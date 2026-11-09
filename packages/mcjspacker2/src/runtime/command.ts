/**
 * Runtime side of the generated command library. Each generated function forwards its
 * arguments here; we walk the command tree to find the matching path (literals by equality,
 * arguments by the parser's `test`), then serialize.
 */
import { parserDef, RUN_TARGET } from "./parsers.js";
import { beginCommand, getState, type CommandEntry } from "./state.js";

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

export interface BoundTree {
  root: TreeNode;
  /** chain target node -> key (redirect path joined by "/") */
  chainKey: Map<TreeNode, string>;
}

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

export function bindTree(root: TreeNode): BoundTree {
  return { root, chainKey: findChainTargets(root) };
}

type Step = { text: string } | { parser: string; props: Record<string, unknown> | undefined; value: unknown; run?: true };

interface Match {
  steps: Step[];
  end: TreeNode;
}

function matchChildren(tree: BoundTree, node: TreeNode, args: unknown[], i: number, steps: Step[]): Match | null {
  const ctx = getState().ctx;
  if (i < args.length && isRootRedirect(node) && node.l) {
    if (i === args.length - 1 && RUN_TARGET.test(args[i], undefined, ctx)) {
      return { steps: [...steps, { parser: "", props: undefined, value: args[i], run: true }], end: node };
    }
    return null;
  }
  if (i === args.length) {
    const target = node.r && node.r.length ? resolvePath(tree.root, node.r) : null;
    if (node.x || tree.chainKey.has(node) || (target && tree.chainKey.has(target))) return { steps, end: node };
    if (!target) return null;
  }
  // Follow redirects (aliases like tp -> teleport) when there are args left.
  const source = node.r && node.r.length && i < args.length ? resolvePath(tree.root, node.r) : node;
  if (i >= args.length) return null;
  const value = args[i];
  for (const [name, child] of Object.entries(source.c ?? {})) {
    if (child.l) {
      if (value !== name) continue;
      const m = matchChildren(tree, child, args, i + 1, [...steps, { text: name }]);
      if (m) return m;
    } else {
      const def = parserDef(child.p ?? "");
      if (!def.test(value, child.o, ctx)) continue;
      const m = matchChildren(tree, child, args, i + 1, [...steps, { parser: child.p ?? "", props: child.o, value }]);
      if (m) return m;
    }
  }
  return null;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => (typeof a === "function" ? `[function ${a.name || "anonymous"}]` : JSON.stringify(a) ?? String(a)))
    .join(", ");
}

function apply(tree: BoundTree, entry: CommandEntry, m: Match): Chain | undefined {
  const ctx = getState().ctx;
  for (const step of m.steps) {
    if ("text" in step) entry.parts.push(step.text);
    else if (step.run) entry.parts.push(RUN_TARGET.serialize(step.value, undefined, ctx));
    else entry.parts.push(parserDef(step.parser).serialize(step.value, step.props, ctx));
  }
  const end = m.end;
  const redirectTarget = end.r && end.r.length ? resolvePath(tree.root, end.r) : null;
  entry.complete = !!end.x || (isRootRedirect(end) && m.steps.length > 0 && "run" in m.steps[m.steps.length - 1]!);
  const chainNode = redirectTarget && tree.chainKey.has(redirectTarget) ? redirectTarget : tree.chainKey.has(end) ? end : null;
  if (!chainNode) return undefined;
  const key = tree.chainKey.get(chainNode)!;
  const Cls = chainClasses.get(key) ?? Chain;
  return new Cls(tree, chainNode, entry);
}

/** Entry point for generated root commands. */
export function command(tree: BoundTree, literal: string, args: unknown[]): any {
  const node = tree.root.c?.[literal];
  if (!node) throw new Error(`Unknown command "${literal}".`);
  const m = matchChildren(tree, node, args, 0, []);
  if (!m) throw new Error(`No overload of "${literal}" matches arguments (${formatArgs(args)}).`);
  const entry = beginCommand(literal);
  return apply(tree, entry, m);
}

const chainClasses = new Map<string, typeof Chain>();

export function registerChain(key: string, cls: typeof Chain): void {
  chainClasses.set(key, cls);
}

/** Base class for generated chain builders (e.g. `Execute().As("@a").Run(...)`). */
export class Chain {
  constructor(
    protected readonly $tree: BoundTree,
    protected readonly $node: TreeNode,
    protected readonly $entry: CommandEntry,
  ) {}

  protected $c(literal: string, args: unknown[]): any {
    const child = this.$node.c?.[literal];
    if (!child) throw new Error(`Unknown subcommand "${literal}".`);
    const m = matchChildren(this.$tree, child, args, 0, [{ text: literal }]);
    if (!m) throw new Error(`No overload of "${this.$entry.parts.join(" ")} ${literal}" matches arguments (${formatArgs(args)}).`);
    return apply(this.$tree, this.$entry, m);
  }

  /** Command text built so far. */
  toString(): string {
    return this.$entry.parts.join(" ");
  }
}
