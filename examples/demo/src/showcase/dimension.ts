// The math showcase: its own dimension, rebuilt on every load. Visit it with
//   /function demo:api/showcase/visit
// Functions for players to run live in demo:api/, apart from everything under demo:generated/.
// A new dimension only appears when the server starts, so restart once after adding it.
import { $, named, resource } from "#mc";
import { STORAGE } from "../math/expr.js";
import { buildChance, tickChance } from "./chance.js";
import { buildCube, tickCube } from "./cube.js";
import { buildFib, tickFib } from "./fib.js";
import { buildPascal } from "./pascal.js";
import { buildPrimes } from "./primes.js";
import { buildAtan2, buildGraphs, buildSinCos, tickAtan2, tickSinCos } from "./trig.js";
import { DIMENSION, FLOOR, label, TAG } from "./ui.js";

/** An empty void world with the overworld's sky. */
resource("dimension", DIMENSION, {
  type: "minecraft:overworld",
  generator: { type: "minecraft:flat", settings: { layers: [], biome: "minecraft:the_void" } },
});

/** The floor reaches this far from spawn (the Pascal triangle goes to x = 45). */
const RADIUS = 48;

/**
 * Which build an entity belongs to. On server start, `@load` runs before the saved entities have
 * loaded (the game loads them a little after their chunks), so the reset can't remove them and they
 * show up next to the new ones. Every reset counts `#gen` up; entities remember the build they were
 * made in, and the tick removes any from an older one as soon as it loads.
 */
const GEN = "showcase_gen";

/**
 * Teleports you to the math showcase.
 * @mcfunction demo:api/showcase/visit
 */
export function Visit() {
  $.execute.in(DIMENSION).run.tp("@s", `0.5 ${FLOOR + 1} 0.5`);
  $.title("@s").title({ text: "Math showcase", color: "gold" });
  $.title("@s").subtitle({ text: "every station runs on /compute", color: "gray" });
}

/**
 * Resets the showcase on every load: keeps the area loaded, lays the floor, removes the old entities
 * and state, then builds the stations over the next ticks (entities can only be placed once the
 * chunks have loaded).
 * @load
 */
export function ShowcaseReset() {
  $.execute.in(DIMENSION).run.function(() => {
    $.forceload.add(`${-RADIUS - 8} ${-RADIUS - 8}`, `${RADIUS + 8} ${RADIUS + 8}`);
    // Everything in this dimension except players (distance=0.. keeps the selector to this dimension).
    $.kill("@e[type=!player,distance=0..]");
    $.fill(`${-RADIUS} ${FLOOR} ${-RADIUS}`, `${RADIUS} ${FLOOR} ${RADIUS}`, "minecraft:smooth_stone");
    $.setblock(`0 ${FLOOR} 0`, "minecraft:gold_block");
  });
  $.data.remove.storage(STORAGE, "showcase");
  $.scoreboard.objectives.add(GEN, "dummy");
  $.scoreboard.players.add("#gen", GEN, 1);
  $.schedule.function(BuildTrig, "2t");
  $.schedule.function(BuildNumbers, "3t");
  $.schedule.function(BuildRest, "4t");
}
// It runs on load; `named` also gives it a name players can run: /function demo:api/showcase/reset
named("demo:api/showcase/reset", ShowcaseReset);

// Split over three ticks so no single run gets close to the game's command limit.
function BuildTrig() {
  $.execute.in(DIMENSION).run.function(() => {
    label(0.5, FLOOR + 3, 0.5, "Math showcase");
    buildSinCos();
    buildAtan2();
    buildGraphs();
  });
}

function BuildNumbers() {
  $.execute.in(DIMENSION).run.function(() => {
    buildPrimes();
    buildPascal();
  });
}

function BuildRest() {
  $.execute.in(DIMENSION).run.function(() => {
    buildFib();
    buildCube();
    buildChance();
    $.data.modify.storage(STORAGE, "showcase.ready").set.value(1);
  });
}

/**
 * Animates the stations while someone is there.
 * @tick
 */
export function ShowcaseTick() {
  $.execute.in(DIMENSION).run.function(() => {
    // New entities join the current build; ones from an older build are removed.
    $.execute.as(`@e[tag=${TAG},distance=0..]`).unless.score("@s", GEN).matches("..2147483647")
      .run.scoreboard.players.operation("@s", GEN, "=", "#gen", GEN);
    $.execute.as(`@e[tag=${TAG},distance=0..]`).unless.score("@s", GEN)["="]("#gen", GEN).run.kill("@s");
  });
  $.execute.in(DIMENSION).positioned(`0.5 ${FLOOR + 1} 0.5`).if.entity(`@a[distance=..${RADIUS * 2}]`)
    .if.data.storage(STORAGE, "showcase.ready").run.function(() => {
      tickSinCos();
      tickAtan2();
      tickFib();
      tickCube();
      tickChance();
    });
}
