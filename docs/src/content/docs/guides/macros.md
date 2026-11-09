---
title: Macros
description: Functions that take arguments when they're called in game.
---

A function with a parameter is a [macro function](https://minecraft.wiki/w/Function_(Java_Edition)#Macros):
the game fills in the values when it's called. Macros need Minecraft 1.20.2 or newer.

```ts
import { $, macro, type Macro } from "#mc";

export function Reward(args: Macro<"player" | "item" | "count">) {
  $.give(args.player, args.item, args.count);
  $.say(macro`gave ${args.count} ${args.item}`);
}
// $give $(player) $(item) $(count)
// $say gave $(count) $(item)
```

`Macro<...>` lists the argument names, so a typo like `args.cuont` is an error. Use `args.name`
wherever the value goes, also inside objects like NBT and text components. The commands that use it
are written as macro lines automatically.

## Calling a macro function

Call it with the values, or with `with` to take them from storage, an entity or a block:

```ts
/** @mcfunction */
export function Main() {
  $.function(Reward, { player: "@p", item: "diamond", count: 3 });
  $.function(Reward).with.storage("mypack:rewards", "daily");
}
// function mypack:main/reward {player:"@p",item:"diamond",count:3}
// function mypack:main/reward with storage mypack:rewards daily
```

If a value is missing, the game doesn't run the function at all.

## What the game puts in

A macro argument is text the game fills in, so it fits anywhere and nothing checks that the value
will make a valid command: that's up to you. Values are put in as text: a string without quotes, a
number without its suffix (`1.5d` becomes `1.5`), and `true` becomes `1`. So for an argument that
needs `true` or `false`, pass those as text.

## Building values from arguments

When an argument is the whole value, pass it as it is: `$.kill(args.target)`. When it's only part
of a value, build the value with the `macro` template:

```ts
import { $, macro, type Macro } from "#mc";

export function Score(args: Macro<"team" | "player" | "points">) {
  // a selector
  $.effect.give(macro`@a[team=${args.team}]`, "glowing", 5);
  // a storage path
  $.data.modify.storage("mypack:scores", macro`players.${args.player}`).set.value(args.points);
  // a sentence
  $.say(macro`${args.player} scored ${args.points} for ${args.team}`);
}
// $effect give @a[team=$(team)] glowing 5
// $data modify storage mypack:scores players.$(player) set value $(points)
// $say $(player) scored $(points) for $(team)
```

What `macro` makes is a macro argument too, so it fits anywhere a value goes. A normal template
string can't use arguments (`` `@a[team=${args.team}]` `` stops the build with a hint), and text you
write yourself never becomes a macro, even if it contains `$(...)`.

## When a command takes different kinds of values

Some commands take different kinds of values at the same place: `tp @s <here>` takes a position
or an entity to teleport to. A macro argument could be either, so TypeScript asks you to say which:

```ts
import { $, type Macro, type MacroArg, type Vec3 } from "#mc";

export function Warp(args: Macro<"to">) {
  $.tp("@s", args.to);                    // error: is it a position or an entity?
  $.tp("@s", args.to as MacroArg<Vec3>);  // $tp @s $(to)
}
```

The error mentions `TypedArg<...>` with the type it expected. Any argument type from the
[API reference](/reference/api/library-mc/readme/) works here (`Vec3`, `Selector`, `Rotation`, ...).

## Text in NBT and text components

A value is put in as-is, so a string inside NBT or a text component needs quotes. Use `.quoted`:

```ts
export function Welcome(args: Macro<"name">) {
  $.tellraw("@a", { text: args.name.quoted, color: "gold" });   // {text:"$(name)",color:"gold"}
}
```

The value itself must not contain `"` then.

## Limits

- Argument names can only use letters, digits and `_`. Paths like `Pos[0]` aren't allowed; copy the
  value into storage first and call the function `with storage`.
- `args` only works in the function's own commands. To use a value in a function it calls, pass it
  on: `$.function(Other, { name: args.name })`.
