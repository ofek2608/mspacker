// @requires function with storage
import { $, macro, type Macro } from "#mc";

export function Show({ word, count, target }: Macro) {
  $.scoreboard.players.set(target, "mcjs2", count);
  $.tellraw("@a", { text: macro`"${word}"`, color: "gold" });
  $(macro`say mcjs2-macro-ok ${word} ${count}`);
}

/** @mcfunction */
export function Macros() {
  $.function(Show, { word: "hi", count: 5, target: "@a" });
  $.data.merge.storage("mcjs2:macro", { word: "yo", count: 2, target: "@a" });
  $.function(Show).with.storage("mcjs2:macro");
}
