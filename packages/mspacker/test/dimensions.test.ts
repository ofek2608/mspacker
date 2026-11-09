import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dimensionChanges, readDimensionFiles } from "../src/dev/dimensions.js";

describe("dimension changes", () => {
  const dim = "data/pk/dimension/arena.json";
  const type = "data/pk/dimension_type/flat/void.json";

  it("lists added, changed and removed dimension files, ignoring everything else", () => {
    const before = new Map([[dim, "{}"], ["data/pk/function/a.mcfunction", "say a"]]);
    expect(dimensionChanges(before, new Map([[dim, "{}"], ["data/pk/function/a.mcfunction", "say b"]]))).toEqual([]);
    expect(dimensionChanges(before, new Map([[dim, '{"type":"x"}']]))).toEqual(["pk:arena"]);
    expect(dimensionChanges(before, new Map([[dim, "{}"], [type, "{}"]]))).toEqual(["pk:flat/void (dimension type)"]);
    expect(dimensionChanges(before, new Map())).toEqual(["pk:arena"]);
  });

  it("reads the dimension files of a pack on disk", () => {
    const pack = mkdtempSync(join(tmpdir(), "mspacker-dims-"));
    mkdirSync(join(pack, "data/pk/dimension"), { recursive: true });
    writeFileSync(join(pack, dim), "{}");
    expect(readDimensionFiles(pack)).toEqual(new Map([[dim, "{}"]]));
    expect(readDimensionFiles(join(pack, "missing"))).toEqual(new Map());
  });
});
