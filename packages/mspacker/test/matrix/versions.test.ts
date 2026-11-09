/**
 * Version matrix: for each Minecraft version, run the whole pipeline against the real game.
 *   download server jar -> datagen -> codegen -> tsc -> build -> start server -> check pack loads and functions run
 *
 * Slow and needs network + Java, so it only runs with MSPACKER_MATRIX=1:
 *   MSPACKER_MATRIX=1 pnpm vitest run test/matrix
 * Pick versions with MSPACKER_MATRIX_VERSIONS="1.21.4,26.3". Skip the server stage with MSPACKER_MATRIX_SERVER=0.
 *
 * Work dirs live in .matrix/<version> (gitignored). The test servers' eula.txt is set to true
 * (the EULA was accepted by the project owner for these test servers).
 */
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import type { GenMeta } from "../../src/build/build.js";
import { writePackDir } from "../../src/build/pack.js";
import { generate } from "../../src/codegen/generate.js";
import { buildProbes, probeFiles, probeResults } from "../../src/codegen/probe.js";
import { loadConfig } from "../../src/config.js";
import { runDatagen } from "../../src/datagen/run.js";
import { Rcon } from "../../src/dev/rcon.js";
import { downloadServerJar } from "../../src/env/download.js";
import { findJavaFor } from "../../src/env/java.js";
import { dataPackFormat, readJarVersion, versionIdMatches } from "../../src/env/server.js";

const DEFAULT_VERSIONS = [
  // latest snapshot, current + 1.21 drops
  "26.4-snapshot-7", "26.3", "26.2", "26.1.2", "1.21.11", "1.21.10", "1.21.8", "1.21.5", "1.21.4", "1.21.3", "1.21.1",
  // milestones
  "1.20.6", // item components
  "1.20.4", // return run
  "1.20.2", // function macros
  "1.20.1",
  "1.19.4", // display entities, return, ride, damage
  "1.19.2",
  "1.18.2", // bundler server jar
  "1.17.1", // item command
  "1.16.5", // worldgen data packs
  "1.15.2", // NBT storage
  "1.14.4", // schedule, predicates
  "1.13.2", // first data packs
  // April Fools versions with data pack support
  "26w14a", "25w14craftmine", "24w14potato", "23w13a_or_b", "22w13oneblockatatime", "20w14infinite", "3D Shareware v1.34",
];
/**
 * Versions where the pack is only checked for loading (no errors, @load ran) but functions aren't run,
 * because running them trips a bug in that game version itself.
 */
const LOAD_ONLY: Record<string, string> = {
  "3D Shareware v1.34": "setblock hangs the server thread in this April Fools build",
};
const PICKED = (process.env.MSPACKER_MATRIX_VERSIONS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const VERSIONS = PICKED.length ? PICKED : DEFAULT_VERSIONS;
const ENABLED = process.env.MSPACKER_MATRIX === "1";
const SERVER = process.env.MSPACKER_MATRIX_SERVER !== "0";

const PKG = resolve(import.meta.dirname, "../..");

// Builds run the user's code in a worker thread, which loads the compiled package, so test against dist.
if (ENABLED) execFileSync(join(PKG, "node_modules/.bin/tsc"), ["-p", join(PKG, "tsconfig.build.json")], { stdio: "inherit" });
type BuildModule = typeof import("../../src/build/build.js");
const buildPack: BuildModule["buildPack"] = ENABLED
  ? ((await import(join(PKG, "dist/build/build.js"))) as BuildModule).buildPack
  : () => Promise.reject(new Error("matrix disabled"));
const ROOT = join(PKG, ".matrix");
/**
 * Versions run concurrently (MSPACKER_MATRIX_CONCURRENCY, default 6, set in vitest.config.ts).
 * Everything is per-version (dirs, ports, processes) except the build step: the recorder keeps its
 * state on globalThis, so builds take turns through this lock.
 */
let buildLock: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = buildLock.then(fn, fn);
  buildLock = run.catch(() => {});
  return run;
}

/** Errors that mean a whole data pack failed to load. */
const PACK_ERRORS = /Failed to load (?:data pack|datapacks)|Errors in currently selected data packs/i;

async function setupProject(version: string, commands: unknown) {
  const base = join(ROOT, version);
  const project = join(base, "project");
  rmSync(project, { recursive: true, force: true });
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(project, "node_modules", "@ofekn"), { recursive: true });
  symlinkSync(PKG, join(project, "node_modules", "@ofekn", "mspacker"), "dir");
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "matrix", type: "module", imports: { "#mc": "./.mspacker/gen/index.ts" } }));
  writeFileSync(
    join(project, "mspacker.config.ts"),
    `export default { version: ${JSON.stringify(version)}, namespace: "matrix:gen", name: "matrix" };\n`,
  );
  writeFileSync(
    join(project, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2023", module: "ESNext", moduleResolution: "bundler", strict: true, noImplicitOverride: true, noImplicitReturns: true, noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, noEmit: true, skipLibCheck: true, types: [] },
      include: ["src", ".mspacker/gen"],
    }),
  );
  const included: string[] = [];
  for (const file of readdirSync(join(import.meta.dirname, "sample"))) {
    const code = readFileSync(join(import.meta.dirname, "sample", file), "utf8");
    const req = /^\/\/ @requires (.+)$/m.exec(code)?.[1];
    if (req && !hasCommandPath(commands, req.trim().split(/\s+/))) continue;
    copyFileSync(join(import.meta.dirname, "sample", file), join(project, "src", file));
    included.push(file.replace(/\.ts$/, ""));
  }
  writeFileSync(join(project, ".gitignore"), ".mspacker/\ndist/\nnode_modules/\nserver/\n");
  return { base, project, included };
}

