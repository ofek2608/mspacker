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

The [namespace](/reference/configuration/#namespace) can include a folder, which keeps your
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

A name without a namespace goes into your namespace (and folder, if you set one).

## Two functions with the same name

If two functions end up with the same name, the build stops and tells you where both are.
