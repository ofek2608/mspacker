// Number theory and small float helpers.
import { $, type Macro } from "#mc";
import {
  abs, add, div, floor, floorDiv, floorMod, intIn, length, max, min, mul, OBJECTIVE, score, sqrt, STORAGE, stored, sub,
  toFloat, toInt, when,
} from "./expr.js";
import { forLoop, onlyIf, returnInt, setFloat, setInt, setScore } from "./io.js";

/**
 * Greatest common divisor (Euclid).
 * @mcfunction
 */
export function Gcd({ a, b }: Macro) {
  onlyIf(intIn(b, { min: 0, max: 0 })).run.return.run.compute.default.integer(abs(a));
  $.data.modify.storage(STORAGE, "gcd").set.value({ a: b, b: 0 });
  setInt("gcd.b", floorMod(a, b));
  $.return.run.function(Gcd).with.storage(STORAGE, "gcd");
}

/**
 * Least common multiple.
 * @mcfunction
 */
export function Lcm({ a, b }: Macro) {
  $.execute.store.result.score("#gcd", OBJECTIVE).run.function(Gcd, { a: a, b: b });
  onlyIf(intIn(score("#gcd"), { min: 0, max: 0 })).run.return(0);
  returnInt(mul(div(abs(a), score("#gcd")), abs(b)));
}

/**
 * 1 if n is prime, else 0 (trial division up to √n).
 * @mcfunction
 */
export function IsPrime({ n }: Macro) {
  onlyIf(intIn(n, { max: 1 })).run.return(0);
  setInt("prime.ok", 1);
  forLoop("d", add(toInt(sqrt(toFloat(n))), 1), { n: n }, (a) => {
    onlyIf(intIn(floorMod(a.n, a.d), { min: 0, max: 0 })).run.data.modify.storage(STORAGE, "prime.ok").set.value(0);
  }, 2);
  returnInt(stored("prime.ok"));
}

/**
 * baseᵉˣᵖ mod m, by squaring (m up to 46340, so products fit in an int).
 * @mcfunction
 */
export function PowMod({ base, exp, mod }: Macro) {
  onlyIf(intIn(exp, { max: 0 })).run.return.run.compute.default.integer(floorMod(1, mod));
  $.data.modify.storage(STORAGE, "powmod.call").set.value({ base: base, mod: mod, exp: 0 });
  setInt("powmod.call.exp", floorDiv(exp, 2));
  $.execute.store.result.score("#half", OBJECTIVE).run.function(PowMod).with.storage(STORAGE, "powmod.call");
  setScore("#sq", floorMod(mul(score("#half"), score("#half")), mod));
  returnInt(floorMod(mul(score("#sq"), when(intIn(floorMod(exp, 2), { min: 1 }), floorMod(base, mod), 1)), mod));
}

/**
 * ⌊√n⌋, exact for every int.
 * @mcfunction
 */
export function IntSqrt({ n }: Macro) {
  setScore("#r", toInt(floor(sqrt(toFloat(n)))));
  // Floats can be off by one for big n. Squares can overflow, so compare r with n / r instead:
  // step down if r > n / r, up if r + 1 <= n / (r + 1).
  setScore("#r", when(intIn(sub(floorDiv(n, max(score("#r"), 1)), score("#r")), { max: -1 }), sub(score("#r"), 1), score("#r")));
  const next = add(score("#r"), 1);
  returnInt(when(intIn(sub(floorDiv(n, next), next), { min: 0 }), next, score("#r")));
}

/**
 * `demo:math out` = √(x² + y²).
 * @mcfunction
 */
export function Hypot({ x, y }: Macro) {
  setFloat("out", length(x, y));
}

/**
 * `demo:math out` = a + (b - a)·t.
 * @mcfunction
 */
export function Lerp({ a, b, t }: Macro) {
  setFloat("out", add(a, mul(sub(b, a), t)));
}

/**
 * `demo:math out` = x limited to lo..hi.
 * @mcfunction
 */
export function Clamp({ x, lo, hi }: Macro) {
  setFloat("out", max(lo, min(x, hi)));
}
