import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { compactTree } from "../src/codegen/generate.js";
import { createRoot, literalName } from "../src/runtime/command.js";
import { __DEV__, __FUNCTION_PREFIX__, __NAMESPACE__, fnId, id, macro, named, nbt, resource, tag } from "../src/runtime/index.js";
import { setParserOverrides } from "../src/runtime/parsers.js";
import { parseNamespace } from "../src/runtime/naming.js";
import { collectOutput, resetState, type FnMeta } from "../src/runtime/state.js";

const $ = createRoot(compactTree(JSON.parse(readFileSync(new URL("./fixtures/commands.json", import.meta.url), "utf8")))) as any;

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
      $.tp("@a", "0 ~1 ~");
      $.tp("@a", "^ ^1 ^-2");
      $.tp("@s", "@p");
      $.tp("1 2 3");
      $.tellraw("@a", { text: "hi", color: "red" });
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe(
      'tp @a 0 ~1 ~\ntp @a ^ ^1 ^-2\ntp @s @p\ntp 1 2 3\ntellraw @a {"text":"hi","color":"red"}\n',
    );
  });

  it("throws on bad arguments", () => {
    function Main() {
      $.tp("@a", "0 1");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/No syntax of "tp" matches arguments \("@a", "0 1"\)/);
  });

  it("rejects mixed local and world coordinates", () => {
    function Main() {
      $.tp("@a", "0 ~10 ^");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/Cannot mix local coordinates and world coordinates together: "0 ~10 \^"/);
  });

  it("errors when a command runs outside a function", () => {
    expect(() => $.say("x")).toThrow(/outside of an mcfunction/);
  });
});

