// Vectors and matrices of any size, decided in game.
//
// They live in storage registers:
//   matrix  demo:math mat.<name> = {rows: 2, cols: 3, m: [[1f, 2f, 3f], [4f, 5f, 6f]]}
//   vector  demo:math vec.<name> = {n: 3, v: [1f, 2f, 3f]}
//
// The helpers below (lowercase) write the commands for one operation on registers chosen at build
// time; sizes are read in game. The exported functions at the bottom are the in-game calculator:
// they work on registers A, B, C (matrices) and U, V, W (vectors).
import { $, macro, nbt, type Macro, type MacroArg } from "#mc";
import {
  abs, add, div, floatIn, floorDiv, floorMod, intIn, max, mul, neg, not, sqrt, STORAGE, stored, sub, when, type Condition, type Num, type Path,
} from "./expr.js";
import { forLoop, onlyIf, setFloat, setInt } from "./io.js";

type Index = number | MacroArg;

const mat = (r: string) => `mat.${r}`;
const vec = (v: string) => `vec.${v}`;
const rows = (r: string) => stored(`${mat(r)}.rows`);
const cols = (r: string) => stored(`${mat(r)}.cols`);
const size = (v: string) => stored(`${vec(v)}.n`);
/** Path of a matrix cell. */
const cell = (r: string, i: Index, j: Index) => macro`${mat(r)}.m[${i}][${j}]`;
/** Path of a vector entry. */
const entry = (v: string, i: Index) => macro`${vec(v)}.v[${i}]`;
const at = (path: Path) => stored(path);

const eq = (a: Num, b: Num): Condition => intIn(sub(a, b), { min: 0, max: 0 });
/** Pivots smaller than this count as zero (floats in game have about 7 digits). */
const EPSILON = 1e-6;

/** Stop the current function with a message when `ok` doesn't hold. */
function check(ok: Condition, message: string) {
  $.execute.unless.predicate(ok).run.say(`math: ${message}`);
  $.execute.unless.predicate(ok).run.return.fail();
}

function distinct(out: string, ...inputs: string[]) {
  if (inputs.includes(out)) throw new Error(`The result register "${out}" can't also be an input (${inputs.join(", ")}).`);
}

// ---------------------------------------------------------------- vectors

/** vec `out` = n zeros. */
export function vecZeros(out: string, n: Num) {
  setInt(`${vec(out)}.n`, n);
  $.data.modify.storage(STORAGE, `${vec(out)}.v`).set.value([]);
  forLoop("i", size(out), {}, () => {
    $.data.modify.storage(STORAGE, `${vec(out)}.v`).append.value(nbt.float(0));
  });
}

/** vec `out` = `u` + `sign`·`v`. */
function vecCombine(u: string, v: string, out: string, sign: 1 | -1) {
  distinct(out, u, v);
  check(eq(size(u), size(v)), `vectors ${u} and ${v} have different sizes`);
  vecZeros(out, size(u));
  forLoop("i", size(out), {}, (a) => {
    setFloat(entry(out, a.i), add(at(entry(u, a.i)), mul(sign, at(entry(v, a.i)))));
  });
}
export const vecAdd = (u: string, v: string, out: string) => vecCombine(u, v, out, 1);
export const vecSub = (u: string, v: string, out: string) => vecCombine(u, v, out, -1);

/** vec `out` = k·`u`. */
export function vecScale(u: string, k: Num, out: string) {
  distinct(out, u);
  // k may use this function's macro arguments, which the loop's own function can't: store it first.
  setFloat("linalg.k", k);
  vecZeros(out, size(u));
  forLoop("i", size(out), {}, (a) => setFloat(entry(out, a.i), mul(at("linalg.k"), at(entry(u, a.i)))));
}

/** `path` = u · v. */
export function dot(u: string, v: string, path: string) {
  check(eq(size(u), size(v)), `vectors ${u} and ${v} have different sizes`);
  setFloat(path, 0);
  forLoop("i", size(u), {}, (a) => setFloat(path, add(at(path), mul(at(entry(u, a.i)), at(entry(v, a.i))))));
}

/** `path` = |u|. */
export function norm(u: string, path: string) {
  dot(u, u, path);
  setFloat(path, sqrt(at(path)));
}

/** vec `out` = u / |u|. */
export function normalize(u: string, out: string) {
  norm(u, "linalg.norm");
  check(not(floatIn(at("linalg.norm"), { max: EPSILON })), `vector ${u} has length 0`);
  vecScale(u, div(1, at("linalg.norm")), out);
}

