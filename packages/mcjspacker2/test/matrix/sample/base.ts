// Base sample for the version matrix: only commands that exist since 1.13 (the first data pack version).
// Newer features live in sibling files marked `// @requires <command path>`.
import { $, fnId, tag } from "#mc";

/** @load */
export function Init() {
  $.Scoreboard.Objectives.Add("mcjs2", "dummy");
  $.Say("mcjs2-load-ok");
}

/** @tick */
export function Tick() {
  $.Execute.As("@a").If.Score("@s", "mcjs2").Matches("10..").Run.Give("@s", "diamond", 1);
}

/** @mcfunction */
export function Commands() {
  $.Tellraw("@a", { text: "hi", color: "gold", bold: true, extra: [{ text: " there" }] });
  $.Tellraw("@a", "plain string");
  $.Title("@a").Title({ text: "Title" });
  $.Tp("@a", "0 ~10 0");
  $.Tp("@a")("^ ^ ^1");
  $.Setblock("0 64 0", "stone");
  $.Effect.Give("@a", "speed", 10, 1, true);
  $.Summon("pig", "0 70 0", { NoAI: true, CustomName: '"pig"' });
  $.Scoreboard.Players.Set("#x", "mcjs2", 5);
  $.Scoreboard.Players.Operation("#x", "mcjs2", "+=", "#x", "mcjs2");
  $.Execute.Store.Result.Score("#y", "mcjs2").Run.Scoreboard.Players.Get("#x", "mcjs2");
  $.Execute.If.Score("#x", "mcjs2")[">"]("#y", "mcjs2").Run.Say("gt");
  $.Execute.At("@p").Run(() => {
    $.Say("multi 1");
    $.Say("multi 2");
  });
  const atAll = $.Execute.As("@a").At("@s");
  atAll.Run.Say("prefix 1");
  atAll.Run.Say("prefix 2");
  $.Function(Helper);
  $("say raw");
  $(`function ${fnId(Helper)}`);
  $`function ${Helper}`;
  $.Say("mcjs2-commands-ok");
}

export function Helper() {
  $.Say("helper");
}

/** @mcfunction custom/renamed */
export function Renamed() {
  for (let i = 0; i < 3; i++) $.Say(`loop ${i}`);
}

tag("function", "matrix:all", [Commands, Renamed]);
