---
title: Raw content
description: Tags, JSON resources, hand-written files and raw command lines.
---

## The `datapack/` directory

Everything in `datapack/` (the [`raw`](/reference/configuration/#raw) setting) is copied into the
built pack as-is:

```
datapack/
  pack.mcmeta                              # optional: replaces the generated one
  data/mypack/function/handwritten.mcfunction
  data/mypack/advancement/root.json
  data/minecraft/tags/function/load.json
```

When a tag file exists both in `datapack/` and in the generated output (for example
`minecraft:load`, which `@load` writes to), the two are merged. Dotfiles are skipped.

Use the folder names of your version: before 1.21 (pack format 45) they are plural, like
`functions/` and `tags/functions/`.

## Tags

```ts
import { tag } from "#mc";

tag("function", "mypack:on_death", [Respawn, "mypack:handwritten"]);
tag("block", "mypack:soft", ["sand", "gravel", "#minecraft:dirt"]);
tag("function", "mypack:all", [Main], { replace: true });
```

The first argument is the folder under `tags/`: `function`, `block`, `item`, `entity_type`, ...
Functions in a tag are emitted even without an `@mcfunction` tag.

## JSON resources

```ts
import { resource } from "#mc";

resource("advancement", "mypack:root", {
  criteria: { tick: { trigger: "minecraft:tick" } },
  rewards: { function: "mypack:main/init" },
});
```

The first argument is the folder under `data/<namespace>/`: `advancement`, `predicate`,
`loot_table`, `recipe`, `item_modifier`, ...

`tag` and `resource` can be called at the top level of a module or inside a function.

## Raw commands

`raw` writes a line into the current function as-is. Use it for commands or syntax the library
doesn't cover, such as macro lines:

```ts
import { fnId, raw } from "#mc";

/** @mcfunction */
export function Main() {
  raw("say this line is copied verbatim");
  raw(`schedule function ${fnId(Tick)} 1s`);
}
```

`fnId(fn)` returns a function's id, emitting the function if it hasn't been yet.

## NBT values

Plain objects, arrays, strings, numbers and booleans become SNBT. For typed numbers and arrays,
use `nbt`:

```ts
import { nbt, Summon } from "#mc";

Summon("pig", "~ ~ ~", { NoAI: nbt.byte(1), Health: nbt.float(5), UUID: nbt.intArray([1, 2, 3, 4]) });
// summon pig ~ ~ ~ {NoAI:1b,Health:5f,UUID:[I;1,2,3,4]}
```

`nbt.raw("...")` inserts SNBT text as-is.
