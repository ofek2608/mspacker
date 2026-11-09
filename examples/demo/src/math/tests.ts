// In-game self test: /function demo:generated/math/tests/math_tests (dev builds only).
// Expected values are worked out in JavaScript at build time. Prints `math-FAIL ...` per failure and
// `math-done pass <n> fail <n>` at the end.
import { $, nbt, type FnRef, type Macro, type NbtCompound } from "#mc";
import { Choose, Catalan, Derangements, Factorial, PascalRow, Permutations } from "./combinatorics.js";
import { abs, floatIn, intIn, OBJECTIVE, score, STORAGE, stored, sub, toFloat, type Condition, type Num } from "./expr.js";
import { Fib, FibBinet, FibRec } from "./fib.js";
import { setFloat } from "./io.js";
import { Cross, Det, Dot, Inverse, MatMul, MatPow, MatVec, Norm, Solve, Trace, Transpose } from "./linalg.js";
import { Clamp, Gcd, Hypot, IntSqrt, IsPrime, Lcm, Lerp, PowMod } from "./numbers.js";
import * as T from "./trig.js";

function Fail(args: Macro<{ name: string; got: number; want: number }>) {
  $(`say math-FAIL ${args.name} got ${args.got} want ${args.want}`);
  $.scoreboard.players.add("#fail", OBJECTIVE, 1);
}

function report(name: string, ok: Condition, got: Num, want: number) {
  $.data.modify.storage(STORAGE, "test").set.value({ name, want });
  setFloat("test.got", got);
  $.execute.if.predicate(ok).run.scoreboard.players.add("#pass", OBJECTIVE, 1);
  $.execute.unless.predicate(ok).run.function(Fail).with.storage(STORAGE, "test");
}

/** Call `fn` and compare what it returns. */
function returns(fn: FnRef, args: NbtCompound | undefined, want: number) {
  const call = $.execute.store.result.score("#got", OBJECTIVE).run;
  if (args) call.function(fn, args);
  else call.function(fn);
  report(`${String((fn as Function).name)} ${JSON.stringify(args ?? {})}`, intIn(score("#got"), { min: want, max: want }), toFloat(score("#got")), want);
}

/** Compare a float in storage, relative to the expected size. */
function near(name: string, path: string, want: number, tolerance: number) {
  report(name, floatIn(abs(sub(stored(path), want)), { max: tolerance * Math.max(1, Math.abs(want)) }), stored(path), want);
}

/** Call `fn` and compare `demo:math out`. */
function gives(fn: FnRef, args: NbtCompound | undefined, want: number, tolerance = 1e-5) {
  $.data.remove.storage(STORAGE, "out");
  if (args) $.function(fn, args);
  else $.function(fn);
  near(`${String((fn as Function).name)} ${JSON.stringify(args ?? {})}`, "out", want, tolerance);
}

// ---------------------------------------------------------------- JS references

const fib = (n: number) => {
  let [a, b] = [0, 1];
  for (let i = 0; i < n; i++) [a, b] = [b, a + b];
  return a;
};
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
/** Exact (BigInt): 33! doesn't fit a double exactly. */
function choose(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let r = 1n;
  for (let i = 1n; i <= BigInt(k); i++) r = (r * (BigInt(n - k) + i)) / i;
  return Number(r);
}

type Matrix = number[][];
/** Deterministic test matrices: small entries, a strong diagonal so they're well conditioned. */
function testMatrix(n: number, seed: number): Matrix {
  let s = seed;
  const next = () => ((s = (s * 1103515245 + 12345) % 2147483648) % 11) - 5;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => next() + (i === j ? 4 * n : 0)));
}
const mul = (a: Matrix, b: Matrix) => a.map((row) => b[0]!.map((_, j) => row.reduce((acc, v, k) => acc + v * b[k]![j]!, 0)));
function detOf(a: Matrix): number {
  const m = a.map((r) => [...r]);
  let d = 1;
  for (let k = 0; k < m.length; k++) {
    let p = k;
    for (let i = k + 1; i < m.length; i++) if (Math.abs(m[i]![k]!) > Math.abs(m[p]![k]!)) p = i;
    if (p !== k) [m[p], m[k], d] = [m[k]!, m[p]!, -d];
    d *= m[k]![k]!;
    for (let i = k + 1; i < m.length; i++) {
      const f = m[i]![k]! / m[k]![k]!;
      for (let j = k; j < m.length; j++) m[i]![j]! -= f * m[k]![j]!;
    }
  }
  return d;
}
function inverseOf(a: Matrix): Matrix {
  const n = a.length;
  const m = a.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i]![k]!) > Math.abs(m[p]![k]!)) p = i;
    [m[p], m[k]] = [m[k]!, m[p]!];
    const piv = m[k]![k]!;
    m[k] = m[k]!.map((v) => v / piv);
    for (let i = 0; i < n; i++) if (i !== k) m[i] = m[i]!.map((v, j) => v - m[i]![k]! * m[k]![j]!);
  }
  return m.map((r) => r.slice(n));
}

