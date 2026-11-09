// @requires schedule function
import { $ } from "#mc";
import { Helper } from "./base.js";

/** @mcfunction */
export function Scheduled() {
  $.schedule.function(Helper, "1s");
}
