# mcjspacker2

Write Minecraft data packs in TypeScript, with autocomplete and error checking for every command of
the exact Minecraft version you target, snapshots and April Fools versions included.

```ts
import { $ } from "#mc";

/** @load */
export function Setup() {
  $.scoreboard.objectives.add("kills", "playerKillCount");
}

/** @mcfunction */
export function StartRound() {
  $.tp("@a", "0 ~10 0");
  $.title("@a").title({ text: "Fight!", color: "red" });
  $.execute.as("@a").at("@s").run.playsound("entity.player.levelup").master("@s");
  $.function(Reward);
}

function Reward() {
  $.give("@a", "diamond", 1);
}
```

Each marked function becomes an `.mcfunction` (`mypack:main/start_round`), and functions it calls
are added automatically.

**Live reload:** `mcjs2 dev` rebuilds on every save and reloads the pack in game automatically, so your
changes are in game within a moment.

## Quick start

```sh
npm create mcjspacker2@latest
cd my-datapack
npm run dev   # starts a server; every save rebuilds and reloads in game
```

`npm create` asks for a directory, namespace and Minecraft version, then sets everything up. To add
mcjspacker2 to an existing project instead:

```sh
npm install -D mcjspacker2 typescript
npx mcjs2 init --mc-version 26.3 --namespace mypack
```

| Command | |
|---|---|
| `mcjs2 gen` | Read the commands of your Minecraft version (downloads the official server jar once). |
| `mcjs2 build [--zip]` | Build the data pack into `dist/`. |
| `mcjs2 dev` | Start a dev server; every save rebuilds and reloads in game. |
| `mcjs2 dev --save <world\|auto>` | Rebuild into a singleplayer world instead. |

## Documentation

The full guide is the Starlight site in [`docs/`](../../docs): run `pnpm docs` from the repository
root. It covers writing functions and commands, `execute`, function names, tags and other data pack
files, dev mode, configuration and supported versions.

Contributing: see [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
