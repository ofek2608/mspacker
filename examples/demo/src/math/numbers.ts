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
export function Gcd(args: Macro<{ a: number; b: number }>) {
  onlyIf(intIn(args.b, { min: 0, max: 0 })).run.return.run.compute.default.integer(abs(args.a));
  $.data.modify.storage(STORAGE, "gcd").set.value({ a: args.b, b: 0 });
  setInt("gcd.b", floorMod(args.a, args.b));
  $.return.run.function(Gcd).with.storage(STORAGE, "gcd");
}

/**
 * Least common multiple.
 * @mcfunction
 */
export function Lcm(args: Macro<{ a: number; b: number }>) {
  $.execute.store.result.score("#gcd", OBJECTIVE).run.function(Gcd, { a: args.a, b: args.b });
  onlyIf(intIn(score("#gcd"), { min: 0, max: 0 })).run.return(0);
  returnInt(mul(div(abs(args.a), score("#gcd")), abs(args.b)));
}

/**
 * 1 if n is prime, else 0 (trial division up to √n).
 * @mcfunction
 */
export function IsPrime(args: Macro<{ n: number }>) {
  onlyIf(intIn(args.n, { max: 1 })).run.return(0);
  setInt("prime.ok", 1);
  forLoop("d", add(toInt(sqrt(toFloat(args.n))), 1), { n: args.n }, (a) => {
    onlyIf(intIn(floorMod(a.n, a.d), { min: 0, max: 0 })).run.data.modify.storage(STORAGE, "prime.ok").set.value(0);
  }, 2);
  returnInt(stored("prime.ok"));
}

/**
 * baseᵉˣᵖ mod m, by squaring (m up to 46340, so products fit in an int).
 * @mcfunction
 */
export function PowMod(args: Macro<{ base: number; exp: number; mod: number }>) {
  onlyIf(intIn(args.exp, { max: 0 })).run.return.run.compute.default.integer(floorMod(1, args.mod));
  $.data.modify.storage(STORAGE, "powmod.call").set.value({ base: args.base, mod: args.mod, exp: 0 });
  setInt("powmod.call.exp", floorDiv(args.exp, 2));
  $.execute.store.result.score("#half", OBJECTIVE).run.function(PowMod).with.storage(STORAGE, "powmod.call");
  setScore("#sq", floorMod(mul(score("#half"), score("#half")), args.mod));
  returnInt(floorMod(mul(score("#sq"), when(intIn(floorMod(args.exp, 2), { min: 1 }), floorMod(args.base, args.mod), 1)), args.mod));
}

/**
 * ⌊√n⌋, exact for every int.
 * @mcfunction
 */
export function IntSqrt(args: Macro<{ n: number }>) {
  setScore("#r", toInt(floor(sqrt(toFloat(args.n)))));
  // Floats can be off by one for big n. Squares can overflow, so compare r with n / r instead:
  // step down if r > n / r, up if r + 1 <= n / (r + 1).
  setScore("#r", when(intIn(sub(floorDiv(args.n, max(score("#r"), 1)), score("#r")), { max: -1 }), sub(score("#r"), 1), score("#r")));
  const next = add(score("#r"), 1);
  returnInt(when(intIn(sub(floorDiv(args.n, next), next), { min: 0 }), next, score("#r")));
}

/**
 * `demo:math out` = √(x² + y²).
 * @mcfunction
 */
export function Hypot(args: Macro<{ x: number; y: number }>) {
  setFloat("out", length(args.x, args.y));
}

/**
 * `demo:math out` = a + (b - a)·t.
 * @mcfunction
 */
export function Lerp(args: Macro<{ a: number; b: number; t: number }>) {
  setFloat("out", add(args.a, mul(sub(args.b, args.a), args.t)));
}

/**
 * `demo:math out` = x limited to lo..hi.
 * @mcfunction
 */
export function Clamp(args: Macro<{ x: number; lo: number; hi: number }>) {
  setFloat("out", max(args.lo, min(args.x, args.hi)));
}
