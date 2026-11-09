/**
 * Minecraft only loads dimensions when a world opens, so `/reload` doesn't pick up new or changed
 * dimension files. Dev mode compares them between builds to say when a restart is needed.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DIMENSION_FILE = /^data\/([^/]+)\/(dimension|dimension_type)\/(.+)\.json$/;

/** `ns:path (dimension)` for every dimension file added, changed or removed between two builds. */
export function dimensionChanges(
  before: ReadonlyMap<string, string | Uint8Array>,
  after: ReadonlyMap<string, string | Uint8Array>,
): string[] {
  const paths = new Set([...before.keys(), ...after.keys()].filter((p) => DIMENSION_FILE.test(p)));
  const changed: string[] = [];
  for (const p of [...paths].sort()) {
    if (asText(before.get(p)) === asText(after.get(p))) continue;
    const [, ns, kind, path] = DIMENSION_FILE.exec(p)!;
    changed.push(kind === "dimension" ? `${ns}:${path}` : `${ns}:${path} (dimension type)`);
  }
  return changed;
}

const asText = (v: string | Uint8Array | undefined) => (v instanceof Uint8Array ? Buffer.from(v).toString("utf8") : v);

/** The dimension files of a pack already on disk (empty when there's none). */
export function readDimensionFiles(packDir: string): Map<string, string> {
  const files = new Map<string, string>();
  const data = join(packDir, "data");
  if (!existsSync(data)) return files;
  for (const ns of readdirSync(data)) {
    for (const kind of ["dimension", "dimension_type"]) {
      const dir = join(data, ns, kind);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir, { recursive: true }) as string[]) {
        const full = join(dir, f);
        if (!f.endsWith(".json")) continue;
        files.set(relative(packDir, full).split(sep).join("/"), readFileSync(full, "utf8"));
      }
    }
  }
  return files;
}
