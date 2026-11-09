import { $ } from "#mc";

/** @mcfunction */
export function StartRound() {
  $.Title("@a").Title({ text: "Fight!", color: "red" });
  $.Say("round started");
}
