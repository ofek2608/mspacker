---
title: Tags, files and text commands
description: Tags, advancements and other data pack files, hand-written functions, and commands written as text.
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

Tags you write here are combined with the ones MSPacker creates, so a `load.json` here and
`@load` functions work together.

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
Functions in a tag are written even without `@mcfunction`.

## Advancements, predicates and other files

```ts
import { resource } from "#mc";

resource("advancement", "mypack:root", {
  criteria: { tick: { trigger: "minecraft:tick" } },
  rewards: { function: "mypack:main/init" },
});
```

The first argument is the folder under `data/<namespace>/`: `advancement`, `predicate`,
`loot_table`, `recipe`, `item_modifier`, ...

`tag` and `resource` can be used anywhere in a file, inside or outside functions.

## Commands as text

Calling `$` writes a command exactly as you give it. Use it for anything MSPacker doesn't cover,
or for macro lines (usually [macro functions](/guides/macros/) are easier):

```ts
import { $, fnId } from "#mc";

/** @mcfunction */
export function Main() {
  $("say this line is copied as-is");
  $("$tp @s $(x) $(y) $(z)");                    // macro line
  $(`schedule function ${fnId(Tick)} 1s`);        // fnId gives a function's name
}
```

`fnId(Tick)` returns the function's name in game, like `mypack:main/tick`, and makes sure the
function is in the pack.

## NBT

Objects, arrays, strings, numbers and booleans are written as NBT. For numbers of a specific kind
(`1b`, `5f`) and typed arrays, use `nbt`:

```ts
import { $, nbt } from "#mc";

$.summon("pig", "~ ~ ~", { NoAI: nbt.byte(1), Health: nbt.float(5), UUID: nbt.intArray([1, 2, 3, 4]) });
// summon pig ~ ~ ~ {NoAI:1b,Health:5f,UUID:[I;1,2,3,4]}
```

`nbt.raw("...")` writes NBT text as-is.
