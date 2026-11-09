// @requires data merge storage
import { Data } from "#mc";

/** @mcfunction */
export function Storage() {
  Data("merge", "storage", "mcjs2:test", { value: 1, list: [1, 2, 3], name: "x" });
}
