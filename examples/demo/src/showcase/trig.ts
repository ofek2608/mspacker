// sin & cos (a dot on a circle), atan2 (a pointer that follows you) and a wall of function graphs.
import { $ } from "#mc";
import { abs, add, cos as tableCos, mul, min, sin as tableSin, STORAGE, stored, sub, type Num } from "../math/expr.js";
import { forLoop } from "../math/io.js";
import { atan, atan2, cos, exp, ln, sin, tanh } from "../math/trig.js";
import { animate, argb, bar, COLOR, cube, decimal, dot, Dot, label, moveTo, setEntityFloat, setText, store, textDisplay, transform } from "./ui.js";

const at = stored;
const hex = (rgb: number) => `#${rgb.toString(16).padStart(6, "0")}`;

// ---------------------------------------------------------------- sin & cos, at x = 20.5
// The circle stands in the y-z plane, facing spawn: y from 67 to 73, z from -2.5 to 3.5, the sin bar
// at z = 4.7 and the cos bar along y = 65.8. Text above it all.

const SC = { x: 20.5, y: 70, z: 0.5, r: 3 };

export function buildSinCos() {
  label(SC.x, SC.y + SC.r + 2.3, SC.z, "sin & cos");
  textDisplay("sc_text", SC.x, SC.y + SC.r + 0.8, SC.z);
  // The circle, drawn at build time.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    dot("sc_ring", SC.x, SC.y + SC.r * Math.sin(a), SC.z + SC.r * Math.cos(a), COLOR.gray, 0.08);
  }
  cube("sc_dot", SC.x, SC.y, SC.z + SC.r, "minecraft:red_concrete", 0.35);
  // sin: a vertical bar on the right; cos: a horizontal bar below.
  bar("sc_sin", SC.x, SC.y, SC.z + SC.r + 1.2, "minecraft:lime_concrete", 0.25, 0);
  // Lies along z: its length (scale[2]) moves, its height stays the bar's width.
  bar("sc_cos", SC.x, SC.y - SC.r - 1.2, SC.z, "minecraft:light_blue_concrete", 0.25, 0.25);
}

export function tickSinCos() {
  // t goes around once every ~6 seconds.
  store("showcase.t", mod2pi(add(at("showcase.t"), 0.05)));
  sin(at("showcase.t"), "showcase.sin");
  cos(at("showcase.t"), "showcase.cos");
  const [s, c] = [at("showcase.sin"), at("showcase.cos")];
  moveTo("sc_dot", SC.x, add(SC.y, mul(SC.r, s)), add(SC.z, mul(SC.r, c)));
  // Bars grow from the axis: height |r·sin|, starting at min(0, r·sin).
  setEntityFloat("sc_sin", "transformation.scale[1]", abs(mul(SC.r, s)));
  setEntityFloat("sc_sin", "transformation.translation[1]", min(0, mul(SC.r, s)));
  animate("sc_sin");
  setEntityFloat("sc_cos", "transformation.scale[2]", abs(mul(SC.r, c)));
  setEntityFloat("sc_cos", "transformation.translation[2]", min(0, mul(SC.r, c)));
  animate("sc_cos");
  // The game's own sin reads a table: compare.
  store("showcase.table_sin", tableSin(at("showcase.t")));
  store("showcase.table_cos", tableCos(at("showcase.t")));
  setText("sc_text", "t = ", decimal(at("showcase.t"), 2), "\\nsin t = ", decimal(s, 6), "   (game's table: ", decimal(at("showcase.table_sin"), 6),
    ")\\ncos t = ", decimal(c, 6), "   (game's table: ", decimal(at("showcase.table_cos"), 6), ")");
}

const TAU = 2 * Math.PI;
const mod2pi = (x: Num) => ({ type: "minecraft:mod", left: x, right: TAU });

// ---------------------------------------------------------------- atan2, at (14.5, 14.5)
// The pointer turns within 2 blocks of the station, at y = 66; text above.

const AT = { x: 14.5, y: 65, z: 14.5 };

