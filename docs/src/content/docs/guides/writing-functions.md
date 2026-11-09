---
title: Writing functions
description: Turn TypeScript functions into Minecraft functions.
---

Each Minecraft function is a TypeScript function. Mark it with a comment and its commands become a
`.mcfunction` file:

```ts
import { $ } from "#mc";

/** @mcfunction */
export function Heal() {
  $.effect.give("@a", "instant_health", 1, 1);
  $.say("Everyone healed!");
}
```

Build the pack and run it in game with `/function mypack:main/heal`. The name comes from the file
and the function, see [function names](/guides/function-ids/).

## Marking functions

| Comment | Effect |
|---|---|
| `/** @mcfunction */` | Becomes a Minecraft function. |
| `/** @load */` | Also runs when the pack loads (and on `/reload`). |
| `/** @tick */` | Also runs every tick. |
| `/** @mcfunction custom/name */` | Uses a [different name](/guides/function-ids/#choosing-a-name). |
| `/** @dev */` | Only exists while developing, see [debug-only functions](#debug-only-functions). |

Comments can be combined: `/** @load @mcfunction setup */`. With a description, put the marks on
their own line, after it:

```ts
/**
 * Gives every player a starting kit.
 * @load
 */
```

A mark in the middle of a sentence is just text, so "runs before the @tick function" doesn't make a
function run every tick.

```ts
/** @load */
export function Setup() {
  $.scoreboard.objectives.add.kills.playerKillCount;
}

/** @tick */
export function EveryTick() {
  $.execute.as("@a").if.score("@s", "kills").matches("10..").run.give("@s", "diamond", 1);
}
```

## Your code runs when you build

Your TypeScript runs once, when you build the pack, and writes down the commands it calls. That
makes JavaScript a tool for writing commands:

```ts
/** @mcfunction */
export function Countdown() {
  for (let i = 3; i > 0; i--) $.say(`${i}...`);
}
```

becomes

```mcfunction
say 3...
say 2...
say 1...
```

- Loops repeat commands, `if` decides which commands to write, and variables hold values while
  building. They don't exist in game.
- To react to what happens in game (scores, players, blocks), use Minecraft's own tools:
  [`execute`](/guides/execute/), scoreboards and storage.
- You can use any npm package or read files to generate commands.
- Commands must be inside a function. A command at the top of a file is an error.

## Debug-only commands

`__DEV__` is `true` while you work with [`mcjs2 dev`](/guides/dev-mode/) and `false` in
`mcjs2 build`, so debug messages never reach the finished pack:

```ts
import { $, __DEV__ } from "#mc";

/** @load */
export function Setup() {
  $.scoreboard.objectives.add.kills.playerKillCount;
  if (__DEV__) $.say("[debug] pack reloaded");
}
```

### Debug-only functions

Add `@dev` to make a whole function exist only in `mcjs2 dev` builds. It works together with the
other comments:

```ts
/** @dev @mcfunction */
export function DebugScores() {
  $.execute.as("@a").run.tellraw("@a", [{ selector: "@s" }, ": ", { score: { name: "@s", objective: "kills" } }]);
}

/** @dev @tick */
export function ShowTickCounter() {
  $.scoreboard.players.add("#ticks", "debug", 1);
}
```

`/function mypack:main/debug_scores` works while developing, and the function isn't in the finished
pack. Other functions can only call it from debug-only code, like inside `if (__DEV__)`; otherwise
`mcjs2 build` stops and tells you where.

## Calling other functions

```ts
/** @mcfunction */
export function Main() {
  $.function(Helper);  // function mypack:main/helper
  Helper();            // say helper
}

function Helper() {
  $.say("helper");
}
```

- `$.function(Helper)` calls `Helper` in game. `Helper` gets its own file automatically, even
  without `@mcfunction`.
- `Helper()` is a normal JavaScript call: `Helper`'s commands are copied into `Main`.

Functions that are never used and not marked aren't written. A function can call itself with
`$.function(Self)`.

A function you call with `$.function(...)` is written after the current function is finished, so
it sees your variables as they are at the end:

```ts
let wave = 1;
$.function(() => $.say(`wave ${wave}`));  // says "wave 2"
wave = 2;
```

To give each call its own value, use a `const` or a `for (let ...)` loop variable.

## Functions without a name

Functions written inline, like `() => { ... }`, and functions declared inside another function get
a generated name such as `mypack:main/__anon/77186eb6`. A function stored in a variable, or in an
object field, starts with that name, so it's easier to recognize: `const step = () => ...` becomes
`mypack:main/__anon/step_77186eb6`.

The name is the same on every build, but it can change whenever the function changes (or with a new
mcjspacker2 version), so don't use it from outside your pack. If something else needs to call it,
declare it at the top of a file or [give it a name](/guides/function-ids/#choosing-a-name).

```ts
$.execute.at("@p").run.function(() => {
  $.say("one");
  $.say("two");
});
// execute at @p run function mypack:main/__anon/77186eb6
```

## Generating commands

Since it's JavaScript, you can build commands from data:

```ts
const colors = ["red", "green", "blue"] as const;

/** @load */
export function SetupTeams() {
  for (const color of colors) {
    $.team.add(color);
    $.team.modify(color).color(color);
  }
}
```
