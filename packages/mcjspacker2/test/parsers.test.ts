import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { compactTree, generate } from "../src/codegen/generate.js";
import { buildProbes, probeFiles, probeResults } from "../src/codegen/probe.js";
import { createRoot } from "../src/runtime/command.js";
import { parseNamespace } from "../src/runtime/naming.js";
import { FORMAT_BELOW_NAME, parserDef, setParserOverrides } from "../src/runtime/parsers.js";
import { collectOutput, resetState, type FnMeta } from "../src/runtime/state.js";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const commands = fixture("commands.json");
const registries = fixture("registries.json");
const meta = (fn: Function, m: FnMeta) => (globalThis as any)[Symbol.for("mcjspacker2.meta")](fn, m);

afterEach(() => setParserOverrides(undefined));

describe("version-aware parsers", () => {
  const ctx = (packFormat: number) => ({ version: "x", packFormat, hasRegistry: () => false, registryIds: () => [] });

  it("switches scoreboard slot types and examples at 1.20.2", () => {
    const def = parserDef("minecraft:scoreboard_slot");
    expect(def.type(undefined, ctx(FORMAT_BELOW_NAME - 1))).toBe("LegacyScoreboardSlot");
    expect(def.type(undefined, ctx(FORMAT_BELOW_NAME))).toBe("ScoreboardSlot");
    expect(def.examples!(undefined, ctx(15))).toContain("belowName");
    expect(def.examples!(undefined, ctx(18))).toContain("below_name");
  });

  it("uses legacy text component keys before 1.21.5", () => {
    const def = parserDef("minecraft:component");
    expect(def.type(undefined, ctx(61))).toBe("LegacyTextComponent");
    expect(JSON.stringify(def.examples!(undefined, ctx(61)))).toContain("clickEvent");
    expect(JSON.stringify(def.examples!(undefined, ctx(71)))).toContain("click_event");
  });
});

describe("inline providers and slot sources (26.x)", () => {
  const c = { version: "x", packFormat: 121, hasRegistry: () => false, registryIds: () => [] };
  it("wraps numbers as constant providers, keeps ids and inline objects", () => {
    const def = parserDef("minecraft:context_float_provider");
    expect(def.serialize(1.5, undefined, c)).toBe('{type:"minecraft:constant",value:1.5d}');
    expect(def.serialize("mypack:speed", undefined, c)).toBe("mypack:speed");
    expect(def.serialize({ type: "minecraft:uniform", min: 1, max: 2 }, undefined, c)).toBe('{type:"minecraft:uniform",min:1,max:2}');
  });
  it("wraps macro arguments as constants (a bare $(n) would be read as an id)", () => {
    expect(parserDef("minecraft:context_int_provider").macro!("$(n)", undefined, c)).toBe('{type:"minecraft:constant",value:$(n)}');
  });
  it("serializes slot sources", () => {
    const def = parserDef("minecraft:slot_source");
    expect(def.serialize("container.*", undefined, c)).toBe("container.*");
    expect(def.serialize({ type: "minecraft:slot_range", slots: "container.0" }, undefined, c)).toBe('{type:"minecraft:slot_range",slots:"container.0"}');
  });
});

describe("user-defined parsers", () => {
  it("override types in codegen", () => {
    setParserOverrides({ "minecraft:vec3": { type: "MyVec" } });
    const out = generate(commands, registries, { version: "t", packFormat: 108 }).files["commands.ts"]!;
    expect(out).toContain("(location: Arg<MyVec>): N");
  });

  it("accept version-dependent type functions and silence unknown-parser warnings", () => {
    const tree = { type: "root", children: { foo: { type: "literal", children: { v: { type: "argument", parser: "minecraft:brand_new", executable: true } } } } };
    expect(generate(tree, {}, { version: "t", packFormat: 200 }).warnings.join()).toMatch(/minecraft:brand_new/);
    setParserOverrides({ "minecraft:brand_new": { type: (_p, c) => (c.packFormat >= 200 ? "`new:${string}`" : "string") } });
    const r = generate(tree, {}, { version: "t", packFormat: 200 });
    expect(r.warnings).toEqual([]);
    expect(r.files["commands.ts"]).toMatch(/\(v: Arg<`new:\$\{string\}`>\): N\d+;/);
  });

  it("override test/serialize at build time", () => {
    setParserOverrides({
      "minecraft:vec3": { test: (v) => typeof v === "object" && v !== null && "x" in v, serialize: (v: any) => `${v.x} ${v.y} ${v.z}` },
    });
    resetState(parseNamespace("pk"), { version: "t", packFormat: 108 });
    const $ = createRoot(compactTree(commands)) as any;
    function Main() {
      $.tp({ x: 1, y: 2, z: 3 });
    }
    meta(Main, { file: "m.ts", name: "Main", mcfunction: true });
    expect(collectOutput().files.get("data/pk/function/m/main.mcfunction")).toBe("tp 1 2 3\n");
  });
});

describe("probes", () => {
  const { probes, skipped } = buildProbes(commands, registries, { version: "t", packFormat: 108 });

  it("builds one line per command path from parser examples", () => {
    const lines = probes.map((p) => p.line);
    expect(lines).toContain("tp @s @s");
    expect(lines).toContain("say probe text");
    expect(lines).toContain("execute as @s run say probe");
    expect(lines).toContain("tellraw @p \"probe\"");
    // Variant line for the second vec3 example (local coordinates).
    expect(lines).toContain("tp ^ ^ ^1");
    expect(new Set(lines).size).toBe(lines.length);
    expect(skipped).toEqual([]);
    expect(lines).toContain('execute if items block 0 64 ~ {type:"minecraft:slot_range",slots:"container.0"} minecraft:diamond');
  });

  it("writes probe functions and the resources they reference", () => {
    const files = probeFiles(probes, 108);
    expect(files.get("data/probe/function/p/0.mcfunction")).toBe(probes[0]!.line + "\n");
    expect(files.has("data/probe/predicate/p.json")).toBe(true);
    expect(probeFiles(probes, 41).has("data/probe/functions/target.mcfunction")).toBe(true);
  });

  it("classifies load errors into parser failures and unavailable commands", () => {
    const log = [
      "[ERROR]: Failed to load function probe:p/0",
      "java.util.concurrent.CompletionException: java.lang.IllegalArgumentException: Whilst parsing command on line 1: Can't find element 'minecraft:1' in registry at position 5: ...<--[HERE]",
      "[ERROR]: Couldn't load function at probe:functions/p/1.mcfunction",
      "java.util.concurrent.CompletionException: java.lang.IllegalArgumentException: Whilst parsing command on line 1: Unknown command at position 0: <--[HERE]",
    ].join("\n");
    const r = probeResults(log, probes);
    expect(r.failed.map((f) => f.probe.path)).toEqual(["p/0"]);
    expect(r.failed[0]!.error).toMatch(/^Can't find element/);
    expect(r.unavailable.map((f) => f.probe.path)).toEqual(["p/1"]);
  });
});
