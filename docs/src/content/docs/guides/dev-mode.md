---
title: Dev mode
description: Start a dev server, rebuild on every save and reload in game automatically.
---

```sh
npm run dev    # or: npx mspacker dev
```

`mspacker dev` starts a Minecraft server for your version and builds your pack into its world. Then it
watches `src/`, `datapack/` and the config: **every time you save, the pack is rebuilt and reloaded
in game automatically**. If a build fails, the error is printed with its source location and the
previous pack keeps running.

The server runs in the same terminal, so you can type server commands there. Stopping the server
(`stop`) also stops dev. If a server is already running on the server's port, dev uses it instead
of starting another.

If you change `version` in the config while dev is running, it regenerates the commands for the
new version and swaps the server jar (if MSPacker downloaded it). Stop the server and run
`mspacker dev` again to play on the new version.

Dev builds set [`__DEV__`](/mspacker/guides/writing-functions/#debug-only-commands) to `true` and include
[`@dev` functions](/mspacker/guides/writing-functions/#debug-only-functions), so you can add commands and
functions that only exist while developing.

## The server directory

The dev server lives in `server/` by default (`server.dir` in the config, or the `MSPACKER_SERVER_DIR`
environment variable).

- **Jar.** If the directory has a server jar, it is used as-is, and its version must match
  `version` in the config. If it has none, the official jar for your version is downloaded from
  Mojang, verified, cached in `~/.cache/mspacker/jars/<version>`, and copied in. When you change
  `version`, a jar that MSPacker copied in is replaced with the new one; a jar you put there
  yourself never is. Set `server.download: false` to never download.
- **`server.properties`.** If there is none yet, dev creates one with RCON enabled and a random
  password. If you have your own, enable RCON yourself:

  ```properties
  enable-rcon=true
  rcon.password=<something>
  rcon.port=25575
  ```

  dev reloads the pack through RCON. Without it, dev still rebuilds, and you run `/reload` yourself.

## Accepting the EULA

mspacker never creates or edits `eula.txt`. The first time you run `mspacker dev`, the Minecraft
server writes `server/eula.txt` and stops. Read the [Minecraft EULA](https://aka.ms/MinecraftEULA),
set `eula=true` in that file if you agree, and run `mspacker dev` again. Dev keeps watching and
rebuilding in the meantime.

## Joining the server

Join `localhost` from the Minecraft client of the same version. Give yourself operator from the
server console (`op <your name>`) to run `/function` in game.

## Singleplayer

To build into a singleplayer world instead:

```sh
npx mspacker dev --save "My World"
npx mspacker dev --save auto      # the most recently played world
```

Saves are found in the launcher's directory: `minecraftRoot` in the config, the `MINECRAFT_ROOT`
environment variable, or the OS default (`~/.minecraft`, `~/Library/Application Support/minecraft`,
`%APPDATA%\.minecraft`). Singleplayer worlds can't be reloaded remotely, so run `/reload` in game
after each build.
