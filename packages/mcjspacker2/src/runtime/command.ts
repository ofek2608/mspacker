/**
 * Runtime side of the generated command library: `$` is a Proxy over the command tree.
 *
 *   $.Execute.As("@a").At("@s").Run.Say("hi")    ->  execute as @a at @s run say hi
 *
 * - Property access follows a literal child (`Execute`, `As`).
 * - A call consumes argument children, one per value: `Give("@s")("diamond", 3)` is the same as
 *   `Give("@s", "diamond", 3)`. Sibling arguments (`tp <targets>` vs `tp <location>`) are tracked as
 *   candidates until the values decide.
 * - Redirects are followed, so `Run` lands on the root and `execute` needs no special handling.
 * - Calling the root emits raw text, a template, or a function as the command.
 * - Every step returns a new proxy; the line is checked for completeness when its function ends.
 */
import { parserDef } from "./parsers.js";
import { beginCommand, emitLine, functionRef, getState, runTarget, type CommandEntry } from "./state.js";

/** Compact command tree node (generated from commands.json). */
export interface TreeNode {
  /** literal */
  l?: 1;
  /** argument parser id */
  p?: string;
  /** parser properties */
  o?: Record<string, unknown>;
  /** children */
  c?: Record<string, TreeNode>;
  /** executable */
  x?: 1;
  /** redirect path (empty = root) */
  r?: string[];
  /** required permission level when above 2 (functions run at level 2, so these can't be used in them) */
  q?: number;
}

/** A node that continues at the root: `execute run` (old trees: a childless literal). */
export function isRootRedirect(node: TreeNode): boolean {
  return (node.l === 1 && !node.c && !node.r && !node.x) || (node.r !== undefined && node.r.length === 0);
}

export function resolvePath(root: TreeNode, path: string[]): TreeNode {
  let n = root;
  for (const seg of path) {
    const next = n.c?.[seg];
    if (!next) throw new Error(`Bad redirect path ${path.join(" ")}`);
    n = next;
  }
  return n;
}

/**
 * A node is a "chain target" when something redirects to it, except plain aliases
 * (a root literal with no children redirecting to another root command, like `tp` -> `teleport`).
 * Used by the probe to stop walking redirect loops.
 */
export function findChainTargets(root: TreeNode): Map<TreeNode, string> {
  const out = new Map<TreeNode, string>();
  const visit = (node: TreeNode, depth: number) => {
    if (node.r && node.r.length > 0) {
      const alias = depth === 1 && !node.c;
      if (!alias) out.set(resolvePath(root, node.r), node.r.join("/"));
    }
    for (const child of Object.values(node.c ?? {})) visit(child, depth + 1);
  };
  visit(root, 0);
  return out;
}

/** Where a node continues: its redirect target (the root for `run`), or itself. */
export function continuation(root: TreeNode, node: TreeNode): TreeNode {
  if (node !== root && isRootRedirect(node)) return root;
  return node.r && node.r.length ? resolvePath(root, node.r) : node;
}

