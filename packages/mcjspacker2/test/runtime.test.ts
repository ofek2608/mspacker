import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { compactTree } from "../src/codegen/generate.js";
import { bindTree, Chain, command, registerChain } from "../src/runtime/command.js";
import { cmd, raw, tag } from "../src/runtime/index.js";
import { parseNamespace } from "../src/runtime/naming.js";
import { collectOutput, resetState, type FnMeta } from "../src/runtime/state.js";

const T = bindTree(compactTree(JSON.parse(readFileSync(new URL("./fixtures/commands.json", import.meta.url), "utf8"))));
const c = (lit: string) => (...args: unknown[]) => command(T, lit, args);
const Say = c("say");
const Tp = c("tp");
const Execute = c("execute");

// Minimal stand-in for the generated ExecuteChain.
class ExecuteChain extends Chain {
  As(...a: unknown[]): any { return this.$c("as", a); }
  At(...a: unknown[]): any { return this.$c("at", a); }
  If(...a: unknown[]): any { return this.$c("if", a); }
  Run(...a: unknown[]): any { return this.$c("run", a); }
}
registerChain("execute", ExecuteChain);
const Function = c("function");
const Return = c("return");
const Tellraw = c("tellraw");

const meta = (fn: Function, m: FnMeta) => (globalThis as any)[Symbol.for("mcjspacker2.meta")](fn, m);

function build(packFormat?: number): Record<string, string> {
  return Object.fromEntries(collectOutput({ packFormat }).files);
}

beforeEach(() => {
  resetState(parseNamespace("pk:gen"));
});

describe("commands", () => {
  it("serializes overloads by argument types", () => {
    function Main() {
      Tp("@a", [0, "~1", "~"]);
      Tp("@a", ["^", "^1", "^-2"]);
      Tp("@s", "@p");
      Tp([1, 2, 3]);
      Tellraw("@a", { text: "hi", color: "red" });
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe(
      'tp @a 0 ~1 ~\ntp @a ^ ^1 ^-2\ntp @s @p\ntp 1 2 3\ntellraw @a {"text":"hi","color":"red"}\n',
    );
  });

  it("throws on bad arguments", () => {
    function Main() {
      Tp("@a", [0, 1]);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/No overload of "tp"/);
  });

  it("rejects mixed local and world coordinates", () => {
    function Main() {
      Tp("@a", [0, "~10", "^"]);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/Cannot mix local coordinates and world coordinates together: "0 ~10 \^"/);
  });

  it("errors when a command runs outside a function", () => {
    expect(() => Say("x")).toThrow(/outside of an mcfunction/);
  });
});

describe("execute chains", () => {
  it("inlines single-command callbacks and outlines multi-command ones", () => {
    function Main() {
      Execute().As("@a").At("@s").Run(() => Say("one"));
      Execute().If("entity", "@p").Run(() => {
        Say("a");
        Say("b");
      });
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    const main = files["data/pk/function/gen/main/main.mcfunction"]!;
    expect(main.split("\n")[0]).toBe("execute as @a at @s run say one");
    expect(main.split("\n")[1]).toMatch(/^execute if entity @p run function pk:gen\/__anon\/[0-9a-f]{8}$/);
    const anon = Object.keys(files).find((f) => f.includes("__anon"))!;
    expect(files[anon]).toBe("say a\nsay b\n");
  });

  it("allows conditions as complete commands", () => {
    function Main() {
      Execute().If("entity", "@p");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe("execute if entity @p\n");
  });

  it("rejects incomplete chains", () => {
    function Main() {
      Execute().As("@a");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/Incomplete command "execute as @a"/);
  });

  it("supports return run", () => {
    function Main() {
      Return("run", () => Say("x"));
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe("return run say x\n");
  });
});

describe("function references", () => {
  it("emits referenced helpers lazily and handles recursion", () => {
    function Helper() {
      Say("helper");
    }
    function Loop() {
      Function(Loop);
    }
    function Main() {
      Function(Helper);
      Function(Loop);
      Function("minecraft:other");
    }
    meta(Helper, { file: "a/b.ts", name: "Helper" });
    meta(Loop, { file: "a/b.ts", name: "Loop" });
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    expect(files["data/pk/function/gen/main/main.mcfunction"]).toBe(
      "function pk:gen/a/b/helper\nfunction pk:gen/a/b/loop\nfunction minecraft:other\n",
    );
    expect(files["data/pk/function/gen/a/b/loop.mcfunction"]).toBe("function pk:gen/a/b/loop\n");
  });

  it("does not emit unreferenced, untagged functions", () => {
    function Unused() {
      Say("x");
    }
    meta(Unused, { file: "main.ts", name: "Unused" });
    expect(Object.keys(build())).toEqual([]);
  });

  it("dedupes identical anonymous functions", () => {
    function Main() {
      const make = () => () => {
        Say("1");
        Say("2");
      };
      Function(make());
      Function(make());
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    const lines = files["data/pk/function/gen/main/main.mcfunction"]!.trim().split("\n");
    expect(lines[0]).toBe(lines[1]);
    expect(Object.keys(files).filter((f) => f.includes("__anon"))).toHaveLength(1);
  });

  it("detects duplicate ids", () => {
    function A() {}
    function B() {}
    meta(A, { file: "main.ts", name: "A", mcfunction: "same" });
    meta(B, { file: "main.ts", name: "B", mcfunction: "same" });
    expect(() => build()).toThrow(/Duplicate function id "pk:gen\/same"/);
  });

  it("supports overrides, load/tick tags, raw and cmd", () => {
    function Init() {
      raw("say raw");
      cmd`function ${Init}`;
    }
    meta(Init, { file: "main.ts", name: "Init", mcfunction: "boot", load: true });
    tag("function", "pk:all", [Init, "pk:x"]);
    const files = build();
    expect(files["data/pk/function/gen/boot.mcfunction"]).toBe("say raw\nfunction pk:gen/boot\n");
    expect(JSON.parse(files["data/minecraft/tags/function/load.json"]!)).toEqual({ values: ["pk:gen/boot"] });
    expect(JSON.parse(files["data/pk/tags/function/all.json"]!)).toEqual({ values: ["pk:gen/boot", "pk:x"] });
  });

  it("uses plural folder names before pack format 45", () => {
    function Init() {
      Say("x");
    }
    meta(Init, { file: "main.ts", name: "Init", load: true });
    tag("block", "pk:stuff", ["stone"]);
    expect(Object.keys(build(41)).sort()).toEqual([
      "data/minecraft/tags/functions/load.json",
      "data/pk/functions/gen/main/init.mcfunction",
      "data/pk/tags/blocks/stuff.json",
    ]);
  });
});
