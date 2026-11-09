---
title: Getting started
description: Create a project, generate the command library and build your first data pack.
---

## Requirements

- Node.js 22.22 or newer.
- Java, for running the Minecraft server. MSPacker prefers the Java runtime the Minecraft
  launcher installed for your version, then `JAVA_HOME`, then `java` on your `PATH`. See
  [`java`](/mspacker/reference/configuration/#java).

## Create a project

```sh
npm create mspacker@latest
# or: pnpm create mspacker / yarn create mspacker / bun create mspacker
```

The setup asks for:

- **Project directory**: where to create the project.
- **Namespace**: your data pack's namespace, such as `mypack`. See
  [namespaces](/mspacker/reference/configuration/#namespace) for the `mypack:generated/` form.
- **Minecraft version**: the list has the latest release and snapshot, the latest patch of every
  minor version since 1.13 (the first version with data packs), every 1.21 game drop, and the April
  Fools versions at the bottom. Pick **Other version…** to search every version that supports data packs.
- **Description**: shown in the in-game pack list.

It then installs dependencies and offers to generate the command library. Generating downloads the
official server jar for your version (about 50 MB, downloaded once per version) and reads its
commands from it.

To skip the questions, pass the answers as flags:

```sh
npm create mspacker@latest my-pack -- --version 26.3 --namespace mypack --yes
```

| Flag | Meaning |
|---|---|
| `--version <id>` | Minecraft version |
| `--namespace <ns>` | Namespace |
| `--description <text>` | Pack description |
| `--yes` | Accept defaults for everything not given |
| `--no-install` | Don't install dependencies |
| `--no-gen` | Don't generate the command library |

### Add to an existing project

Run it in the project's folder:

```sh
npm create mspacker@latest .
```

Existing files are kept: it adds `mspacker.config.ts`, the `#mc` import, scripts and dependencies in
`package.json`, `tsconfig.json`, `.gitignore` entries and `src/main.ts`.

## Generate, build, run

```sh
npm run gen     # generate the typed command library into .mspacker/gen
npm run build   # build the data pack into dist/<name>
npm run dev     # rebuild into a dev server on every save and /reload it
```

Your code imports `$` from `#mc`, a package import that points at the generated library. Every
command hangs off it: `$.say("hi")`, `$.execute.as("@a").run.say("hi")`. See [commands](/mspacker/guides/commands/).
Run `gen` again whenever you change `version`.

## Your first function

`src/main.ts` from the template:

```ts
import { $ } from "#mc";

/** @load */
export function Init() {
  $.say("Datapack loaded!");
}

/** @mcfunction */
export function Greet() {
  $.execute.as("@a").at("@s").run.tellraw("@s", { text: "Hello!", color: "gold" });
}
```

`npm run build` writes:

```
dist/my-pack/
  pack.mcmeta
  data/mypack/function/main/init.mcfunction    # say Datapack loaded!
  data/mypack/function/main/greet.mcfunction   # execute as @a at @s run tellraw @s {...}
  data/minecraft/tags/function/load.json       # ["mypack:main/init"]
```

In game, run `/function mypack:main/greet`.

## Next

- [Writing functions](/mspacker/guides/writing-functions/): how TypeScript turns into commands.
- [Dev mode](/mspacker/guides/dev-mode/): the dev server, RCON and the EULA.
