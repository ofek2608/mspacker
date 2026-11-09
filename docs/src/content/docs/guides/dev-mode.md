---
title: Dev mode
description: Rebuild on save into a dev server and reload it over RCON.
---

```sh
npm run dev            # mcjs2 dev
npx mcjs2 dev --start  # also start the server
```

`mcjs2 dev` watches `src/`, `datapack/` and the config. On every change it rebuilds the pack into
the dev server's world, at `<server dir>/<level-name>/datapacks/<name>`, and sends `reload` to the
server over RCON. If a build fails, the error is printed with its source location and the previous
pack stays in place.

Dev builds set [`__DEV__`](/guides/writing-functions/#debug-only-commands) to `true` and include
[`@dev` functions](/guides/writing-functions/#debug-only-functions), so you can add commands and
functions that only exist while developing.

## The server directory

The dev server lives in `server/` by default (`server.dir` in the config, or the `MCJS2_SERVER_DIR`
environment variable).

- **Jar.** If the directory has a server jar, it is used as-is, and its version must match
  `version` in the config. If it has none, the official jar for your version is downloaded from
  Mojang, verified, cached in `~/.cache/mcjspacker2/jars/<version>`, and copied in. When you change
  `version`, a jar that mcjspacker2 copied in is replaced with the new one; a jar you put there
  yourself never is. Set `server.download: false` to never download.
- **`server.properties`.** If there is none yet, dev creates one with RCON enabled and a random
  password. If you have your own, enable RCON yourself:

  ```properties
  enable-rcon=true
  rcon.password=<something>
  rcon.port=25575
  ```

  Without RCON, dev still rebuilds, and you run `/reload` on the server yourself.

## Accepting the EULA

mcjspacker2 never creates or edits `eula.txt`. The first time you run `mcjs2 dev --start`, the
Minecraft server writes `server/eula.txt` and stops. Read the
[Minecraft EULA](https://aka.ms/MinecraftEULA), set `eula=true` in that file if you agree, and run
`mcjs2 dev --start` again. Dev keeps watching and rebuilding in the meantime.

## Joining the server

Start the server with `--start`, or start it yourself with `java -jar server.jar` in the server
directory. Then join `localhost` from the Minecraft client of the same version. Give yourself
operator from the server console (`op <your name>`) to run `/function` in game.

When dev started the server, it skips the first reload because the server loads the pack while
booting.

## Singleplayer

To build into a singleplayer world instead:

```sh
npx mcjs2 dev --save "My World"
npx mcjs2 dev --save auto      # the most recently played world
```

Saves are found in the launcher's directory: `minecraftRoot` in the config, the `MINECRAFT_ROOT`
environment variable, or the OS default (`~/.minecraft`, `~/Library/Application Support/minecraft`,
`%APPDATA%\.minecraft`). Singleplayer worlds can't be reloaded remotely, so run `/reload` in game
after each build.
