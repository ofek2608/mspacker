/**
 * commands.json + registries.json -> TypeScript command library.
 *
 * Root literals become PascalCase functions with one overload per command path.
 * Nodes that are redirect targets (e.g. `execute`) become chain builder classes.
 */
import { findChainTargets, isRootRedirect, resolvePath, type TreeNode } from "../runtime/command.js";
import { camel, pascal } from "../runtime/naming.js";
import { isKnownParser, parserDef, RUN_TARGET, type ParserContext } from "../runtime/parsers.js";

interface RawNode {
  type: "root" | "literal" | "argument";
  children?: Record<string, RawNode>;
  executable?: boolean;
  redirect?: string[];
  parser?: string;
  properties?: Record<string, unknown>;
  permissions?: { permission?: { level?: string } };
}

const PERMISSION_LEVELS: Record<string, number> = { all: 0, moderators: 1, gamemasters: 2, admins: 3, owners: 4 };

export type Registries = Record<string, { entries: Record<string, unknown> }>;

/** Parser context for codegen / probes: version info plus registry lookups from registries.json. */
export function parserContext(registries: Registries, meta: { version: string; packFormat: number }): ParserContext {
  return {
    version: meta.version,
    packFormat: meta.packFormat,
    hasRegistry: (r) => r in registries,
    registryIds: (r) => Object.keys(registries[r]?.entries ?? {}),
  };
}

export function compactTree(raw: RawNode): TreeNode {
  const node: TreeNode = {};
  if (raw.type === "literal") node.l = 1;
  if (raw.type === "argument") {
    node.p = raw.parser;
    if (raw.properties && Object.keys(raw.properties).length) node.o = raw.properties;
  }
  if (raw.executable) node.x = 1;
  const level = PERMISSION_LEVELS[raw.permissions?.permission?.level ?? ""];
  if (level !== undefined && level > 2) node.q = level;
  if (raw.redirect) node.r = raw.redirect;
  if (raw.children && Object.keys(raw.children).length) {
    node.c = {};
    for (const [k, v] of Object.entries(raw.children)) node.c[k] = compactTree(v);
  }
  return node;
}

interface Param {
  name: string;
  type: string;
  optional?: boolean;
}

interface Sig {
  params: Param[];
  ret: string;
  syntax: string[];
}

/** Names exported by mcjspacker2/runtime; generated commands must not collide with them. */
const RUNTIME_EXPORTS = new Set([
  "WorldCoord", "LocalCoord", "PositionCoord", "Position", "Vec3", "BlockCoord", "BlockPos", "Vec2", "ColumnPos", "RotationCoord", "Rotation",
  "SelectorBase", "Selector", "ScoreHolder", "Range", "Duration", "TextComponent", "TextComponentObject", "FnRef",
  "RunTarget", "EntityAnchor", "GameModeId", "Heightmap", "Operation", "TemplateMirror", "TemplateRotation", "Swizzle",
  "ChatColor", "ScoreboardSlot", "LegacyScoreboardSlot", "LegacyTextComponent", "LegacyTextComponentObject",
  "Dimension", "NbtCompound", "NbtValue", "Chain", "Id", "RegistryIds",
]);

const MAX_OVERLOADS = 400;

export interface GenerateResult {
  files: Record<string, string>;
  warnings: string[];
  stats: { commands: number; overloads: number; chains: number };
}

