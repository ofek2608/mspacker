import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fetchVersionJson } from "./download.js";
import { findMinecraftRoot } from "./mcroot.js";

const exe = process.platform === "win32" ? "java.exe" : "java";

function works(cmd: string): boolean {
  return spawnSync(cmd, ["-version"], { stdio: "ignore" }).status === 0;
}

/** Find java inside the launcher's runtime dir: <root>/runtime/<component>/<os>/<component>/bin/java. */
function launcherJava(root: string, component?: string): string | null {
  const runtimeDir = join(root, "runtime");
  if (!existsSync(runtimeDir)) return null;
  const dirs = component ? [component].filter((c) => existsSync(join(runtimeDir, c))) : readdirSync(runtimeDir);
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 5) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === "bin" && existsSync(join(p, exe))) found.push(join(p, exe));
      else if (statSync(p).isDirectory()) walk(p, depth + 1);
    }
  };
  for (const d of dirs) walk(join(runtimeDir, d), 0);
  return found.sort().pop() ?? null;
}

export interface JavaOptions {
  /** Explicit java path from the config; always wins. */
  configured?: string;
  minecraftRoot?: string;
  /** Launcher runtime component the game version needs (e.g. "jre-legacy", "java-runtime-delta"). */
  component?: string;
  /** Java major version the game version needs (e.g. 21). */
  majorVersion?: number;
}

/** `JAVA_HOME_<major>_<arch>`, as set by actions/setup-java and preinstalled on GitHub runners. */
function javaHomeFor(major: number): string | null {
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !new RegExp(`^JAVA_HOME_${major}_[A-Z0-9]+$`).test(key)) continue;
    const p = join(value, "bin", exe);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Pick java: config, then the launcher runtime matching the version's component (the exact Java the
 * game itself runs on; only the Java runtime is taken from the launcher dir, never game jars),
 * then `JAVA_HOME_<major>_<arch>` for the version's Java major, then JAVA_HOME, then PATH.
 */
export function findJava(opts: JavaOptions): string {
  if (opts.configured) return opts.configured;
  if (opts.component) {
    const match = launcherJava(findMinecraftRoot(opts.minecraftRoot), opts.component);
    if (match) return match;
  }
  if (opts.majorVersion) {
    const match = javaHomeFor(opts.majorVersion);
    if (match) return match;
  }
  if (process.env.JAVA_HOME) {
    const p = join(process.env.JAVA_HOME, "bin", exe);
    if (existsSync(p)) return p;
  }
  if (works("java")) return "java";
  const any = launcherJava(findMinecraftRoot(opts.minecraftRoot));
  if (any) return any;
  throw new Error('Java not found. Install Java, set JAVA_HOME, or set "java" in the config.');
}

/** findJava for a specific Minecraft version, using Mojang's version JSON to know which runtime it needs. */
export async function findJavaFor(version: string, opts: Omit<JavaOptions, "component" | "majorVersion">): Promise<string> {
  let javaVersion: { component?: string; majorVersion?: number } | undefined;
  try {
    javaVersion = (await fetchVersionJson(version)).javaVersion;
  } catch {
    // Offline or unknown version: fall back to JAVA_HOME / PATH.
  }
  return findJava({ ...opts, component: javaVersion?.component, majorVersion: javaVersion?.majorVersion });
}
