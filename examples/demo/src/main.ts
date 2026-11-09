import { Say, Tellraw, Execute, Function, Scoreboard, Tp, Give, Setblock, Effect, Swing, raw, cmd, tag } from "#mc";
import { StartRound } from "./combat/arena.js";

/** @load */
export function Init() {
  Scoreboard("objectives", "add", "kills", "playerKillCount");
  Say("Demo pack loaded!");
}

/** @tick */
export function Tick() {
  Execute().As("@a").If("score", "@s", "kills", "matches", "10..").Run(() => Give("@s", "diamond", 1));
}

/** @mcfunction */
export function Greet() {
  Tellraw("@a", { text: "Hello from TypeScript!", color: "gold", bold: true });
  Tp("@a", ["~", "~10", "~"]);
  Setblock([0, 64, 0], "stone");
  Function(StartRound);
  Function(Helper);
  // Multi-command callbacks become their own anonymous function.
  Execute().At("@p").Run(() => {
    Say("one");
    Say("two");
  });
  Effect("give", "@a", "speed", 10, 1, true);
  Swing("@s", "mainhand"); // 26.4 added optional animation/duration args
  raw("say raw line");
  cmd`function ${Helper}`;
}

// Not tagged: emitted only because Greet references it.
function Helper() {
  Say("helper");
}

/** @mcfunction custom/renamed */
export function WeirdName() {
  Say("I live at demo:generated/custom/renamed");
}

// Build-time JS: loops unroll into commands.
/** @mcfunction */
export function Countdown() {
  for (let i = 3; i > 0; i--) Say(`${i}...`);
}

tag("function", "demo:all", [Greet, Countdown, "demo:handwritten"]);