export function generate(
  commandsJson: unknown,
  registries: Registries,
  meta: { version: string; packFormat: number },
): GenerateResult {
  const root = compactTree(commandsJson as RawNode);
  const chainKey = findChainTargets(root);
  const warnings: string[] = [];
  const unknownParsers = new Set<string>();
  const ctx = parserContext(registries, meta);

  const chainName = (node: TreeNode) => pascal(chainKey.get(node)!.replace(/\//g, "-")) + "Chain";

  function argType(node: TreeNode): string {
    const id = node.p ?? "";
    if (!isKnownParser(id)) unknownParsers.add(id);
    return parserDef(id).type(node.o, ctx);
  }

  function* walk(node: TreeNode, params: Param[], syntax: string[]): Generator<Sig> {
    if (node.l && isRootRedirect(node)) {
      yield { params: [...params, { name: "command", type: RUN_TARGET.type(undefined, ctx) }], ret: "void", syntax: [...syntax, "<command>"] };
      return;
    }
    if (chainKey.has(node)) {
      yield { params, ret: chainName(node), syntax };
      return;
    }
    const target = node.r && node.r.length ? resolvePath(root, node.r) : null;
    if (target && chainKey.has(target)) {
      yield { params, ret: chainName(target), syntax };
      return;
    }
    if (node.x) yield { params, ret: "void", syntax };
    const source = target ?? node;
    // Group sibling literals with identical subtrees into one union-typed parameter.
    const groups = new Map<string, string[]>();
    const args: [string, TreeNode][] = [];
    for (const [name, child] of Object.entries(source.c ?? {})) {
      if (child.l) {
        const key = JSON.stringify(child);
        const list = groups.get(key) ?? [];
        list.push(name);
        groups.set(key, list);
      } else args.push([name, child]);
    }
    for (const names of groups.values()) {
      const child = source.c![names[0]!]!;
      const type = names.map((n) => JSON.stringify(n)).join(" | ");
      const name = names.length === 1 ? camel(names[0]!) : "mode";
      yield* walk(child, [...params, { name, type }], [...syntax, names.join("|")]);
    }
    for (const [name, child] of args) {
      yield* walk(child, [...params, { name: camel(name), type: argType(child) }], [...syntax, `<${name}>`]);
    }
  }

  function finish(sigs: Sig[]): Sig[] {
    // Fold prefix overloads into optional trailing params: f(a), f(a, b) -> f(a, b?).
    const key = (s: Sig, n = s.params.length) => s.params.slice(0, n).map((p) => p.type).join(",") + "->" + s.ret;
    const byKey = new Map<string, Sig>();
    for (const s of sigs) if (!byKey.has(key(s))) byKey.set(key(s), s);
    const unique = [...byKey.values()];
    const consumed = new Set<Sig>();
    const sorted = [...unique].sort((a, b) => b.params.length - a.params.length);
    for (const s of sorted) {
      if (consumed.has(s)) continue;
      let k = s.params.length;
      while (k > 0) {
        const shorter = byKey.get(key({ ...s, params: s.params.slice(0, k - 1) }));
        if (!shorter || consumed.has(shorter) || shorter === s) break;
        consumed.add(shorter);
        k--;
      }
      s.params = s.params.map((p, i) => ({ ...p, optional: i >= k }));
      if (k < s.params.length) s.syntax = s.syntax.map((t, i) => (i >= k + (s.syntax.length - s.params.length) ? `[${t}]` : t));
    }
    return unique.filter((s) => !consumed.has(s));
  }

  function renderParams(params: Param[]): string {
    const seen = new Map<string, number>();
    return params
      .map((p) => {
        const n = seen.get(p.name) ?? 0;
        seen.set(p.name, n + 1);
        const name = n ? `${p.name}${n + 1}` : p.name;
        return `${safeIdent(name)}${p.optional ? "?" : ""}: ${p.type}`;
      })
      .join(", ");
  }

  let overloadCount = 0;
  function renderOverloads(indent: string, decl: string, sigs: Sig[], impl: string, note = ""): string {
    if (sigs.length > MAX_OVERLOADS) {
      warnings.push(`${decl}: ${sigs.length} overloads, falling back to an untyped signature.`);
      sigs = [];
    }
    overloadCount += sigs.length;
    const lines: string[] = [];
    for (const s of sigs) {
      lines.push(`${indent}/** \`${s.syntax.join(" ")}\`${note} */`);
      lines.push(`${indent}${decl}(${renderParams(s.params)}): ${s.ret};`);
    }
    lines.push(`${indent}${decl}(...args: unknown[]): any { ${impl} }`);
    return lines.join("\n");
  }

  // ---- chain classes
  const chainOut: string[] = [];
  const chainNodes = [...chainKey.entries()].sort(([, a], [, b]) => a.localeCompare(b));
  for (const [node, keyStr] of chainNodes) {
    const cls = chainName(node);
    const methods: string[] = [];
    for (const [lit, child] of Object.entries(node.c ?? {})) {
      if (!child.l) {
        warnings.push(`Chain ${keyStr}: argument child <${lit}> is not supported; use raw().`);
        continue;
      }
      const sigs = finish([...walk(child, [], [keyStr.split("/").pop()!, lit])]);
      methods.push(renderOverloads("  ", pascal(lit), sigs, `return this.$c(${JSON.stringify(lit)}, args);`));
    }
    chainOut.push(`export class ${cls} extends Chain {\n${methods.join("\n\n")}\n}\nregisterChain(${JSON.stringify(keyStr)}, ${cls});`);
  }

  // ---- root commands
  const cmdOut: string[] = [];
  const exported = new Set<string>();
  let commandCount = 0;
  for (const [lit, node] of Object.entries(root.c ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const name = pascal(lit);
    if (!name || RUNTIME_EXPORTS.has(name) || exported.has(name)) {
      warnings.push(`Command "${lit}" maps to export "${name}", which is taken; skipped (use raw()).`);
      continue;
    }
    exported.add(name);
    commandCount++;
    const sigs = finish([...walk(node, [], [lit])]);
    const note = node.q ? ` — needs permission level ${node.q}; functions run at level 2, so this only works from RCON/console` : "";
    cmdOut.push(renderOverloads("", `export function ${name}`, sigs, `return command(T, ${JSON.stringify(lit)}, args);`, note));
  }

  if (unknownParsers.size) {
    warnings.push(`Unmapped argument parsers (typed as string): ${[...unknownParsers].sort().join(", ")}`);
  }

  const header = `// Generated by mcjspacker2 for Minecraft ${meta.version}. Do not edit.\n`;
  const commands =
    header +
    `/* eslint-disable */\n` +
    `import { Chain, bindTree, command, registerChain } from "mcjspacker2/runtime";\n` +
    `import type * as R from "mcjspacker2/runtime";\n` +
    `import type { Id } from "./registries.js";\n` +
    `import { tree } from "./tree.js";\n\n` +
    TYPE_ALIASES + "\n\n" +
    `const T = bindTree(tree);\n\n` +
    chainOut.join("\n\n") +
    "\n\n" +
    cmdOut.join("\n\n") +
    "\n";

  const registriesTs =
    header +
    "export interface RegistryIds {\n" +
    Object.entries(registries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reg, { entries }]) => {
        const ids = Object.keys(entries)
          .map((id) => JSON.stringify(id.replace(/^minecraft:/, "")))
          .sort();
        return `  ${JSON.stringify(reg.replace(/^minecraft:/, ""))}: ${ids.length ? ids.join(" | ") : "never"};`;
      })
      .join("\n") +
    "\n}\n\n" +
    "/** Registry id, with or without the `minecraft:` prefix. Other namespaces are accepted as plain strings. */\n" +
    "export type Id<R extends keyof RegistryIds> = RegistryIds[R] | `minecraft:${RegistryIds[R]}` | (string & {});\n";

  const treeTs = header + `import type { TreeNode } from "mcjspacker2/runtime";\nexport const tree: TreeNode = ${JSON.stringify(root)};\n`;

  const index =
    header +
    `export * from "mcjspacker2/runtime";\n` +
    `export * from "./registries.js";\n` +
    `export * from "./commands.js";\n` +
    `export const MINECRAFT_VERSION = ${JSON.stringify(meta.version)};\n`;

  return {
    files: { "index.ts": index, "commands.ts": commands, "registries.ts": registriesTs, "tree.ts": treeTs },
    warnings,
    stats: { commands: commandCount, overloads: overloadCount, chains: chainNodes.length },
  };
}

/** Local aliases so generated signatures can use bare type names. */
const TYPE_NAMES = [
  "RotationCoord", "Vec3", "BlockPos", "Vec2", "ColumnPos", "Rotation", "Selector", "ScoreHolder", "Range", "Duration", "TextComponent",
  "FnRef", "RunTarget", "EntityAnchor", "GameModeId", "Heightmap", "Operation", "TemplateMirror", "TemplateRotation",
  "Swizzle", "ChatColor", "ScoreboardSlot", "LegacyScoreboardSlot", "LegacyTextComponent", "Dimension", "NbtCompound",
  "NbtValue",
];
const TYPE_ALIASES = TYPE_NAMES.map((n) => `type ${n} = R.${n};`).join("\n");


const RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum", "export",
  "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null", "return", "super",
  "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield", "let", "static", "await",
  "implements", "interface", "package", "private", "protected", "public", "arguments", "eval",
]);

function safeIdent(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_$]/g, "_");
  const ident = /^[0-9]/.test(cleaned) ? "_" + cleaned : cleaned || "arg";
  return RESERVED.has(ident) ? ident + "_" : ident;
}
