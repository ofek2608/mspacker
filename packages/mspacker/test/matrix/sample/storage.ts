// @requires data merge storage
import { $ } from "#mc";

/** @mcfunction */
export function Storage() {
  $.data.merge.storage("mspacker:test", { value: 1, list: [1, 2, 3], name: "x" });
}
