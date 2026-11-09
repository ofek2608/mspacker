// Linear algebra: a cube turning in 3D. Each tick: a rotation matrix R from sin/cos, then
// R · P (P = the 20 points of the cube, as columns) with matMul, and every point moves to its column.
import { $, nbt } from "#mc";
import { add, mul, neg, STORAGE, stored } from "../math/expr.js";
import { det, matMul } from "../math/linalg.js";
import { cos, sin } from "../math/trig.js";
import { COLOR, decimal, dot, label, moveTo, setText, store, textDisplay } from "./ui.js";

const at = stored;
// Points stay within √3·1.6 ≈ 2.8 of the center: y from 67.2 to 72.8. Text above that.
const CU = { x: -20.5, y: 70, z: 0.5, size: 1.6 };

// The 8 corners and the 12 edge midpoints of a cube from -1 to 1.
const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z])));
const edges = corners.flatMap((a, i) =>
  corners.slice(i + 1).filter((b) => a.filter((v, k) => v !== b[k]).length === 1).map((b) => a.map((v, k) => (v + b[k]!) / 2)),
);
const points = [...corners, ...edges];

const setMatrix = (name: string, m: number[][]) =>
  $.data.modify.storage(STORAGE, `mat.${name}`).set.value({ rows: m.length, cols: m[0]!.length, m: m.map((r) => r.map((v) => nbt.double(v))) });

export function buildCube() {
  label(CU.x, CU.y + 4.4, CU.z, "linear algebra: R · P");
  // P: one column per point.
  setMatrix("CubeP", [0, 1, 2].map((k) => points.map((p) => p[k]!)));
  setMatrix("CubeRy", [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  setMatrix("CubeRx", [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  points.forEach((p, j) =>
    dot(`cube_${j}`, CU.x + CU.size * p[0]!, CU.y + CU.size * p[1]!, CU.z + CU.size * p[2]!, j < 8 ? COLOR.cyan : COLOR.white, j < 8 ? 0.3 : 0.15));
  textDisplay("cube_text", CU.x, CU.y + 3.2, CU.z);
}

export function tickCube() {
  // Two angles, each turning at its own speed and wrapping at 2π on its own. (Deriving one from the
  // other, like 0.6·t, would jump whenever t wraps around.)
  store("cube.a", { type: "minecraft:mod", left: add(at("cube.a"), 0.05), right: 2 * Math.PI });
  store("cube.b", { type: "minecraft:mod", left: add(at("cube.b"), 0.03), right: 2 * Math.PI });
  cos(at("cube.a"), "cube.c1");
  sin(at("cube.a"), "cube.s1");
  cos(at("cube.b"), "cube.c2");
  sin(at("cube.b"), "cube.s2");
  const cell = (m: string, i: number, j: number) => `mat.${m}.m[${i}][${j}]`;
  store(cell("CubeRy", 0, 0), at("cube.c1"));
  store(cell("CubeRy", 0, 2), at("cube.s1"));
  store(cell("CubeRy", 2, 0), neg(at("cube.s1")));
  store(cell("CubeRy", 2, 2), at("cube.c1"));
  store(cell("CubeRx", 1, 1), at("cube.c2"));
  store(cell("CubeRx", 1, 2), neg(at("cube.s2")));
  store(cell("CubeRx", 2, 1), at("cube.s2"));
  store(cell("CubeRx", 2, 2), at("cube.c2"));
  matMul("CubeRy", "CubeRx", "CubeR");
  matMul("CubeR", "CubeP", "CubeQ");
  // Each point moves to center + size · (its column of R · P).
  points.forEach((_, j) => {
    const coord = (k: number, c: number) => add(c, mul(CU.size, at(cell("CubeQ", k, j))));
    moveTo(`cube_${j}`, coord(0, CU.x), coord(1, CU.y), coord(2, CU.z));
  });
  // A rotation keeps volumes: det R stays 1 (up to float rounding).
  det("CubeR", "cube.det");
  setText("cube_text", "det R = ", decimal(at("cube.det"), 6));
}
