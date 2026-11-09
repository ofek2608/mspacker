import { $, __DEV__, fnId, named, tag } from "#mc";
import { StartRound } from "./combat/arena.js";

/** @load */
export function Init() {
  $.scoreboard.objectives.add.kills.playerKillCount;
  $.say("Demo pack loaded!");
  if (__DEV__) $.say("[dev] debug output is on");
}

/** @tick */
export function Tick() {
  $.execute.as("@a").if.score("@s", "kills").matches("10..").run.give("@s", "diamond", 1);
}

/** @mcfunction demo:api/greet */
export function Greet() {
  $.tellraw("@a", { text: "Hello from TypeScript!", color: "gold", bold: true });
  $.tp("@a", "~ ~10 ~");
  $.setblock("0 64 0", "stone");
  $.function(StartRound);
  $.function(Helper);
  // Multi-command callbacks become their own anonymous function.
  $.execute.at("@p").run.function(() => {
    $.say("one");
    $.say("two");
  });
  $.effect.give("@a", "speed", 10, 1, true);
  $.swing("@s").mainhand; // 26.4 added optional animation/duration args
  $("say raw line");
  $(`function ${fnId(Helper)}`);
}

// Not tagged: emitted only because Greet references it.
function Helper() {
  $.say("helper");
}

/** @mcfunction custom/renamed */
export function WeirdName() {
  $.say("I live at demo:generated/custom/renamed");
}

// One function per kit, each with a name players can run: /function demo:api/kit/archer
const KITS = { warrior: ["iron_sword", "shield"], archer: ["bow", "arrow"] } as const;
for (const [kit, items] of Object.entries(KITS)) {
  named(`demo:api/kit/${kit}`, () => {
    for (const item of items) $.give("@s", item);
  });
}

// Build-time JS: loops unroll into commands.
/** @mcfunction */
export function Countdown() {
  for (let i = 3; i > 0; i--) $.say(`${i}...`);
}

tag("function", "demo:all", [Greet, Countdown, "demo:handwritten"]);

// Only in `mspacker dev` builds: /function demo:generated/main/debug_scores
/** @dev @mcfunction */
export function DebugScores() {
  $.tellraw("@a", { text: "kills:", color: "gray" });
  $.execute.as("@a").run.tellraw("@a", [{ selector: "@s" }, { text: " " }, { score: { name: "@s", objective: "kills" } }]);
}
