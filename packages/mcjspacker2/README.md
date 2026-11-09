# mcjspacker2

Write Minecraft datapacks in TypeScript. The command library is generated from the game's own
datagen reports, so every command, argument, and registry id is typed for the exact version you target.

```ts
import { $ } from "#mc";

/** @mcfunction */
export function StartRound() {
  $.tp("@a", "0 ~10 0");
  $.execute.as("@a").at("@s").run.say("go!");
  $.scoreboard.players.set("@s", "kills", 0);
  $.function(Helper);
}

function Helper() { $.say("helper"); }   // emitted because StartRound references it
```

Commands are a chain on `$`: literal words are properties, in snake_case as Minecraft writes them
(`$.scoreboard.players`, `$.gamerule.keep_inventory`, `$.function`), arguments are calls
(`set("@s", "kills", 0)`, or split: `set("@s")("kills", 0)`). String arguments can also be properties:
`$.team.modify.red.collision_rule.never`. `run` leads back to `$`. Each `$.`
starts a line, which must be a complete command when the function ends.

Full documentation: the Starlight site in [`docs/`](../../docs) (`pnpm docs` from the repo root).

## Setup

```sh
npm create mcjspacker2@latest      # interactive: directory, namespace, version, description
# or, in an existing project:
pnpm add -D mcjspacker2 typescript
pnpm mcjs2 init --mc-version 26.3
```

The version list has the latest release and snapshot, the latest patch of every minor release since 1.13,
every 1.21 game drop, and the April Fools versions at the bottom. **Other version…** searches every version
with data packs. Non-interactive: `npm create mcjspacker2@latest my-pack -- --version 26.3 --namespace mypack --yes`.

**Positions** are strings, as in game: `$.tp("@s", "~ ~1 ~")`, `$.setblock("0 64 0", "stone")`.

**Server jar.** If the server dir contains a jar, it is used as-is. The server dir is
`server.dir` in the config, the `MCJS2_SERVER_DIR` env var, or `<project>/server` by default.
Its `version.json` must match `version`.

If there is no jar, the official server jar is downloaded through Mojang's version manifest,
SHA-1 verified, and cached in `~/.cache/mcjspacker2/jars/<version>`. Set `server.download: false`
to turn downloading off. The launcher's `.minecraft` directory is never used as a jar source.

`mcjs2 dev` copies the jar into the server dir and records that in `.mcjs2-installed.json`. When you change `version`, a jar that mcjs2 installed is swapped for the new one. A jar you put there yourself is never replaced: on a version mismatch you get an error instead. If the server dir has no `server.properties` yet, it
writes one with RCON enabled. It never creates or edits `eula.txt`. On its first `--start`, the server
writes that file and stops. Set `eula=true` there to accept the EULA, and `dev` keeps rebuilding in the meantime.

```ts
// mcjs2.config.ts
import { defineConfig } from "mcjspacker2";

export default defineConfig({
  version: "26.3",
  namespace: "mypack:generated/", // "mypack", "mypack:", "mypack:x", "mypack:x/" all work
  server: { dir: "server" },
  // src: "src", raw: "datapack", outDir: "dist", name, description, java, minecraftRoot
});
```

## Commands

| command | what it does |
|---|---|
| `mcjs2 gen [--force]` | Runs `net.minecraft.data.Main --reports` on the server jar and writes the typed library to `.mcjs2/gen`. The `#mc` import points there. Reports are cached in `~/.cache/mcjspacker2/<version>/<jar-sha1>`. |
| `mcjs2 build [--zip]` | Builds the pack into `dist/<name>`. |
| `mcjs2 dev [--start]` | Watches, rebuilds into `<server>/<level-name>/datapacks/<name>`, and sends `reload` over RCON. To enable it, set `enable-rcon=true` and `rcon.password` in `server.properties`; dev enables RCON when it creates that file. `--start` also launches the server. |
| `mcjs2 dev --save <name\|auto>` | Targets a singleplayer save instead. `auto` picks the most recently opened world under the launcher root (`MINECRAFT_ROOT`, or the OS default). Singleplayer can't be reloaded remotely, so you run `/reload` yourself. |

## How functions map to files

- **Entry points.** JSDoc `@mcfunction` makes a function an entry point. `@load` / `@tick` also add it to `#minecraft:load` / `#minecraft:tick`. Add `@dev` to any of them for an entry that only exists in `mcjs2 dev` builds; referencing it from a release build is an error.
- **Other functions.** Functions without a tag are emitted only when referenced (`$.function(fn)`, `fnId(fn)`, `tag(...)`).
- **Ids.** The id is `<namespace>:<prefix><file path>/<function name>`. Every path segment is converted by inserting `_` before each capital letter except the first, then lowercasing. For example, `src/combat/Arena.ts` → `function StartRound` gives `mypack:generated/combat/arena/start_round`.
- **Overrides.** `/** @mcfunction other:path */` is absolute. `/** @mcfunction path */` is relative to the namespace prefix.
- **Anonymous functions.** Arrows and names that can't be parsed get `…/<file>/__anon/<hash of body>`. The name is deterministic, and identical bodies are shared.
- **Inline functions.** `$.execute.as("@a").run.function(() => { ... })` writes the arrow as an anonymous function. Anonymous functions are recorded where they are referenced, so they see the surrounding variables; their names are deterministic but may change whenever the function changes.