const setMatrix = (name: string, m: Matrix) =>
  $.data.modify.storage(STORAGE, `mat.${name}`).set.value({ rows: m.length, cols: m[0]!.length, m: m.map((r) => r.map((v) => nbt.double(v))) });
const setVector = (name: string, v: number[]) =>
  $.data.modify.storage(STORAGE, `vec.${name}`).set.value({ n: v.length, v: v.map((x) => nbt.double(x)) });
function matrixIs(label: string, name: string, want: Matrix, tolerance: number) {
  want.forEach((row, i) => row.forEach((v, j) => near(`${label}[${i}][${j}]`, `mat.${name}.m[${i}][${j}]`, v, tolerance)));
}
function vectorIs(label: string, name: string, want: number[], tolerance: number) {
  want.forEach((v, i) => near(`${label}[${i}]`, `vec.${name}.v[${i}]`, v, tolerance));
}

// ---------------------------------------------------------------- groups (one per tick, so each gets its own command budget)

/** @dev */
export function TestNumbers() {
  returns(Gcd, { a: 48, b: 18 }, 6);
  returns(Gcd, { a: -12, b: 8 }, 4);
  returns(Lcm, { a: 4, b: 6 }, 12);
  for (const [n, prime] of [[1, 0], [2, 1], [97, 1], [91, 0], [7919, 1], [7917, 0]] as const) returns(IsPrime, { n }, prime);
  returns(PowMod, { base: 3, exp: 200, mod: 1000 }, 1);
  returns(PowMod, { base: 7, exp: 0, mod: 13 }, 1);
  for (const n of [0, 1, 99, 100, 2147395600, 2147483647]) returns(IntSqrt, { n }, Math.floor(Math.sqrt(n)));
  gives(Hypot, { x: 3, y: 4 }, 5);
  gives(Lerp, { a: 10, b: 20, t: 0.25 }, 12.5);
  gives(Clamp, { x: 7, lo: 0, hi: 5 }, 5);
}

/** @dev */
export function TestFib() {
  for (const n of [0, 1, 2, 10, 30, 46]) returns(Fib, { n }, fib(n));
  for (const n of [0, 1, 10, 20, 30]) returns(FibBinet, { n }, fib(n));
  for (const n of [0, 1, 2, 12]) returns(FibRec, { n }, fib(n));
}

/** @dev */
export function TestFibRec() {
  // 8,361 calls: the most that fits in the game's limit of 65,536 commands per run.
  returns(FibRec, { n: 18 }, fib(18));
}

/** @dev */
export function TestCombinatorics() {
  for (const n of [0, 1, 5, 12]) returns(Factorial, { n }, factorial(n));
  for (const [n, k] of [[5, 2], [10, 0], [10, 10], [30, 15], [33, 16], [5, 7]] as const) returns(Choose, { n, k }, choose(n, k));
  returns(Permutations, { n: 10, k: 3 }, 720);
  for (const n of [0, 1, 5, 15]) returns(Catalan, { n }, choose(2 * n, n) / (n + 1));
  for (const [n, d] of [[0, 1], [1, 0], [2, 1], [5, 44], [12, 176214841]] as const) returns(Derangements, { n }, d);
  $.function(PascalRow, { n: 10 });
  for (let k = 0; k <= 10; k++) near(`pascal[${k}]`, `pascal[${k}]`, choose(10, k), 0);
}

