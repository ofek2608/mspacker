// Fibonacci: a sunflower (golden-angle spiral) and a button comparing the three fib functions.
import { $ } from "#mc";
import { add, floorMod, intIn, mul, sqrt, STORAGE, stored, toFloat } from "../math/expr.js";
import { Fib, FibBinet, FibRec } from "../math/fib.js";
import { forLoop, onlyIf, setInt } from "../math/io.js";
import { cos, sin } from "../math/trig.js";
import { argb, button, COLOR, Dot, label, setText, store, textDisplay, whenClicked } from "./ui.js";

const at = stored;
// The sunflower stands in a vertical plane facing spawn (normal (1, 0, -1)), centered at
// (-14.5, 70.5, 14.5), radius 4: y from 66.5 to 74.5. Text and button sit 5 blocks closer to spawn.
const FB = { x: -14.5, y: 70.5, z: 14.5, scale: 0.32 };
/** In-plane horizontal direction (perpendicular to the way to spawn). */
const U = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
const PANEL = { x: -9.5, z: 9.5 };
/** The golden angle, 2π(1 - 1/φ): each seed turns this much from the last. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const SEEDS = 160;

export function buildFib() {
  label(FB.x, FB.y + FB.scale * Math.sqrt(SEEDS) + 1, FB.z, "Fibonacci: golden-angle sunflower");
  // Seed i sits at radius √i and angle i·golden. The spirals you see come in Fibonacci counts.
  forLoop("i", SEEDS, {}, (a) => {
    store("fib.r", mul(FB.scale, sqrt(toFloat(a.i))));
    store("fib.a", mul(toFloat(a.i), GOLDEN));
    cos(at("fib.a"), "fib.cos");
    sin(at("fib.a"), "fib.sin");
    $.data.modify.storage(STORAGE, "ui.dot").set.value({ tag: "fib_seed", color: argb(COLOR.yellow) });
    onlyIf(intIn(floorMod(a.i, 8), { max: 0 })).run.data.modify.storage(STORAGE, "ui.dot.color").set.value(argb(COLOR.orange));
    onlyIf(intIn(floorMod(a.i, 13), { max: 0 })).run.data.modify.storage(STORAGE, "ui.dot.color").set.value(argb(COLOR.brown));
    const across = mul(at("fib.r"), at("fib.cos"));
    store("ui.dot.x", add(FB.x, mul(U.x, across)));
    store("ui.dot.y", add(FB.y, mul(at("fib.r"), at("fib.sin"))));
    store("ui.dot.z", add(FB.z, mul(U.z, across)));
    $.function(Dot).with.storage(STORAGE, "ui.dot");
  });
  textDisplay("fib_text", PANEL.x, 67.6, PANEL.z);
  button("fib_next", PANEL.x, 65, PANEL.z, "next n");
  setInt("showcase.fib.n", 0);
  showFib();
}

/** Compute fib(n) three ways and show them. */
function showFib() {
  const call = (fn: Function, key: string) =>
    $.execute.store.result.storage(STORAGE, `showcase.fib.${key}`).int(1).run.function(fn as () => void).with.storage(STORAGE, "showcase.fib");
  call(Fib, "loop");
  call(FibBinet, "binet");
  // The recursive one does ~fib(n) calls: 18 is its limit, 17 keeps a click quick.
  $.data.modify.storage(STORAGE, "showcase.fib.rec").set.value("too slow");
  onlyIf(intIn(at("showcase.fib.n"), { max: 17 })).run.function(() => call(FibRec, "rec"));
  setText("fib_text", "fib(", { path: "showcase.fib.n" }, ")\\nloop: ", { path: "showcase.fib.loop" }, "\\nφⁿ/√5: ",
    { path: "showcase.fib.binet" }, "\\nrecursive: ", { path: "showcase.fib.rec" });
}

export function tickFib() {
  whenClicked("fib_next", () => {
    // n = 0, 1, ..., 46, then back to 0 (fib(47) doesn't fit in an int).
    setInt("showcase.fib.n", floorMod(add(at("showcase.fib.n"), 1), 47));
    showFib();
  });
}
