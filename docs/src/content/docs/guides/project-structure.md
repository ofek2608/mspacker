---
title: Project structure
description: What the files in a mcjspacker2 project are for.
---

```
my-pack/
  mcjs2.config.ts     # version, namespace, server dir, ...
  package.json        # "imports": { "#mc": "./.mcjs2/gen/index.ts" }
  tsconfig.json
  src/                # your TypeScript functions
    main.ts
  datapack/           # optional: files copied into the pack as-is
    data/mypack/...
  .mcjs2/             # generated (gitignored)
    gen/              # the commands of your Minecraft version (where `$` comes from)
  dist/               # build output (gitignored)
  server/             # dev server: jar, world, server.properties (gitignored)
```

- **`src/`**: your code. Functions marked with
  [`@mcfunction`](/guides/writing-functions/#marking-functions) can be in any file and folder. The
  file's path becomes part of the [function's name](/guides/function-ids/).
- **`datapack/`**: anything that isn't a TypeScript function: hand-written `.mcfunction` files,
  advancements, loot tables, tags. See [tags and files](/guides/raw-content/).
- **`.mcjs2/gen/`**: created by `mcjs2 gen`. Don't edit it; it's recreated when you run `gen` again.
- **`server/`**: the [dev server](/guides/dev-mode/). Put a server jar here to use your own;
  otherwise the official one is downloaded.

The template's `.gitignore` excludes `.mcjs2/`, `dist/`, `node_modules/` and `server/`.
