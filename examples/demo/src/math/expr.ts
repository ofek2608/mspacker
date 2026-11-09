// Build-time helpers that write number providers: a whole expression becomes one `compute`.
//
//   compute(add(stored("x"), mul(2, score("#y"))))   ->  x + 2 * #y, evaluated in game
//
// Values can be numbers, other expressions, or macro arguments (`args.n`).
import type { MacroArg, NbtCompound } from "#mc";

export type Num = number | NbtCompound | MacroArg<number>;
/** A storage path; build one with macro arguments using `` macro`m[${args.i}]` ``. */
export type Path = string | MacroArg<any>;

/** The storage every math function reads from and writes to. */
export const STORAGE = "demo:math";
/** The scoreboard objective for integer scratch values (created in `@load`). */
export const OBJECTIVE = "math";

const op = (type: string, fields: NbtCompound): NbtCompound => ({ type: `minecraft:${type}`, ...fields });

// A bare number is read as a registry id at the top of `compute`, so wrap constants there.
export const constant = (value: Num): NbtCompound => op("constant", { value });

export const add = (...inputs: Num[]) => op("add", { inputs });
export const mul = (...inputs: Num[]) => op("mul", { inputs });
export const min = (...inputs: Num[]) => op("min", { inputs });
export const max = (...inputs: Num[]) => op("max", { inputs });
export const avg = (...inputs: Num[]) => op("avg", { inputs });
/** √(x₁² + x₂² + ...), floats only. */
export const length = (...inputs: Num[]) => op("length", { inputs });
export const sub = (left: Num, right: Num) => op("sub", { left, right });
/** Division rounding toward zero (integers), or plain division (floats). */
export const div = (left: Num, right: Num) => op("div", { left, right });
/** Integer division rounding down. */
export const floorDiv = (left: Num, right: Num) => op("floor_div", { left, right });
/** Remainder with the sign of the divisor (integers). */
export const floorMod = (left: Num, right: Num) => op("floor_mod", { left, right });
export const mod = (left: Num, right: Num) => op("mod", { left, right });
export const pow = (base: Num, exponent: Num) => op("pow", { base, exponent });
export const neg = (input: Num) => op("negate", { input });
export const abs = (input: Num) => op("abs", { input });
export const sqrt = (input: Num) => op("sqrt", { input });
export const sin = (input: Num) => op("sin", { input });
export const cos = (input: Num) => op("cos", { input });
export const floor = (input: Num) => op("floor", { input });
export const ceil = (input: Num) => op("ceil", { input });
export const round = (input: Num) => op("round", { input });
/** Float to integer, rounding toward zero. */
export const toInt = (input: Num) => op("from_float", { input });
/** Integer to float. */
export const toFloat = (input: Num) => op("from_int", { input });
export const uniform = (min: Num, max: Num) => op("uniform", { min, max });
export const binomial = (n: Num, p: Num) => op("binomial", { n, p });

/** A number in storage (`demo:math <path>`), or `fallback` if it's missing. */
export const stored = (path: Path, fallback?: Num) =>
  // Inside NBT a macro argument is written as-is, so a path built with macro`...` needs its quotes.
  op("storage", { storage: STORAGE, path: typeof path === "string" ? path : path.quoted, ...(fallback === undefined ? {} : { fallback }) });
/** A score (of the `math` objective by default). */
export const score = (holder: string, objective = OBJECTIVE) =>
  op("score", { target: { type: "minecraft:fixed", name: holder }, score: objective });

/** Inclusive bounds; leave one out for an open range. */
export interface Range {
  min?: Num;
  max?: Num;
}
export type Condition = NbtCompound;
export const intIn = (value: Num, test: Range): Condition => ({ type: "minecraft:int_value_check", value, test: { ...test } });
export const floatIn = (value: Num, test: Range): Condition => ({ type: "minecraft:float_value_check", value, test: { ...test } });
export const not = (term: Condition): Condition => ({ type: "minecraft:inverted", term });
/** `cond ? onTrue : onFalse`. */
export const when = (condition: Condition, onTrue: Num, onFalse: Num) =>
  op("conditional", { condition, on_true: onTrue, on_false: onFalse });

/** Sum of a JS array of expressions (0 when empty). */
export const sum = (xs: Num[]) => (xs.length ? add(...xs) : constant(0));