/** Property name for a literal: PascalCase, without a `minecraft:` prefix. Null if it isn't identifier-like. */
export function literalName(literal: string): string | null {
  const bare = literal.replace(/^minecraft:/, "");
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(bare)) return null;
  return bare
    .split(/[_-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join("");
}

const literalIndex = new WeakMap<TreeNode, Map<string, string>>();

/** Literal children of a node, by exact key and by property name. */
function literalsOf(node: TreeNode): Map<string, string> {
  let map = literalIndex.get(node);
  if (!map) {
    map = new Map();
    for (const [key, child] of Object.entries(node.c ?? {})) if (child.l) map.set(key, key);
    for (const key of [...map.keys()]) {
      const name = literalName(key);
      if (name && !map.has(name)) map.set(name, key);
    }
    literalIndex.set(node, map);
  }
  return map;
}

interface Candidate {
  node: TreeNode;
  parts: string[];
  /** Ended with a command after `run`. */
  done?: true;
}

interface ChainState {
  slot: Slot | null;
  cands: Candidate[];
}

/** One line being built. Stepping from a state other than `latest` (a reused prefix) starts a new line. */
interface Slot {
  entry: CommandEntry;
  buffer: unknown;
  latest: ChainState;
}

const text = (c: Candidate) => c.parts.join(" ");

function formatArg(a: unknown): string {
  return typeof a === "function" ? `[function ${a.name || "anonymous"}]` : (JSON.stringify(a) ?? String(a));
}

/** Command text for a root call: a string, a template literal (functions become ids), or a function. */
function rootCallText(args: unknown[]): string {
  const [first, ...rest] = args;
  if (Array.isArray(first) && "raw" in first) {
    const strings = first as unknown as TemplateStringsArray;
    let out = strings[0] ?? "";
    rest.forEach((v, i) => {
      out += (typeof v === "function" ? functionRef(v) : String(v)) + (strings[i + 1] ?? "");
    });
    return out;
  }
  if (args.length === 1 && (typeof first === "string" || typeof first === "function")) return runTarget(first);
  throw new Error(`Expected a command: a string, a template literal or a function, got (${args.map(formatArg).join(", ")}).`);
}

function currentBuffer(): unknown {
  const s = getState();
  return s.stack[s.stack.length - 1];
}

/** Create the `$` root for a command tree. */
export function createRoot(root: TreeNode): unknown {
  const atRoot = (st: ChainState) => st.cands.every((c) => !c.done && continuation(root, c.node) === root);

  const advance = (prev: ChainState, cands: Candidate[]): ChainState => {
    const next: ChainState = { slot: prev.slot, cands };
    const buffer = currentBuffer();
    if (prev.slot && prev.slot.latest === prev && prev.slot.buffer === buffer) {
      prev.slot.latest = next;
      return next;
    }
    const slot = { buffer, latest: next } as Slot;
    slot.entry = beginCommand(cands[0]!.parts[0]!, () => {
      const done = slot.latest.cands.find((c) => c.done || c.node.x);
      return done ? text(done) : null;
    }, () => text(slot.latest.cands[0]!));
    next.slot = slot;
    return next;
  };

  const proxyFor = (st: ChainState): unknown =>
    new Proxy(function command() {}, {
      get(target, prop, receiver) {
        if (typeof prop === "string") {
          const cands: Candidate[] = [];
          for (const c of st.cands) {
            if (c.done) continue;
            const src = continuation(root, c.node);
            const key = literalsOf(src).get(prop);
            if (key !== undefined) cands.push({ node: src.c![key]!, parts: [...c.parts, key] });
          }
          if (cands.length) return proxyFor(advance(st, cands));
          if (/^[A-Z]/.test(prop)) {
            const at = st.slot ? `after "${text(st.cands[0]!)}"` : "";
            throw new Error(`Unknown ${st.slot ? "subcommand" : "command"} "${prop}" ${at}`.trim() + ".");
          }
        }
        return Reflect.get(target, prop, receiver);
      },
      apply(_target, _this, args: unknown[]) {
        if (atRoot(st)) {
          const line = rootCallText(args);
          if (!st.slot) return void emitLine(line); // `$("...")`: a line of its own
          return void advance(st, st.cands.map((c) => ({ node: c.node, parts: [...c.parts, line], done: true as const })));
        }
        const ctx = getState().ctx;
        let cands = st.cands.filter((c) => !c.done);
        for (const value of args) {
          const next: Candidate[] = [];
          let error: unknown;
          for (const c of cands) {
            const src = continuation(root, c.node);
            for (const child of Object.values(src.c ?? {})) {
              if (child.l) continue;
              const def = parserDef(child.p ?? "");
              if (!def.test(value, child.o, ctx)) continue;
              try {
                next.push({ node: child, parts: [...c.parts, def.serialize(value, child.o, ctx)] });
              } catch (e) {
                error ??= e;
              }
            }
          }
          if (!next.length) {
            if (error) throw error;
            throw new Error(`No syntax of "${text(st.cands[0]!)}" matches arguments (${args.map(formatArg).join(", ")}).`);
          }
          cands = next;
        }
        return proxyFor(advance(st, cands));
      },
    });

  return proxyFor({ slot: null, cands: [{ node: root, parts: [] }] });
}
