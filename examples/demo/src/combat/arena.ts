import { Say, Title } from "#mc";

/** @mcfunction */
export function StartRound() {
  Title("@a", "title", { text: "Fight!", color: "red" });
  Say("round started");
}
