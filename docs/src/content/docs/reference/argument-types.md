---
title: Argument types
description: The TypeScript type and output of every command argument.
---

Every command argument in Minecraft names a parser, like `minecraft:vec3` or `brigadier:integer`.
mcjspacker2 maps each parser to a TypeScript type, a runtime check that picks between sibling syntaxes,
and a serializer. This page lists them. Types are exported from `#mc`, so you can use them in your
own helpers:

```ts
import { $, type BlockPos } from "#mc";

function pillar(base: BlockPos, height: number) { /* ... */ }
```

## Numbers, strings, booleans

| Parser | Type | Example |
|---|---|---|
| `brigadier:integer`, `brigadier:long` | `number` | `5` |
| `brigadier:float`, `brigadier:double` | `number` | `1.5` |
| `brigadier:bool` | `boolean` | `true` |
| `brigadier:string` | `string` | Quoted when needed (for `phrase` strings) |
| `minecraft:message` | `string` | `"hello there"` |

## Positions and rotations

Written as one string, like in game.

| Parser | Type | Example |
|---|---|---|
| `minecraft:vec3` | `Vec3` | `"~ ~1 ~"`, `"0.5 64 0.5"`, `"^ ^ ^1"` |
| `minecraft:block_pos` | `BlockPos` | `"0 64 0"`, `"~ ~-1 ~"` |
| `minecraft:vec2` | `Vec2` | `"1 ~"` |
| `minecraft:column_pos` | `ColumnPos` | `"0 0"` |
| `minecraft:rotation` | `Rotation` | `"90 0"`, `"~ ~"` |
| `minecraft:angle` | `number \| RotationCoord` | `90`, `"~"` |

`Vec3` and `BlockPos` accept either all world coordinates (`5`, `~`, `~5`) or all local ones
(`^`, `^5`). Two-coordinate types don't accept local coordinates. The build rejects mixes and wrong
coordinate counts.

## Entities and players

| Parser | Type | Example |
|---|---|---|
| `minecraft:entity` | `Selector` | `"@s"`, `"@e[type=pig,limit=1]"`, `"Steve"`, a UUID |
| `minecraft:game_profile` | `Selector` | `"@a"`, `"Steve"` |
| `minecraft:score_holder` | `ScoreHolder` | `"@s"`, `"#global"`, `"*"` |

## Ids

| Parser | Type |
|---|---|
| `minecraft:resource`, `minecraft:resource_key` | `Id<registry>` |
| `minecraft:resource_or_tag`, `minecraft:resource_or_tag_key` | `` Id<registry> \| `#${string}` `` |
| `minecraft:block_state` | `Id<"block">`, with states and NBT: `"oak_stairs[facing=east]"` |
| `minecraft:block_predicate` | `` Id<"block"> \| `#${string}` `` |
| `minecraft:item_stack` | `Id<"item">`, with components: `"diamond_sword[damage=5]"` |
| `minecraft:item_predicate` | `` Id<"item"> \| `#${string}` \| "*" `` |
| `minecraft:mob_effect`, `minecraft:entity_summon`, `minecraft:item_enchantment`, `minecraft:particle` | `Id<...>` of their registry |
| `minecraft:function` | `FnRef`: a TypeScript function, an id or a `#tag` |
| `minecraft:dimension` | `Dimension` |
| `minecraft:resource_location` | `string` |

`Id<"item">` autocompletes every item id of your version, with and without `minecraft:`, and
accepts any other string for ids your pack or a mod defines.

## Text and NBT

| Parser | Type | Output |
|---|---|---|
| `minecraft:component` | `TextComponent` (1.21.5+) / `LegacyTextComponent` | JSON: `{"text":"hi","color":"red"}` |
| `minecraft:style` | `NbtCompound` | SNBT |
| `minecraft:nbt_compound_tag`, `minecraft:nbt` | `NbtCompound` | SNBT: `{a:1,b:"x"}` |
| `minecraft:nbt_tag` | `NbtValue` | SNBT |
| `minecraft:nbt_path` | `string` | `"Inventory[0].id"` |

Text components can be a string, an object or an array. From 1.21.5 the object form uses
snake_case event keys (`click_event`, `hover_event`); before that, `clickEvent` and `hoverEvent`.
See [NBT values](/guides/raw-content/#nbt-values) for typed numbers like `1b` and `5f`.

## Inline definitions

These accept an id of a data pack resource or an inline definition:

| Parser | Type | Example |
|---|---|---|
| `minecraft:loot_table`, `minecraft:loot_predicate`, `minecraft:loot_modifier`, `minecraft:dialog` | `string \| NbtCompound` | `"mypack:my_table"`, `{ type: "minecraft:random_chance", chance: 0.5 }` |
| `minecraft:context_int_provider`, `minecraft:context_float_provider` | `string \| number \| NbtCompound` | `3`, `{ type: "minecraft:uniform", min: 1, max: 2 }` |
| `minecraft:slot_source` | `string \| NbtCompound` | `"container.*"`, `{ type: "minecraft:slot_range", slots: "container.0" }` |

A plain number passed to a number provider is written as `{type:"minecraft:constant",value:N}`,
because the game reads a bare number there as an id.

## Fixed words

| Parser | Type |
|---|---|
| `minecraft:entity_anchor` | `"eyes" \| "feet"` |
| `minecraft:gamemode` | `"survival" \| "creative" \| "adventure" \| "spectator"` |
| `minecraft:heightmap` | `Heightmap` |
| `minecraft:operation` | `"=" \| "+=" \| "-=" \| ...` |
| `minecraft:swizzle` | `"x" \| "xz" \| "xyz" \| ...` |
| `minecraft:color`, `minecraft:team_color` | `ChatColor` |
| `minecraft:scoreboard_slot` | `ScoreboardSlot` (`below_name` from 1.20.2, `belowName` before) |
| `minecraft:template_mirror`, `minecraft:template_rotation` | `TemplateMirror`, `TemplateRotation` |

## Others

| Parser | Type | Example |
|---|---|---|
| `minecraft:int_range`, `minecraft:float_range` | `Range` | `5`, `"1.."`, `"..10"`, `"1..10"` |
| `minecraft:time` | `Duration` | `20`, `"1s"`, `"0.5d"` |
| `minecraft:item_slot`, `minecraft:item_slots` | `string` | `"weapon.mainhand"`, `"container.*"` |
| `minecraft:objective`, `minecraft:team`, `minecraft:objective_criteria` | `string` | `"kills"`, `"dummy"` |
| `minecraft:uuid` | `string` | |
| `minecraft:hex_color` | `string` | `"FF00FF"` |

Parsers not listed fall back to `string`, and `mcjs2 gen` warns about them. You can
[define them yourself](/reference/custom-parsers/).
