// Fibonacci three ways.
import { $, macro, type Macro } from "#mc";
import { add, constant, div, intIn, OBJECTIVE, pow, round, score, sqrt, STORAGE, stored, sub, toInt } from "./expr.js";
import { forLoop, onlyIf, returnInt, setInt } from "./io.js";

/**
 * fib(n) by plain double recursion: about fib(n) calls, so it's slow on purpose (a good stress test).
 * The game stops a run after 65,536 commands, which is enough for n up to 18.
 * @mcfunction
 */
export function FibRec(args: Macro<{ n: number }>) {
  onlyIf(intIn(args.n, { max: 1 })).run.return.run.compute.default.integer(constant(args.n));
  // The first result waits in storage while the second call runs. Calls that are still running all
  // have different n, so `fib.p<n>` can't be overwritten by a deeper call.
  setInt("fib.call.n", sub(args.n, 1));
  $.execute.store.result.storage(STORAGE, macro`fib.p${args.n}`).int(1).run.function(FibRec).with.storage(STORAGE, "fib.call");
  setInt("fib.call.n", sub(args.n, 2));
  $.execute.store.result.score("#fib", OBJECTIVE).run.function(FibRec).with.storage(STORAGE, "fib.call");
  returnInt(add(stored(macro`fib.p${args.n}`), score("#fib")));
}

/**
 * fib(n) with a loop: exact up to fib(46), the largest that fits in an int.
 * @mcfunction
 */
export function Fib(args: Macro<{ n: number }>) {
  setInt("fib.a", 0);
  setInt("fib.b", 1);
  forLoop("i", args.n, {}, () => {
    setInt("fib.t", add(stored("fib.a"), stored("fib.b")));
    $.data.modify.storage(STORAGE, "fib.a").set.from.storage(STORAGE, "fib.b");
    $.data.modify.storage(STORAGE, "fib.b").set.from.storage(STORAGE, "fib.t");
  });
  returnInt(stored("fib.a"));
}

const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * fib(n) in one command: round(φⁿ / √5). Floats in game have about 7 digits, so it drifts past n ≈ 30.
 * @mcfunction
 */
export function FibBinet(args: Macro<{ n: number }>) {
  returnInt(toInt(round(div(pow(PHI, args.n), sqrt(5)))));
}
