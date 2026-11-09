---
title: Writing commands
description: How to write Minecraft commands in TypeScript with $.
---

Every command starts with `$`. Write the command's words with dots between them, and put the values
you'd type (players, positions, numbers, text) in parentheses:

| In Minecraft | In TypeScript |
|---|---|
| `say hello` | `$.say("hello")` |
| `tp @a 0 64 0` | `$.tp("@a", "0 64 0")` |
| `give @s diamond 3` | `$.give("@s", "diamond", 3)` |
| `effect give @a speed 10 1` | `$.effect.give("@a", "speed", 10, 1)` |
| `scoreboard players add @s kills 1` | `$.scoreboard.players.add("@s", "kills", 1)` |
| `title @a title {"text":"Fight!"}` | `$.title("@a").title({ text: "Fight!" })` |
| `time set day` | `$.time.set.day` |
| `reload` | `$.reload()` |

```ts
import { $ } from "#mc";

/** @mcfunction */
export function Welcome() {
  $.say("Welcome!");
  $.effect.give("@a", "regeneration", 5, 1);
  $.tellraw("@a", { text: "Have fun", color: "gold" });
}
```

You don't need to remember every command: type `$.` and your editor lists them all. After
`$.scoreboard.` it lists what can come next, and inside the parentheses it shows what each value is.

## Words with special spelling

Words are written in lowercase with underscores, the way most Minecraft commands already are:

| In Minecraft | In TypeScript |
|---|---|
| `ban-ip` | `$.ban_ip` |
| `team modify red collisionRule never` | `$.team.modify("red").collision_rule.never` |
| `gamerule keepInventory true` | `$.gamerule.keep_inventory(true)` |

Words that are also JavaScript words work as they are: `$.function(...)`, `$.execute.if`,
`$.execute.in(...)`, `$.return(1)`.

## Names as words

Names like team names, objectives or item ids can be written either way:

```ts
$.team.modify("red").collision_rule.never;    // team modify red collisionRule never
$.team.modify.red.collision_rule.never;       // the same

$.scoreboard.objectives.add.kills.dummy;      // scoreboard objectives add kills dummy
$.give("@s").diamond(3);                      // give @s diamond 3
```

Use parentheses for everything that isn't a plain name: players (`"@a"`), positions, numbers, text
and anything stored in a variable.

:::note
If your `tsconfig.json` enables `noUncheckedIndexedAccess`, write names in parentheses instead:
`$.team.modify("red")`.
:::

## Splitting values

Values can go in one pair of parentheses or several. These are the same:

```ts
$.tp("@a", "~ ~1 ~", "90 0");
$.tp("@a")("~ ~1 ~")("90 0");
```

## Positions

Positions are written as one string, exactly like in game:

```ts
$.tp("@s", "~ ~1 ~");                       // relative to the player
$.tp("@s", "0 64 0");                       // exact position
$.tp("@s", "^ ^ ^5");                       // 5 blocks forward
$.fill("~-1 ~ ~-1", "~1 ~ ~1", "glass");
```

Your editor warns you when a position can't work, like `"0 64"` (missing a coordinate) or
`"~ ~ ^1"` (`^` can't be mixed with other kinds).

## Saving part of a command

A command you start can be stored in a variable and finished more than once. Each one becomes its
own line:

```ts
const atPlayers = $.execute.as("@a").at("@s");
atPlayers.run.say("one");   // execute as @a at @s run say one
atPlayers.run.say("two");   // execute as @a at @s run say two
```

## Writing a command as text

Calling `$` itself writes a line exactly as you give it. Use it for anything mcjspacker2 doesn't
cover, or for [macro lines](https://minecraft.wiki/w/Function_(Java_Edition)#Macros):

```ts
$("say written as-is");
$("$tp @s $(x) $(y) $(z)");
```

More in [tags, files and text commands](/guides/raw-content/#commands-as-text).

## Common errors

**`No syntax of "tp" matches arguments ("@a", "0 1")`**: the values don't fit the command. Here the
position is missing a coordinate. The error shows the line in your code.

**`Incomplete command "execute as @a"`**: a command was started but not finished. Add the rest, for
example `.run.say("hi")`.

**`Unknown subcommand "sideways" after "execute as @a"`**: there's no such word at that point.
Your editor's suggestions show what fits.

## Commands that don't run in data packs

Some commands need more permissions than data packs have, like `op`, `stop` and `ban`. They're
still listed, with a note, but only work from the server console.

## Different Minecraft versions

The commands you get match the Minecraft version in your [config](/reference/configuration/#version):
commands that don't exist in your version aren't offered, and values are written the way your
version expects. Run `mcjs2 gen` after changing versions.