export function buildAtan2() {
  label(AT.x, AT.y + 3.4, AT.z, "atan2: points at you");
  $.summon("block_display", `${AT.x} ${AT.y + 1} ${AT.z}`, {
    Tags: ["showcase", "at_arrow"],
    block_state: "minecraft:orange_concrete",
    teleport_duration: 2,
    transformation: transform([0.16, 0.16, 2], [-0.08, -0.08, 0]),
  });
  cube("at_base", AT.x, AT.y + 1, AT.z, "minecraft:black_concrete", 0.4);
  // The 0° direction of atan2(dz, dx) is +x: a thin line just below the pointer, so you can see the angle.
  $.summon("block_display", `${AT.x} ${AT.y + 0.85} ${AT.z}`, {
    Tags: ["showcase"],
    block_state: "minecraft:cyan_concrete",
    transformation: transform([2.2, 0.05, 0.05], [0, -0.025, -0.025]),
  });
  label(AT.x + 2.5, AT.y + 0.75, AT.z, "0°", { text: { text: "0°", color: hex(COLOR.cyan) } });
  textDisplay("at_text", AT.x, AT.y + 2.3, AT.z);
}

export function tickAtan2() {
  // The nearest player's position, relative to the station.
  $.execute.positioned(`${AT.x} ${AT.y} ${AT.z}`).as("@p[distance=..48]").run.data.modify.storage(STORAGE, "showcase.player").set.from.entity("@s", "Pos");
  const dx = sub(at("showcase.player[0]"), AT.x);
  const dz = sub(at("showcase.player[2]"), AT.z);
  atan2(dz, dx, "showcase.angle");
  store("showcase.angle_deg", mul(at("showcase.angle"), 180 / Math.PI));
  // Minecraft's yaw is 0 facing +z and turns the other way: yaw = angle - 90°.
  setEntityFloat("at_arrow", "Rotation[0]", sub(at("showcase.angle_deg"), 90));
  setText("at_text", "atan2(dz, dx) = ", decimal(at("showcase.angle_deg"), 1), "°");
}

// ---------------------------------------------------------------- function graphs, at z = 22.5
// x from -5.8 to 6.8, y from 66.6 to 72.7 (exp's top); the legend and title above.

const GRAPH = { x: 0.5, y: 69, z: 22.5, sx: 2, sy: 1.5, samples: 48 };
const step = (2 * Math.PI) / GRAPH.samples;

/** Plot y = f(x) for sample indexes from..to - 1 (x = -π + i·step). */
function curve(color: number, f: (x: Num, path: string) => void, from: number, to: number) {
  forLoop("i", to, {}, (a) => {
    store("graph.x", add(-Math.PI, mul(a.i, step)));
    f(at("graph.x"), "graph.y");
    // Seen from spawn (looking +z), +x is on the left, so mirror x.
    $.data.modify.storage(STORAGE, "ui.dot").set.value({ color: argb(color), tag: "graph" });
    store("ui.dot.x", sub(GRAPH.x, mul(GRAPH.sx, at("graph.x"))));
    store("ui.dot.y", add(GRAPH.y, mul(GRAPH.sy, at("graph.y"))));
    store("ui.dot.z", GRAPH.z);
    $.function(Dot).with.storage(STORAGE, "ui.dot");
  }, from);
}

export function buildGraphs() {
  label(GRAPH.x, GRAPH.y + 6, GRAPH.z, "graphs");
  label(GRAPH.x, GRAPH.y + 4.9, GRAPH.z, "sin  tanh  atan  exp  ln", { text: [
    { text: "sin  ", color: hex(COLOR.red) }, { text: "tanh  ", color: hex(COLOR.green) }, { text: "atan  ", color: hex(COLOR.blue) },
    { text: "exp  ", color: hex(COLOR.yellow) }, { text: "ln", color: hex(COLOR.magenta) },
  ] });
  // Axes.
  $.summon("block_display", `${GRAPH.x - Math.PI * GRAPH.sx} ${GRAPH.y} ${GRAPH.z}`, {
    Tags: ["showcase"], block_state: "minecraft:gray_concrete",
    transformation: transform([2 * Math.PI * GRAPH.sx, 0.04, 0.04], [0, -0.02, 0]),
  });
  $.summon("block_display", `${GRAPH.x} ${GRAPH.y - 3} ${GRAPH.z}`, {
    Tags: ["showcase"], block_state: "minecraft:gray_concrete",
    transformation: transform([0.04, 6, 0.04], [-0.02, 0, 0]),
  });
  const all = GRAPH.samples + 1;
  curve(COLOR.red, sin, 0, all);
  curve(COLOR.green, tanh, 0, all);
  curve(COLOR.blue, atan, 0, all);
  // exp up to x ≈ 0.9 (y ≈ 2.5), ln from x ≈ 0.2.
  curve(COLOR.yellow, exp, 0, Math.floor((0.9 + Math.PI) / step) + 1);
  curve(COLOR.magenta, ln, Math.ceil((0.2 + Math.PI) / step), all);
}
