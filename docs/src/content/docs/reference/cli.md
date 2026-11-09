---
title: CLI
description: The mcjs2 and create-mcjspacker2 commands.
---

## `create-mcjspacker2`

```sh
npm create mcjspacker2@latest [dir] -- [options]
```

Sets up a new project interactively. See [getting started](/getting-started/#create-a-project) for
the options.

## `mcjs2`

All commands take `--cwd <dir>` to run in another project directory.

### `mcjs2 init`

```sh
mcjs2 init [--mc-version <id>] [--namespace <ns>]
```

Adds mcjspacker2 to the current directory: `mcjs2.config.ts`, the `#mc` import and scripts in
`package.json`, `tsconfig.json`, `.gitignore` entries and `src/main.ts`. Existing files are kept.

### `mcjs2 gen`

```sh
mcjs2 gen [--force]
```

Reads the commands of your Minecraft `version` from its server jar and writes them into
`.mcjs2/gen`, where `$` comes from. Run it again after changing `version`. The result is cached, so
it's quick after the first time; `--force` reads the jar again. If the version has kinds of values
mcjspacker2 doesn't know yet, it says so (see [new value types](/reference/custom-parsers/)).

### `mcjs2 build`

```sh
mcjs2 build [--zip]
```

Builds the pack into `<outDir>/<name>`, replacing what was there. `--zip` also writes
`<outDir>/<name>.zip`. Runs `gen` first if the library hasn't been generated.

### `mcjs2 dev`

```sh
mcjs2 dev [--start] [--save <name|auto>]
```

Watches and rebuilds. See [dev mode](/guides/dev-mode/).

| Option | |
|---|---|
| `--start` | Start the dev server too. |
| `--save <name>` | Build into a singleplayer save instead of the server. `auto` picks the most recently played one. |

The cache directory is `$XDG_CACHE_HOME/mcjspacker2` when `XDG_CACHE_HOME` is set.
