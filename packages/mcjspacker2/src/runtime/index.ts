/**
 * Runtime imported by user code (through the generated `#mc` library).
 *
 * Lowercase helpers avoid clashing with generated PascalCase commands (`Tag` is the `/tag` command,
 * `tag` registers a datapack tag).
 */
import { addResource, addTag, devFlag, fnId as functionId, packInfo } from "./state.js";
import type { FnRef } from "./types.js";
import { hasMacroArg, isMacroArg, macro, MacroError, type MacroArg } from "./macro.js";

/** Tags and resources are files, read without arguments: macro arguments can't go there. */
function noMacros(value: unknown, what: string): void {
  if (hasMacroArg(value)) throw new MacroError(`Macro arguments only work in commands, not in ${what}.`);
}

export * from "./types.js";
export { macro, type Macro, type MacroArg, type MacroValue } from "./macro.js";
export { nbt, snbt } from "./nbt.js";
export { createRoot, literalName, type TreeNode } from "./command.js";

/**
 * `true` while building with `mcjs2 dev`, `false` for `mcjs2 build`. Use it for debug output:
 *
 *     if (__DEV__) $.say("debug: round started");
 */
export let __DEV__: boolean = devFlag().value;
devFlag().listeners.add((value) => {
  __DEV__ = value;
});

/** Your pack's namespace, e.g. `mypack` (from `namespace` in mcjs2.config.ts). */
export let __NAMESPACE__: string = packInfo().value.namespace;
/**
 * Where your function names start: `mypack:`, or `mypack:generated/` when the namespace in
 * mcjs2.config.ts has a folder (`mypack:generated/`).
 */
export let __FUNCTION_PREFIX__: string = packInfo().value.functionPrefix;
packInfo().listeners.add((info) => {
  __NAMESPACE__ = info.namespace;
  __FUNCTION_PREFIX__ = info.functionPrefix;
});

/**
 * An id in your namespace: `id("rewards/daily")` is `mypack:rewards/daily`. Also takes macro
 * arguments: `` id(macro`rewards/${args.kind}`) `` is `mypack:rewards/$(kind)`.
 */
export function id(path: string): string;
export function id(path: MacroArg<any>): MacroArg<any>;
export function id(path: string | MacroArg<any>): string | MacroArg<any> {
  const ns = packInfo().value.namespace;
  return isMacroArg(path) ? macro`${ns}:${path}` : `${ns}:${path}`;
}

/**
 * Add entries to a datapack tag, e.g. `tag("function", "minecraft:load", [Init])`.
 * `registry` is the folder under `tags/` (function, block, item, entity_type, ...).
 */
export function tag(registry: string, id: string, values: (FnRef | string)[], options?: { replace?: boolean }): void {
  noMacros(values, `tag "${id}"`);
  addTag(registry, id, values as (string | Function)[], options?.replace);
}

/** Add a JSON resource, e.g. `resource("advancement", "mypack:root", {...})`. */
export function resource(registry: string, id: string, data: unknown): void {
  noMacros(data, `${registry} "${id}"`);
  addResource(registry, id, data);
}

/**
 * The in-game name of a function (`mypack:main/helper`), making sure it's written to the pack.
 * `$.function(fn)` uses it too. Strings (ids, `#tags`) are returned as-is.
 */
export function fnId(fn: FnRef): string {
  return functionId(fn);
}
