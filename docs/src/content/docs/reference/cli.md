---
title: CLI
description: The mspacker and create-mspacker commands.
---

## `create-mspacker`

```sh
npm create mspacker@latest [dir] -- [options]
```

Sets up a new project interactively, or adds MSPacker to an existing one (`.` as the directory;
existing files are kept). See [getting started](/getting-started/#create-a-project) for
the options.

## `mspacker`

All commands take `--cwd <dir>` to run in another project directory.

### `mspacker gen`

```sh
mspacker gen [--force]
```

Reads the commands of your Minecraft `version` from its server jar and writes them into
`.mspacker/gen`, where `$` comes from. Run it again after changing `version`. The result is cached, so
it's quick after the first time; `--force` reads the jar again. If the version has kinds of values
MSPacker doesn't know yet, it says so (see [new value types](/reference/custom-parsers/)).

### `mspacker build`

```sh
mspacker build [--zip]
```

Builds the pack into `<outDir>/<name>`, replacing what was there. `--zip` also writes
`<outDir>/<name>.zip`. Runs `gen` first if the library hasn't been generated.

### `mspacker dev`

```sh
mspacker dev [--save <name|auto>]
```

Starts the dev server, rebuilds on every save and reloads the pack in game. See [dev mode](/guides/dev-mode/).

| Option | |
|---|---|
| `--save <name>` | Build into a singleplayer save instead of the server. `auto` picks the most recently played one. |

The cache directory is `$XDG_CACHE_HOME/mspacker` when `XDG_CACHE_HOME` is set.
