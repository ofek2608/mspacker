import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

/** Locate the Minecraft launcher root: MINECRAFT_ROOT env, config, then the OS default. */
export function findMinecraftRoot(configured?: string): string {
  const fromEnv = process.env.MINECRAFT_ROOT;
  if (fromEnv) return resolve(fromEnv);
  if (configured) return resolve(configured);
  return defaultMinecraftRoot();
}

export function defaultMinecraftRoot(): string {
  switch (platform()) {
    case "win32":
      return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), ".minecraft");
    case "darwin":
      return join(homedir(), "Library", "Application Support", "minecraft");
    default:
      return join(homedir(), ".minecraft");
  }
}

export function requireMinecraftRoot(configured?: string): string {
  const root = findMinecraftRoot(configured);
  if (!existsSync(root)) {
    throw new Error(`Minecraft root not found at ${root}. Set MINECRAFT_ROOT or "minecraftRoot" in the config.`);
  }
  return root;
}
