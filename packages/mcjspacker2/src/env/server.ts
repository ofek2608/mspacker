import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { downloadServerJar } from "./download.js";

export interface JarVersion {
  id: string;
  name?: string;
  java_version?: number;
  pack_version: number | { data?: number; data_major?: number; data_minor?: number; resource?: number };
}

/** Written next to a jar that mcjs2 installed, so it can be replaced on version changes. */
const INSTALLED_MARKER = ".mcjs2-installed.json";

export interface ServerInfo {
  /** Server directory (for gen it may not exist when only a downloaded jar is used). */
  dir: string;
  jar: string;
  version: JarVersion;
}

export interface ServerConfig {
  dir?: string;
  jar?: string;
  /** Download the official server jar when none is provided. Default true. */
  download?: boolean;
}

/** Server dir: MCJS2_SERVER_DIR env, then config `server.dir`, then `<project>/server`. */
export function findServerDir(projectDir: string, configured?: string): string {
  const fromEnv = process.env.MCJS2_SERVER_DIR;
  if (fromEnv) return resolve(fromEnv);
  return resolve(projectDir, configured ?? "server");
}

/** The jar inside a server dir: configured name, server.jar, or the only *.jar. */
function findJarInDir(dir: string, jarName?: string): string | null {
  if (!existsSync(dir)) return null;
  if (jarName) return existsSync(resolve(dir, jarName)) ? resolve(dir, jarName) : null;
  if (existsSync(join(dir, "server.jar"))) return join(dir, "server.jar");
  const jars = readdirSync(dir).filter((f) => f.endsWith(".jar"));
  return jars.length === 1 ? join(dir, jars[0]!) : null;
}

/**
 * Read version.json from a server jar. 1.13.x jars have none; for those, `expected` (the configured
 * version) is trusted if the jar contains the server classes, with the 1.13 data pack format (4).
 */
export function readJarVersion(jar: string, expected?: string): JarVersion {
  let isServer = false;
  const files = unzipSync(readFileSync(jar), {
    filter: (f) => {
      if (f.name === "net/minecraft/server/MinecraftServer.class") isServer = true;
      return f.name === "version.json";
    },
  });
  const data = files["version.json"];
  if (data) return JSON.parse(new TextDecoder().decode(data)) as JarVersion;
  if (isServer && expected?.startsWith("1.13")) return { id: expected, pack_version: 4 };
  throw new Error(`${jar} has no version.json; is it a Minecraft server jar?`);
}

/** Some jars append a build hash to the id ("3D Shareware v1.34 / 62337d1d..."); ignore it. */
export function versionIdMatches(id: string, version: string): boolean {
  return id === version || id.split(" / ")[0] === version;
}

function checkVersion(jar: string, version: string): JarVersion {
  const v = readJarVersion(jar, version);
  if (!versionIdMatches(v.id, version)) throw new Error(`Server jar ${jar} is Minecraft ${v.id}, but the config asks for ${version}.`);
  return v;
}

/**
 * Find the server jar. A jar provided in the server dir always wins; otherwise the official
 * jar is downloaded (cached). With `forDev`, the server dir is created (default `<project>/server`)
 * and the downloaded jar is copied into it so the server can be run there.
 * Never touches the launcher's .minecraft directory.
 */
export async function resolveServer(
  projectDir: string,
  version: string,
  configured: ServerConfig | undefined,
  opts: { log: (s: string) => void; forDev?: boolean },
): Promise<ServerInfo> {
  const dir = findServerDir(projectDir, configured?.dir);
  const marker = join(dir, INSTALLED_MARKER);
  const existing = findJarInDir(dir, configured?.jar);
  // A jar we installed earlier (unchanged since) is ours to replace; anything else is the user's.
  const ours =
    existing !== null &&
    existsSync(marker) &&
    (JSON.parse(readFileSync(marker, "utf8")) as { sha1?: string }).sha1 === fileSha1(existing);
  if (existing && !ours) return { dir, jar: existing, version: checkVersion(existing, version) };
  if (existing && ours && versionIdMatches(readJarVersion(existing, version).id, version)) {
    return { dir, jar: existing, version: checkVersion(existing, version) };
  }

  if (configured?.download === false) {
    throw new Error(
      `No Minecraft ${version} server jar found in ${dir} and downloads are disabled (server.download: false).\n` +
        `Put the server jar in your server directory and point server.dir or MCJS2_SERVER_DIR at it.`,
    );
  }
  let jar = await downloadServerJar(version, opts.log);
  if (opts.forDev) {
    mkdirSync(dir, { recursive: true });
    const target = resolve(dir, configured?.jar ?? "server.jar");
    copyFileSync(jar, target);
    writeFileSync(marker, JSON.stringify({ version, sha1: fileSha1(target) }, null, 2) + "\n");
    opts.log(`${existing ? "Replaced" : "Installed"} the server jar in ${dir} with Minecraft ${version}.`);
    jar = target;
  }
  return { dir, jar, version: checkVersion(jar, version) };
}

/** Data pack format as [major, minor]. */
export function dataPackFormat(v: JarVersion): [number, number] {
  const pv = v.pack_version;
  if (typeof pv === "number") return [pv, 0];
  if (pv.data_major !== undefined) return [pv.data_major, pv.data_minor ?? 0];
  if (pv.data !== undefined) return [pv.data, 0];
  throw new Error("Cannot determine the data pack format from version.json.");
}

export function fileSha1(path: string): string {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

export interface ServerProperties {
  [key: string]: string;
}

export function readServerProperties(dir: string): ServerProperties {
  const file = join(dir, "server.properties");
  const props: ServerProperties = {};
  if (!existsSync(file)) return props;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const eq = line.search(/[=:]/);
    if (eq < 0) continue;
    props[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/\\(.)/g, "$1");
  }
  return props;
}
