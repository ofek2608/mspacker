import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { parseNamespace, type NamespaceSpec } from "./runtime/naming.js";
import type { UserParserDef } from "./runtime/parsers.js";

/** The settings in `mcjs2.config.ts`. Only `version` and `namespace` are required. */
export interface UserConfig {
  /** Minecraft version id, must match the server jar (e.g. "26.3" or "26.3-snapshot-1"). */
  version: string;
  /** "mypack", "mypack:", "mypack:generated" or "mypack:generated/" */
  namespace: string;
  /** Pack folder name. Defaults to the package name / project dir. */
  name?: string;
  /** The pack description in `pack.mcmeta`. */
  description?: string;
  /** TS source dir. Default "src". */
  src?: string;
  /** Raw datapack files merged into the output verbatim. Default "datapack". */
  raw?: string;
  /** Build output dir. Default "dist". */
  outDir?: string;
  /** The dev server (`mcjs2 dev`). */
  server?: {
    /**
     * Server dir used by `dev` (world + datapacks). Overridden by MCJS2_SERVER_DIR. Default "server".
     * If it contains a server jar, that jar is used; otherwise the official jar is downloaded.
     */
    dir?: string;
    /** Jar file name inside the server dir. Default "server.jar" or the only *.jar. */
    jar?: string;
    /** Download the official server jar when none is provided. Default true. */
    download?: boolean;
    /** RCON host. Default "127.0.0.1". */
    host?: string;
    /** Extra JVM args for the server `mcjs2 dev` starts. */
    jvmArgs?: string[];
  };
  /** Path to java. Default: JAVA_HOME, PATH, then the launcher's bundled runtime. */
  java?: string;
  /**
   * Add or override argument parsers, keyed by brigadier parser id (e.g. "minecraft:particle").
   * Use this when a new Minecraft version adds or changes an argument type before mcjspacker2 is
   * updated. Fields you leave out keep the built-in behavior (or the string fallback).
   * `type` changes generated signatures, so re-run `mcjs2 gen` after editing it.
   */
  parsers?: Record<string, UserParserDef>;
  /** Minecraft launcher root (for singleplayer saves). Overridden by MINECRAFT_ROOT. */
  minecraftRoot?: string;
}

/**
 * Your project's settings; `mcjs2.config.ts` exports the result:
 *
 *     export default defineConfig({ version: "26.3", namespace: "mypack" });
 */
export function defineConfig(config: UserConfig): UserConfig {
  return config;
}

/** Typed helper for entries of `parsers` in the config. */
export function defineParser(def: UserParserDef): UserParserDef {
  return def;
}

export interface ResolvedConfig extends UserConfig {
  projectDir: string;
  configFile: string;
  name: string;
  spec: NamespaceSpec;
  srcDir: string;
  rawDir: string;
  outDir: string;
  genDir: string;
  workDir: string;
}

export const CONFIG_NAMES = ["mcjs2.config.ts", "mcjs2.config.mts", "mcjs2.config.js", "mcjs2.config.mjs"];

export function findConfig(dir: string): string | null {
  for (const n of CONFIG_NAMES) if (existsSync(join(dir, n))) return join(dir, n);
  return null;
}

export async function loadConfig(projectDir: string): Promise<ResolvedConfig> {
  const configFile = findConfig(projectDir);
  if (!configFile) throw new Error(`No mcjs2.config.ts in ${projectDir}. Create a project with \`npm create mcjspacker2\`.`);
  const workDir = join(projectDir, ".mcjs2");
  mkdirSync(join(workDir, "build"), { recursive: true });
  const outfile = join(workDir, "build", "config.mjs");
  await build({
    entryPoints: [configFile],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    logLevel: "silent",
  });
  const mod = await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
  const user = (mod.default ?? mod.config) as UserConfig | undefined;
  if (!user || typeof user !== "object") throw new Error(`${configFile} must default-export defineConfig({...}).`);
  if (!user.version) throw new Error(`${configFile}: "version" is required.`);
  if (!user.namespace) throw new Error(`${configFile}: "namespace" is required.`);

  let name = user.name;
  if (!name) {
    try {
      const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"));
      name = String(pkg.name ?? "").replace(/^@.*\//, "");
    } catch {}
  }
  name ||= basename(projectDir);

  return {
    ...user,
    projectDir,
    configFile,
    name,
    spec: parseNamespace(user.namespace),
    srcDir: resolve(projectDir, user.src ?? "src"),
    rawDir: resolve(projectDir, user.raw ?? "datapack"),
    outDir: resolve(projectDir, user.outDir ?? "dist"),
    genDir: join(workDir, "gen"),
    workDir,
  };
}
