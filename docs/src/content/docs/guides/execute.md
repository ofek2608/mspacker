---
title: Execute
description: Chaining execute subcommands.
---

`execute` is a chain like any other command: its subcommands lead back to `execute`, and `run`
leads back to `$`, so whatever follows `run` is a whole command:

```ts
$.execute.as("@a").at("@s").run.say("hi");
// execute as @a at @s run say hi

$.execute.as("@e[type=zombie]").if.block("~ ~-1 ~", "sand").run.kill("@s");
// execute as @e[type=zombie] if block ~ ~-1 ~ sand run kill @s

$.execute.store.result.score("#pigs", "count").if.entity("@e[type=pig]");
// execute store result score #pigs count if entity @e[type=pig]
```

The same goes for anything else that ends in `run`, like `$.return.run.function(Helper)`.

## Running more than one command

`run` is `$`, so it can also be called. That's how you run several commands, a function, or
raw text:

| Code | Output |
|---|---|
| `.run.say("hi")` | `run say hi` |
| `.run(() => $.say("hi"))` | `run say hi` (a callback with one command is inlined) |
| `.run(() => { $.say("a"); $.say("b"); })` | `run function <anonymous id>` |
| `.run(Helper)` | `run function mypack:main/helper` |
| `.run("say hi")` | `run say hi` |

Callbacks run right away, while the surrounding function is being recorded, so they see your
variables as they are at that point.

## Conditions

A chain without `run` is a complete command when Minecraft allows it, which is useful with `store`:

```ts
$.execute.if.entity("@e[type=pig]");
```

`.if.function(fn)` takes a function, a function id or a `#tag`, like `$.function()`. The function
is emitted and its id is used. It passes when the function returns a non-zero value:

```ts
function HasPlayers() {
  $.execute.if.entity("@a").run.return(1);
  $.return(0);
}

$.execute.if.function(HasPlayers).run.say("someone is online");
```
