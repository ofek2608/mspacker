---
title: Project structure
description: What the files in a mcjspacker2 project are for.
---

```
my-pack/
  mcjs2.config.ts     # version, namespace, server dir, ...
  package.json        # "imports": { "#mc": "./.mcjs2/gen/index.ts" }
  tsconfig.json
  src/                # your TypeScript: every file is bundled and run at build time
    main.ts
  datapack/           # optional: files copied into the pack as-is
    data/mypack/...
  .mcjs2/             # generated (gitignored)
    gen/              # the typed command library for your version
  dist/               # build output (gitignored)
  server/             # dev server: jar, world, server.properties (gitignored)
```

- **`src/`**: every `.ts` file is loaded when building, so functions tagged with
  [`@mcfunction`](/guides/writing-functions/#entry-points) are found in any file. The path of a file
  becomes part of its [function ids](/guides/function-ids/).
- **`datapack/`**: anything that isn't a TypeScript function: hand-written `.mcfunction` files,
  advancements, loot tables, tags. See [raw content](/guides/raw-content/).
- **`.mcjs2/gen/`**: written by `mcjs2 gen`. Don't edit it; it's regenerated from the server jar.
- **`server/`**: the [dev server](/guides/dev-mode/). Put a server jar here to use your own;
  otherwise the official one is downloaded.

The template's `.gitignore` excludes `.mcjs2/`, `dist/`, `node_modules/` and `server/`.
