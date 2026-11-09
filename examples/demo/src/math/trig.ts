// The math functions the game doesn't have, built from sin, cos, sqrt and pow.
//
// Each helper writes its result to a storage path; the exported functions write `demo:math out`.
// Floats in game have about 7 significant digits, so results are good to about 6.
import { type Macro } from "#mc";
import { abs, add, div, floatIn, length, mul, neg, pow, round, sqrt, stored, sub, when, type Num } from "./expr.js";
import { setFloat } from "./io.js";

const PI = Math.PI;
const at = stored;
const sign = (x: Num) => when(floatIn(x, { min: 0 }), 1, -1);

/**
 * path = sin x, to float precision. The game's own `sin` and `cos` read a lookup table: about 4
 * digits, and sin(0.001) comes out 4% low.
 *   1. Into -π..π: r = x - 2π·round(x / 2π).
 *   2. Into -π/2..π/2: sin(π - r) = sin r.
 *   3. Taylor series up to r¹³ (error below 10⁻⁹ there).
 */
export function sin(x: Num, path: string) {
  setFloat("trig.sin.r", x);
  const r = at("trig.sin.r");
  setFloat("trig.sin.r", sub(r, mul(2 * PI, round(div(r, 2 * PI)))));
  setFloat("trig.sin.r", when(floatIn(r, { min: PI / 2 }), sub(PI, r), when(floatIn(r, { max: -PI / 2 }), sub(-PI, r), r)));
  setFloat("trig.sin.u", mul(r, r));
  const u = at("trig.sin.u");
  // r·(1 - u/6·(1 - u/20·(1 - u/42·(1 - u/72·(1 - u/110·(1 - u/156))))))
  let series: Num = 1;
  for (const d of [156, 110, 72, 42, 20, 6]) series = sub(1, mul(u, 1 / d, series));
  setFloat(path, mul(r, series));
}

/** path = cos x = sin(x + π/2), to float precision. */
export function cos(x: Num, path: string) {
  sin(add(x, PI / 2), path);
}

/** path = tan x */
export function tan(x: Num, path: string) {
  setFloat("trig.tan.x", x);
  sin(at("trig.tan.x"), "trig.tan.s");
  cos(at("trig.tan.x"), "trig.tan.c");
  setFloat(path, div(at("trig.tan.s"), at("trig.tan.c")));
}

/** path = eˣ */
export function exp(x: Num, path: string) {
  setFloat(path, pow(Math.E, x));
}

/**
 * path = ln x (x > 0). A first guess from ln x ≈ 2¹²·(x^(1/2¹²) - 1), then two Halley steps on eʸ = x,
 * which each roughly cube the error.
 */
export function ln(x: Num, path: string) {
  setFloat("trig.ln.x", x);
  setFloat(path, mul(4096, sub(pow(at("trig.ln.x"), 1 / 4096), 1)));
  for (let step = 0; step < 2; step++) {
    // y += 2(x - eʸ) / (x + eʸ)
    const ey = pow(Math.E, at(path));
    setFloat(path, add(at(path), div(mul(2, sub(at("trig.ln.x"), ey)), add(at("trig.ln.x"), ey))));
  }
}

export function log10(x: Num, path: string) {
  ln(x, path);
  setFloat(path, div(at(path), Math.LN10));
}

export function log2(x: Num, path: string) {
  ln(x, path);
  setFloat(path, div(at(path), Math.LN2));
}

/** path = sinh x. Near 0 the exponentials cancel out, so a series is used there. */
export function sinh(x: Num, path: string) {
  setFloat("trig.x", x);
  const v = at("trig.x");
  setFloat(path, when(
    floatIn(abs(v), { max: 0.01 }),
    add(v, div(mul(v, v, v), 6)),
    div(sub(pow(Math.E, v), pow(Math.E, neg(v))), 2),
  ));
}

/** path = cosh x */
export function cosh(x: Num, path: string) {
  setFloat("trig.x", x);
  setFloat(path, div(add(pow(Math.E, at("trig.x")), pow(Math.E, neg(at("trig.x")))), 2));
}

/** path = tanh x, written with e^(-2|x|) so large x doesn't overflow. */
export function tanh(x: Num, path: string) {
  setFloat("trig.x", x);
  const e = pow(Math.E, mul(-2, abs(at("trig.x"))));
  setFloat(path, mul(sign(at("trig.x")), div(sub(1, e), add(1, e))));
}

/** path = asinh x = ln(|x| + √(x² + 1)), with the sign of x. */
export function asinh(x: Num, path: string) {
  setFloat("trig.x", x);
  ln(add(abs(at("trig.x")), sqrt(add(mul(at("trig.x"), at("trig.x")), 1))), path);
  setFloat(path, mul(sign(at("trig.x")), at(path)));
}

/** path = acosh x = ln(x + √(x² - 1)), x ≥ 1. */
export function acosh(x: Num, path: string) {
  setFloat("trig.x", x);
  ln(add(at("trig.x"), sqrt(sub(mul(at("trig.x"), at("trig.x")), 1))), path);
}

/** path = atanh x = ½·ln((1 + x) / (1 - x)), |x| < 1. */
export function atanh(x: Num, path: string) {
  setFloat("trig.x", x);
  ln(div(add(1, at("trig.x")), sub(1, at("trig.x"))), path);
  setFloat(path, div(at(path), 2));
}

