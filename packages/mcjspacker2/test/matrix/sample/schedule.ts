// @requires schedule function
import { Schedule } from "#mc";
import { Helper } from "./base.js";

/** @mcfunction */
export function Scheduled() {
  Schedule("function", Helper, "1s");
}
