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
    expect(commands).toMatch(/\(targets: Selector, location: Vec3, rotation: Rotation\): N\d+;/);
  });

  it("merges sibling arguments of the same type", () => {
    expect(commands).toContain("/** `tp <destination>` or `tp <targets>` */");
    expect(commands).toMatch(/\(destination: Selector\): N\d+ & N\d+;/);
  });

  it("uses the target's type for redirects", () => {
    expect(commands).toMatch(/\/\*\* `execute run` \*\/\n  readonly run: Commands;/);
    expect(commands).toContain('readonly "<": ');
  });

  it("uses registry id unions", () => {
    expect(commands).toContain('(pos: BlockPos, block: Id<"block">)');
    expect(result.files["registries.ts"]).toContain('"block": ');
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
        `import { $ } from "./gen/index.js";
export function Main() {
  $.tp("@a", "0 ~1 ~2");
  $.tp("@a")("^ ^1 ^2");
  $.tp("@a")("@p");
  $.execute.as("@a").if.entity("@s").run.say("x");
  $.execute.as("@a").run(() => $.say("x"));
  $.execute.if.score("@s", "a")["<"]("@s", "b").run("say raw");
  $.function(Main);
  $.setblock("0 0 0", "stone");
  $.effect.give("@s", "minecraft:speed", 10);
  $.scoreboard.players.set("@s", "kills", 0);
  $("$say $(message)");
  $\`function \${Main}\`;
}
// @ts-expect-error wrong arity for a position
$.setblock("0 1", "stone");
// @ts-expect-error local and world coordinates can't mix
$.setblock("0 ~1 ^", "stone");
// @ts-expect-error positions are strings, not arrays
$.setblock([0, 1, 2], "stone");
// @ts-expect-error unknown subcommand
$.execute.sideways;
// @ts-expect-error literals are properties, not string arguments
$.effect("give", "@s", "speed");
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