/**
 * path = atan x.
 *   1. |x| > 1: atan x = ±π/2 - atan(1/x), so t is in [-1, 1].
 *   2. Halve the angle three times: atan t = 2·atan(t / (1 + √(1 + t²))), so |t| ≤ tan(π/32).
 *   3. A short series: t - t³/3 + t⁵/5 - t⁷/7 + t⁹/9.
 */
export function atan(x: Num, path: string) {
  setFloat("trig.atan.x", x);
  const big = floatIn(abs(at("trig.atan.x")), { min: 1 });
  setFloat("trig.atan.t", when(big, div(1, at("trig.atan.x")), at("trig.atan.x")));
  const t = at("trig.atan.t");
  for (let i = 0; i < 3; i++) setFloat("trig.atan.t", div(t, add(1, sqrt(add(1, mul(t, t))))));
  setFloat("trig.atan.u", mul(t, t));
  const u = at("trig.atan.u");
  const series = mul(t, add(1, mul(u, add(-1 / 3, mul(u, add(1 / 5, mul(u, add(-1 / 7, mul(u, 1 / 9)))))))));
  setFloat("trig.atan.r", mul(8, series));
  setFloat(path, when(big, sub(mul(sign(at("trig.atan.x")), PI / 2), at("trig.atan.r")), at("trig.atan.r")));
}

/**
 * path = atan2(y, x), the angle of (x, y) in -π..π. Uses the half angle, tan(θ/2) = y / (r + x) =
 * (r - x) / y with r = √(x² + y²), picking the form that doesn't cancel out.
 */
export function atan2(y: Num, x: Num, path: string) {
  setFloat("trig.atan2.y", y);
  setFloat("trig.atan2.x", x);
  const [Y, X] = [at("trig.atan2.y"), at("trig.atan2.x")];
  setFloat("trig.atan2.r", length(X, Y));
  const r = at("trig.atan2.r");
  const right = floatIn(X, { min: 0 });
  const yZero = floatIn(abs(Y), { max: 0 });
  // (0, 0) -> 0 and (negative, 0) -> π are the cases where the half-angle forms divide by zero.
  setFloat("trig.atan2.q", when(right, when(floatIn(r, { max: 0 }), 0, div(Y, add(r, X))), when(yZero, 0, div(sub(r, X), Y))));
  atan(at("trig.atan2.q"), "trig.atan2.a");
  setFloat(path, when(right, mul(2, at("trig.atan2.a")), when(yZero, PI, mul(2, at("trig.atan2.a")))));
}

/** path = asin x = atan2(x, √(1 - x²)) */
export function asin(x: Num, path: string) {
  setFloat("trig.x", x);
  atan2(at("trig.x"), sqrt(sub(1, mul(at("trig.x"), at("trig.x")))), path);
}

/** path = acos x = atan2(√(1 - x²), x) */
export function acos(x: Num, path: string) {
  setFloat("trig.x", x);
  atan2(sqrt(sub(1, mul(at("trig.x"), at("trig.x")))), at("trig.x"), path);
}

/** path = x in radians (x in degrees). */
export const radians = (x: Num, path: string) => setFloat(path, mul(x, PI / 180));
/** path = x in degrees (x in radians). */
export const degrees = (x: Num, path: string) => setFloat(path, mul(x, 180 / PI));

// ---------------------------------------------------------------- in-game: result in `demo:math out`

type X = Macro<"x">;

/** @mcfunction */
export function Sin(args: X) {
  sin(args.x, "out");
}
/** @mcfunction */
export function Cos(args: X) {
  cos(args.x, "out");
}
/** @mcfunction */
export function Tan(args: X) {
  tan(args.x, "out");
}
/** @mcfunction */
export function Exp(args: X) {
  exp(args.x, "out");
}
/** @mcfunction */
export function Ln(args: X) {
  ln(args.x, "out");
}
/** @mcfunction */
export function Log10(args: X) {
  log10(args.x, "out");
}
/** @mcfunction */
export function Log2(args: X) {
  log2(args.x, "out");
}
/** @mcfunction */
export function Sinh(args: X) {
  sinh(args.x, "out");
}
/** @mcfunction */
export function Cosh(args: X) {
  cosh(args.x, "out");
}
/** @mcfunction */
export function Tanh(args: X) {
  tanh(args.x, "out");
}
/** @mcfunction */
export function Asinh(args: X) {
  asinh(args.x, "out");
}
/** @mcfunction */
export function Acosh(args: X) {
  acosh(args.x, "out");
}
/** @mcfunction */
export function Atanh(args: X) {
  atanh(args.x, "out");
}
/** @mcfunction */
export function Atan(args: X) {
  atan(args.x, "out");
}
/** @mcfunction */
export function Asin(args: X) {
  asin(args.x, "out");
}
/** @mcfunction */
export function Acos(args: X) {
  acos(args.x, "out");
}
/** @mcfunction */
export function Atan2(args: Macro<"y" | "x">) {
  atan2(args.y, args.x, "out");
}
/** @mcfunction */
export function Radians(args: X) {
  radians(args.x, "out");
}
/** @mcfunction */
export function Degrees(args: X) {
  degrees(args.x, "out");
}
