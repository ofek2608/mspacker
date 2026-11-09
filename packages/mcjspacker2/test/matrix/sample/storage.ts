// @requires data merge storage
import { $ } from "#mc";

/** @mcfunction */
export function Storage() {
  $.Data.Merge.Storage("mcjs2:test", { value: 1, list: [1, 2, 3], name: "x" });
}
