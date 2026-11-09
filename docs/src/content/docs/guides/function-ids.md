---
title: Function names
description: How your functions are named in game, and how to choose a name.
---

A function's name in game comes from its namespace, its file and its name:

| File and function | Name in game (namespace `mypack`) |
|---|---|
| `src/main.ts`, `function Init` | `mypack:main/init` |
| `src/combat/Arena.ts`, `function StartRound` | `mypack:combat/arena/start_round` |
| `src/ui/sidebar.ts`, `function showTopKills` | `mypack:ui/sidebar/show_top_kills` |

Capital letters become lowercase with an `_` before them (except the first letter). That's done
letter by letter, so `HTTPGet` becomes `h_t_t_p_get`. Rename the function, or
[choose a name](#choosing-a-name), if that doesn't read well.

## A folder for everything

The [namespace](/mspacker/reference/configuration/#namespace) can include a folder, which keeps your
TypeScript functions apart from hand-written ones:

```ts
namespace: "mypack:generated/",
// src/main.ts, Init  →  mypack:generated/main/init
```

## Choosing a name

Write the name after `@mcfunction`:

```ts
/** @mcfunction custom/renamed */
export function WeirdName() {}   // mypack:custom/renamed

/** @mcfunction other:api/run */
export function Api() {}         // other:api/run
```

A name without a namespace goes into your namespace (and folder, if you set one). A name with a
namespace is used exactly as written.

You can also name a function in code with `named`. It takes the same kind of name and gives back the
function. The name can be built from values, so it works in loops and helpers, where a comment
can't:

```ts
import { $, named } from "#mc";

const KITS = { warrior: "iron_sword", archer: "bow" };
for (const [kit, item] of Object.entries(KITS)) {
  named(`mypack:api/kit/${kit}`, () => {
    $.give("@s", item);
  });
}
// mypack:api/kit/warrior, mypack:api/kit/archer
```

Like `@mcfunction`, a named function is written to the pack even if nothing calls it.

## Functions for players to run

With a [folder in your namespace](#a-folder-for-everything), every function lives under
`mypack:generated/...`, next to many helper functions nobody should run by hand. Give the functions
people should run (players, admins, other packs) a name in a folder of their own, like `api`:

```ts
/**
 * Teleports you to the arena.
 * @mcfunction mypack:api/arena/join
 */
export function Join() {}
// /function mypack:api/arena/join
```

Then `/function mypack:api/` and Tab show only those, and their names stay the same when you move
the code around.

## Two functions with the same name

If two functions end up with the same name and different commands, the build stops and tells you
where both are. With the same commands they share it, so a helper that names a function can run
twice.

## Your namespace in code

To write ids without repeating your namespace:

```ts
import { $, __FUNCTION_PREFIX__, __NAMESPACE__, id } from "#mc";

/** @mcfunction */
export function Setup() {
  $.say(`this pack is ${__NAMESPACE__}`);        // mypack
  $.say(`functions start with ${__FUNCTION_PREFIX__}`); // mypack: (or mypack:generated/ with a folder)
  $.schedule.function(id("timers/tick"), "1s");   // mypack:timers/tick
}
```

`id` also works with [macro arguments](/mspacker/guides/macros/): `` id(macro`rewards/${kind}`) `` is
`mypack:rewards/$(kind)`.
