---
title: Configuration
description: Every option in mcjs2.config.ts.
---

```ts
// mcjs2.config.ts
import { defineConfig } from "mcjspacker2";

export default defineConfig({
  version: "26.3",
  namespace: "mypack:generated/",
  description: "My pack",
  server: { dir: "server" },
});
```

The config can also be `mcjs2.config.mts`, `.js` or `.mjs`.

### `version`

**Required.** The Minecraft version id, exactly as in the launcher: `"26.3"`,
`"26.4-snapshot-7"`, `"1.20.4"`, `"24w14potato"`. It decides which server jar is used, what the
command library contains and the `pack.mcmeta` format. Run `mcjs2 gen` after changing it.

### `namespace`

**Required.** The namespace of your functions, with an optional path prefix:

| Value | Functions go to |
|---|---|
| `"mypack"` or `"mypack:"` | `mypack:<file>/<name>` |
| `"mypack:generated"` or `"mypack:generated/"` | `mypack:generated/<file>/<name>` |

See [function ids](/guides/function-ids/).

### `name`

The pack's folder and zip name. Defaults to the `name` in `package.json` (without its scope), then the
project directory name.

### `description`

The pack description in `pack.mcmeta`.

### `src`

TypeScript source directory. Default `"src"`.

### `raw`

Directory copied into the pack as-is. Default `"datapack"`. See [raw content](/guides/raw-content/).

### `outDir`

Build output directory. Default `"dist"`.

### `server`

| Option | Default | |
|---|---|---|
| `dir` | `"server"` | Dev server directory. `MCJS2_SERVER_DIR` overrides it. |
| `jar` | `server.jar`, or the only `*.jar` | Jar file name in `dir`. |
| `download` | `true` | Download the official jar when `dir` has none. |
| `host` | `"127.0.0.1"` | RCON host. |
| `jvmArgs` | `[]` | Extra JVM arguments for `mcjs2 dev --start`, e.g. `["-Xmx2G"]`. |

### `java`

Path to the `java` executable. By default, mcjspacker2 uses the Java runtime the Minecraft
launcher installed for your version (the same Java the game runs on), then `JAVA_HOME`, then `java`
on the `PATH`. Old versions need old Java (1.16 and earlier run on Java 8), so launching a version
once in the launcher is the easiest way to get the right runtime.

### `minecraftRoot`

The Minecraft launcher directory, used for singleplayer saves and Java runtimes. `MINECRAFT_ROOT`
overrides it. Default: the OS's standard location. Server jars are never taken from it.

### `parsers`

Add or change argument types. See [custom parsers](/reference/custom-parsers/).

## Environment variables

| Variable | |
|---|---|
| `MCJS2_SERVER_DIR` | Overrides `server.dir`. |
| `MINECRAFT_ROOT` | Overrides `minecraftRoot`. |
| `JAVA_HOME` | Java to use when `java` isn't set. |
