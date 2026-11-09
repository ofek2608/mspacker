---
title: Versions
description: Which Minecraft versions work, and how that's tested.
---

mcjspacker2 works with every Minecraft version that has data packs: 1.13 and later, snapshots, and
the April Fools versions that support data packs. The command library comes from the version's own
datagen, so new commands work as soon as the version is out.

## What changes between versions

These are handled for you, based on the pack format of your version:

| Change | Handling |
|---|---|
| Folder names: `functions/`, `tags/functions/` before 1.21 | Generated files use the right names. Use them in `datapack/` too. |
| `pack.mcmeta`: `min_format`/`max_format` from pack format 82, `pack_format` before | Written for your version. |
| Text components: JSON before 1.21.5, SNBT after | Written as JSON, which is valid SNBT. Event keys follow the version. |
| Scoreboard slot `belowName` → `below_name` in 1.20.2 | Typed per version. |
| Number providers and slot sources became inline-definable in 26.x | Typed per version. |

When a version changes something mcjspacker2 doesn't know about yet, you can
[override the parser](/reference/custom-parsers/).

## Tested versions

mcjspacker2's test suite runs against real servers of these versions:

- **Latest:** 26.4-snapshot-7, 26.3, 26.2, 26.1.2
- **1.21 game drops:** 1.21.11, 1.21.10, 1.21.8, 1.21.5, 1.21.4, 1.21.3, 1.21.1
- **Milestones:** 1.20.6, 1.20.4, 1.20.2, 1.20.1, 1.19.4, 1.19.2, 1.18.2, 1.17.1, 1.16.5, 1.15.2, 1.14.4, 1.13.2
- **April Fools:** 26w14a, 25w14craftmine, 24w14potato, 23w13a_or_b, 22w13oneblockatatime, 20w14infinite, 3D Shareware v1.34

For each version the test downloads the server, runs datagen, generates the library, type-checks
and builds a sample pack, then starts the server, which must load the pack and run every function.

### Parser probe

Each test server also loads a generated probe pack. Every command path of that version becomes a
function line, with each argument filled from its parser's examples, and the server must load all
of them, about 1,200 lines per version. A line the server rejects because of an argument's format is
a bug for that version and fails the test.
