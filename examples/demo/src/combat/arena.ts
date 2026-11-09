import { $ } from "#mc";

/** @mcfunction */
export function StartRound() {
  $.title("@a").title({ text: "Fight!", color: "red" });
  $.say("round started");
}
