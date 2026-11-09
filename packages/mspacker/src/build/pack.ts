import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { zipSync } from "fflate";
import type { ResolvedConfig } from "../config.js";
import type { GenMeta } from "./build.js";

export type PackFiles = Map<string, string | Uint8Array>;

function packMcmeta(description: string, [major, minor]: [number, number]): string {
  const fmt = minor ? [major, minor] : major;
  // Formats >= 82 use min_format/max_format; older versions use pack_format.
  const pack = major >= 82 ? { description, min_format: fmt, max_format: fmt } : { description, pack_format: major };
  return JSON.stringify({ pack }, null, 2) + "\n";
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith(".")) continue; // .gitkeep, .DS_Store, ...
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

const TAG_RE = /^data\/[^/]+\/tags\/.+\.json$/;

/** Combine generated files with pack.mcmeta and the raw datapack dir. Tag files are merged. */
export function assemblePack(cfg: ResolvedConfig, meta: GenMeta, generated: Map<string, string>): { files: PackFiles; warnings: string[] } {
  const warnings: string[] = [];
  const files: PackFiles = new Map(generated);
  files.set("pack.mcmeta", packMcmeta(cfg.description ?? `${cfg.name} (built with MSPacker)`, meta.packFormat));

  for (const abs of walkFiles(cfg.rawDir)) {
    const rel = relative(cfg.rawDir, abs).split(sep).join("/");
    const data = readFileSync(abs);
    const existing = files.get(rel);
    if (existing !== undefined && TAG_RE.test(rel) && rel !== "pack.mcmeta") {
      const a = JSON.parse(String(existing)) as { replace?: boolean; values: unknown[] };
      const b = JSON.parse(data.toString("utf8")) as { replace?: boolean; values?: unknown[] };
      const values = [...(b.values ?? []), ...a.values];
      const seen = new Set<string>();
      const merged = values.filter((v) => {
        const k = JSON.stringify(v);
        return seen.has(k) ? false : (seen.add(k), true);
      });
      files.set(rel, JSON.stringify({ ...((a.replace || b.replace) ? { replace: true } : {}), values: merged }, null, 2) + "\n");
      continue;
    }
    if (existing !== undefined && rel !== "pack.mcmeta") warnings.push(`Raw file ${rel} overrides a generated file.`);
    files.set(rel, data);
  }
  return { files, warnings };
}

/** Write the pack into `target`, replacing it atomically-ish so stale files disappear. */
export function writePackDir(target: string, files: PackFiles): void {
  const stage = `${target}.mspacker-tmp`;
  const old = `${target}.mspacker-old`;
  rmSync(stage, { recursive: true, force: true });
  rmSync(old, { recursive: true, force: true });
  for (const [rel, data] of files) {
    const p = join(stage, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
  }
  if (files.size === 0) mkdirSync(stage, { recursive: true });
  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) renameSync(target, old);
  renameSync(stage, target);
  rmSync(old, { recursive: true, force: true });
}

export function writePackZip(file: string, files: PackFiles): void {
  const entries: Record<string, Uint8Array> = {};
  for (const [rel, data] of files) entries[rel] = typeof data === "string" ? new TextEncoder().encode(data) : data;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, zipSync(entries));
}
