/**
 * Runtime imported by user code (through the generated `#mc` library).
 *
 * Lowercase helpers avoid clashing with generated PascalCase commands (`Tag` is the `/tag` command,
 * `tag` registers a datapack tag).
 */
import { addResource, addTag, devFlag, fnId as functionId } from "./state.js";
import type { FnRef } from "./types.js";

export * from "./types.js";
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

/**
 * The in-game name of a function (`mypack:main/helper`), making sure it's written to the pack.
 * `$.function(fn)` uses it too. Strings (ids, `#tags`) are returned as-is.
 */
export function fnId(fn: FnRef): string {
  return functionId(fn);
}
