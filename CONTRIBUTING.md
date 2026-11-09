# Contributing to MineScriptPacker

## Repository

```
packages/mspacker/         the tool (CLI `mspacker`) and the runtime user code imports
packages/create-mspacker/  `npm create mspacker`: standalone (no dependency on the tool), owns the
                              project template; released with the same version as mspacker
examples/demo/                a real project used for manual end-to-end checks
docs/                         the Starlight documentation site
```

```sh
pnpm install
pnpm typecheck
pnpm test                               # unit tests of both packages (fast)
pnpm build                              # compile to dist/ (the CLIs and the build worker run from dist)
pnpm docs                               # docs dev server
```

In `examples/demo`: `npx mspacker gen`, `npx mspacker build`, `npx mspacker dev`.

## How it works

1. **gen** (`src/codegen/emit.ts`): find or download the server jar (`src/env/`), run Minecraft's
   datagen (`src/datagen/run.ts`, cached per jar) and turn `commands.json` + `registries.json` into
   `.mspacker/gen/` (`src/codegen/generate.ts`). The generated `$` is typed with one interface per
   command tree node: literals are properties, runs of arguments are call signatures, redirects reuse
   the target's interface (that's how `execute ... run` works without special cases).
2. **build** (`src/build/build.ts`): esbuild bundles `src/`, and `transform.ts` injects metadata
   (file, name, JSDoc tags) for every function, on the same line so stack traces stay exact. The
   bundle runs in a short-lived worker thread (`worker.ts`) so dev rebuilds don't accumulate modules.
3. **runtime** (`src/runtime/`): user code runs at build time.
   - `command.ts`: `$` is a Proxy walking the compact tree. Property access follows literals (or takes
     a string argument), calls consume arguments; sibling arguments are kept as candidates until later
     values decide.
   - `state.ts`: the recorder. `fnId` is the single way a function gets its name. Every function is
     queued and recorded one at a time (no nesting). Named functions get their name right away;
     anonymous ones get a placeholder, and once everything is recorded they're named by a hash of
     their commands (references first, cycles by position, prefixed by the `hint` the build records
     for nested variables and object keys) and the placeholders are replaced. A taken id
     (`named()`/`@mcfunction` twice) is checked after that: fine if the commands are identical.
   - `parsers.ts`: the argument type registry (see below).
   - `macro.ts`: macro functions. Every recorded function gets an `args` proxy (no arity check) whose
     properties are markers: objects with a symbol, owned by that function. Markers are never
     recognized by text: while a command line is built, reading a marker's text records it
     (`collectMacros`), and lines that used one get the `$` prefix. Markers refuse `toString`;
     `` macro`...` `` makes new markers from text. Generated signatures accept markers anywhere
     inside a value (`MacroValue<T>`); argument types can say how a marker is written (`macro`
     in `ParserDef`, used by number providers).
4. **pack** (`src/build/pack.ts`): merge with the raw `datapack/` dir, write `pack.mcmeta`, handle
   old folder names.
5. **dev** (`src/dev/`): watch, rebuild into the server world or a save, `/reload` over RCON.

State shared between copies of the runtime module lives on `globalThis` (`Symbol.for("mspacker.*")`).

## Argument types (parsers)

Every command argument names a brigadier parser (`minecraft:vec3`, `minecraft:component`, ...).
`src/runtime/parsers.ts` maps each one to:

- `type(props, ctx)`: the TypeScript type in generated signatures,
- `test(value, props, ctx)`: whether a value fits (picks between sibling arguments),
- `serialize(value, props, ctx)`: the command text,
- `examples(props, ctx)`: sample values for the probe.

`ctx.packFormat` is how parsers follow format changes between versions (`FORMAT_*` constants).
Users can override any parser from their config (`parsers`), which is the escape hatch for new
Minecraft versions; when a version adds a parser we don't know, `mspacker gen` warns and types it as
`string`.

When adding or changing a parser: add unit tests in `test/parsers.test.ts`, give it `examples`, and
run the version matrix.

## Version matrix and parser probe

`test/matrix/versions.test.ts` checks the whole pipeline against real servers for every version in
its list (current releases, every 1.21 drop, milestones back to 1.13.2, April Fools versions):
download, datagen, codegen, strict `tsc`, build, then a real server must load the sample pack
(`test/matrix/sample/`, files can declare `// @requires <command path>`) and run its functions.

```sh
MSPACKER_MATRIX=1 pnpm vitest run test/matrix                                   # all versions
MSPACKER_MATRIX=1 MSPACKER_MATRIX_VERSIONS=1.21.4,26.3 pnpm vitest run test/matrix  # some versions
MSPACKER_MATRIX=1 MSPACKER_MATRIX_SERVER=0 pnpm vitest run test/matrix             # no servers
MSPACKER_MATRIX=1 MSPACKER_MATRIX_CONCURRENCY=10 pnpm vitest run test/matrix       # parallelism (default 6)
```

It builds the package first and tests `dist/`. Older versions need older Java: each version uses the
runtime the Minecraft launcher installed for it, so launch a version once in the launcher if its
runtime is missing. Test servers accept the EULA in their own `eula.txt`. Work dirs are in `.matrix/`.

**Parser probe** (`src/codegen/probe.ts`): each server also loads a generated `probe` pack where every
command path of that version becomes a function line, with arguments filled from parser `examples`
(each extra example becomes its own line). The server must load every line. Rejected lines are
classified as:

- **failed**: an argument format was rejected, a parser bug for that version. Fails the test.
- **unavailable**: the command itself isn't usable from functions (experimental, permission level).
- **skipped**: not probed (needs permission level > 2, or no examples).

Results go to `.matrix/<version>/probe-report.json`. Run the matrix after any change to parsers,
codegen or the runtime; it's the only check that the output is valid Minecraft.

## Conventions

- TypeScript is strict (`tsconfig.base.json`) minus options that make code harder to read.
- Everything users import (`#mc` and `@ofekn/mspacker`) has a doc comment: the docs' API reference is
  generated from them by TypeDoc (`starlight-typedoc`) on every docs build. Mark helpers that only
  generated code uses with `@internal`. TypeDoc needs TypeScript's JS API, so the docs package has
  its own TypeScript 6 just for that.
- The docs are for beginners: no internals (literals, parsers, nodes) outside the advanced page.
  Every code example in them should build; check new ones against the demo.
