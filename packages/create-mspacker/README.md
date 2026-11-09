# create-mcjspacker2

Set up a [mcjspacker2](../mcjspacker2) project: Minecraft data packs written in TypeScript.

```sh
npm create mcjspacker2@latest
# or
pnpm create mcjspacker2
```

It asks for the project directory, namespace, Minecraft version and description, then scaffolds the
project, installs dependencies and generates the typed command library.

Non-interactive:

```sh
npm create mcjspacker2@latest my-pack -- --version 26.3 --namespace mypack --yes
```

Options: `--version <id>`, `--namespace <ns>`, `--description <text>`, `--yes` (accept defaults),
`--no-install`, `--no-gen`.
