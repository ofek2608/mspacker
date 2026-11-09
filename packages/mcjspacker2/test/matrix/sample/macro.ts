// @requires function with storage
import { $, macro, type Macro, type Selector } from "#mc";

export function Show(args: Macro<{ word: string; count: number; target: Selector }>) {
  $.scoreboard.players.set(args.target, "mcjs2", args.count);
  $.tellraw("@a", { text: args.word.quoted, color: "gold" });
  $(macro`say mcjs2-macro-ok ${args.word} ${args.count}`);
}

/** @mcfunction */
export function Macros() {
  $.function(Show, { word: "hi", count: 5, target: "@a" });
  $.data.merge.storage("mcjs2:macro", { word: "yo", count: 2, target: "@a" });
  $.function(Show).with.storage("mcjs2:macro");
}
