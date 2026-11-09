---
title: Macros
description: Functions that take arguments when they're called in game.
---

A function that takes arguments is a [macro function](https://minecraft.wiki/w/Function_(Java_Edition)#Macros):
the game fills in the values when it's called. Macros need Minecraft 1.20.2 or newer.

```ts
import { $, macro, type Macro } from "#mc";

export function Reward({ player, item, count }: Macro) {
  $.give(player, item, count);
  $.say(macro`gave ${count} ${item}`);
}
// $give $(player) $(item) $(count)
// $say gave $(count) $(item)
```

Name the arguments you need between `{ }`; each name is the argument's name in game. Use an argument
wherever the value goes, also inside objects like NBT and text components. The commands that use
one are written as macro lines automatically.

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

When an argument is the whole value, pass it as it is: `$.kill(target)`. When it's only part of a
value, build the value with the `macro` template:

```ts
import { $, macro, type Macro } from "#mc";

export function Score({ team, player, points }: Macro) {
  // a selector
  $.effect.give(macro`@a[team=${team}]`, "glowing", 5);
  // a storage path
  $.data.modify.storage("mypack:scores", macro`players.${player}`).set.value(points);
  // a sentence
  $.say(macro`${player} scored ${points} for ${team}`);
}
// $effect give @a[team=$(team)] glowing 5
// $data modify storage mypack:scores players.$(player) set value $(points)
// $say $(player) scored $(points) for $(team)
```

What `macro` makes is a macro argument too, so it fits anywhere a value goes. A normal template
string can't use arguments (`` `@a[team=${team}]` `` stops the build with a hint), and text you
write yourself never becomes a macro, even if it contains `$(...)`.

## When a command takes different kinds of values

Some commands take different kinds of values at the same place: `tp @s <here>` takes a position
or an entity to teleport to. A macro argument could be either, so TypeScript asks you to say which:

```ts
import { $, type Macro, type MacroArg, type Vec3 } from "#mc";

export function Warp({ to }: Macro) {
  $.tp("@s", to);                    // error: is it a position or an entity?
  $.tp("@s", to as MacroArg<Vec3>);  // $tp @s $(to)
}
```

The error mentions `TypedArg<...>` with the type it expected. Any argument type from the
[API reference](/reference/api/library-mc/readme/) works here (`Vec3`, `Selector`, `Rotation`, ...).

## Text in NBT and text components

A value is put in exactly as the game gets it, so a string inside NBT or a text component needs
quotes. Add them yourself with `macro`:

```ts
export function Welcome({ name }: Macro) {
  $.tellraw("@a", { text: macro`"${name}"`, color: "gold" });   // {text:"$(name)",color:"gold"}
}
```

The game pastes the value in as text, so a value with a `"` in it breaks the command. Making sure
the values fit is up to you.

Before 1.21.5 text is JSON, and a macro argument in a text component is already written as a JSON
string: `{ text: name }` gives `{"text":"$(name)"}`.

## Limits

- Argument names can only use letters, digits and `_`. Paths like `Pos[0]` aren't allowed; copy the
  value into storage first and call the function `with storage`.
- Arguments only work in the function's own commands, not in functions declared inside it. To use
  a value in a function it calls, pass it on: `$.function(Other, { name })`.
- To keep all arguments in one object instead, name the parameter: `function Reward(args: Macro)`
  and use `args.player`. `Macro<"player" | "item">` also lists the names in the type.
