import { $, type Macro, type Selector } from "#mc";

// A function with a parameter is a macro function: the game fills in `args` when it's called.
export function Gift(args: Macro<{ player: Selector; item: string; count: number; from: string }>) {
  $.give(args.player, args.item, args.count);
  $.tellraw(args.player, [{ text: args.from.quoted, color: "gold" }, { text: " sent you a gift!" }]);
}

// Anything that doesn't fit one argument can be written as text.
/** @mcfunction */
export function Warp(args: Macro<{ destination: string }>) {
  $(`tp @s ${args.destination}`);
}

/** @mcfunction */
export function Rewards() {
  // Values given right away...
  $.function(Gift, { player: "@a", item: "diamond", count: 3, from: "The server" });
  // ...or taken from storage.
  $.data.merge.storage("demo:gifts", { daily: { player: "@a", item: "emerald", count: 1, from: "Daily reward" } });
  $.function(Gift).with.storage("demo:gifts", "daily");

  $.execute.as("@a").run.function(Warp, { destination: "0 100 0" });
}
