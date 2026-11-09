---
title: Function ids
description: How mcjspacker2 names your functions, and how to override it.
---

## The rule

A function's id is built from the namespace, the file path and the function name:

```
<namespace>:<prefix><file path without extension>/<function name>
```

Every path segment and the name go through the same conversion: an `_` is inserted before each
capital letter except the first, then everything is lowercased.

| Source | Id (namespace `mypack`) |
|---|---|
| `src/main.ts` → `function Init` | `mypack:main/init` |
| `src/combat/Arena.ts` → `function StartRound` | `mypack:combat/arena/start_round` |
| `src/ui/sidebar.ts` → `function showTopKills` | `mypack:ui/sidebar/show_top_kills` |

The conversion is literal, so `HTTPGet` becomes `h_t_t_p_get`. Rename or
[override](#overriding-the-id) functions where that reads badly.

## Prefix

The namespace setting can include a path prefix. All generated functions go under it, which keeps
them apart from hand-written files in [`datapack/`](/guides/raw-content/):

```ts
namespace: "mypack:generated/",
// src/main.ts → Init  =>  mypack:generated/main/init
```

## Overriding the id

Give `@mcfunction` an id:

```ts
/** @mcfunction custom/renamed */
export function WeirdName() {} // mypack:generated/custom/renamed  (relative: under the prefix)

/** @mcfunction other:api/run */
export function Api() {}      // other:api/run  (absolute: has a namespace)
```

## Anonymous functions

Names that can't be converted to a valid id, `default` exports and unnamed arrows become anonymous:

```
<namespace>:<prefix><file path>/__anon/<8-character hash of the commands>
```

The hash only depends on the commands, so ids stay the same between builds as long as the body
does, and identical bodies are shared.

## Duplicates

Two functions that end up with the same id are a build error that names both sources.
