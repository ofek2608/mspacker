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
  for (let i = 3; i > 0; i--) $.say(`${i}...`);
}
```

```mcfunction
say 3...
say 2...
say 1...
```

This means:

- `if`, loops, variables and helper functions are evaluated at build time. A loop unrolls into
  repeated commands. To branch in game, use [`$.execute`](/guides/execute/).
- You can use any npm package or Node API to compute commands (read a JSON file, generate a grid of
  positions, ...).
- Commands must run inside a function. Calling `$.say(...)` at the top level of a module is an error.

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
  $.function(Helper); // function mypack:main/helper
  Helper();           // say helper  (inlined)
}

function Helper() {
  $.say("helper");
}
```

- `$.function(Helper)` emits a `function` command. `Helper` gets its own file even though it has no
  tag, because it is referenced. The same happens for `.run(Helper)`, `$(Helper)`, `fnId(Helper)` and
  `tag("function", ..., [Helper])`.
- `Helper()` is a normal JavaScript call: its commands are written into `Main`.

Untagged functions that are never referenced aren't emitted. Recursion works: a function can
reference itself with `$.function(Self)`.

### Recording order

Referenced functions are recorded one at a time, after the function that references them, not in
the middle of it. `$.function(Helper)` writes the id and queues `Helper`. Long chains of functions
calling each other therefore don't build up the JavaScript call stack.

`Run(() => ...)` callbacks are the exception: they run right away, so they see your variables as
they are at that point in the loop, and a callback with a single command can be inlined.

`fnId()` of an anonymous function returns a placeholder, because its id is a hash of its commands,
which aren't known yet. The placeholder is replaced with the id in commands, tags and resources,
so use it in those, not for string processing.


## Anonymous functions

Functions without a usable name, such as inline arrows, get a deterministic id from a hash of
their commands: `mypack:main/__anon/77186eb6`. Two anonymous functions with identical commands
share one file.

```ts
$.execute.at("@p").run(() => {
  $.say("one");
  $.say("two");
});
// execute at @p run function mypack:main/__anon/77186eb6
```

A `run` callback that emits exactly one command is inlined instead:

```ts
$.execute.as("@a").run(() => $.say("hi")); // execute as @a run say hi
```

## Parameterizing with JavaScript

Since functions are JavaScript, you can generate them:

```ts
const colors = ["red", "green", "blue"] as const;

/** @load */
export function SetupTeams() {
  for (const c of colors) {
    $.team.add(c);
    $.team.modify(c).color(c);
  }
}
```

For values only known in game (scores, storage), use Minecraft's own features: scoreboards,
`execute store` and `execute if`. Anything the library doesn't cover can be written as-is with [`$(...)`](/guides/raw-content/#raw-commands).