/** True if the literal path exists in commands.json (literals only; arguments are skipped over). */
function hasCommandPath(root: unknown, path: string[]): boolean {
  type N = { type?: string; children?: Record<string, N> };
  const walk = (node: N, i: number): boolean => {
    if (i === path.length) return true;
    for (const [name, child] of Object.entries(node.children ?? {})) {
      if (child.type === "literal" ? name === path[i] && walk(child, i + 1) : walk(child, i)) return true;
    }
    return false;
  };
  return walk(root as N, 0);
}

function waitFor(child: ReturnType<typeof spawn>, pattern: RegExp, timeoutMs: number, output: { text: string }): Promise<void> {
  return new Promise((resolveP, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}\n${output.text.slice(-3000)}`)), timeoutMs);
    const check = () => {
      if (pattern.test(output.text)) {
        clearTimeout(timer);
        resolveP();
      }
    };
    child.stdout!.on("data", check);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!pattern.test(output.text)) reject(new Error(`Server exited (${code}) before ${pattern}\n${output.text.slice(-3000)}`));
    });
    check();
  });
}

/** Ask the OS for free ports (held open together so they're distinct). */
async function freePorts(n: number): Promise<number[]> {
  const held = await Promise.all(
    Array.from({ length: n }, () => new Promise<NetServer>((r) => { const s = createNetServer(); s.listen(0, "127.0.0.1", () => r(s)); })),
  );
  const ports = held.map((s) => (s.address() as { port: number }).port);
  await Promise.all(held.map((s) => new Promise((r) => s.close(r))));
  return ports;
}

/** Every server we start, so none outlive the run (e.g. when a test times out). */
const servers = new Set<ReturnType<typeof spawn>>();
afterAll(() => {
  for (const child of servers) child.kill("SIGKILL");
});

const matrix = ENABLED ? describe.concurrent : describe.skip;

matrix.each(VERSIONS)("Minecraft %s", (version) => {
  it("generates, type-checks, builds, and loads on a real server", async () => {
    const log = (s: string) => console.log(`[${version}] ${s}`);
    // 1. jar + datagen
    const jar = await downloadServerJar(version, log);
    const jarVersion = readJarVersion(jar, version);
    expect(versionIdMatches(jarVersion.id, version), `jar id ${jarVersion.id}`).toBe(true);
    const java = await findJavaFor(version, {});
    log(`java: ${java}`);
    const reports = await runDatagen({ dir: "", jar, version: jarVersion }, java, { log });

    // 2. codegen into a fresh project
    const { base, project, included } = await setupProject(version, reports.commands);
    const result = generate(reports.commands, reports.registries, { version, packFormat: dataPackFormat(jarVersion)[0] });
    const genDir = join(project, ".mspacker", "gen");
    mkdirSync(genDir, { recursive: true });
    for (const [name, content] of Object.entries(result.files)) writeFileSync(join(genDir, name), content);
    const meta: GenMeta = { version, packFormat: dataPackFormat(jarVersion) };
    writeFileSync(join(genDir, "meta.json"), JSON.stringify(meta));
    log(`${result.stats.commands} commands, ${result.stats.nodes} node types, pack format ${meta.packFormat.join(".")}`);
    for (const w of result.warnings) log(`codegen warning: ${w}`);

    // 3. type-check generated library + sample
    try {
      execFileSync(join(PKG, "node_modules/.bin/tsc"), ["-p", project], { encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      throw new Error(`tsc failed for ${version}:\n${(e as { stdout?: string }).stdout}`);
    }

    // 4. build
    const { files } = await exclusive(async () => buildPack(await loadConfig(project)));
    const fnDir = meta.packFormat[0] < 45 ? "functions" : "function";
    expect(files.has(`data/matrix/${fnDir}/gen/base/commands.mcfunction`)).toBe(true);
    log(`sample files: ${included.join(", ")}`);

    if (!SERVER) return;

    // 5. real server: fresh flat world with the pack, RCON on a free-ish port
    const serverDir = join(base, "server");
    rmSync(serverDir, { recursive: true, force: true });
    mkdirSync(serverDir, { recursive: true });
    copyFileSync(jar, join(serverDir, "server.jar"));
    writeFileSync(join(serverDir, "eula.txt"), "eula=true\n");
    const [port, rconPort] = await freePorts(2);
    const password = randomBytes(8).toString("hex");
    writeFileSync(
      join(serverDir, "server.properties"),
      [
        "level-name=world",
        "level-type=flat",
        "generate-structures=false",
        "online-mode=false",
        `server-port=${port}`,
        "enable-rcon=true",
        `rcon.port=${rconPort}`,
        `rcon.password=${password}`,
        "spawn-protection=0",
      ].join("\n") + "\n",
    );
    writePackDir(join(serverDir, "world", "datapacks", "matrix"), files);
    // Probe pack: every command path with every parser's examples, one function per line.
    const { probes, skipped } = buildProbes(reports.commands, reports.registries, { version, packFormat: meta.packFormat[0] });
    const probePack = probeFiles(probes, meta.packFormat[0]);
    probePack.set("pack.mcmeta", String(files.get("pack.mcmeta")));
    writePackDir(join(serverDir, "world", "datapacks", "probe"), probePack);
    log(`${probes.length} parser probes, ${skipped.length} command paths skipped`);

    const child = spawn(java, ["-Xmx1G", "-jar", "server.jar", "nogui"], { cwd: serverDir, stdio: ["pipe", "pipe", "pipe"] });
    servers.add(child);
    child.on("exit", () => servers.delete(child));
    const output = { text: "" };
    child.stdout.on("data", (b: Buffer) => (output.text += b.toString()));
    child.stderr.on("data", (b: Buffer) => (output.text += b.toString()));
    try {
      // Wait for both: most versions start RCON after "Done", but some (25w14craftmine) start it before the world.
      await waitFor(child, /Done \([\d.]+s\)!/, 180_000, output);
      await waitFor(child, /RCON running on/, 30_000, output);
      const rcon = await Rcon.connect("127.0.0.1", rconPort, password, 10_000);
      try {
        const results: Record<string, string> = {};
        if (LOAD_ONLY[version]) log(`load-only: ${LOAD_ONLY[version]}`);
        const fns = LOAD_ONLY[version] ? [] : ["matrix:gen/base/commands", "matrix:gen/custom/renamed", "matrix:gen/base/tick", "#matrix:all"];
        if (included.includes("storage") && !LOAD_ONLY[version]) fns.push("matrix:gen/storage/storage");
        if (included.includes("schedule") && !LOAD_ONLY[version]) fns.push("matrix:gen/schedule/scheduled");
        if (included.includes("macro") && !LOAD_ONLY[version]) fns.push("matrix:gen/macro/macros");
        for (const fn of fns) {
          results[fn] = await rcon.command(`function ${fn}`);
        }
        // Probe failures are reported per parser; sample-pack errors must be zero.
        const { failed, unavailable } = probeResults(output.text, probes);
        writeFileSync(
          join(base, "probe-report.json"),
          JSON.stringify({ version, packFormat: meta.packFormat[0], total: probes.length, failed, unavailable, skipped }, null, 2),
        );
        if (failed.length) {
          const byParser = new Map<string, string[]>();
          for (const f of failed) {
            const key = f.probe.variant?.parser ?? f.probe.parsers.join(",") ?? "?";
            byParser.set(key, [...(byParser.get(key) ?? []), `${f.probe.line}  ->  ${f.error}`]);
          }
          for (const [parser, lines] of byParser) log(`probe FAIL [${parser}] ${lines.length}x, e.g. ${lines[0]}`);
        }
        const errors = output.text
          .split("\n")
          .filter((l) => (/(Failed to load|Couldn't load) function/i.test(l) && /matrix[:/\\]/.test(l)) || PACK_ERRORS.test(l));
        expect(errors, `pack load errors on ${version}`).toEqual([]);
        // Some versions (3D Shareware) start RCON before the load functions have run.
        await waitFor(child, /mspacker-load-ok/, 30_000, output).catch(() => {});
        expect(output.text, "@load function ran").toContain("mspacker-load-ok");
        for (const [fn, res] of Object.entries(results)) {
          expect(res, `${fn} on ${version}`).not.toMatch(/Unknown function|Unknown or incomplete|Can't find|error/i);
        }
        if (!LOAD_ONLY[version]) {
          // The server can log a function's output after answering the RCON command that ran it.
          await waitFor(child, /mspacker-commands-ok/, 30_000, output).catch(() => {});
          expect(output.text, "commands function ran to the end").toContain("mspacker-commands-ok");
          if (included.includes("macro")) {
            await waitFor(child, /mspacker-macro-ok yo 2/, 30_000, output).catch(() => {});
            expect(output.text, "macro function ran with arguments").toContain("mspacker-macro-ok hi 5");
            expect(output.text, "macro function ran with storage").toContain("mspacker-macro-ok yo 2");
          }
        }
        expect(failed.map((f) => `${f.probe.line} -> ${f.error}`), `parser probes on ${version}`).toEqual([]);
        await rcon.command("stop");
      } finally {
        rcon.close();
      }
      await new Promise<void>((r) => (child.exitCode !== null ? r() : child.on("exit", () => r())));
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      writeFileSync(join(base, "server-output.log"), output.text);
    }
  }, 600_000);
});

describe.skipIf(ENABLED)("version matrix", () => {
  it.skip("set MSPACKER_MATRIX=1 to run", () => {});
});

