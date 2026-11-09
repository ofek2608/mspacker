import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { build as esbuild, type Plugin } from "esbuild";
import type { ResolvedConfig } from "../config.js";
import { collectOutput, resetState } from "../runtime/state.js";
import { setParserOverrides } from "../runtime/parsers.js";
import { instrument } from "./transform.js";
import { assemblePack, type PackFiles } from "./pack.js";

export interface GenMeta {
  version: string;
  packFormat: [number, number];
}

const SOURCE_RE = /\.(m?ts|m?js)$/;

export function listSources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (SOURCE_RE.test(name) && !name.endsWith(".d.ts") && !/\.(test|spec)\.[mc]?[jt]s$/.test(name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const toPosix = (p: string) => p.split(sep).join("/");

function instrumentPlugin(srcDir: string): Plugin {
  return {
    name: "mspacker-instrument",
    setup(b) {
      b.onLoad({ filter: SOURCE_RE }, (args) => {
        const rel = relative(srcDir, args.path);
        if (rel.startsWith("..") || rel.includes("node_modules")) return undefined;
        const ts = /\.m?ts$/.test(args.path);
        const code = readFileSync(args.path, "utf8");
        try {
          return { contents: instrument(code, toPosix(rel), { typescript: ts }), loader: ts ? "ts" : "js" };
        } catch (e) {
          // Babel parse errors carry a location; report them against the source file.
          const loc = (e as { loc?: { line: number; column: number } }).loc;
          const text = (e as Error).message.replace(/ \(\d+:\d+\)$/, "");
          return { errors: [{ text, location: loc ? { file: args.path, line: loc.line, column: loc.column } : { file: args.path } }] };
        }
      });
    },
  };
}

/** Bare package imports stay external (resolved from the project at runtime); `#` subpath imports are bundled. */
const externalPackages: Plugin = {
  name: "mspacker-externals",
  setup(b) {
    b.onResolve({ filter: /^[^./#]/ }, (args) => {
      if (args.kind === "entry-point") return undefined;
      if (/^[A-Za-z]:[\\/]/.test(args.path)) return undefined;
      return { path: args.path, external: true };
    });
  },
};

let buildCounter = 0;

/** Append the first stack frame inside the user's src dir (stacks are source-mapped). */
function withSourceLocation(e: unknown, srcDir: string): unknown {
  if (!(e instanceof Error) || !e.stack) return e;
  const frame = e.stack
    .split("\n")
    .map((l) => /\(?((?:file:\/\/)?[^()\s]+:\d+:\d+)\)?\s*$/.exec(l)?.[1])
    .find((loc) => loc && loc.replace(/^file:\/\//, "").startsWith(srcDir));
  if (frame) e.message += `\n    at ${relative(process.cwd(), frame.replace(/^file:\/\//, ""))}`;
  return e;
}

export function readGenMeta(cfg: ResolvedConfig): GenMeta {
  const file = join(cfg.genDir, "meta.json");
  if (!existsSync(file)) throw new Error("Generated library missing. Run `mspacker gen` first.");
  const meta = JSON.parse(readFileSync(file, "utf8")) as GenMeta;
  if (meta.version !== cfg.version) {
    throw new Error(`Generated library is for ${meta.version} but config says ${cfg.version}. Run \`mspacker gen\`.`);
  }
  return meta;
}

/** Bundle the user's sources, execute them at build time, and return the datapack files. */
export interface BuildOptions {
  /** Dev build: `__DEV__` is true and `@dev` functions are included. */
  dev?: boolean;
}

export async function buildPack(
  cfg: ResolvedConfig,
  options: BuildOptions = {},
): Promise<{ files: PackFiles; functionCount: number; warnings: string[] }> {
  const meta = readGenMeta(cfg);
  const sources = listSources(cfg.srcDir);
  const outfile = join(cfg.workDir, "build", "bundle.mjs");
  const entry = sources.map((s) => `import ${JSON.stringify(s)};`).join("\n");

  await esbuild({
    stdin: { contents: entry, resolveDir: cfg.projectDir, sourcefile: "mspacker-entry.js", loader: "js" },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: "inline",
    logLevel: "silent",
    plugins: [externalPackages, instrumentPlugin(cfg.srcDir)],
  });

  // The user's code runs in a short-lived worker: each build loads a new copy of the bundle, and Node
  // never unloads modules, so running it in-process would grow memory with every dev rebuild.
  const out = await runInWorker({ projectDir: cfg.projectDir, outfile, dev: options.dev ?? false });
  const { files, warnings } = assemblePack(cfg, meta, out.files);
  return { files, functionCount: out.functionCount, warnings };
}

/** Run the bundled user code and collect the pack's generated files (inside the build worker). */
export async function executeBundle(
  cfg: ResolvedConfig,
  meta: GenMeta,
  outfile: string,
  dev: boolean,
): Promise<{ files: Map<string, string>; functionCount: number }> {
  setParserOverrides(cfg.parsers);
  resetState(cfg.spec, { version: meta.version, packFormat: meta.packFormat[0] }, { dev });
  process.setSourceMapsEnabled?.(true);
  try {
    await import(pathToFileURL(outfile).href + `?v=${++buildCounter}-${Date.now()}`);
    return collectOutput({ packFormat: meta.packFormat[0] });
  } catch (e) {
    throw withSourceLocation(e, cfg.srcDir);
  }
}

export interface WorkerInput {
  projectDir: string;
  outfile: string;
  dev: boolean;
}

export type WorkerResult =
  | { ok: true; files: [string, string][]; functionCount: number }
  | { ok: false; message: string; stack?: string };

function runInWorker(input: WorkerInput): Promise<{ files: Map<string, string>; functionCount: number }> {
  return new Promise((resolveP, reject) => {
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      workerData: input,
      // Don't inherit the CLI's node flags: some (`--input-type`, `--expose-gc`) are invalid in workers.
      execArgv: [],
    });
    let settled = false;
    worker.once("message", (r: WorkerResult) => {
      settled = true;
      void worker.terminate();
      if (r.ok) resolveP({ files: new Map(r.files), functionCount: r.functionCount });
      else reject(Object.assign(new Error(r.message), { stack: r.stack ?? r.message }));
    });
    worker.once("error", (e) => {
      settled = true;
      reject(e);
    });
    worker.once("exit", (code) => {
      if (!settled) reject(new Error(`Build worker exited unexpectedly (code ${code}).`));
    });
  });
}

/** How build errors are shown: the message (with its source location); the full stack with MSPACKER_DEBUG=1. */
export function formatBuildError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  return process.env.MSPACKER_DEBUG ? (e.stack ?? e.message) : e.message;
}
