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
  it("emits one function per root command", () => {
    expect(result.stats.commands).toBe(13);
    expect(commands).toContain("export function Tp(location: Vec3): void;");
    expect(commands).toContain("export function Say(message: string): void;");
  });

  it("folds prefix overloads into optional params", () => {
    expect(commands).toContain("export function Tp(targets: Selector, location?: Vec3, rotation?: Rotation): void;");
  });

  it("builds a chain class for execute", () => {
    expect(result.stats.chains).toBe(1);
    expect(commands).toContain("export class ExecuteChain extends Chain");
    expect(commands).toContain("  Run(command: RunTarget): void;");
    expect(commands).toContain("export function Execute(): ExecuteChain;");
  });

  it("uses registry id unions", () => {
    expect(commands).toMatch(/Setblock\(pos: BlockPos, block: Id<"block">/);
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
        `import { Tp, Execute, Say, Function, Setblock, Effect } from "./gen/index.js";
export function Main() {
  Tp("@a", [0, "~1", "~2"]);
  Tp("@a", ["^", "^1", "^2"]);
  Execute().As("@a").If("entity", "@s").Run(() => Say("x"));
  Function(Main);
  Setblock([0, 0, 0], "stone");
  Effect("give", "@s", "minecraft:speed", 10);
}
// @ts-expect-error wrong arity for a position
Tp("@a", [0, 1]);
// @ts-expect-error local and world coordinates can't mix
Tp("@a", [0, "~1", "^"]);
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
