/**
 * Runtime imported by user code (through the generated `#mc` library).
 *
 * Lowercase helpers avoid clashing with generated PascalCase commands (`Tag` is the `/tag` command,
 * `tag` registers a datapack tag).
 */
import { addResource, addTag, emitLine, functionRef } from "./state.js";
import type { FnRef } from "./types.js";

export * from "./types.js";
export { nbt, snbt } from "./nbt.js";
export { Chain, bindTree, command, registerChain, type BoundTree, type TreeNode } from "./command.js";

/** Emit a raw command line into the current function. */
export function raw(line: string): void {
  emitLine(line);
}

/** Template-tag form of `raw`: cmd`say ${name}`. Functions interpolate as their ids. */
export function cmd(strings: TemplateStringsArray, ...values: unknown[]): void {
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    out += (typeof v === "function" ? functionRef(v) : String(v)) + (strings[i + 1] ?? "");
  });
  emitLine(out);
}

/**
 * Add entries to a datapack tag, e.g. `tag("function", "minecraft:load", [Init])`.
 * `registry` is the folder under `tags/` (function, block, item, entity_type, ...).
 */
export function tag(registry: string, id: string, values: (FnRef | string)[], options?: { replace?: boolean }): void {
  addTag(registry, id, values as (string | Function)[], options?.replace);
}

/** Add a JSON resource, e.g. `resource("advancement", "mypack:root", {...})`. */
export function resource(registry: string, id: string, data: unknown): void {
  addResource(registry, id, data);
}

/** Get the id of a function (recording it if needed). */
export function fnId(fn: FnRef): string {
  return functionRef(fn);
}
