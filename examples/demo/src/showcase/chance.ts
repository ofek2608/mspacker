// Chance: flip 20 coins again and again; the histogram of heads grows into the binomial bell curve.
import { $, macro, type Macro } from "#mc";
import { add, div, intIn, mul, STORAGE, stored, toFloat } from "../math/expr.js";
import { CoinFlips, RollDice } from "../math/combinatorics.js";
import { onlyIf, setInt } from "../math/io.js";
import { animate, bar, button, FLOOR, label, setEntityFloat, setText, textDisplay, whenClicked } from "./ui.js";

const at = stored;
const COINS = 20;
// Bars along z = -22.5 from x = -9.5 to 10.5, at most ~5 tall (y 66 to 71). Buttons 4 blocks in
// front of them; title and count above the tallest bar.
const CH = { x: 0.5, z: -22.5 };
const HEIGHT = 25;

export function buildChance() {
  label(CH.x, FLOOR + 8.4, CH.z, `heads in ${COINS} coin flips`);
  // Seen from spawn (looking -z), +x is on the right: bar k at x + k - 10.
  for (let k = 0; k <= COINS; k++) bar(`coin_${k}`, CH.x + k - COINS / 2, FLOOR + 1, CH.z, "minecraft:light_blue_concrete", 0.7, 0);
  $.data.modify.storage(STORAGE, "showcase.coins").set.value({ auto: 0, total: 0, counts: Array.from({ length: COINS + 1 }, () => 0) });
  button("coin_toggle", CH.x - 3, FLOOR + 1, CH.z + 4, "start / stop flipping");
  button("dice_roll", CH.x + 3, FLOOR + 1, CH.z + 4, "roll 2 dice");
  textDisplay("coin_text", CH.x, FLOOR + 7.4, CH.z);
  textDisplay("dice_text", CH.x + 3, FLOOR + 2.9, CH.z + 4, "?");
  setText("coin_text", "flips: 0");
}

/** Count one result k: bump counts[k] and grow bar k. */
function Count(args: Macro<{ k: number }>) {
  const path = macro`showcase.coins.counts[${args.k}]`;
  $.data.modify.storage(STORAGE, path).set.compute.default.integer(add(at(path), 1));
}

export function tickChance() {
  whenClicked("coin_toggle", () => {
    $.data.modify.storage(STORAGE, "showcase.coins.auto").set.compute.default.integer({ type: "minecraft:sub", left: 1, right: at("showcase.coins.auto") });
  });
  whenClicked("dice_roll", () => {
    $.execute.store.result.storage(STORAGE, "showcase.dice").int(1).run.function(RollDice, { count: 2, sides: 6 });
    setText("dice_text", "rolled ", { path: "showcase.dice" });
  });
  // While on: 4 rounds of 20 flips per tick, up to 4000 rounds.
  onlyIf(intIn(at("showcase.coins.auto"), { min: 1 })).run.function(() => {
    for (let i = 0; i < 4; i++) {
      $.execute.store.result.storage(STORAGE, "showcase.coin.k").int(1).run.function(CoinFlips, { n: COINS });
      $.function(Count).with.storage(STORAGE, "showcase.coin");
    }
    setInt("showcase.coins.total", add(at("showcase.coins.total"), 4));
    // Bar height: the share of results, so the shape keeps its size as it fills in (the tallest,
    // 10 heads, is about 18%: 4.4 blocks).
    for (let k = 0; k <= COINS; k++) {
      setEntityFloat(`coin_${k}`, "transformation.scale[1]", div(mul(HEIGHT, toFloat(at(`showcase.coins.counts[${k}]`))), toFloat(at("showcase.coins.total"))));
      animate(`coin_${k}`);
    }
    onlyIf(intIn(at("showcase.coins.total"), { min: 4000 })).run.data.modify.storage(STORAGE, "showcase.coins.auto").set.value(0);
    setText("coin_text", "flips: ", { path: "showcase.coins.total" });
  });
}
