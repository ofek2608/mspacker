---
title: Macros
description: Functions that take arguments when they're called in game.
---

A function with a parameter is a [macro function](https://minecraft.wiki/w/Function_(Java_Edition)#Macros):
the game fills in the values when it's called. Macros need Minecraft 1.20.2 or newer.

```ts
import { $, macro, type Macro, type Selector } from "#mc";

export function Reward(args: Macro<{ player: Selector; item: string; count: number }>) {
  $.give(args.player, args.item, args.count);
  $.say(macro`gave ${args.count} ${args.item}`);
}
// $give $(player) $(item) $(count)
// $say gave $(count) $(item)
```

Use `args.name` wherever the value goes, also inside objects like NBT and text components. The
commands that use it are written as macro lines automatically.

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

## Types

The types in `Macro<{ ... }>` say where each value can be used: `args.count` fits where a command
takes a number, `args.player` where it takes a selector. They can't be checked in game, so they're
up to you. Values are put into the command as text: a string without quotes, a number without its
suffix (`1.5d` becomes `1.5`), and `true` becomes `1`. So for a `boolean`, pass the text `"true"` or
`"false"`.

## Building text from arguments

To put arguments into text, use the `macro` template:

```ts
import { $, macro, type Macro } from "#mc";

export function Go(args: Macro<{ x: number; z: number; destination: string }>) {
  $.tp("@s", macro`${args.x} 100 ${args.z}`);   // $tp @s $(x) 100 $(z)
  $(macro`tp @s ${args.destination}`);           // $tp @s $(destination)
}
```

What `macro` makes fits anywhere a value goes, without type checks: it's up to you that it forms a
valid command. A normal template string can't use arguments (`` `tp @s ${args.x}` `` stops the
build with a hint), and text you write yourself never becomes a macro, even if it contains `$(...)`.

## Text in NBT and text components

A value is put in as-is, so a string inside NBT or a text component needs quotes. Use `.quoted`:

```ts
export function Welcome(args: Macro<{ name: string }>) {
  $.tellraw("@a", { text: args.name.quoted, color: "gold" });   // {text:"$(name)",color:"gold"}
}
```

The value itself must not contain `"` then.

## Limits

- Argument names can only use letters, digits and `_`. Paths like `Pos[0]` aren't allowed; copy the
  value into storage first and call the function `with storage`.
- `args` only works in the function's own commands. To use a value in a function it calls, pass it
  on: `$.function(Other, { name: args.name })`.
