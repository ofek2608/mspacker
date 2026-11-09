---
title: Commands
description: The generated command library and how calls become command lines.
---

`mcjs2 gen` reads the command tree from your Minecraft version's datagen (`commands.json`) and
generates one function per root command, with an overload per syntax:

```ts
import { Give, Scoreboard, Setblock, Tellraw, Tp } from "#mc";

Tp("@a", "0 ~10 0");                                   // tp @a 0 ~10 0
Tp("@s", "@p");                                        // tp @s @p
Setblock("~ ~-1 ~", "stone");                          // setblock ~ ~-1 ~ stone
Give("@s", "diamond", 3);                              // give @s diamond 3
Scoreboard("players", "add", "@s", "kills", 1);        // scoreboard players add @s kills 1
Tellraw("@a", { text: "Hi", color: "gold" });          // tellraw @a {"text":"Hi","color":"gold"}
```

## Naming

Root commands are PascalCase: `tp` → `Tp`, `function` → `Function`, `place` → `Place`.
Literal words of a command (`players`, `add`, `give`) are passed as string arguments, in order.

## Overloads

Every path through the command tree is one overload, so your editor shows exactly the syntaxes your
version supports, with the argument names Minecraft uses. At build time, mcjspacker2 picks the
overload whose arguments match the values you passed, using each argument type's
[runtime check](/reference/argument-types/). Passing values no overload accepts is a build error
that points at your source line:

```
[mcjs2] No overload of "tp" matches arguments ("@a", "0 1").
    at src/main.ts:3:30
```

## Typed ids

Arguments that take registry ids (blocks, items, entity types, effects, ...) autocomplete the ids
from your version's `registries.json`, with or without the `minecraft:` prefix. Tags
(`#minecraft:logs`) are accepted where the game accepts them. Any other string is accepted too, for
ids your data pack or a mod defines.

## Positions

Positions are strings, written the same as in game:

```ts
Tp("@s", "~ ~1 ~");            // relative
Tp("@s", "0 64 0");            // absolute
Tp("@s", "^ ^ ^5");            // local (relative to rotation)
Fill("~-1 ~ ~-1", "~1 ~ ~1", "glass");
```

The types reject positions Minecraft would reject: the wrong number of coordinates, or mixing
local (`^`) with world coordinates. Since the types can't catch every mistake in strings built at
runtime, the build checks them again.

## High-permission commands

Commands that need a higher permission level than functions have (`op`, `stop`, `ban`, ...) are
still generated, with a note in their JSDoc, because they can't run from a data pack.

## Version differences

The library is generated per version, so commands and arguments that don't exist in your version
aren't there. Where an argument kept its name but changed format between versions (text
components, scoreboard slot names, ...), the types and the serialization follow your version. See
[versions](/reference/versions/).
