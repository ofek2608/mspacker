---
title: Custom parsers
description: Add or change argument types for versions mcjspacker2 doesn't know yet.
---

When a new Minecraft version adds an argument type, or changes the format of an existing one, you
don't have to wait for a mcjspacker2 update. Define the parser in your config:

```ts
import { defineConfig, defineParser } from "mcjspacker2";

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

`mcjs2 gen` warns about parsers it doesn't know, with their ids. Look them up in
`commands.json` from the reports (`~/.cache/mcjspacker2/<version>/<jar sha1>/reports/`) to see where
they're used and their properties.

## Fields

Every field is optional. Fields you leave out keep the built-in behavior, or the `string` fallback
for unknown parsers.

| Field | Used by | |
|---|---|---|
| `type` | `mcjs2 gen` | The TypeScript type in generated signatures, as source text. Can use any type exported from `#mc`. Run `mcjs2 gen` again after changing it. |
| `test(value, props, ctx)` | build | Whether a value fits this argument. Used to pick between overloads, so keep it as strict as you can. |
| `serialize(value, props, ctx)` | build | The command text for a value. |
| `examples` | probe | Values the [version probe](/reference/versions/#parser-probe) uses to test this parser on a real server. |

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
included. `FORMAT_BELOW_NAME` and `FORMAT_SNBT_TEXT` are exported from `mcjspacker2` as examples of
thresholds the built-in parsers use. The built-in definitions are exported as `PARSERS`, so you can
wrap one:

```ts
import { defineParser, PARSERS } from "mcjspacker2";

const base = PARSERS["minecraft:component"];
const component = defineParser({
  serialize: (v, props, ctx) => base.serialize(v, props, ctx).replaceAll("§", ""),
});
```