/** vec `out` = u × v (3D only). Fixed size, so it's written out at build time. */
export function cross(u: string, v: string, out: string) {
  distinct(out, u, v);
  check(eq(size(u), 3), `cross product needs 3D vectors, ${u} isn't`);
  check(eq(size(v), 3), `cross product needs 3D vectors, ${v} isn't`);
  vecZeros(out, 3);
  for (let i = 0; i < 3; i++) {
    const [j, k] = [(i + 1) % 3, (i + 2) % 3];
    setFloat(entry(out, i), sub(mul(at(entry(u, j)), at(entry(v, k))), mul(at(entry(u, k)), at(entry(v, j)))));
  }
}

// ---------------------------------------------------------------- matrices

/** mat `out` = rows × cols zeros. */
export function matZeros(out: string, r: Num, c: Num) {
  setInt(`${mat(out)}.rows`, r);
  setInt(`${mat(out)}.cols`, c);
  $.data.modify.storage(STORAGE, `${mat(out)}.m`).set.value([]);
  forLoop("i", rows(out), {}, () => {
    $.data.modify.storage(STORAGE, `${mat(out)}.m`).append.value([]);
    forLoop("j", cols(out), {}, () => {
      $.data.modify.storage(STORAGE, `${mat(out)}.m[-1]`).append.value(nbt.float(0));
    });
  });
}

/** mat `out` = the n × n identity. */
export function identity(out: string, n: Num) {
  matZeros(out, n, n);
  forLoop("i", rows(out), {}, (a) => setFloat(cell(out, a.i, a.i), 1));
}

export function copyMat(from: string, to: string) {
  $.data.modify.storage(STORAGE, mat(to)).set.from.storage(STORAGE, mat(from));
}

/** mat `out` = a + sign·b. */
function matCombine(a: string, b: string, out: string, sign: 1 | -1) {
  distinct(out, a, b);
  check(eq(rows(a), rows(b)), `matrices ${a} and ${b} have different sizes`);
  check(eq(cols(a), cols(b)), `matrices ${a} and ${b} have different sizes`);
  matZeros(out, rows(a), cols(a));
  forLoop("i", rows(out), {}, (r) =>
    forLoop("j", cols(out), { i: r.i }, (x) => {
      setFloat(cell(out, x.i, x.j), add(at(cell(a, x.i, x.j)), mul(sign, at(cell(b, x.i, x.j)))));
    }),
  );
}
export const matAdd = (a: string, b: string, out: string) => matCombine(a, b, out, 1);
export const matSub = (a: string, b: string, out: string) => matCombine(a, b, out, -1);

/** mat `out` = k·a. */
export function matScale(a: string, k: Num, out: string) {
  distinct(out, a);
  setFloat("linalg.k", k);
  matZeros(out, rows(a), cols(a));
  forLoop("i", rows(out), {}, (r) =>
    forLoop("j", cols(out), { i: r.i }, (x) => setFloat(cell(out, x.i, x.j), mul(at("linalg.k"), at(cell(a, x.i, x.j))))),
  );
}

/** mat `out` = aᵀ. */
export function transpose(a: string, out: string) {
  distinct(out, a);
  matZeros(out, cols(a), rows(a));
  forLoop("i", rows(a), {}, (r) =>
    forLoop("j", cols(a), { i: r.i }, (x) => setFloat(cell(out, x.j, x.i), at(cell(a, x.i, x.j)))),
  );
}

/** mat `out` = a·b. */
export function matMul(a: string, b: string, out: string) {
  distinct(out, a, b);
  check(eq(cols(a), rows(b)), `can't multiply ${a} by ${b}: ${a} needs as many columns as ${b} has rows`);
  matZeros(out, rows(a), cols(b));
  forLoop("i", rows(out), {}, (r) =>
    forLoop("j", cols(out), { i: r.i }, (c) =>
      forLoop("k", cols(a), { i: c.i, j: c.j }, (x) => {
        setFloat(cell(out, x.i, x.j), add(at(cell(out, x.i, x.j)), mul(at(cell(a, x.i, x.k)), at(cell(b, x.k, x.j)))));
      }),
    ),
  );
}

/** vec `out` = a·u. */
export function matVec(a: string, u: string, out: string) {
  check(eq(cols(a), size(u)), `can't multiply ${a} by ${u}: sizes don't match`);
  vecZeros(out, rows(a));
  forLoop("i", rows(a), {}, (r) =>
    forLoop("k", cols(a), { i: r.i }, (x) => {
      setFloat(entry(out, x.i), add(at(entry(out, x.i)), mul(at(cell(a, x.i, x.k)), at(entry(u, x.k)))));
    }),
  );
}

