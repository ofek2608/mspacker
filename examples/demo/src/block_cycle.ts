// A block that turns into every block in the game, one after another (every half second).
import { $, macro, registries, type Macro } from "#mc";

const POS = "0 65 0";
const EVERY_TICKS = 10;
const STORE = "demo:block_cycle";

// Blocks that can't (or shouldn't) be placed with /setblock.
const SKIP = new Set(["air", "cave_air", "void_air", "moving_piston", "piston_head"]);
// Build time: the generated list of every block id, filtered.
const BLOCKS = registries.block.filter((b) => !SKIP.has(b));

/** @load */
export function SetupBlockCycle() {
  $.scoreboard.objectives.add("block_cycle", "dummy");
  $.data.modify.storage(STORE, "blocks").set.value(BLOCKS.map((b) => `minecraft:${b}`));
}

/** @tick */
export function TickBlockCycle() {
  $.scoreboard.players.add("#t", "block_cycle", 1);
  $.execute.if.score("#t", "block_cycle").matches(`${EVERY_TICKS}..`).run.function(() => {
    $.scoreboard.players.set("#t", "block_cycle", 0);
    // Pass the current index to Pick as a macro argument.
    $.execute.store.result.storage(STORE, "pick.i").int(1).run.scoreboard.players.get("#i", "block_cycle");
    $.function(Pick).with.storage(STORE, "pick");
    $.scoreboard.players.add("#i", "block_cycle", 1);
    $.execute.if.score("#i", "block_cycle").matches(`${BLOCKS.length}..`).run.scoreboard.players.set("#i", "block_cycle", 0);
  });
}

/** Look up blocks[i] and place it. */
function Pick({ i }: Macro) {
  $.data.modify.storage(STORE, "place.block").set.from.storage(STORE, macro`blocks[${i}]`);
  $.function(Place).with.storage(STORE, "place");
}

function Place({ block }: Macro) {
  // strict: no block updates, so torches, doors, etc. don't pop off.
  $.setblock(POS, block).strict;
}
