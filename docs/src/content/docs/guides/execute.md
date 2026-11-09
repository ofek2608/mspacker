---
title: Execute
description: Chaining execute subcommands.
---

`execute` is generated as a chain. Each subcommand is a method, and `.Run()` ends the chain:

```ts
Execute().As("@a").At("@s").Run(() => Say("hi"));
// execute as @a at @s run say hi

Execute()
  .As("@e[type=zombie]")
  .If("block", "~ ~-1 ~", "sand")
  .Run(() => Kill("@s"));
// execute as @e[type=zombie] if block ~ ~-1 ~ sand run kill @s
```

Each method takes the same arguments as the subcommand in game, with its literals as strings:
`.If("score", "@s", "kills", "matches", "10..")`, `.Store("result", "score", "#x", "obj")`,
`.Positioned("~ ~1 ~")`, `.Facing("entity", "@p", "eyes")`.

## What `.Run()` accepts

| Argument | Output |
|---|---|
| A callback with one command | `run <that command>` (inlined) |
| A callback with several commands | `run function <anonymous id>` |
| A function (`.Run(Helper)`) | `run function mypack:main/helper` |
| A string (`.Run("say hi")`) | `run say hi` |

A chain without `.Run()` is a complete command too, for conditions and stores:

```ts
Execute().If("entity", "@e[type=pig]");
// execute if entity @e[type=pig]
Execute().Store("result", "score", "#pigs", "count").If("entity", "@e[type=pig]");
```

## Conditions on functions

`.If("function", fn)` takes a function, a function id or a `#tag`, like `Function()`.
