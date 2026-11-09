import { describe, expect, it } from "vitest";
import { nbt, snbt } from "../src/runtime/nbt.js";

describe("snbt", () => {
  it("serializes compounds", () => {
    expect(snbt({ text: "hi", bold: true, n: 3, f: 1.5, "weird key": "x" })).toBe('{text:"hi",bold:true,n:3,f:1.5d,"weird key":"x"}');
  });
  it("escapes strings", () => {
    expect(snbt('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
  it("supports typed numbers and arrays", () => {
    expect(snbt({ b: nbt.byte(1), s: nbt.short(2), l: nbt.long(3), fl: nbt.float(0.5) })).toBe("{b:1b,s:2s,l:3L,fl:0.5f}");
    expect(snbt(nbt.intArray([1, 2]))).toBe("[I;1,2]");
    expect(snbt(nbt.byteArray([1]))).toBe("[B;1b]");
    expect(snbt([1, 2, { a: nbt.raw("1b") }])).toBe("[1,2,{a:1b}]");
  });
  it("skips undefined keys", () => {
    expect(snbt({ a: 1, b: undefined })).toBe("{a:1}");
  });
});
