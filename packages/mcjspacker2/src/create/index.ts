/**
 * Interactive project setup (`npm create mcjspacker2`): asks for the directory, namespace, Minecraft version
 * and description, scaffolds the project, then optionally installs dependencies and generates the library.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { init } from "../init.js";
import { parseNamespace } from "../runtime/naming.js";
import { allDatapackVersions, curatedVersions, fetchManifest, type Manifest } from "./versions.js";

export interface CreateArgs {
  dir?: string;
  version?: string;
  namespace?: string;
  description?: string;
  /** Accept defaults for anything not given on the command line. */
  yes?: boolean;
  install?: boolean;
  gen?: boolean;
}

const OTHER = "\0other";

function bail(): never {
  p.cancel("Cancelled.");
  process.exit(1);
}

function check<T>(v: T): Exclude<T, symbol> {
  if (p.isCancel(v)) bail();
  return v as Exclude<T, symbol>;
}

const defaultNamespace = (dir: string) => basename(resolve(dir)).toLowerCase().replace(/[^a-z0-9_.-]+/g, "_") || "mypack";

function validateNamespace(v: string | undefined): string | undefined {
  if (!v) return "Required";
  try {
    parseNamespace(v);
  } catch (e) {
    return (e as Error).message;
  }
  return undefined;
}

/** The package manager that launched us (`pnpm create`, `yarn create`, `npm create`, `bun create`). */
export function detectPackageManager(userAgent = process.env.npm_config_user_agent ?? ""): string {
  const name = userAgent.split("/")[0];
  return name === "pnpm" || name === "yarn" || name === "bun" ? name : "npm";
}

async function pickVersion(): Promise<string> {
  const s = p.spinner();
  s.start("Fetching Minecraft versions");
  let manifest: Manifest;
  try {
    manifest = await fetchManifest();
    s.stop("Fetched Minecraft versions");
  } catch (e) {
    s.stop(`Couldn't fetch the version list (${(e as Error).message})`);
    return check(await p.text({ message: "Minecraft version", placeholder: "26.3", validate: (v) => (v ? undefined : "Required") }));
  }

  const choices = curatedVersions(manifest);
  const picked = check(
    await p.select({
      message: "Minecraft version",
      initialValue: manifest.latest.release,
      maxItems: 14,
      options: [
        ...choices.map((c) => ({ value: c.id, label: c.hint ? `${c.id} ${styleText("dim", `(${c.hint})`)}` : c.id })),
        { value: OTHER, label: "Other version…", hint: "search every version with data packs" },
      ],
    }),
  );
  if (picked !== OTHER) return picked;

  const all = allDatapackVersions(manifest);
  return check(
    await p.autocomplete({
      message: "Search for a version",
      placeholder: "e.g. 1.20.4, 24w14potato",
      maxItems: 10,
      options: all.map((v) => ({ value: v.id, label: v.id, hint: `${v.type}, ${v.releaseTime.slice(0, 10)}` })),
    }),
  );
}

export async function create(args: CreateArgs): Promise<void> {
  p.intro("mcjspacker2 — TypeScript data packs");

  const dirInput =
    args.dir ??
    (args.yes
      ? "my-datapack"
      : check(await p.text({ message: "Project directory", placeholder: "my-datapack", defaultValue: "my-datapack" })));
  const dir = resolve(dirInput);
  if (existsSync(dir) && readdirSync(dir).length > 0 && !args.yes) {
    const go = check(await p.confirm({ message: `${dirInput} is not empty. Add mcjspacker2 to it anyway? Existing files are kept.`, initialValue: false }));
    if (!go) bail();
  }

  const namespace =
    args.namespace ??
    (args.yes
      ? defaultNamespace(dir)
      : check(
          await p.text({
            message: "Namespace",
            placeholder: defaultNamespace(dir),
            defaultValue: defaultNamespace(dir),
            validate: (v) => validateNamespace(v || defaultNamespace(dir)),
          }),
        ));
  const nsError = validateNamespace(namespace);
  if (nsError) throw new Error(`Invalid namespace "${namespace}": ${nsError}`);

  const version = args.version ?? (args.yes ? (await fetchManifest()).latest.release : await pickVersion());

  const description =
    args.description ??
    (args.yes ? "" : check(await p.text({ message: "Description", placeholder: "optional", defaultValue: "" })));

  mkdirSync(dir, { recursive: true });
  const created: string[] = [];
  init(dir, { version, namespace, description: description || undefined, log: (s) => created.push(s) });
  p.note(created.join("\n"), "Scaffolded");

  const pm = detectPackageManager();
  const install = args.install ?? (args.yes ? true : check(await p.confirm({ message: `Install dependencies with ${pm}?` })));
  let installed = false;
  if (install) {
    p.log.step(`${pm} install`);
    installed = spawnSync(pm, ["install"], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" }).status === 0;
    if (!installed) p.log.warn(`${pm} install failed; run it yourself.`);
  }

  let generated = false;
  if (installed) {
    const gen =
      args.gen ??
      (args.yes
        ? true
        : check(await p.confirm({ message: `Generate the command library now? (downloads the ${version} server jar and runs datagen)` })));
    if (gen) {
      p.log.step(`${pm} run gen`);
      generated = spawnSync(pm, ["run", "gen"], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" }).status === 0;
      if (!generated) p.log.warn("Generation failed; see the output above, then run it again.");
    }
  }

  const rel = relative(process.cwd(), dir) || ".";
  const run = pm === "npm" ? "npm run" : pm;
  const steps = [
    rel !== "." && `cd ${rel}`,
    !installed && `${pm} install`,
    !generated && `${run} gen      # generate the typed command library`,
    `${run} build    # build the data pack into dist/`,
    `${run} dev      # start the dev server; every save rebuilds and reloads in game`,
  ].filter(Boolean);
  p.note(steps.join("\n"), "Next steps");
  p.outro("Happy packing!");
}

/** Parse `create-mcjspacker2 [dir] [--version x] [--namespace x] [--description x] [--yes] [--no-install] [--no-gen]`. */
export function parseCreateArgs(argv: string[]): CreateArgs {
  const out: CreateArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--version" || a === "--mc-version" || a === "-v") out.version = value();
    else if (a === "--namespace" || a === "-n") out.namespace = value();
    else if (a === "--description" || a === "-d") out.description = value();
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--install") out.install = true;
    else if (a === "--no-install") out.install = false;
    else if (a === "--gen") out.gen = true;
    else if (a === "--no-gen") out.gen = false;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: create-mcjspacker2 [dir] [--version <id>] [--namespace <ns>] [--description <text>] [--yes] [--no-install] [--no-gen]",
      );
      process.exit(0);
    } else if (a.startsWith("-")) throw new Error(`Unknown option ${a}`);
    else out.dir = a;
  }
  return out;
}
