# mcjspacker2

Write Minecraft data packs in TypeScript, with autocomplete and error checking for every command of
the exact Minecraft version you target, snapshots and April Fools versions included.

**Save a file and your changes are live in game**: `mcjs2 dev` rebuilds the pack and reloads it in
game automatically, no `/reload`, no copying files.

```ts
import { $ } from "#mc";

/** @mcfunction */
export function StartRound() {
  $.tp("@a", "0 ~10 0");
  $.title("@a").title({ text: "Fight!", color: "red" });
  $.execute.as("@a").at("@s").run.playsound("entity.player.levelup").master("@s");
}
```

## Quick guide

### Create a project

You need Node.js 20+ and Java.

```sh
npm create mcjspacker2@latest
cd my-datapack
```

The setup asks for a folder, a namespace (like `mypack`) and a Minecraft version. Then start
developing:

```sh
npm run dev
```

This downloads the official server for your version, starts it, and builds your pack into it. The
first time, accept the [Minecraft EULA](https://aka.ms/MinecraftEULA) in `server/eula.txt` and run it
again. Join `localhost` from Minecraft.

From then on, **every time you save a file the pack is rebuilt and reloaded in game
automatically**, so your changes are in game within a moment. If something doesn't compile, you see
the error with its line and the previous version keeps running.

### Write functions

Functions in `src/` marked with a comment become Minecraft functions:

```ts
import { $ } from "#mc";

/** @load */
export function Setup() {
  $.scoreboard.objectives.add("kills", "playerKillCount");
}

/** @tick */
export function EveryTick() {
  $.execute.as("@a").if.score("@s", "kills").matches("10..").run.function(Reward);
}

/** @mcfunction */
export function Reward() {
  $.give("@s", "diamond", 1);
  $.scoreboard.players.set("@s", "kills", 0);
}
```

- `@mcfunction` makes a function you can run in game: `/function mypack:main/reward`. The name comes
  from the file (`src/main.ts`) and the function.
- `@load` runs on load and `/reload`; `@tick` runs every tick.
- Functions you call with `$.function(...)` are added automatically.

### Write commands

Start with `$`, write the command's words with dots, and put values in parentheses:

| Minecraft | TypeScript |
|---|---|
| `say hello` | `$.say("hello")` |
| `tp @a 0 64 0` | `$.tp("@a", "0 64 0")` |
| `effect give @a speed 10 1` | `$.effect.give("@a", "speed", 10, 1)` |
| `time set day` | `$.time.set.day` |
| `execute as @a run say hi` | `$.execute.as("@a").run.say("hi")` |

Type `$.` and your editor lists every command of your version. Anything not covered can be written
as text: `$("say hello")`.

### Your code runs when you build

Loops and variables are evaluated while building, so they write commands:

```ts
/** @mcfunction */
export function Countdown() {
  for (let i = 3; i > 0; i--) $.say(`${i}...`);   // say 3... / say 2... / say 1...
}
```

To react to the game (scores, players, blocks), use Minecraft's own tools like `execute` and
scoreboards.

### Build

```sh
npm run build          # dist/<name>/, ready to copy into a world's datapacks folder
npx mcjs2 build --zip  # also a .zip
```

## Documentation

The full guide is the documentation site in [`docs/`](docs). Run it with `pnpm docs` from the
repository root. It covers commands, `execute`, function names, tags and data files, dev mode,
configuration and supported versions.

## Packages

- [`mcjspacker2`](packages/mcjspacker2/README.md): the tool (`mcjs2` CLI) and the library your code imports.
- [`create-mcjspacker2`](packages/create-mcjspacker2/README.md): `npm create mcjspacker2`, sets up a project.

The [`examples/demo`](examples/demo) project shows a complete pack.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
