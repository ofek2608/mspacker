/**
 * Instruments user source so the runtime knows each function's file, name and JSDoc tags:
 *   function declarations   -> `;__mcjs_m(Name, {...});` appended after the declaration
 *   function/arrow exprs    -> wrapped as `__mcjs_w(<expr>, {...})`
 *
 * JSDoc tags:
 *   @mcfunction            entry point (emitted even if never referenced)
 *   @mcfunction <id>       entry point with explicit id ("ns:path" or path relative to the namespace prefix)
 *   @load / @tick          add to #minecraft:load / #minecraft:tick (implies entry point)
 *   @dev                   entry point that only exists in dev builds (combine with the tags above)
 */
import { parse } from "@babel/parser";
import type { FnMeta } from "../runtime/state.js";

interface AnyNode {
  type: string;
  start: number;
  end: number;
  loc?: { start: { line: number } };
  leadingComments?: { type: string; value: string }[];
  [key: string]: unknown;
}

export const HEADER =
  'const __mcjs_m = globalThis[Symbol.for("mcjspacker2.meta")], __mcjs_w = (f, m) => (__mcjs_m(f, m), f); ';

type Tags = Pick<FnMeta, "mcfunction" | "load" | "tick" | "dev">;

function jsdocTags(...nodes: (AnyNode | undefined)[]): Tags {
  for (const node of nodes) {
    const comments = node?.leadingComments;
    if (!comments?.length) continue;
    const doc = [...comments].reverse().find((c) => c.type === "CommentBlock" && c.value.startsWith("*"));
    if (!doc) continue;
    const out: Tags = {};
    // The id can't start with "@", so `@mcfunction @dev` is two tags.
    const m = /@mcfunction\b(?:[ \t]+([^\s*@][^\s*]*))?/.exec(doc.value);
    if (m) out.mcfunction = m[1] ?? true;
    if (/@load\b/.test(doc.value)) out.load = true;
    if (/@tick\b/.test(doc.value)) out.tick = true;
    if (/@dev\b/.test(doc.value)) out.dev = true;
    return out;
  }
  return {};
}

function isNode(v: unknown): v is AnyNode {
  return typeof v === "object" && v !== null && typeof (v as AnyNode).type === "string";
}

export function instrument(code: string, relFile: string, opts: { typescript: boolean }): string {
  const ast = parse(code, {
    sourceType: "module",
    plugins: opts.typescript ? ["typescript"] : [],
    errorRecovery: false,
  }) as unknown as { program: AnyNode };

  // group: 0 = closer, 1 = declaration meta, 2 = opener. Applied so that at one position
  // inner closers come before outer closers, and outer openers before inner openers.
  const inserts: { pos: number; text: string; group: number; span: number }[] = [];
  const meta = (node: AnyNode, name: string | undefined, tags: object) =>
    JSON.stringify({ file: relFile, ...(name ? { name } : {}), line: node.loc?.start.line, ...tags });

  const STATEMENT_LISTS = new Set(["Program", "BlockStatement", "TSModuleBlock", "StaticBlock"]);
  const ancestors: AnyNode[] = [];
  const up = (n: number) => ancestors[ancestors.length - n];

  const visit = (node: AnyNode) => {
    const parent = up(1);
    if (node.type === "FunctionDeclaration" && node.body && !node.declare) {
      const id = node.id as AnyNode | null;
      const isExport = parent?.type === "ExportNamedDeclaration" || parent?.type === "ExportDefaultDeclaration";
      const stmt = isExport ? parent! : node;
      const list = isExport ? up(2) : parent;
      if (id && list && STATEMENT_LISTS.has(list.type)) {
        // Only functions at the top of a file get a name. One declared inside another function is
        // created anew on each call, so naming it would give every copy the same name.
        const name = list.type === "Program" ? (id.name as string) : undefined;
        const tags = jsdocTags(node, isExport ? parent : undefined);
        inserts.push({ pos: stmt.end, text: `;__mcjs_m(${id.name as string}, ${meta(node, name, tags)});`, group: 1, span: 0 });
      }
    } else if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") {
      let name: string | undefined;
      let tags: object;
      if (parent?.type === "VariableDeclarator" && parent.init === node) {
        const declId = parent.id as AnyNode;
        const decl = up(2);
        const exp = up(3)?.type === "ExportNamedDeclaration" ? up(3) : undefined;
        // Named after the variable only at the top of a file (see function declarations above).
        const topLevel = (exp ? up(4) : up(3))?.type === "Program";
        if (topLevel) name = ((node.id as AnyNode | null)?.name as string | undefined) ?? (declId.type === "Identifier" ? (declId.name as string) : undefined);
        tags = jsdocTags(decl, exp, node);
      } else {
        tags = jsdocTags(node);
      }
      const span = node.end - node.start;
      inserts.push({ pos: node.start, text: "__mcjs_w(", group: 2, span });
      inserts.push({ pos: node.end, text: `, ${meta(node, name, tags)})`, group: 0, span });
    }

    ancestors.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "leadingComments" || key === "trailingComments" || key === "innerComments" || key === "loc") continue;
      if (Array.isArray(value)) {
        for (const child of value) if (isNode(child)) visit(child);
      } else if (isNode(value)) {
        visit(value);
      }
    }
    ancestors.pop();
  };
  visit(ast.program);

  const byPos = new Map<number, typeof inserts>();
  for (const ins of inserts) {
    const list = byPos.get(ins.pos) ?? [];
    list.push(ins);
    byPos.set(ins.pos, list);
  }
  let out = code;
  for (const pos of [...byPos.keys()].sort((a, b) => b - a)) {
    const text = byPos
      .get(pos)!
      .sort((a, b) => a.group - b.group || (a.group === 0 ? a.span - b.span : b.span - a.span))
      .map((i) => i.text)
      .join("");
    out = out.slice(0, pos) + text + out.slice(pos);
  }
  return HEADER + out;
}
