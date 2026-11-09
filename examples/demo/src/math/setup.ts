import { $ } from "#mc";
import { OBJECTIVE } from "./expr.js";

/** @load */
export function MathSetup() {
  $.scoreboard.objectives.add(OBJECTIVE, "dummy");
}
