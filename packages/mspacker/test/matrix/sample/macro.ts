// @requires function with storage
import { $, macro, type Macro } from "#mc";

export function Show({ word, count, target }: Macro) {
  $.scoreboard.players.set(target, "mspacker", count);
  $.tellraw("@a", { text: macro`"${word}"`, color: "gold" });
  $(macro`say mspacker-macro-ok ${word} ${count}`);
}

/** @mcfunction */
export function Macros() {
  $.function(Show, { word: "hi", count: 5, target: "@a" });
  $.data.merge.storage("mspacker:macro", { word: "yo", count: 2, target: "@a" });
  $.function(Show).with.storage("mspacker:macro");
}
