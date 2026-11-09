---
title: Getting started
description: Create a project, generate the command library and build your first data pack.
---

## Requirements

- Node.js 20 or newer.
- Java, for running the Minecraft server. mcjspacker2 prefers the Java runtime the Minecraft
  launcher installed for your version, then `JAVA_HOME`, then `java` on your `PATH`. See
  [`java`](/reference/configuration/#java).

## Create a project

```sh
npm create mcjspacker2@latest
# or: pnpm create mcjspacker2 / yarn create mcjspacker2 / bun create mcjspacker2
```

The setup asks for:

- **Project directory**: where to create the project.
- **Namespace**: your data pack's namespace, such as `mypack`. See
  [namespaces](/reference/configuration/#namespace) for the `mypack:generated/` form.
- **Minecraft version**: the list has the latest release and snapshot, the latest patch of every
  minor version since 1.13 (the first version with data packs), every 1.21 game drop, and the April
  Fools versions at the bottom. Pick **Other version…** to search every version that supports data packs.
- **Description**: shown in the in-game pack list.

It then installs dependencies and offers to generate the command library. Generating downloads the
official server jar for your version (about 50 MB, cached once per version) and runs its datagen.

To skip the questions, pass the answers as flags:

```sh
npm create mcjspacker2@latest my-pack -- --version 26.3 --namespace mypack --yes
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

```sh
npm install -D mcjspacker2 typescript
npx mcjs2 init --mc-version 26.3 --namespace mypack
```

## Generate, build, run

```sh
npm run gen     # generate the typed command library into .mcjs2/gen
npm run build   # build the data pack into dist/<name>
npm run dev     # rebuild into a dev server on every save and /reload it
```

Your code imports commands from `#mc`, a package import that points at the generated library.
Run `gen` again whenever you change `version`.

## Your first function

`src/main.ts` from the template:

```ts
import { Say, Tellraw, Execute } from "#mc";

/** @load */
export function Init() {
  Say("Datapack loaded!");
}

/** @mcfunction */
export function Greet() {
  Execute().As("@a").At("@s").Run(() => Tellraw("@s", { text: "Hello!", color: "gold" }));
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

- [Writing functions](/guides/writing-functions/): how TypeScript turns into commands.
- [Dev mode](/guides/dev-mode/): the dev server, RCON and the EULA.
