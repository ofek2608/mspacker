// Base sample for the version matrix: only commands that exist since 1.13 (the first data pack version).
// Newer features live in sibling files marked `// @requires <command path>`.
import { $, fnId, tag } from "#mc";

/** @load */
export function Init() {
  $.scoreboard.objectives.add("mcjs2", "dummy");
  $.say("mcjs2-load-ok");
}

/** @tick */
export function Tick() {
  $.execute.as("@a").if.score("@s", "mcjs2").matches("10..").run.give("@s", "diamond", 1);
}

/** @mcfunction */
export function Commands() {
  $.tellraw("@a", { text: "hi", color: "gold", bold: true, extra: [{ text: " there" }] });
  $.tellraw("@a", "plain string");
  $.title("@a").title({ text: "Title" });
  $.tp("@a", "0 ~10 0");
  $.tp("@a")("^ ^ ^1");
  $.setblock("0 64 0", "stone");
  $.effect.give("@a", "speed", 10, 1, true);
  $.summon("pig", "0 70 0", { NoAI: true, CustomName: '"pig"' });
  $.scoreboard.players.set("#x", "mcjs2", 5);
  $.scoreboard.players.operation("#x", "mcjs2", "+=", "#x", "mcjs2");
  $.execute.store.result.score("#y", "mcjs2").run.scoreboard.players.get("#x", "mcjs2");
  $.execute.if.score("#x", "mcjs2")[">"]("#y", "mcjs2").run.say("gt");
  $.execute.at("@p").run(() => {
    $.say("multi 1");
    $.say("multi 2");
  });
  const atAll = $.execute.as("@a").at("@s");
  atAll.run.say("prefix 1");
  atAll.run.say("prefix 2");
  $.function(Helper);
  $("say raw");
  $(`function ${fnId(Helper)}`);
  $`function ${Helper}`;
  $.say("mcjs2-commands-ok");
}

export function Helper() {
  $.say("helper");
}

/** @mcfunction custom/renamed */
export function Renamed() {
  for (let i = 0; i < 3; i++) $.say(`loop ${i}`);
}

tag("function", "matrix:all", [Commands, Renamed]);
