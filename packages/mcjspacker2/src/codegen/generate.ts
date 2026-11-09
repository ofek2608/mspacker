/**
 * commands.json + registries.json -> TypeScript command library.
 *
 * Emits `$`, typed with one interface per command tree node: literal children are properties,
 * runs of argument children are call signatures, and redirects reuse their target's interface.
 */
import { continuation, literalName, type TreeNode } from "../runtime/command.js";
import { camel } from "../runtime/naming.js";
import { isKnownParser, parserDef, type ParserContext } from "../runtime/parsers.js";

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
}

export interface GenerateResult {
  files: Record<string, string>;
  warnings: string[];
  stats: { commands: number; nodes: number };
}

/** Parameter types that accept any string. */
const BROAD_TYPE = /\b(string|Selector|ScoreHolder|Id<|FnRef|Dimension|Swizzle|NbtValue|TextComponent|LegacyTextComponent)\b/;

/** Signatures per node stop after this many consecutive arguments (`f(a, b, c, ...)`). */
const MAX_ARGS_PER_CALL = 12;

export function generate(
  commandsJson: unknown,
  registries: Registries,
  meta: { version: string; packFormat: number },
): GenerateResult {
  const root = compactTree(commandsJson as RawNode);
  const warnings: string[] = [];
  const unknownParsers = new Set<string>();
  const ctx = parserContext(registries, meta);

  function argType(node: TreeNode): string {
    const id = node.p ?? "";
    if (!isKnownParser(id)) unknownParsers.add(id);
    return parserDef(id).type(node.o, ctx);
  }

  // One interface per node that isn't a redirect. Redirecting nodes use their target's type
  // (`execute as <targets>` -> the `execute` node, `run` -> the root).
  const names = new Map<TreeNode, string>([[root, "Commands"]]);
  const syntaxOf = new Map<TreeNode, string>([[root, ""]]);
  const pending: TreeNode[] = [root];

  function typeOf(node: TreeNode, syntax: string): string {
    const target = continuation(root, node);
    let name = names.get(target);
    if (!name) {
      name = `N${names.size}`;
      names.set(target, name);
      syntaxOf.set(target, syntax);
      pending.push(target);
    }
    return name;
  }

  const join = (a: string, b: string) => (a ? `${a} ${b}` : b);

  function renderParams(params: Param[]): string {
    const seen = new Map<string, number>();
    return params
      .map((p) => {
        const n = seen.get(p.name) ?? 0;
        seen.set(p.name, n + 1);
        return `${safeIdent(n ? `${p.name}${n + 1}` : p.name)}: ${p.type}`;
      })
      .join(", ");
  }

  function renderNode(node: TreeNode): string {
    const syntax = syntaxOf.get(node)!;
    const lines: string[] = [];

    if (node === root) {
      lines.push(
        "  /** A command line as-is: `$(\"say hi\")`, or a macro line: `$(\"$say $(message)\")`. */",
        "  (command: string): void;",
        "  /** A command template. Functions interpolate as their ids: `$`function ${Helper}``. */",
        "  (strings: TemplateStringsArray, ...values: unknown[]): void;",
        "  /** A function's commands: a single anonymous command is inlined, otherwise `function <id>`. */",
        "  (fn: (...args: never[]) => unknown): void;",
      );
    } else if (node.x) {
      lines.push(`  /** \`${syntax}\` */`, `  (): ${names.get(node)};`);
    }

    // Calls: every run of consecutive arguments, so `f(a)(b)` and `f(a, b)` both type-check. Sibling
    // arguments with the same types (`tp <targets>` / `tp <destination>`) merge into one signature
    // returning both nodes' types, because the runtime keeps both until later arguments decide.
    const sigs = new Map<string, { params: Param[]; returns: Set<string>; syntax: string[] }>();
    const calls = (from: TreeNode, params: Param[], path: string, depth: number) => {
      if (depth >= MAX_ARGS_PER_CALL) return;
      for (const [key, child] of Object.entries(from.c ?? {})) {
        if (child.l) continue;
        const p = [...params, { name: camel(key), type: argType(child) }];
        const childSyntax = join(path, `<${key}>`);
        const sigKey = p.map((x) => x.type).join(", ");
        const sig = sigs.get(sigKey) ?? { params: p, returns: new Set<string>(), syntax: [] };
        sig.returns.add(typeOf(child, childSyntax));
        sig.syntax.push(childSyntax);
        sigs.set(sigKey, sig);
        const next = continuation(root, child);
        if (next !== root) calls(next, p, childSyntax, depth + 1);
      }
    };
    calls(node, [], syntax, 0);
    // TS picks the first matching overload, and catch-all string types (selectors, ids) also accept
    // positions: list signatures with fewer catch-all parameters first, so `"~ ~1 ~"` picks Vec3.
    const broad = (sig: { params: Param[] }) => sig.params.filter((p) => BROAD_TYPE.test(p.type)).length;
    for (const sig of [...sigs.values()].sort((a, b) => broad(a) - broad(b))) {
      lines.push(
        `  /** ${sig.syntax.map((x) => `\`${x}\``).join(" or ")} */`,
        `  (${renderParams(sig.params)}): ${[...sig.returns].join(" & ")};`,
      );
    }

    // Literals: properties.
    const used = new Map<string, TreeNode>();
    for (const [key, child] of Object.entries(node.c ?? {})) {
      if (!child.l) continue;
      let prop = literalName(key);
      const taken = prop ? used.get(prop) : undefined;
      if (taken) {
        // `minecraft:water_source_conversion` and its alias `water_source_conversion`: same subtree.
        if (JSON.stringify(taken) === JSON.stringify(child)) continue;
        warnings.push(`"${join(syntax, key)}": property ${prop} is taken by a sibling; use ["${key}"].`);
      }
      if (!prop || taken) prop = JSON.stringify(key);
      used.set(prop, child);
      const childSyntax = join(syntax, key);
      const note =
        node === root && child.q
          ? ` — needs permission level ${child.q}; functions run at level 2, so this only works from RCON/console`
          : "";
      lines.push(`  /** \`${childSyntax}\`${note} */`, `  readonly ${prop}: ${typeOf(child, childSyntax)};`);
    }

    const name = names.get(node)!;
    const doc = node === root ? "/** Every command of this version. */\nexport " : `/** \`${syntax}\` */\n`;
    return `${doc}interface ${name} {\n${lines.join("\n")}\n}`;
  }

  const out: string[] = [];
  for (let i = 0; i < pending.length; i++) out.push(renderNode(pending[i]!));
  const commandCount = Object.values(root.c ?? {}).filter((c) => c.l).length;

  if (unknownParsers.size) {
    warnings.push(`Unmapped argument parsers (typed as string): ${[...unknownParsers].sort().join(", ")}`);
  }

  const header = `// Generated by mcjspacker2 for Minecraft ${meta.version}. Do not edit.\n`;
  const commands =
    header +
    `/* eslint-disable */\n` +
    `import { createRoot } from "mcjspacker2/runtime";\n` +
    `import type * as R from "mcjspacker2/runtime";\n` +
    `import type { Id } from "./registries.js";\n` +
    `import { tree } from "./tree.js";\n\n` +
    TYPE_ALIASES +
    "\n\n" +
    "/**\n" +
    " * Every command, as a chain: literals are properties, arguments are calls.\n" +
    " *\n" +
    " *     $.Execute.As(\"@a\").At(\"@s\").Run.Say(\"hi\");\n" +
    " *     $.Scoreboard.Players.Set(\"@s\", \"kills\", 0);\n" +
    " *     $(\"say raw command\");\n" +
    " */\n" +
    "export const $ = createRoot(tree) as Commands;\n\n" +
    out.join("\n\n") +
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
    stats: { commands: commandCount, nodes: names.size },
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