describe("execute chains", () => {
  it("runs a command, or a function's commands, after run", () => {
    function Main() {
      $.execute.as("@a").at("@s").run.say("one");
      $.execute.if.entity("@p").run.function(() => {
        $.say("a");
        $.say("b");
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
      $.execute.if.entity("@p");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe("execute if entity @p\n");
  });

  it("rejects incomplete chains", () => {
    function Main() {
      $.execute.as("@a");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/Incomplete command "execute as @a"/);
  });

  it("supports return run", () => {
    function Main() {
      $.return.run.say("x");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe("return run say x\n");
  });
});

describe("function references", () => {
  it("emits referenced helpers lazily and handles recursion", () => {
    function Helper() {
      $.say("helper");
    }
    function Loop() {
      $.function(Loop);
    }
    function Main() {
      $.function(Helper);
      $.function(Loop);
      $.function("minecraft:other");
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
      $.say("x");
    }
    meta(Unused, { file: "main.ts", name: "Unused" });
    expect(Object.keys(build())).toEqual([]);
  });

  it("dedupes identical anonymous functions", () => {
    function Main() {
      const make = () => () => {
        $.say("1");
        $.say("2");
      };
      $.function(make());
      $.function(make());
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    const lines = files["data/pk/function/gen/main/main.mcfunction"]!.trim().split("\n");
    expect(lines[0]).toBe(lines[1]);
    expect(Object.keys(files).filter((f) => f.includes("__anon"))).toHaveLength(1);
  });

  it("detects duplicate ids with different commands", () => {
    function A() {
      $.say("a");
    }
    function B() {
      $.say("b");
    }
    meta(A, { file: "main.ts", name: "A", mcfunction: "same" });
    meta(B, { file: "main.ts", name: "B", mcfunction: "same" });
    expect(() => build()).toThrow(/Duplicate function id "pk:gen\/same": defined by A \(main\.ts\) and B \(main\.ts\), with different commands/);
  });

  it("names functions with named(), by path or full id, and shares identical copies", () => {
    const helper = (what: string) =>
      named(`pk:api/${what}`, () => {
        $.say(what);
        $.execute.run.function(() => $.say("inner"));
      });
    helper("reset");
    helper("reset"); // a second copy with the same commands
    named("tools/x", () => $.say("x"));
    const files = build();
    expect(files["data/pk/function/api/reset.mcfunction"]).toMatch(/^say reset\nexecute run function pk:gen\/__anon\/[0-9a-f]{8}\n$/);
    expect(files["data/pk/function/gen/tools/x.mcfunction"]).toBe("say x\n");

    resetState(parseNamespace("pk:gen"));
    helper("same");
    named("pk:api/same", () => $.say("other"));
    expect(() => build()).toThrow(/Duplicate function id "pk:api\/same".*different commands/);

    resetState(parseNamespace("pk:gen"));
    expect(() => named("Bad Id", () => {})).toThrow(/Invalid resource location/);
  });

  it("starts anonymous names with the hint of a nested function", () => {
    function Main() {
      // What the build adds for `const step = () => ...` inside a function.
      const step = meta(() => $.say("step"), { file: "main.ts", hint: "step", line: 2 });
      $.function(step);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    expect(Object.keys(files).some((f) => /gen\/main\/__anon\/step_[0-9a-f]{8}\.mcfunction$/.test(f))).toBe(true);
  });

  it("supports overrides, load/tick tags and raw", () => {
    function Init() {
      $("say raw");
      $(`function ${fnId(Init)}`);
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
      $.say("x");
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
        $.say(`n${i}`);
        if (i + 1 < 20_000) $.function(fns[i + 1]);
      };
      meta(f, { file: "chain.ts", name: `F${i}` });
      fns.push(f);
    }
    function Main() {
      $.function(fns[0]);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    expect(files["data/pk/function/gen/chain/f0.mcfunction"]).toBe("say n0\nfunction pk:gen/chain/f1\n");
    expect(files["data/pk/function/gen/chain/f19999.mcfunction"]).toBe("say n19999\n");
  });

  it("records long chains of anonymous functions without nesting", () => {
    const fns: Function[] = [];
    for (let i = 0; i < 20_000; i++) {
      fns.push(() => {
        $.say(`a${i}`);
        if (i + 1 < 20_000) $.function(fns[i + 1]);
      });
    }
    function Main() {
      $.function(fns[0]);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    expect(Object.keys(files).filter((f) => f.includes("__anon"))).toHaveLength(20_000);
    const first = /^function (\S+)\n$/.exec(files["data/pk/function/gen/main/main.mcfunction"]!)![1]!;
    expect(first).toMatch(/^pk:gen\/__anon\/[0-9a-f]{8}$/);
    expect(files[`data/pk/function/${first.slice(3)}.mcfunction`]).toMatch(/^say a0\nfunction pk:gen\/__anon\/[0-9a-f]{8}\n$/);
  });

  it("records anonymous functions after the current one, like named ones", () => {
    function Main() {
      let wave = 0;
      for (; wave < 2; wave++) {
        $.execute.as("@a").run.function(() => {
          $.say(`wave ${wave}`);
        });
      }
      for (let round = 0; round < 2; round++) {
        $.function(() => {
          $.say(`round ${round}`);
        });
      }
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    const bodies = Object.entries(files).filter(([f]) => f.includes("__anon")).map(([, b]) => b).sort();
    // `wave` is shared by both callbacks and is 2 by the time they run; `round` is per iteration.
    expect(bodies).toEqual(["say round 0\n", "say round 1\n", "say wave 2\n"]);
  });

  it("never inlines anonymous functions, even with one command", () => {
    function Main() {
      $.function(() => $.say("one"));
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    expect(files["data/pk/function/gen/main/main.mcfunction"]).toMatch(/^function pk:gen\/__anon\/[0-9a-f]{8}\n$/);
  });

  it("replaces the names of anonymous functions everywhere in the output", () => {
    const anon = () => {
      $.say("a");
      $.say("b");
    };
    function Main() {
      $(`schedule function ${fnId(anon)} 1s`);
      tag("function", "pk:t", [fnId(anon)]);
      resource("advancement", "pk:adv", { rewards: { function: fnId(anon) } });
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    const id = /schedule function (\S+) 1s/.exec(files["data/pk/function/gen/main/main.mcfunction"]!)![1]!;
    expect(id).toMatch(/^pk:gen\/__anon\/[0-9a-f]{8}$/);
    expect(JSON.parse(files["data/pk/tags/function/t.json"]!).values).toEqual([id]);
    expect(JSON.parse(files["data/pk/advancement/adv.json"]!).rewards.function).toBe(id);
  });

  it("records functions referenced by tags added while recording", () => {
    function Late() {
      $.say("late");
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
      $.say("ping");
      $.function(fns[1]);
    };
    fns[1] = () => {
      $.say("pong");
      $.function(fns[0]);
    };
    meta(fns[0]!, { file: "main.ts", line: 1 });
    meta(fns[1]!, { file: "main.ts", line: 5 });
    function Main() {
      $.function(fns[0]);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    const anon = Object.entries(files).filter(([f]) => f.includes("__anon"));
    expect(anon).toHaveLength(2);
    for (const [, body] of anon) expect(body).toMatch(/^say p[io]ng\nfunction pk:gen\/main\/__anon\/p?[0-9a-f]{8}\n$/);
  });
});

describe("$ proxy", () => {
  const main = (body: () => void) => {
    meta(body, { file: "main.ts", name: "Main", mcfunction: true });
    return build()["data/pk/function/gen/main/main.mcfunction"];
  };

  it("accepts arguments in one call or split across calls", () => {
    expect(
      main(function Main() {
        $.tp("@a", "1 2 3");
        $.tp("@a")("1 2 3");
        $.tp("@a")("1 2 3")("90 0");
        $.tp("@a")("@p"); // sibling args <targets> / <destination> stay open until the next value
        $.scoreboard.players.set("@s", "kills", 0);
      }),
    ).toBe("tp @a 1 2 3\ntp @a 1 2 3\ntp @a 1 2 3 90 0\ntp @a @p\nscoreboard players set @s kills 0\n");
  });

  it("follows redirects: Run lands on the root, subcommands chain", () => {
    expect(
      main(function Main() {
        $.execute.as("@a").at("@s").if.entity("@p").run.say("hi");
        $.execute.if.score("@s", "a")["<"]("@s", "b").run.say("lt");
        $.execute.as("@a").run("say raw");
        $.execute.as("@a").run.execute.at("@s").run.say("nested");
      }),
    ).toBe(
      "execute as @a at @s if entity @p run say hi\n" +
        "execute if score @s a < @s b run say lt\n" +
        "execute as @a run say raw\n" +
        "execute as @a run execute at @s run say nested\n",
    );
  });

  it("writes commands given as text, and only text", () => {
    function Helper() {
      $.say("a");
    }
    meta(Helper, { file: "main.ts", name: "Helper" });
    expect(
      main(function Main() {
        $("$say $(message)");
        $(`schedule function ${fnId(Helper)} 1s`);
        $.execute.as("@a").run("say hi");
      }),
    ).toBe("$say $(message)\nschedule function pk:gen/main/helper 1s\nexecute as @a run say hi\n");
    resetState(parseNamespace("pk:gen"));
    function Bad() {
      $(Helper as any);
    }
    meta(Bad, { file: "main.ts", name: "Bad", mcfunction: true });
    expect(() => build()).toThrow(/To call a function, use \$\.function\(fn\)/);
  });

  it("starts a new line when a stored prefix is reused", () => {
    expect(
      main(function Main() {
        const atAll = $.execute.as("@a").at("@s");
        atAll.run.say("1");
        atAll.run.say("2");
      }),
    ).toBe("execute as @a at @s run say 1\nexecute as @a at @s run say 2\n");
  });

  it("reports incomplete commands at the line that started them", () => {
    function Main() {
      $.say("ok");
      $.execute.as("@a").at("@s");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    let err: Error | undefined;
    try {
      build();
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).toMatch(/Incomplete command "execute as @a at @s"/);
    expect(err?.stack).toMatch(/runtime\.test\.ts:\d+/);
  });

  it("rejects unknown literals with the command so far", () => {
    function Main() {
      $.execute.as("@a").sideways;
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/Unknown subcommand "sideways" after "execute as @a"/);
  });

  it("accepts string arguments as properties", () => {
    expect(
      main(function Main() {
        $.scoreboard.players.set("@s").kills(5);
        $.tp["@a"]["1 2 3"];
        $.function["pk:other"];
      }),
    ).toBe("scoreboard players set @s kills 5\ntp @a 1 2 3\nfunction pk:other\n");
  });

  it("keeps the root strict: properties there must be commands", () => {
    function Main() {
      $.sya("x");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/Unknown command "sya"/);
  });

  it("never treats probed names as argument values", () => {
    function Main() {
      const chain = $.scoreboard.players.set("@s");
      expect((chain as any).then).toBeUndefined();
      chain.kills(1);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe("scoreboard players set @s kills 1\n");
  });

  it("lets tools probe chains without starting commands", async () => {
    function Main() {
      const chain = $.execute.as("@a").run.say("x");
      expect((chain as any).then).toBeUndefined(); // not a thenable
      expect(typeof (chain as any).toString).toBe("function");
    }
    expect(
      (meta(Main, { file: "main.ts", name: "Main", mcfunction: true }), build()["data/pk/function/gen/main/main.mcfunction"]),
    ).toBe("execute as @a run say x\n");
  });

  it("names literals in snake_case across spellings, keeping JS keywords", () => {
    expect(literalName("keepInventory")).toBe("keep_inventory");
    expect(literalName("minecraft:keep_inventory")).toBe("keep_inventory");
    expect(literalName("ban-ip")).toBe("ban_ip");
    expect(literalName("function")).toBe("function");
    expect(literalName("then")).toBe("then_");
    expect(literalName("<")).toBeNull();
  });
});

describe("__DEV__", () => {
  it("is true only in dev builds", () => {
    function Main() {
      $.say(__DEV__ ? "dev" : "release");
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe("say release\n");
    resetState(parseNamespace("pk:gen"), undefined, { dev: true });
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe("say dev\n");
    resetState(parseNamespace("pk:gen"));
    expect(__DEV__).toBe(false);
  });
});

describe("@dev entries", () => {
  const setup = () => {
    function Debug() {
      $.say("debug");
    }
    function Main() {
      $.say("main");
    }
    meta(Debug, { file: "main.ts", name: "Debug", dev: true, load: true });
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    return { Debug, Main };
  };

  it("exist only in dev builds", () => {
    setup();
    const release = build();
    expect(Object.keys(release)).toEqual(["data/pk/function/gen/main/main.mcfunction"]);

    resetState(parseNamespace("pk:gen"), undefined, { dev: true });
    setup();
    const dev = build();
    expect(dev["data/pk/function/gen/main/debug.mcfunction"]).toBe("say debug\n");
    expect(JSON.parse(dev["data/minecraft/tags/function/load.json"]!).values).toEqual(["pk:gen/main/debug"]);
  });

  it("can't be referenced from a release build", () => {
    const { Debug } = setup();
    function Caller() {
      $.function(Debug);
    }
    meta(Caller, { file: "main.ts", name: "Caller", mcfunction: true });
    expect(() => build()).toThrow(/Debug \(main\.ts\) is marked @dev/);
  });

  it("can be referenced behind __DEV__", () => {
    const { Debug } = setup();
    function Caller() {
      if (__DEV__) $.function(Debug);
      $.say("ok");
    }
    meta(Caller, { file: "main.ts", name: "Caller", mcfunction: true });
    expect(build()["data/pk/function/gen/main/caller.mcfunction"]).toBe("say ok\n");
  });
});

describe("fnId", () => {
  it("returns names immediately and is how $.function finds them", () => {
    function Helper() {
      $.say("h");
    }
    meta(Helper, { file: "a/b.ts", name: "Helper" });
    let seen = "";
    function Main() {
      seen = fnId(Helper);
      $.function(Helper);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    expect(seen).toBe("pk:gen/a/b/helper");
    expect(files["data/pk/function/gen/main/main.mcfunction"]).toBe("function pk:gen/a/b/helper\n");
    expect(files["data/pk/function/gen/a/b/helper.mcfunction"]).toBe("say h\n");
  });
});

describe("function property names as values", () => {
  it("explain how to write them", () => {
    function Main() {
      $.scoreboard.players.set("@s").name(5);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/"name" can't be written as a property after "scoreboard players set @s".*Use parentheses instead: \("name"\)/);
  });

  it("work in parentheses", () => {
    function Main() {
      $.scoreboard.players.set("@s")("name", 5);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe("scoreboard players set @s name 5\n");
  });
});

describe("macro functions", () => {
  it("turns parameters into macro arguments and lines that use them into macro lines", () => {
    function Teleport(args: any) {
      $.say("start");
      $.tp(args.target, args.pos);
      $.scoreboard.players.set(args.target, "obj", args.amount);
      $(macro`tp @s ${args.destination}`);
      $.tellraw("@a", { text: args.name.quoted, color: "red" });
      $.function("pk:other", { Count: args.amount, Name: args.name.quoted });
    }
    meta(Teleport, { file: "main.ts", name: "Teleport", mcfunction: true });
    expect(build()["data/pk/function/gen/main/teleport.mcfunction"]).toBe(
      [
        "say start",
        "$tp $(target) $(pos)",
        "$scoreboard players set $(target) obj $(amount)",
        "$tp @s $(destination)",
        '$tellraw @a {text:"$(name)",color:"red"}',
        '$function pk:other {Count:$(amount),Name:"$(name)"}',
        "",
      ].join("\n"),
    );
  });

  it("writes macro arguments as JSON strings in text before SNBT text components", () => {
    function Hello(args: any) {
      $.tellraw("@a", { text: args.name });
      $.tellraw("@a", { text: args.name.quoted });
    }
    meta(Hello, { file: "main.ts", name: "Hello", mcfunction: true });
    resetState(parseNamespace("pk:gen"), { version: "1.20.4", packFormat: 26 });
    meta(Hello, { file: "main.ts", name: "Hello", mcfunction: true });
    expect(build(26)["data/pk/functions/gen/main/hello.mcfunction"]).toBe(
      '$tellraw @a {"text":"$(name)"}\n$tellraw @a {"text":"$(name)"}\n',
    );
  });

  it("writes text before SNBT text components as JSON, with nbt.raw for JSON written by hand", () => {
    resetState(parseNamespace("pk:gen"), { version: "1.20.4", packFormat: 26 });
    function Old() {
      $.tellraw("@a", "hi");
      $.tellraw("@a", ["a", { text: "b", clickEvent: { action: "run_command", value: "/say hi" }, skip: undefined }]);
      $.tellraw("@a", nbt.raw('{"text":"raw","color":"gold"}'));
    }
    meta(Old, { file: "main.ts", name: "Old", mcfunction: true });
    expect(build(26)["data/pk/functions/gen/main/old.mcfunction"]).toBe(
      'tellraw @a "hi"\n' +
        'tellraw @a ["a",{"text":"b","clickEvent":{"action":"run_command","value":"/say hi"}}]\n' +
        'tellraw @a {"text":"raw","color":"gold"}\n',
    );

    for (const [what, value] of [
      ["typed numbers", { text: "x", n: nbt.int(1) }],
      ["bigints", { text: "x", n: 1n }],
    ] as const) {
      resetState(parseNamespace("pk:gen"), { version: "1.20.4", packFormat: 26 });
      const Bad = () => $.tellraw("@a", value);
      meta(Bad, { file: "main.ts", name: "Bad", mcfunction: true });
      expect(() => build(26), what).toThrow(/NBT number types .* don't exist in text components before 1\.21\.5/);
    }
    resetState(parseNamespace("pk:gen"), { version: "1.20.4", packFormat: 26 });
    const Nested = () => $.tellraw("@a", { extra: [nbt.raw("{}")] });
    meta(Nested, { file: "main.ts", name: "Nested", mcfunction: true });
    expect(() => build(26)).toThrow(/nbt\.raw\(\.\.\.\) only works as a whole text component/);
  });

  it("calls macro functions with arguments through the normal function command", () => {
    function Greet(args: any) {
      $.say(macro`hi ${args.name}`);
    }
    function Main() {
      $.function(Greet, { name: "Steve" });
      $.function(Greet).with.storage("pk:s", "args");
    }
    meta(Greet, { file: "main.ts", name: "Greet" });
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    const files = build();
    expect(files["data/pk/function/gen/main/main.mcfunction"]).toBe(
      'function pk:gen/main/greet {name:"Steve"}\nfunction pk:gen/main/greet with storage pk:s args\n',
    );
    expect(files["data/pk/function/gen/main/greet.mcfunction"]).toBe("$say hi $(name)\n");
  });

  it("rejects macro arguments used in another function", () => {
    function Outer(args: any) {
      $.function(() => $.say(args.name));
    }
    meta(Outer, { file: "main.ts", name: "Outer", mcfunction: true });
    expect(() => build()).toThrow(/args\.name belongs to Outer.*but is used in <anonymous>.*pass it on/);
  });

  it("refuses to turn macro arguments into plain text", () => {
    function Main(args: any) {
      $(`tp @s ${args.x}`);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/args\.x can't become plain text\. Pass it directly.*macro template/);
  });

  it("never treats plain text as a macro, even with $(...) in it", () => {
    function Main(args: any) {
      $.say("costs $(price)");
      $.say(args.price);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe("say costs $(price)\n$say $(price)\n");
  });

  it("builds text with macro`...`, usable anywhere a value goes", () => {
    function Main(args: any) {
      $.tp("@s", macro`${args.x} ${args.y} ${args.z}`);
      $.execute.as(macro`@e[tag=${args.tag},limit=1]`).run.say("hi");
      $.tellraw("@a", { text: macro`"Hello ${args.name}!"`, extra: [{ text: args.who.quoted }] });
      $(macro`say ${args.name} and ${5}`);
      $(macro`say no arguments`);
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe(
      [
        "$tp @s $(x) $(y) $(z)",
        "$execute as @e[tag=$(tag),limit=1] run say hi",
        '$tellraw @a {text:"Hello $(name)!",extra:[{text:"$(who)"}]}',
        "$say $(name) and 5",
        "say no arguments",
        "",
      ].join("\n"),
    );
  });

  it("rejects macro`...` mixing arguments of two functions", () => {
    let outer: any;
    function Inner(args: any) {
      $(macro`say ${args.a} ${outer.b}`);
    }
    function Outer(args: any) {
      outer = args;
      $.function(Inner, { a: 1 });
    }
    meta(Inner, { file: "main.ts", name: "Inner" });
    meta(Outer, { file: "main.ts", name: "Outer", mcfunction: true });
    expect(() => build()).toThrow(/mixes macro arguments of Inner .* and Outer/);
  });

  it("keeps macro arguments out of tags and resources", () => {
    function Main(args: any) {
      resource("advancement", "pk:adv", { rewards: { experience: args.xp } });
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(() => build()).toThrow(/Macro arguments only work in commands, not in advancement "pk:adv"/);
  });

  it("lets argument types adapt macro arguments, except macro`...` text", () => {
    setParserOverrides({ "brigadier:integer": { macro: (text) => `[${text}]` } });
    try {
      function Main(args: any) {
        $.scoreboard.players.set("@s", "obj", args.n);
        $.scoreboard.players.set("@s", "obj", macro`${args.n}`);
      }
      meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
      expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe(
        "$scoreboard players set @s obj [$(n)]\n$scoreboard players set @s obj $(n)\n",
      );
    } finally {
      setParserOverrides({});
    }
  });

  it("rejects names the game doesn't accept and old versions", () => {
    function Bad(args: any) {
      $.say(args["Pos[0]"]);
    }
    meta(Bad, { file: "main.ts", name: "Bad", mcfunction: true });
    expect(() => build()).toThrow(/Invalid macro argument name "Pos\[0\]".*letters, digits and _/);

    resetState(parseNamespace("pk:gen"), { version: "1.20.1", packFormat: 15 });
    function Old(args: any) {
      $.say(args.x);
    }
    meta(Old, { file: "main.ts", name: "Old", mcfunction: true });
    expect(() => build(15)).toThrow(/Old \(main\.ts\) uses macro argument args\.x\. Macros need Minecraft 1\.20\.2 or newer/);
  });

  it("treats every function the same: parameters alone don't make a macro function", () => {
    resetState(parseNamespace("pk:gen"), { version: "1.20.1", packFormat: 15 });
    function Unused(_ctx: unknown) {
      $.say("hi");
    }
    const Defaults = (args: any = {}) => $.say(String(Object.keys(args).length));
    meta(Unused, { file: "main.ts", name: "Unused", mcfunction: true });
    meta(Defaults, { file: "main.ts", name: "Defaults", mcfunction: true });
    const files = build(15);
    expect(files["data/pk/functions/gen/main/unused.mcfunction"]).toBe("say hi\n");
    // Every function gets `args`, so a default value isn't used.
    expect(files["data/pk/functions/gen/main/defaults.mcfunction"]).toBe("say 0\n");
  });
});

describe("namespace values", () => {
  it("knows the namespace and where function names start", () => {
    expect(__NAMESPACE__).toBe("pk");
    expect(__FUNCTION_PREFIX__).toBe("pk:gen/");
    resetState(parseNamespace("other"));
    expect(__NAMESPACE__).toBe("other");
    expect(__FUNCTION_PREFIX__).toBe("other:");
  });

  it("makes ids in the namespace, also from macro arguments", () => {
    expect(id("rewards/daily")).toBe("pk:rewards/daily");
    function Main(args: any) {
      $.function(id("helpers/x"));
      $.function(id(macro`rewards/${args.kind}`));
      $.function(id(args.name));
    }
    meta(Main, { file: "main.ts", name: "Main", mcfunction: true });
    expect(build()["data/pk/function/gen/main/main.mcfunction"]).toBe(
      "function pk:helpers/x\n$function pk:rewards/$(kind)\n$function pk:$(name)\n",
    );
  });
});
