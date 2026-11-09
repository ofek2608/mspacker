import { describe, expect, it } from "vitest";
import { anonymousId, camel, namedFunctionId, overrideId, parseNamespace, snake } from "../src/runtime/naming.js";

describe("parseNamespace", () => {
  it.each([
    ["mypack", { ns: "mypack", prefix: "" }],
    ["mypack:", { ns: "mypack", prefix: "" }],
    ["mypack:generated", { ns: "mypack", prefix: "generated/" }],
    ["mypack:generated/", { ns: "mypack", prefix: "generated/" }],
    ["mypack:a/b/", { ns: "mypack", prefix: "a/b/" }],
  ])("%s", (input, expected) => {
    expect(parseNamespace(input)).toEqual(expected);
  });

  it("rejects invalid namespaces", () => {
    expect(() => parseNamespace("My Pack")).toThrow(/Invalid namespace/);
    expect(() => parseNamespace("ok:Bad Path")).toThrow(/Invalid path segment/);
  });
});

describe("snake", () => {
  it.each([
    ["MyFunction", "my_function"],
    ["myFunction", "my_function"],
    ["foo", "foo"],
    ["HTTPGet", "h_t_t_p_get"],
    ["already_snake", "already_snake"],
  ])("%s -> %s", (input, expected) => expect(snake(input)).toBe(expected));
});

describe("function ids", () => {
  const spec = parseNamespace("mypack:generated");
  it("combines file path and function name", () => {
    expect(namedFunctionId(spec, "combat/Arena.ts", "StartRound")).toBe("mypack:generated/combat/arena/start_round");
  });
  it("returns null for unparsable names", () => {
    expect(namedFunctionId(spec, "a.ts", undefined)).toBeNull();
    expect(namedFunctionId(spec, "a.ts", "$weird")).toBeNull();
    expect(namedFunctionId(spec, "a.ts", "default")).toBeNull();
  });
  it("resolves overrides", () => {
    expect(overrideId(spec, "other:x/y")).toBe("other:x/y");
    expect(overrideId(spec, "x/y")).toBe("mypack:generated/x/y");
    expect(() => overrideId(spec, "Bad Id")).toThrow();
  });
  it("builds anonymous ids", () => {
    expect(anonymousId(spec, "main.ts", "abcd1234")).toBe("mypack:generated/main/__anon/abcd1234");
  });
  it("camel-cases argument names for generated parameters", () => {
    expect(camel("max_count")).toBe("maxCount");
    expect(camel("targets")).toBe("targets");
    expect(camel("Target-Pos")).toBe("targetPos");
    expect(camel("")).toBe("arg");
  });
});