/** @dev */
export function TestTrig() {
  const xs = [-7, -2, -0.5, 0, 0.001, 0.3, 1, 2.5, 100];
  for (const x of xs) {
    gives(T.Sin, { x }, Math.sin(x), x === 100 ? 1e-5 : 1e-6);
    gives(T.Cos, { x }, Math.cos(x), x === 100 ? 1e-5 : 1e-6);
    gives(T.Atan, { x }, Math.atan(x));
    gives(T.Exp, { x: x / 10 }, Math.exp(x / 10));
    gives(T.Sinh, { x: x / 10 }, Math.sinh(x / 10));
    gives(T.Tanh, { x }, Math.tanh(x));
  }
  for (const x of [0.001, 0.5, 1, 10, 12345]) {
    gives(T.Ln, { x }, Math.log(x));
    gives(T.Log10, { x }, Math.log10(x));
    gives(T.Log2, { x }, Math.log2(x));
  }
  for (const x of [-0.99, -0.5, 0, 0.3, 1]) {
    gives(T.Asin, { x }, Math.asin(x));
    gives(T.Acos, { x }, Math.acos(x));
  }
  for (const [y, x] of [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 0], [0.001, -5]] as const) {
    gives(T.Atan2, { y, x }, Math.atan2(y, x));
  }
  gives(T.Tan, { x: 1.2 }, Math.tan(1.2));
  gives(T.Cosh, { x: 2 }, Math.cosh(2));
  gives(T.Asinh, { x: -3 }, Math.asinh(-3));
  gives(T.Acosh, { x: 3 }, Math.acosh(3));
  gives(T.Atanh, { x: 0.5 }, Math.atanh(0.5));
  gives(T.Degrees, { x: Math.PI }, 180);
}

/** @dev */
export function TestLinalg() {
  for (let n = 1; n <= 6; n++) {
    const a = testMatrix(n, n);
    setMatrix("A", a);
    gives(Det, undefined, detOf(a), 1e-4);
    $.function(Inverse);
    matrixIs(`inverse ${n}x${n}`, "C", inverseOf(a), 1e-4);
    const b = testMatrix(n, n + 10);
    setMatrix("B", b);
    $.function(MatMul);
    matrixIs(`mul ${n}x${n}`, "C", mul(a, b), 1e-5);
    const u = a.map((_, i) => i + 1);
    setVector("U", u);
    $.function(Solve);
    vectorIs(`solve ${n}x${n}`, "W", inverseOf(a).map((row) => row.reduce((acc, v, k) => acc + v * u[k]!, 0)), 1e-4);
  }
  // Non-square shapes.
  const r = [[1, 2, 3], [4, 5, 6]];
  setMatrix("A", r);
  $.function(Transpose);
  matrixIs("transpose", "C", [[1, 4], [2, 5], [3, 6]], 0);
  setVector("U", [1, 0, -1]);
  $.function(MatVec);
  vectorIs("matvec", "W", [-2, -2], 0);
  setMatrix("A", [[1, 1], [1, 0]]);
  $.function(MatPow, { e: 20 });
  near("fib via matrix power", "mat.C.m[0][1]", fib(20), 0);
  gives(Trace, undefined, 1);
  setVector("U", [1, 2, 3]);
  setVector("V", [4, 5, 6]);
  $.function(Cross);
  vectorIs("cross", "W", [-3, 6, -3], 0);
  gives(Dot, undefined, 32);
  gives(Norm, undefined, Math.sqrt(14));
}

/** @dev */
function Summary(args: Macro<{ pass: number; fail: number }>) {
  $(`say math-done pass ${args.pass} fail ${args.fail}`);
}

/** @dev */
export function ReportTests() {
  $.execute.store.result.storage(STORAGE, "test.summary.pass").int(1).run.scoreboard.players.get("#pass", OBJECTIVE);
  $.execute.store.result.storage(STORAGE, "test.summary.fail").int(1).run.scoreboard.players.get("#fail", OBJECTIVE);
  $.function(Summary).with.storage(STORAGE, "test.summary");
}

/**
 * Runs every group, one per tick.
 * @dev @mcfunction
 */
export function MathTests() {
  $.scoreboard.players.set("#pass", OBJECTIVE, 0);
  $.scoreboard.players.set("#fail", OBJECTIVE, 0);
  const groups = [TestNumbers, TestFib, TestFibRec, TestCombinatorics, TestTrig, TestLinalg, ReportTests];
  groups.forEach((g, i) => $.schedule.function(g, `${i + 1}t`));
}
