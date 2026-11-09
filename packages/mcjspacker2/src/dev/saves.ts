import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface SaveInfo {
  name: string;
  dir: string;
  lastPlayed: number;
}

export function listSaves(mcRoot: string): SaveInfo[] {
  const savesDir = join(mcRoot, "saves");
  if (!existsSync(savesDir)) return [];
  const out: SaveInfo[] = [];
  for (const name of readdirSync(savesDir)) {
    const dir = join(savesDir, name);
    if (!existsSync(join(dir, "level.dat"))) continue;
    // session.lock is touched when a world is opened; level.dat when it is saved.
    const times = ["session.lock", "level.dat"].filter((f) => existsSync(join(dir, f))).map((f) => statSync(join(dir, f)).mtimeMs);
    out.push({ name, dir, lastPlayed: Math.max(...times) });
  }
  return out.sort((a, b) => b.lastPlayed - a.lastPlayed);
}

/** Pick the save that is most likely open right now. */
export function detectCurrentSave(mcRoot: string): { save: SaveInfo; ambiguous: SaveInfo[] } {
  const saves = listSaves(mcRoot);
  if (!saves.length) throw new Error(`No singleplayer saves found in ${join(mcRoot, "saves")}.`);
  const [first, ...rest] = saves;
  const ambiguous = rest.filter((s) => first!.lastPlayed - s.lastPlayed < 5000);
  return { save: first!, ambiguous };
}

export function findSave(mcRoot: string, name: string): SaveInfo {
  const saves = listSaves(mcRoot);
  const save = saves.find((s) => s.name === name);
  if (!save) {
    throw new Error(`Save "${name}" not found. Available: ${saves.map((s) => s.name).join(", ") || "(none)"}`);
  }
  return save;
}
