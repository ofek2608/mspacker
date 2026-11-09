import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { compactTree } from "../src/codegen/generate.js";
import { bindTree, Chain, command, registerChain } from "../src/runtime/command.js";
import { fnId, raw, resource, tag } from "../src/runtime/index.js";
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
      Tp("@a", "0 ~1 ~");
      Tp("@a", "^ ^1 ^-2");
      Tp("@s", "@p");
      Tp("1 2 3");
      Tellraw("@a", { text: "hi", color: "red" });
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe(
      'tp @a 0 ~1 ~\ntp @a ^ ^1 ^-2\ntp @s @p\ntp 1 2 3\ntellraw @a {"text":"hi","color":"red"}\n',
    );
  });

  it("throws on bad arguments", () => {
    function Main() {
      Tp("@a", "0 1");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/No overload of "tp"/);
  });

  it("rejects mixed local and world coordinates", () => {
    function Main() {
      Tp("@a", "0 ~10 ^");
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

  it("supports overrides, load/tick tags and raw", () => {
    function Init() {
      raw("say raw");
      raw(`function ${fnId(Init)}`);
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

describe("queued recording", () => {
  it("records long reference chains without nesting", () => {
    // 20k functions that each call the next: nested recording would overflow the JS stack.
    const fns: Function[] = [];
    for (let i = 0; i < 20_000; i++) {
      const f = () => {
        Say(`n${i}`);
        if (i + 1 < 20_000) Function(fns[i + 1]);
      };
      meta(f, { file: "chain.ts", name: `F${i}` });
      fns.push(f);
    }
    function Main() {
      Function(fns[0]);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    expect(files["data/pk/function/gen/chain/f0.mcfunction"]).toBe("say n0\nfunction pk:gen/chain/f1\n");
    expect(files["data/pk/function/gen/chain/f19999.mcfunction"]).toBe("say n19999\n");
  });

  it("handles long chains of anonymous functions", () => {
    const fns: Function[] = [];
    for (let i = 0; i < 5_000; i++) {
      fns.push(() => {
        Say(`a${i}`);
        if (i + 1 < 5_000) Function(fns[i + 1]);
      });
    }
    function Main() {
      Function(fns[0]);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    expect(Object.keys(files).filter((f) => f.includes("__anon"))).toHaveLength(5_000);
    expect(files["data/pk/function/gen/main/main.mcfunction"]).toMatch(/^function pk:gen\/__anon\/[0-9a-f]{8}\n$/);
  });

  it("runs .Run callbacks immediately, so they see the caller's state", () => {
    function Main() {
      let wave = 0;
      for (; wave < 2; wave++) {
        Execute().As("@a").Run(() => {
          Say(`wave ${wave}`);
          Say("x");
        });
      }
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    const bodies = Object.entries(files).filter(([f]) => f.includes("__anon")).map(([, b]) => b).sort();
    expect(bodies).toEqual(["say wave 0\nsay x\n", "say wave 1\nsay x\n"]);
  });

  it("resolves anonymous ids in raw lines, tags and resources", () => {
    const anon = () => {
      Say("a");
      Say("b");
    };
    function Main() {
      raw(`schedule function ${fnId(anon)} 1s`);
      tag("function", "pk:t", [fnId(anon)]);
      resource("advancement", "pk:adv", { rewards: { function: fnId(anon) } });
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    const id = /schedule function (\S+) 1s/.exec(files["data/pk/function/gen/main/main.mcfunction"]!)![1]!;
    expect(id).toMatch(/^pk:gen\/__anon\/[0-9a-f]{8}$/);
    expect(JSON.parse(files["data/pk/tags/function/t.json"]!).values).toEqual([id]);
    expect(JSON.parse(files["data/pk/advancement/adv.json"]!).rewards.function).toBe(id);
    expect(Object.values(files).join("")).not.toContain("\u0000");
  });

  it("records functions referenced by tags added while recording", () => {
    function Late() {
      Say("late");
    }
    meta(Late, { file: "main.ts", name: "Late" });
    function Main() {
      tag("function", "pk:late", [Late]);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/late.mcfunction"]).toBe("say late\n");
  });

  it("gives anonymous functions in a reference cycle position-based ids", () => {
    const fns: Function[] = [];
    fns[0] = () => {
      Say("ping");
      Function(fns[1]);
    };
    fns[1] = () => {
      Say("pong");
      Function(fns[0]);
    };
    meta(fns[0]!, { file: "main.ts", line: 1 });
    meta(fns[1]!, { file: "main.ts", line: 5 });
    function Main() {
      Function(fns[0]);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    const anon = Object.entries(files).filter(([f]) => f.includes("__anon"));
    expect(anon).toHaveLength(2);
    for (const [, body] of anon) expect(body).toMatch(/^say p[io]ng\nfunction pk:gen\/main\/__anon\/p?[0-9a-f]{8}\n$/);
  });
});
