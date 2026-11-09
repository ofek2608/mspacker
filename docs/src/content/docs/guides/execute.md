---
title: Execute
description: Run commands as other entities, at other places, or only when something is true.
---

`execute` works like in Minecraft: chain what you need, then end with `run` and the command to run:

```ts
$.execute.as("@a").at("@s").run.say("hi");
// execute as @a at @s run say hi

$.execute.as("@e[type=zombie]").if.block("~ ~-1 ~", "sand").run.kill("@s");
// execute as @e[type=zombie] if block ~ ~-1 ~ sand run kill @s

$.execute.if.score("@s", "kills").matches("10..").run.give("@s", "diamond", 1);
// execute if score @s kills matches 10.. run give @s diamond 1
```

Anything can follow `run`, including another `execute`.

## Running several commands

Use `run.function` with a function, the same as calling a function anywhere else. A function
written inline gets [a generated name](/guides/writing-functions/#functions-without-a-name):

```ts
$.execute.as("@a").run.function(Reward);
// execute as @a run function mypack:main/reward

$.execute.as("@a").at("@s").run.function(() => {
  $.particle("heart", "~ ~2 ~");
  $.playsound("entity.player.levelup").master("@s");
});
// execute as @a at @s run function mypack:main/__anon/3f2a9c1d
```

## Without `run`

Some `execute` commands are complete without `run`, like checking a condition and storing the
result:

```ts
$.execute.store.result.score("#pigs", "count").if.entity("@e[type=pig]");
// execute store result score #pigs count if entity @e[type=pig]
```

## Checking a function

`if.function` runs a function and continues when it returns a value other than 0:

```ts
function HasPlayers() {
  $.execute.if.entity("@a").run.return(1);
  $.return(0);
}

$.execute.if.function(HasPlayers).run.say("someone is online");
```

`return` needs Minecraft 1.20.3 or newer.
