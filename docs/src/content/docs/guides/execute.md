---
title: Execute
description: Chaining execute subcommands.
---

`execute` is a chain like any other command: its subcommands lead back to `execute`, and `Run`
leads back to `$`, so whatever follows `Run` is a whole command:

```ts
$.Execute.As("@a").At("@s").Run.Say("hi");
// execute as @a at @s run say hi

$.Execute.As("@e[type=zombie]").If.Block("~ ~-1 ~", "sand").Run.Kill("@s");
// execute as @e[type=zombie] if block ~ ~-1 ~ sand run kill @s

$.Execute.Store.Result.Score("#pigs", "count").If.Entity("@e[type=pig]");
// execute store result score #pigs count if entity @e[type=pig]
```

The same goes for anything else that ends in `run`, like `$.Return.Run.Function(Helper)`.

## Running more than one command

`Run` is `$`, so it can also be called. That's how you run several commands, a function, or
raw text:

| Code | Output |
|---|---|
| `.Run.Say("hi")` | `run say hi` |
| `.Run(() => $.Say("hi"))` | `run say hi` (a callback with one command is inlined) |
| `.Run(() => { $.Say("a"); $.Say("b"); })` | `run function <anonymous id>` |
| `.Run(Helper)` | `run function mypack:main/helper` |
| `.Run("say hi")` | `run say hi` |

Callbacks run right away, while the surrounding function is being recorded, so they see your
variables as they are at that point.

## Conditions

A chain without `Run` is a complete command when Minecraft allows it, which is useful with `store`:

```ts
$.Execute.If.Entity("@e[type=pig]");
```

`.If.Function(fn)` takes a function, a function id or a `#tag`, like `$.Function()`. The function
is emitted and its id is used. It passes when the function returns a non-zero value:

```ts
function HasPlayers() {
  $.Execute.If.Entity("@a").Run.Return(1);
  $.Return(0);
}

$.Execute.If.Function(HasPlayers).Run.Say("someone is online");
```
