/**
 * The version list offered when creating a project, built from Mojang's version manifest:
 * latest release and snapshot, the latest patch of every minor release since data packs (1.13),
 * every 1.21 game drop, then April Fools versions at the bottom.
 */
const VERSION_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

export interface ManifestVersion {
  id: string;
  type: string;
  releaseTime: string;
}

export interface Manifest {
  latest: { release: string; snapshot: string };
  versions: ManifestVersion[];
}

export interface VersionChoice {
  id: string;
  /** "latest release", "latest snapshot", "2024 April Fools", ... */
  hint?: string;
  aprilFools?: boolean;
}

/** 1.21 game drops (latest patch of each). Not derivable from the manifest. */
export const DROPS_1_21 = ["1.21.11", "1.21.10", "1.21.8", "1.21.5", "1.21.4", "1.21.3", "1.21.1"];

/** Data packs were added in 1.13 (first snapshot: 17w43a). */
const DATAPACKS_SINCE = "2017-10-25";
const RELEASE_1_13 = "2018-07-18";

/** Release ids grouped by minor: "1.20.6" -> "1.20", "26.1.2" -> "26.1", "26.3" -> "26.3". */
const minorOf = (id: string) => id.split(".").slice(0, 2).join(".");

/** April Fools versions: snapshots published on April 1st that aren't pre-releases or release candidates. */
export function isAprilFools(v: ManifestVersion): boolean {
  return v.type === "snapshot" && v.releaseTime.slice(5, 10) === "04-01" && !/pre|rc|snapshot/i.test(v.id);
}

export function curatedVersions(manifest: Manifest): VersionChoice[] {
  const byId = new Map(manifest.versions.map((v) => [v.id, v]));
  const picked = new Map<string, VersionChoice>();
  const add = (id: string, hint?: string) => {
    if (!byId.has(id)) return;
    const prev = picked.get(id);
    if (!prev) picked.set(id, { id, hint });
    else if (hint && !prev.hint) prev.hint = hint;
  };

  add(manifest.latest.release, "latest release");
  add(manifest.latest.snapshot, "latest snapshot");
  const seenMinor = new Set<string>();
  for (const v of manifest.versions) {
    if (v.type !== "release" || v.releaseTime < RELEASE_1_13) continue;
    const minor = minorOf(v.id);
    if (seenMinor.has(minor)) continue;
    seenMinor.add(minor);
    add(v.id);
  }
  for (const id of DROPS_1_21) add(id);

  const time = (c: VersionChoice) => byId.get(c.id)!.releaseTime;
  const main = [...picked.values()].sort((a, b) => time(b).localeCompare(time(a)));
  const fools = manifest.versions
    .filter((v) => v.releaseTime >= DATAPACKS_SINCE && isAprilFools(v))
    .map((v) => ({ id: v.id, hint: `${v.releaseTime.slice(0, 4)} April Fools`, aprilFools: true }));
  return [...main, ...fools.filter((f) => !picked.has(f.id))];
}

/** Every manifest version that supports data packs, newest first (for the "other version" search). */
export function allDatapackVersions(manifest: Manifest): ManifestVersion[] {
  return manifest.versions.filter((v) => v.releaseTime >= DATAPACKS_SINCE);
}

export async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(VERSION_MANIFEST_URL);
  if (!res.ok) throw new Error(`GET ${VERSION_MANIFEST_URL} failed: ${res.status}`);
  return (await res.json()) as Manifest;
}
