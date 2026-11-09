---
title: Writing functions
description: How TypeScript functions become .mcfunction files.
---

## Your code runs at build time

mcjspacker2 doesn't translate TypeScript into commands. It **runs** your TypeScript when you build,
and every command call appends one line to the function that is being recorded:

```ts
/** @mcfunction */
export function Countdown() {
  for (let i = 3; i > 0; i--) Say(`${i}...`);
}
```

```mcfunction
say 3...
say 2...
say 1...
```

This means:

- `if`, loops, variables and helper functions are evaluated at build time. A loop unrolls into
  repeated commands. To branch in game, use [`Execute`](/guides/execute/).
- You can use any npm package or Node API to compute commands (read a JSON file, generate a grid of
  positions, ...).
- Commands must run inside a function. Calling `Say(...)` at the top level of a module is an error.

## Entry points

A function becomes its own `.mcfunction` when it has a JSDoc tag:

| Tag | Effect |
|---|---|
| `/** @mcfunction */` | Emit this function. |
| `/** @load */` | Emit it and add it to `#minecraft:load`. |
| `/** @tick */` | Emit it and add it to `#minecraft:tick`. |
| `/** @mcfunction custom/id */` | Emit it under a different id. See [function ids](/guides/function-ids/#overriding-the-id). |

Tags can be combined (`/** @load @mcfunction setup */`). They work on function declarations,
function expressions and arrow functions assigned to a variable.

## Calling other functions

There are two ways to use another function, and they produce different output:

```ts
/** @mcfunction */
export function Main() {
  Function(Helper); // function mypack:main/helper
  Helper();         // say helper  (inlined)
}

function Helper() {
  Say("helper");
}
```

- `Function(Helper)` emits a `function` command. `Helper` gets its own file even though it has no
  tag, because it is referenced. The same happens for `.Run(Helper)`, `fnId(Helper)` and
  `tag("function", ..., [Helper])`.
- `Helper()` is a normal JavaScript call: its commands are written into `Main`.

Untagged functions that are never referenced aren't emitted. Recursion works: a function can
reference itself with `Function(Self)`.

:::note
The generated `Function` export shadows JavaScript's global `Function` constructor in files that import it.
:::

## Anonymous functions

Functions without a usable name, such as inline arrows, get a deterministic id from a hash of
their commands: `mypack:main/__anon/77186eb6`. Two anonymous functions with identical commands
share one file.

```ts
Execute().At("@p").Run(() => {
  Say("one");
  Say("two");
});
// execute at @p run function mypack:main/__anon/77186eb6
```

A `.Run()` callback that emits exactly one command is inlined instead:

```ts
Execute().As("@a").Run(() => Say("hi")); // execute as @a run say hi
```

## Parameterizing with JavaScript

Since functions are JavaScript, you can generate them:

```ts
const colors = ["red", "green", "blue"] as const;

/** @load */
export function SetupTeams() {
  for (const c of colors) {
    Team("add", c);
    Team("modify", c, "color", c);
  }
}
```

For values only known in game (scores, storage), use Minecraft's own features: scoreboards,
`execute store` and `execute if`. Anything the library doesn't cover can go through [`raw`](/guides/raw-content/#raw-commands).
