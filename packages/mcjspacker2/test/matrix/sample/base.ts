// Base sample for the version matrix: only commands that exist since 1.13 (the first data pack version).
// Newer features live in sibling files marked `// @requires <command path>`.
import { Effect, Execute, Function, Give, Say, Scoreboard, Setblock, Summon, Tellraw, Title, Tp, cmd, raw, tag } from "#mc";

/** @load */
export function Init() {
  Scoreboard("objectives", "add", "mcjs2", "dummy");
  Say("mcjs2-load-ok");
}

/** @tick */
export function Tick() {
  Execute().As("@a").If("score", "@s", "mcjs2", "matches", "10..").Run(() => Give("@s", "diamond", 1));
}

/** @mcfunction */
export function Commands() {
  Tellraw("@a", { text: "hi", color: "gold", bold: true, extra: [{ text: " there" }] });
  Tellraw("@a", "plain string");
  Title("@a", "title", { text: "Title" });
  Tp("@a", [0, "~10", 0]);
  Tp("@a", ["^", "^", "^1"]);
  Setblock([0, 64, 0], "stone");
  Effect("give", "@a", "speed", 10, 1, true);
  Summon("pig", [0, 70, 0], { NoAI: true, CustomName: '"pig"' });
  Scoreboard("players", "set", "#x", "mcjs2", 5);
  Scoreboard("players", "operation", "#x", "mcjs2", "+=", "#x", "mcjs2");
  Execute().Store("result", "score", "#y", "mcjs2").Run(() => Scoreboard("players", "get", "#x", "mcjs2"));
  Execute().At("@p").Run(() => {
    Say("multi 1");
    Say("multi 2");
  });
  Function(Helper);
  raw("say raw");
  cmd`function ${Helper}`;
  Say("mcjs2-commands-ok");
}

export function Helper() {
  Say("helper");
}

/** @mcfunction custom/renamed */
export function Renamed() {
  for (let i = 0; i < 3; i++) Say(`loop ${i}`);
}

tag("function", "matrix:all", [Commands, Renamed]);