/** `path` = the sum of a's diagonal. */
export function trace(a: string, path: string) {
  check(eq(rows(a), cols(a)), `matrix ${a} isn't square`);
  setFloat(path, 0);
  forLoop("i", rows(a), {}, (x) => setFloat(path, add(at(path), at(cell(a, x.i, x.i)))));
}

/** Swap rows k and p of matrix `r` (k and p from storage `with`). */
const swaps = new Map<string, (args: Macro) => void>();
function swapRows(r: string) {
  if (!swaps.has(r)) {
    swaps.set(r, ({ k, p }: Macro) => {
      $.data.modify.storage(STORAGE, "linalg.row").set.from.storage(STORAGE, macro`${mat(r)}.m[${k}]`);
      $.data.modify.storage(STORAGE, macro`${mat(r)}.m[${k}]`).set.from.storage(STORAGE, macro`${mat(r)}.m[${p}]`);
      $.data.modify.storage(STORAGE, macro`${mat(r)}.m[${p}]`).set.from.storage(STORAGE, "linalg.row");
    });
  }
  return swaps.get(r)!;
}

/**
 * Partial pivoting for column k of `work`: finds the row p ≥ k with the largest |value| and swaps it
 * into row k (in `also` too). Leaves `linalg.swap.k/p` and `linalg.best` (the pivot's size).
 */
function pivot(work: string, n: Num, k: MacroArg, also?: string) {
  $.data.modify.storage(STORAGE, "linalg.swap").set.value({ k, p: k });
  setFloat("linalg.best", abs(at(cell(work, k, k))));
  forLoop("i", n, { k }, (x) => {
    const value = abs(at(cell(work, x.i, x.k)));
    // A bigger value: remember its row (before `best` changes, which the condition reads).
    onlyIf(floatIn(sub(value, at("linalg.best")), { min: EPSILON })).run.data.modify.storage(STORAGE, "linalg.swap.p").set.value(x.i);
    setFloat("linalg.best", max(value, at("linalg.best")));
  }, add(k, 1));
  const swapped = not(eq(stored("linalg.swap.k"), stored("linalg.swap.p")));
  onlyIf(swapped).run.function(swapRows(work)).with.storage(STORAGE, "linalg.swap");
  if (also) onlyIf(swapped).run.function(swapRows(also)).with.storage(STORAGE, "linalg.swap");
  return swapped;
}

/** `path` = det(a), by Gaussian elimination with partial pivoting. */
export function det(a: string, path: string) {
  check(eq(rows(a), cols(a)), `matrix ${a} isn't square`);
  const work = "_det";
  copyMat(a, work);
  setFloat(path, 1);
  forLoop("k", rows(a), {}, (s) => {
    const swapped = pivot(work, rows(work), s.k);
    onlyIf(swapped).run.function(() => setFloat(path, neg(at(path))));
    // A zero column: the determinant is 0, and the loop stops here.
    onlyIf(floatIn(at("linalg.best"), { max: EPSILON })).run.function(() => setFloat(path, 0));
    onlyIf(floatIn(at("linalg.best"), { max: EPSILON })).run.return.fail();
    setFloat(path, mul(at(path), at(cell(work, s.k, s.k))));
    // Clear column k below the pivot.
    forLoop("i", rows(work), { k: s.k }, (r) => {
      setFloat("linalg.f", div(at(cell(work, r.i, r.k)), at(cell(work, r.k, r.k))));
      forLoop("j", cols(work), { k: r.k, i: r.i }, (x) => {
        setFloat(cell(work, x.i, x.j), sub(at(cell(work, x.i, x.j)), mul(at("linalg.f"), at(cell(work, x.k, x.j)))));
      }, r.k);
    }, add(s.k, 1));
  });
}

