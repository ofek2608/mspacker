// Counting. Results are ints, so they overflow past 2³¹ (13!, C(34, 17), ...): the command then fails.
import { $, type Macro } from "#mc";
import { add, binomial, div, intIn, min, mul, OBJECTIVE, score, STORAGE, stored, sub, uniform } from "./expr.js";
import { forLoop, onlyIf, returnInt, setInt } from "./io.js";
import { Gcd } from "./numbers.js";

/**
 * n!
 * @mcfunction
 */
export function Factorial(args: Macro<"n">) {
  setInt("comb.r", 1);
  forLoop("i", add(args.n, 1), {}, (a) => setInt("comb.r", mul(stored("comb.r"), a.i)), 1);
  returnInt(stored("comb.r"));
}

/**
 * C(n, k): ways to choose k of n. Multiplies and divides step by step, so every value stays exact.
 * @mcfunction
 */
export function Choose(args: Macro<"n" | "k">) {
  onlyIf(intIn(args.k, { max: -1 })).run.return(0);
  onlyIf(intIn(sub(args.n, args.k), { max: -1 })).run.return(0);
  // C(n, k) = C(n, n - k): use the smaller one.
  setInt("comb.k", min(args.k, sub(args.n, args.k)));
  setInt("comb.r", 1);
  // r = r · (n - k + i) / i for i = 1..k. r · (n - k + i) alone can overflow even when the result
  // fits, so divide first: with g = gcd(r, i), r / g and (n - k + i) / (i / g) are both exact.
  forLoop("i", add(stored("comb.k"), 1), { n: args.n }, (a) => {
    $.data.modify.storage(STORAGE, "comb.gcd").set.value({ a: 0, b: a.i });
    $.data.modify.storage(STORAGE, "comb.gcd.a").set.from.storage(STORAGE, "comb.r");
    $.execute.store.result.score("#g", OBJECTIVE).run.function(Gcd).with.storage(STORAGE, "comb.gcd");
    setInt("comb.r", mul(div(stored("comb.r"), score("#g")), div(add(sub(a.n, stored("comb.k")), a.i), div(a.i, score("#g")))));
  }, 1);
  returnInt(stored("comb.r"));
}

/**
 * P(n, k) = n! / (n - k)!: ordered ways to pick k of n.
 * @mcfunction
 */
export function Permutations(args: Macro<"n" | "k">) {
  onlyIf(intIn(args.k, { max: -1 })).run.return(0);
  onlyIf(intIn(sub(args.n, args.k), { max: -1 })).run.return(0);
  setInt("comb.r", 1);
  forLoop("i", add(args.n, 1), {}, (a) => setInt("comb.r", mul(stored("comb.r"), a.i)), add(sub(args.n, args.k), 1));
  returnInt(stored("comb.r"));
}

/**
 * The n-th Catalan number, C(2n, n) / (n + 1).
 * @mcfunction
 */
export function Catalan(args: Macro<"n">) {
  $.data.modify.storage(STORAGE, "comb.call").set.value({ n: 0, k: args.n });
  setInt("comb.call.n", mul(args.n, 2));
  $.execute.store.result.score("#c", OBJECTIVE).run.function(Choose).with.storage(STORAGE, "comb.call");
  returnInt(div(score("#c"), add(args.n, 1)));
}

/**
 * Derangements: orderings of n items where nothing stays in place. D(n) = (n - 1)(D(n - 1) + D(n - 2)).
 * @mcfunction
 */
export function Derangements(args: Macro<"n">) {
  setInt("comb.a", 1); // D(0)
  setInt("comb.b", 0); // D(1)
  onlyIf(intIn(args.n, { max: 0 })).run.return(1);
  forLoop("i", add(args.n, 1), {}, (a) => {
    setInt("comb.t", mul(sub(a.i, 1), add(stored("comb.a"), stored("comb.b"))));
    $.data.modify.storage(STORAGE, "comb.a").set.from.storage(STORAGE, "comb.b");
    $.data.modify.storage(STORAGE, "comb.b").set.from.storage(STORAGE, "comb.t");
  }, 2);
  returnInt(stored("comb.b"));
}

/**
 * Row n of Pascal's triangle, into `demo:math pascal` as a list.
 * @mcfunction
 */
export function PascalRow(args: Macro<"n">) {
  $.data.modify.storage(STORAGE, "pascal").set.value([1]);
  // Each entry from the previous one: C(n, i) = C(n, i - 1) · (n - i + 1) / i
  forLoop("i", add(args.n, 1), { n: args.n }, (a) => {
    $.data.modify.storage(STORAGE, "pascal").append.compute.default.integer(
      div(mul(stored("pascal[-1]"), sub(add(a.n, 1), a.i)), a.i),
    );
  }, 1);
}

/**
 * The sum of `count` rolls of a die with `sides` sides.
 * @mcfunction
 */
export function RollDice(args: Macro<"count" | "sides">) {
  setInt("dice.sum", 0);
  forLoop("i", args.count, { sides: args.sides }, (a) => {
    setInt("dice.sum", add(stored("dice.sum"), uniform(1, a.sides)));
  });
  returnInt(stored("dice.sum"));
}

/**
 * Heads in n fair coin flips.
 * @mcfunction
 */
export function CoinFlips(args: Macro<"n">) {
  returnInt(binomial(args.n, 0.5));
}
