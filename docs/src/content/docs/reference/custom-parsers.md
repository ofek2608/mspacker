---
title: New value types
description: Advanced. Teach MSPacker about values that a new Minecraft version added or changed.
---

:::note
This page is for when Minecraft releases something MSPacker doesn't know yet. You won't need it
for normal use.
:::

Every kind of value in a command has an id, like `minecraft:particle` or `minecraft:vec3`. When a
new Minecraft version adds a kind of value, `mspacker gen` warns about it and lets you pass any string
there. When a version changes how a value is written, the output may be wrong for it. In both
cases you can describe the value in your config instead of waiting for an update:

```ts
import { defineConfig, defineParser } from "mspacker";

export default defineConfig({
  version: "27.1",
  namespace: "mypack",
  parsers: {
    // A parser this version introduced
    "minecraft:brand_new": defineParser({ type: '"a" | "b"', examples: ["a"] }),

    // Change an existing one, depending on the version
    "minecraft:particle": defineParser({
      type: (props, ctx) => (ctx.packFormat >= 130 ? "string | { type: string }" : "string"),
      test: (v) => typeof v === "string" || typeof v === "object",
      serialize: (v, props, ctx) => (typeof v === "string" ? v : JSON.stringify(v)),
    }),
  },
});
```

`mspacker gen` warns about parsers it doesn't know, with their ids. Look them up in
`commands.json` from the reports (`~/.cache/mspacker/<version>/<jar sha1>/reports/`) to see where
they're used and their properties.

## Fields

Every field is optional. Fields you leave out keep the built-in behavior, or the `string` fallback
for unknown parsers.

| Field | Used by | |
|---|---|---|
| `type` | `mspacker gen` | The TypeScript type in generated signatures, as source text. Can use any type exported from `#mc`. Run `mspacker gen` again after changing it. |
| `test(value, props, ctx)` | build | Whether a value fits. When a command accepts different kinds of values at the same spot (a player or a position in `tp`), this decides which one was meant, so keep it strict. |
| `serialize(value, props, ctx)` | build | The command text for a value. |
| `examples` | tests | Sample values MSPacker's own version tests use on a real server. |

`type` and `examples` can be a value or a function of `(props, ctx)`.

- `props` are the parser's properties from `commands.json`, such as
  `{ registry: "minecraft:item" }` or `{ min: 0, max: 10 }`.
- `ctx` describes the version:

  ```ts
  interface ParserContext {
    version: string;      // "1.21.4"
    packFormat: number;   // data pack format, e.g. 61. Use this for version checks.
    hasRegistry(registry: string): boolean;
    registryIds(registry: string): string[];
  }
  ```

Compare `packFormat` rather than the version string: it increases with every version, snapshots
included. `FORMAT_BELOW_NAME` and `FORMAT_SNBT_TEXT` are exported from `mspacker` as examples of
thresholds the built-in parsers use. The built-in definitions are exported as `PARSERS`, so you can
wrap one:

```ts
import { defineParser, PARSERS } from "mspacker";

const base = PARSERS["minecraft:component"];
const component = defineParser({
  serialize: (v, props, ctx) => base.serialize(v, props, ctx).replaceAll("§", ""),
});
```