## Build-time semantics

Your TypeScript runs **at build time**. Each command call appends one line to the function being recorded. As a result:

- `if`/`for`/variables are compile-time: a loop unrolls into repeated commands.
- Calling a helper directly (`Helper()`) inlines its commands. Use `$.function(Helper)` to emit a `function` call instead.
- `__DEV__` (from `#mc`) is `true` in `mcjs2 dev` builds and `false` in `mcjs2 build`: `if (__DEV__) $.say("debug")`.
- Calling a command at module top level is an error. Commands must run inside a function.

## Escape hatches

- `$("any command")` emits a line verbatim, e.g. macro lines `$("$say $(message)")`. `fnId(fn)` gives a function's in-game name: ``$(`schedule function ${fnId(Tick)} 1s`)``.
- `tag("function", "minecraft:load", [Init, "other:fn"])` and `resource("advancement", "mypack:root", {...})` add tags and JSON resources.
- `nbt.byte(1)`, `nbt.intArray([...])`, `nbt.raw("...")` give typed SNBT values.
- Everything in `datapack/` (the `raw` dir) is copied into the pack verbatim. When a tag JSON file exists both there and in the generated output, the two are merged.

## Argument types and custom parsers

Every command argument names a brigadier parser (`minecraft:vec3`, `minecraft:component`, …).
`src/runtime/parsers.ts` maps each parser to:
- `type`: the TS type in generated signatures
- `test`: a runtime check used to pick between syntaxes (`tp <targets>` vs `tp <location>`)
- `serialize`: how a value becomes command text
- `examples`: sample values used by the version probe (see below)

Every function receives a context with `version` and `packFormat`, because Minecraft sometimes changes
an argument's format while keeping its parser id. For example, the scoreboard slot `belowName` became
`below_name` in 1.20.2, and text components switched from JSON to SNBT with snake_case event keys
in 1.21.5. Parsers missing from the registry fall back to `string`, and `mcjs2 gen` warns about them.

**Your own parsers.** When a new Minecraft version adds or changes an argument before mcjspacker2 is
updated, add a `parsers` entry to the config. Fields you leave out keep the built-in behavior:

```ts
import { defineConfig, defineParser } from "mcjspacker2";

export default defineConfig({
  version: "27.1",
  namespace: "mypack",
  parsers: {
    // A parser this version introduced
    "minecraft:brand_new": defineParser({ type: '"a" | "b"', examples: ["a"] }),
    // Change an existing one, depending on the version
    "minecraft:particle": defineParser({
      type: (props, ctx) => (ctx.packFormat >= 130 ? "string | { type: string }" : "string"),
      test: (v) => typeof v === "string" || typeof v === "object",
      serialize: (v, props, ctx) => (typeof v === "string" ? v : JSON.stringify(v)),
    }),
  },
});
```

`type` affects generated code, so run `mcjs2 gen` again after changing it. `test` and `serialize` apply on the next build.

## Version compatibility

Data packs differ between versions. These differences are handled automatically:
- Before pack format 45 (1.21), folders use plural names (`functions/`, `tags/functions/`).
- Pack format 82 and later use `min_format`/`max_format` in `pack.mcmeta`; earlier versions use `pack_format`.
- Text components are emitted as JSON. Before 1.21.5 the game required JSON, and from 1.21.5 on, JSON is still accepted because it is valid SNBT.

`test/matrix` checks the whole pipeline against real servers: download, datagen, codegen, `tsc`, build, then a real server that must load the pack and run every function. It covers the current releases, every 1.21 drop, milestones back to 1.13.2 (the first version with data packs), and the April Fools versions that support data packs. The list is in `test/matrix/versions.test.ts`:

```sh
MCJS2_MATRIX=1 pnpm vitest run test/matrix                                # all versions
MCJS2_MATRIX=1 MCJS2_MATRIX_VERSIONS=1.21.4,26.3 pnpm vitest run test/matrix
MCJS2_MATRIX=1 MCJS2_MATRIX_SERVER=0 pnpm vitest run test/matrix          # skip the server stage
MCJS2_MATRIX=1 MCJS2_MATRIX_CONCURRENCY=10 pnpm vitest run test/matrix     # versions in parallel (default 6)
```

Each version picks the Java runtime it needs from the launcher's `runtime/` dir (from `javaVersion.component`
in Mojang's version JSON), so older versions (Java 8/16/17) need those runtimes installed. Launching that
version once in the launcher installs its runtime.

**Parser probe.** Alongside the sample pack, each server also loads a generated `probe` pack:
- Every command path of that version becomes one function line, with each argument filled from its parser's `examples`.
- Each additional example becomes its own variant line.
- The server must load every line.

Rejected lines are classified:
- **failed:** an argument format was rejected. This is a parser bug for that version, and it fails the test.
- **unavailable:** the command or subcommand itself isn't available to functions, for example experimental features or higher permission levels.
- **skipped:** not probed. These need a higher permission level, or the parser has no examples because it references data-pack-defined registries.

Results are written to `.matrix/<version>/probe-report.json`.

The test servers accept the Minecraft EULA in their own `eula.txt`. Work dirs live in `.matrix/` (gitignored).
