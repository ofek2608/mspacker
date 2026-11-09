import { describe, expect, it } from "vitest";
import { HEADER, instrument } from "../src/build/transform.js";

const run = (code: string) => instrument(code, "dir/file.ts", { typescript: true }).slice(HEADER.length);

describe("instrument", () => {
  it("registers declarations with JSDoc tags", () => {
    const out = run(`/** @mcfunction */\nexport function Foo(): void {}\n`);
    expect(out).toContain(`;__mcjs_m(Foo, {"file":"dir/file.ts","name":"Foo","line":2,"mcfunction":true});`);
  });

  it("parses id overrides and load/tick", () => {
    const out = run(`/**\n * @mcfunction other:path/x\n * @tick\n */\nfunction Foo() {}\n`);
    expect(out).toContain(`"mcfunction":"other:path/x","tick":true`);
  });

  it("wraps arrows, naming them after their variable and nesting correctly", () => {
    const out = run(`/** @load */\nexport const Bar = () => () => 1;\n`);
    expect(out).toBe(
      `/** @load */\nexport const Bar = __mcjs_w(() => __mcjs_w(() => 1, {"file":"dir/file.ts","line":2}), {"file":"dir/file.ts","name":"Bar","line":2,"load":true});\n`,
    );
  });

  it("leaves untagged functions as plain metadata", () => {
    const out = run(`function helper<T>(x: T) { return x }\n`);
    expect(out).toContain(`;__mcjs_m(helper, {"file":"dir/file.ts","name":"helper","line":1});`);
    expect(out).not.toContain("mcfunction");
  });

  it("produces code esbuild accepts", async () => {
    const { transform } = await import("esbuild");
    const src = instrument(`export const f = async <T,>(a: T) => a;\nexport default function () {}\nfoo(function named() {}, x => x);`, "f.ts", { typescript: true });
    await expect(transform(src, { loader: "ts" })).resolves.toBeTruthy();
  });
});
