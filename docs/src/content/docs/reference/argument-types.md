---
title: Values
description: What to pass for players, positions, text, items and other values.
---

Your editor shows the expected kind of value for every command. This page lists them with examples.

## Numbers, text and true/false

| Value | Example |
|---|---|
| Whole and decimal numbers | `5`, `1.5` |
| True or false | `true` |
| Text, like in `say` | `"hello there"` |
| Names: objectives, teams, tags | `"kills"`, `"red"` |

## Players and entities

Selectors and player names are strings, the same as in game:

```ts
$.kill("@e[type=zombie,distance=..10]");
$.tp("Steve", "@p");
$.scoreboard.players.set("#global", "round", 1);   // fake players work too
```

## Positions and rotations

One string, the same as in game:

| Value | Example |
|---|---|
| Position | `"~ ~1 ~"`, `"0.5 64 0.5"`, `"^ ^ ^1"` |
| Block position | `"0 64 0"`, `"~ ~-1 ~"` |
| Two coordinates (x z) | `"10 -20"` |
| Rotation (yaw pitch) | `"90 0"`, `"~ ~"` |

A position uses either `~`/numbers or `^` for all three coordinates, never a mix. These types are
exported from `#mc` for your own helpers:

```ts
import { $, type BlockPos } from "#mc";

function pillar(base: BlockPos) {
  $.fill(base, base, "stone");
}
```

## Blocks, items and other ids

Ids autocomplete from your Minecraft version, with or without `minecraft:`:

```ts
$.give("@s", "diamond_sword", 1);
$.setblock("~ ~ ~", "minecraft:oak_stairs[facing=east]");
$.execute.if.block("~ ~-1 ~", "#minecraft:logs").run.say("on a log");
```

Tags (`#minecraft:logs`) work where the game accepts them, and ids from your own pack or mods are
accepted too.

## Functions

Where a command expects a function, pass the TypeScript function itself, a name, or a function tag:

```ts
$.function(Helper);
$.function("mypack:handwritten");
$.schedule.function(Tick, "1s");
```

## Text components

`tellraw`, `title` and other text are written as objects:

```ts
$.tellraw("@a", { text: "Hello ", color: "gold", extra: [{ selector: "@s" }] });
$.title("@a").title({ text: "Fight!", color: "red", bold: true });
```

A plain string works for simple text: `$.tellraw("@a", "Hello")`.

The common fields (`text`, `color`, `bold`, `extra`, `click_event`, ...) are suggested by your editor
and checked. Any other field the game knows works too, also ones added in newer versions, like icons:

```ts
$.tellraw("@a", [{ type: "object", sprite: "item/diamond" }, " found!"]);
```

Your editor can't tell a new field from a misspelled one, and neither can the game: it ignores
fields it doesn't know, so `{ text: "hi", colr: "red" }` shows "hi" without color. Wrong values of
fields it knows (`color: "redd"`) are errors when the command runs.

### Before 1.21.5

Older versions write text as JSON, and their field names differ a little (`clickEvent` and
`hoverEvent`). Objects work the same way, but their fields aren't checked, so look them up in the
[text format for your version](https://minecraft.wiki/w/Text_component_format). Numbers made with
`nbt.int(...)` and friends don't exist in JSON, use plain numbers.

To write the JSON yourself, pass it with `nbt.raw`:

```ts
$.tellraw("@a", nbt.raw('{"text":"Hello","color":"gold"}'));
```

## NBT

Objects and arrays are written as NBT:

```ts
$.summon("pig", "~ ~ ~", { NoAI: true, CustomName: { text: "Bob" } });
```

See [NBT](/mspacker/guides/raw-content/#nbt) for numbers like `1b` and `5f`.

## Ranges and times

| Value | Example |
|---|---|
| Range | `5`, `"1.."`, `"..10"`, `"1..10"` |
| Time | `20` (ticks), `"1s"`, `"0.5d"` |
