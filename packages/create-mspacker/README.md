# create-mspacker

Set up a [MSPacker](../mspacker) project: Minecraft data packs written in TypeScript.

```sh
npm create mspacker@latest
# or
pnpm create mspacker
```

It asks for the project directory, namespace, Minecraft version and description, then scaffolds the
project, installs dependencies and generates the typed command library.

Non-interactive:

```sh
npm create mspacker@latest my-pack -- --version 26.3 --namespace mypack --yes
```

Options: `--version <id>`, `--namespace <ns>`, `--description <text>`, `--yes` (accept defaults),
`--no-install`, `--no-gen`.
