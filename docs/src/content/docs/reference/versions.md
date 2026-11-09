---
title: Versions
description: Which Minecraft versions work, and how that's tested.
---

MSPacker works with every Minecraft version that has data packs: 1.13 and later, snapshots, and
the April Fools versions that support data packs. MSPacker reads the list of commands from the
Minecraft version itself, so new commands work as soon as the version is out.

## Differences between versions

Data packs changed over the years: folder names, the `pack.mcmeta` format, how text is written,
some command words. MSPacker writes your pack the way your version expects, so the same code
works across versions as long as the commands exist.

If a new Minecraft version changes a command in a way MSPacker doesn't know yet, you can
[teach it yourself](/reference/custom-parsers/).

## Tested versions

MSPacker's test suite runs against real servers of these versions:

- **Latest:** 26.4-snapshot-7, 26.3, 26.2, 26.1.2
- **1.21 game drops:** 1.21.11, 1.21.10, 1.21.8, 1.21.5, 1.21.4, 1.21.3, 1.21.1
- **Milestones:** 1.20.6, 1.20.4, 1.20.2, 1.20.1, 1.19.4, 1.19.2, 1.18.2, 1.17.1, 1.16.5, 1.15.2, 1.14.4, 1.13.2
- **April Fools:** 26w14a, 25w14craftmine, 24w14potato, 23w13a_or_b, 22w13oneblockatatime, 20w14infinite, 3D Shareware v1.34

For each version, the tests build a sample pack, start a real server, and check that the server
loads the pack and runs its functions. They also try every command of that version.
