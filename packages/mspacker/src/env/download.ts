/**
 * Downloads the official server jar via Mojang's version manifest (the same source the
 * launcher and mod-loader dev tooling use). Jars are cached per version and verified by SHA-1.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheRoot } from "../datagen/run.js";

export const VERSION_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

interface Manifest {
  versions: { id: string; url: string; sha1?: string }[];
}

export interface VersionJson {
  downloads?: { server?: { url: string; sha1: string; size?: number } };
  /** The Java runtime the launcher uses for this version, e.g. { component: "jre-legacy", majorVersion: 8 }. */
  javaVersion?: { component?: string; majorVersion?: number };
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res;
}

const sha1 = (data: Uint8Array) => createHash("sha1").update(data).digest("hex");

/** Mojang's version JSON for `version` (cached on disk). */
export async function fetchVersionJson(version: string): Promise<VersionJson> {
  const file = join(cacheRoot(), "jars", version, "version.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as VersionJson;
  const manifest = (await (await fetchOk(VERSION_MANIFEST_URL)).json()) as Manifest;
  const entry = manifest.versions.find((v) => v.id === version);
  if (!entry) throw new Error(`Minecraft version "${version}" is not in Mojang's version manifest. Check "version" in the config.`);
  const info = (await (await fetchOk(entry.url)).json()) as VersionJson;
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(info));
  return info;
}

/** Path of the cached server jar for `version`, downloading it first if needed. */
export async function downloadServerJar(version: string, log: (s: string) => void): Promise<string> {
  const dir = join(cacheRoot(), "jars", version);
  const jar = join(dir, "server.jar");
  const shaFile = join(dir, "server.jar.sha1");
  if (existsSync(jar) && existsSync(shaFile) && sha1(readFileSync(jar)) === readFileSync(shaFile, "utf8").trim()) {
    return jar;
  }

  const info = await fetchVersionJson(version);
  const server = info.downloads?.server;
  if (!server) throw new Error(`Minecraft ${version} has no server download.`);

  log(`Downloading Minecraft ${version} server jar${server.size ? ` (${(server.size / 1e6).toFixed(1)} MB)` : ""}...`);
  const data = new Uint8Array(await (await fetchOk(server.url)).arrayBuffer());
  const actual = sha1(data);
  if (actual !== server.sha1) throw new Error(`Server jar checksum mismatch for ${version} (expected ${server.sha1}, got ${actual}).`);

  mkdirSync(dir, { recursive: true });
  writeFileSync(jar + ".part", data);
  renameSync(jar + ".part", jar);
  writeFileSync(shaFile, server.sha1 + "\n");
  return jar;
}
