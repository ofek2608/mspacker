import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { generate } from "../src/codegen/generate.js";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const result = generate(fixture("commands.json"), fixture("registries.json"), { version: "test", packFormat: 108 });
const commands = result.files["commands.ts"]!;

describe("generate", () => {
  it("types $ with one interface per node: literals are properties, arguments are calls", () => {
    expect(result.stats.commands).toBe(13);
    expect(commands).toContain("export const $ = createRoot(tree) as Commands;");
    expect(commands).toMatch(/\/\*\* `tp` \*\/\n  readonly tp: N\d+;/);
    expect(commands).toMatch(/\(targets: Arg<Selector>, location: Arg<Vec3>, rotation: Arg<Rotation>\): N\d+;/);
  });

  it("merges sibling arguments of the same type", () => {
    expect(commands).toContain("/** `tp <destination>` or `tp <targets>` */");
    expect(commands).toMatch(/\(destination: TypedArg<Selector>\): N\d+ & N\d+;/);
  });

  it("uses the target's type for redirects", () => {
    expect(commands).toMatch(/\/\*\* `execute run` \*\/\n  readonly run: Commands;/);
    expect(commands).toContain('readonly "<": ');
  });

  it("uses registry id unions", () => {
    expect(commands).toContain('(pos: Arg<BlockPos>, block: Arg<Id<"block">>)');
    expect(result.files["registries.ts"]).toContain('"block": ');
  });

  it("emits iterable registry id lists", () => {
    expect(result.files["registries.ts"]).toMatch(/export const registries: .*= \{\n  "[a-z_/]+": \[/);
    expect(result.files["registries.ts"]).toMatch(/\n  "block": \["[a-z_]+", /);
  });

  it("reports no warnings for vanilla parsers", () => {
    expect(result.warnings).toEqual([]);
  });

  describe("type-checks", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcjs2-codegen-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("generated code and sample usage compile with tsc", () => {
      const gen = join(dir, "gen");
      mkdirSync(gen);
      for (const [name, content] of Object.entries(result.files)) writeFileSync(join(gen, name), content);
      writeFileSync(
        join(dir, "use.ts"),
        `import { $, fnId, macro, type Macro, type MacroArg, type Selector, type Vec3 } from "./gen/index.js";
export function Main() {
  $.tp("@a", "0 ~1 ~2");
  $.tp("@a")("^ ^1 ^2");
  $.tp("@a")("@p");
  $.execute.as("@a").if.entity("@s").run.say("x");
  $.execute.as("@a").run.function(() => $.say("x"));
  $.execute.if.score("@s", "a")["<"]("@s", "b").run("say raw");
  $.function(Main);
  $.setblock("0 0 0", "stone");
  $.effect.give("@s", "minecraft:speed", 10);
  $.scoreboard.players.set("@s", "kills", 0);
  $("$say $(message)");
  $(\`function \${fnId(Main)}\`);
}
// @ts-expect-error wrong arity for a position
$.setblock("0 1", "stone");
// @ts-expect-error local and world coordinates can't mix
$.setblock("0 ~1 ^", "stone");
// @ts-expect-error positions are strings, not arrays
$.setblock([0, 1, 2], "stone");
// String arguments as properties
$.scoreboard.players.set("@s").kills(5);
$.tp["@a"]("1 2 3");
// @ts-expect-error functions are called with $.function, not $()
$(() => 1);
// @ts-expect-error unknown subcommand
$.execute.sideways;
// @ts-expect-error unknown command (the root takes no arguments as properties)
$.sya;
// @ts-expect-error not a position
$.setblock.nope;
// @ts-expect-error literals are properties, not string arguments
$.effect("give", "@s", "speed");
// Text components: the common fields are checked, any other field works (icons, newer fields).
$.tellraw("@a", { text: "hi", color: "gold", extra: [{ type: "object", sprite: "item/diamond" }], shadow_color: 5 });
$.tellraw("@a", { text: "x", color: "#ff8800", click_event: { action: "run_command", command: "/say hi" } });
// @ts-expect-error bold is true or false
$.tellraw("@a", { bold: "yes" });
// @ts-expect-error not a color
$.tellraw("@a", { color: "golden" });
// Macro arguments fit anywhere, also inside objects; only their names are checked.
export function WithArgs(args: Macro<"who" | "n" | "name" | "pos">) {
  $.tp(args.who as MacroArg<Selector>, args.pos as MacroArg<Vec3>);
  $.tellraw(args.who, { text: args.name, extra: [{ text: macro\`"\${args.name}"\` }] });
  $.setblock(macro\`\${args.n} 64 \${args.n}\`, "stone");
  $.scoreboard.players.set(args.who, "kills", args.n);
  $(macro\`say \${args.name}\`);
  // Where a command takes different kinds of values (tp <location> / <targets>), a macro argument
  // must say which it is.
  // @ts-expect-error tp takes an entity or a position here
  $.tp(args.who);
  // @ts-expect-error same for the second value (a position or an entity to teleport to)
  $.tp("@s", args.pos);
  $.tp(args.who as MacroArg<Selector>)("0 0 0");
  $.tp(args.who as MacroArg<Selector>, args.pos as MacroArg<Vec3>).facing.entity("@p");
  // @ts-expect-error a number is neither
  $.tp(args.who as MacroArg<number>);
  // @ts-expect-error not one of the declared names
  $.say(args.nope);
}
`,
      );
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            target: "ES2023",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            // The runtime source imports node builtins; user projects see its .d.ts instead.
            typeRoots: [resolve("node_modules/@types")],
            types: ["node"],
            paths: { "mcjspacker2/runtime": [resolve("src/runtime/index.ts")] },
          },
          include: ["use.ts", "gen"],
        }),
      );
      const tsc = resolve("node_modules/.bin/tsc");
      try {
        execFileSync(tsc, ["-p", dir], { encoding: "utf8", stdio: "pipe" });
      } catch (e) {
        throw new Error(`tsc failed:\n${(e as { stdout?: string }).stdout}`);
      }
    }, 60000);
  });
});
