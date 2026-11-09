import { describe, expect, it } from "vitest";
import { detectPackageManager, parseCreateArgs, validateNamespace } from "../src/index.js";
import { curatedVersions, type Manifest } from "../src/versions.js";

const v = (id: string, type: string, releaseTime: string) => ({ id, type, releaseTime });

const manifest: Manifest = {
  latest: { release: "26.3", snapshot: "26.4-snapshot-7" },
  versions: [
    v("26.4-snapshot-7", "snapshot", "2026-11-01T00:00:00+00:00"),
    v("26.3", "release", "2026-10-01T00:00:00+00:00"),
    v("26.3-rc-1", "snapshot", "2026-09-28T00:00:00+00:00"),
    v("26.1.2", "release", "2026-04-20T00:00:00+00:00"),
    v("26w14a", "snapshot", "2026-04-01T12:00:00+00:00"),
    v("26.1.1", "release", "2026-04-01T09:00:00+00:00"),
    v("26.1.1-rc-1", "snapshot", "2026-04-01T08:00:00+00:00"),
    v("26.1", "release", "2026-03-01T00:00:00+00:00"),
    v("1.21.11", "release", "2025-12-01T00:00:00+00:00"),
    v("1.21.10", "release", "2025-10-07T00:00:00+00:00"),
    v("1.21.9", "release", "2025-09-30T00:00:00+00:00"),
    v("24w14potato", "snapshot", "2024-04-01T11:00:00+00:00"),
    v("1.20.6", "release", "2024-04-29T00:00:00+00:00"),
    v("1.20.5", "release", "2024-04-23T00:00:00+00:00"),
    v("3D Shareware v1.34", "snapshot", "2019-04-01T11:00:00+00:00"),
    v("1.13.2", "release", "2018-10-22T00:00:00+00:00"),
    v("1.13", "release", "2018-07-18T15:11:46+00:00"),
    v("1.12.2", "release", "2017-09-18T00:00:00+00:00"),
    v("1.RV-Pre1", "snapshot", "2016-03-31T16:18:53+00:00"),
    v("15w14a", "snapshot", "2015-04-01T07:08:00+00:00"),
  ],
};

describe("create: version list", () => {
  const list = curatedVersions(manifest);
  it("lists latest, latest patch per minor since 1.13 and 1.21 drops, newest first, without duplicates", () => {
    expect(list.filter((c) => !c.aprilFools).map((c) => c.id)).toEqual([
      "26.4-snapshot-7", "26.3", "26.1.2", "1.21.11", "1.21.10", "1.20.6", "1.13.2",
    ]);
    expect(list.find((c) => c.id === "26.3")!.hint).toBe("latest release");
    expect(list.find((c) => c.id === "26.4-snapshot-7")!.hint).toBe("latest snapshot");
  });
  it("puts April Fools versions (since data packs) at the bottom", () => {
    expect(list.filter((c) => c.aprilFools).map((c) => [c.id, c.hint])).toEqual([
      ["26w14a", "2026 April Fools"],
      ["24w14potato", "2024 April Fools"],
      ["3D Shareware v1.34", "2019 April Fools"],
    ]);
    expect(list.at(-1)!.aprilFools).toBe(true);
  });
  it("doesn't duplicate the latest snapshot when it equals the release", () => {
    const ids = curatedVersions({ ...manifest, latest: { release: "26.3", snapshot: "26.3" } }).map((c) => c.id);
    expect(ids.filter((id) => id === "26.3")).toHaveLength(1);
  });
});

describe("create: args", () => {
  it("parses flags", () => {
    expect(parseCreateArgs(["pack", "--version", "1.20.4", "-n", "mp", "--yes", "--no-install"])).toEqual({
      dir: "pack", version: "1.20.4", namespace: "mp", yes: true, install: false,
    });
  });
  it("detects the package manager", () => {
    expect(detectPackageManager("pnpm/10.0.0 npm/? node/v24")).toBe("pnpm");
    expect(detectPackageManager("")).toBe("npm");
  });
});

describe("validateNamespace", () => {
  it("accepts namespaces with an optional folder prefix", () => {
    expect(validateNamespace("mypack")).toBeUndefined();
    expect(validateNamespace("my_pack.v2:some/folder/")).toBeUndefined();
  });

  it("rejects invalid characters", () => {
    expect(validateNamespace("")).toBe("Required");
    expect(validateNamespace("My Pack")).toMatch(/Only a-z/);
    expect(validateNamespace("mypack:Bad")).toMatch(/"Bad"/);
  });
});