/** mat `out` = a⁻¹ (Gauss-Jordan). Fails with a message if a is singular. */
export function inverse(a: string, out: string) {
  distinct(out, a);
  check(eq(rows(a), cols(a)), `matrix ${a} isn't square`);
  const work = "_inv";
  copyMat(a, work);
  identity(out, rows(a));
  setInt("linalg.ok", 1);
  forLoop("k", rows(a), {}, (s) => {
    pivot(work, rows(work), s.k, out);
    onlyIf(floatIn(at("linalg.best"), { max: EPSILON })).run.function(() => setInt("linalg.ok", 0));
    onlyIf(floatIn(at("linalg.best"), { max: EPSILON })).run.return.fail();
    // Scale row k so the pivot is 1 (in both matrices).
    setFloat("linalg.p", at(cell(work, s.k, s.k)));
    forLoop("j", rows(work), { k: s.k }, (x) => {
      setFloat(cell(work, x.k, x.j), div(at(cell(work, x.k, x.j)), at("linalg.p")));
      setFloat(cell(out, x.k, x.j), div(at(cell(out, x.k, x.j)), at("linalg.p")));
    });
    // Clear column k in every other row (row k itself gets factor 0).
    forLoop("i", rows(work), { k: s.k }, (r) => {
      setFloat("linalg.f", when(eq(r.i, r.k), 0, at(cell(work, r.i, r.k))));
      forLoop("j", rows(work), { k: r.k, i: r.i }, (x) => {
        setFloat(cell(work, x.i, x.j), sub(at(cell(work, x.i, x.j)), mul(at("linalg.f"), at(cell(work, x.k, x.j)))));
        setFloat(cell(out, x.i, x.j), sub(at(cell(out, x.i, x.j)), mul(at("linalg.f"), at(cell(out, x.k, x.j)))));
      });
    });
  });
  check(eq(stored("linalg.ok"), 1), `matrix ${a} is singular (no inverse)`);
}

/** vec `x` solving a·x = b. */
export function solve(a: string, b: string, x: string) {
  inverse(a, "_solve");
  matVec("_solve", b, x);
}

/** mat `out` = aᵉ (e ≥ 0), by repeated squaring. */
export function matPow(a: string, e: Num, out: string) {
  distinct(out, a);
  check(eq(rows(a), cols(a)), `matrix ${a} isn't square`);
  identity(out, rows(a));
  copyMat(a, "_pow");
  setInt("linalg.e", e);
  forLoop("bit", 31, {}, () => {
    // Done when e = 0 (stops the loop).
    onlyIf(intIn(stored("linalg.e"), { max: 0 })).run.return.fail();
    // Odd e: out = out · base
    onlyIf(intIn(floorMod(stored("linalg.e"), 2), { min: 1 })).run.function(() => {
      matMul(out, "_pow", "_pow_t");
      copyMat("_pow_t", out);
    });
    matMul("_pow", "_pow", "_pow_t");
    copyMat("_pow_t", "_pow");
    setInt("linalg.e", floorDiv(stored("linalg.e"), 2));
  });
}

// ---------------------------------------------------------------- in-game calculator

/** @mcfunction */
export function MatAdd() {
  matAdd("A", "B", "C");
}
/** @mcfunction */
export function MatSub() {
  matSub("A", "B", "C");
}
/** @mcfunction */
export function MatMul() {
  matMul("A", "B", "C");
}
/** @mcfunction */
export function MatScale({ k }: Macro) {
  matScale("A", k, "C");
}
/** @mcfunction */
export function Transpose() {
  transpose("A", "C");
}
/** @mcfunction */
export function Identity({ n }: Macro) {
  identity("A", n);
}
/** @mcfunction */
export function MatPow({ e }: Macro) {
  matPow("A", e, "C");
}
/**
 * `demo:math out` = det(A).
 * @mcfunction
 */
export function Det() {
  det("A", "out");
}
/**
 * `demo:math out` = trace(A).
 * @mcfunction
 */
export function Trace() {
  trace("A", "out");
}
/**
 * C = A⁻¹.
 * @mcfunction
 */
export function Inverse() {
  inverse("A", "C");
}
/**
 * W solves A·W = U.
 * @mcfunction
 */
export function Solve() {
  solve("A", "U", "W");
}
/**
 * W = A·U.
 * @mcfunction
 */
export function MatVec() {
  matVec("A", "U", "W");
}
/** @mcfunction */
export function VecAdd() {
  vecAdd("U", "V", "W");
}
/** @mcfunction */
export function VecSub() {
  vecSub("U", "V", "W");
}
/** @mcfunction */
export function VecScale({ k }: Macro) {
  vecScale("U", k, "W");
}
/**
 * `demo:math out` = U · V.
 * @mcfunction
 */
export function Dot() {
  dot("U", "V", "out");
}
/**
 * `demo:math out` = |U|.
 * @mcfunction
 */
export function Norm() {
  norm("U", "out");
}
/** @mcfunction */
export function Normalize() {
  normalize("U", "W");
}
/** @mcfunction */
export function Cross() {
  cross("U", "V", "W");
}
