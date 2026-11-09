// @requires schedule function
import { $ } from "#mc";
import { Helper } from "./base.js";

/** @mcfunction */
export function Scheduled() {
  $.Schedule.Function(Helper, "1s");
}
