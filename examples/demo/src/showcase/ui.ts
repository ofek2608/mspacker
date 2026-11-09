// Entities for the showcase: labels, dots, bars and buttons. Everything gets the "showcase" tag, so
// the reset can remove it all.
import { $, macro, nbt, type Macro, type NbtCompound } from "#mc";
import { abs, add, floatIn, floorDiv, floorMod, mul, round, STORAGE, stored, toInt, type Num, type Path } from "../math/expr.js";
import { onlyIf, setFloat, setInt } from "../math/io.js";

export const DIMENSION = "demo:showcase";
export const TAG = "showcase";
/** Floor height: stations stand on y = 65. */
export const FLOOR = 64;

export const transform = (scale: [number, number, number], translation: [number, number, number] = [0, 0, 0]) => ({
  translation: translation.map((v) => nbt.float(v)),
  left_rotation: [nbt.float(0), nbt.float(0), nbt.float(0), nbt.float(1)],
  scale: scale.map((v) => nbt.float(v)),
  right_rotation: [nbt.float(0), nbt.float(0), nbt.float(0), nbt.float(1)],
});

const tags = (...extra: string[]) => [TAG, ...extra];
const pos = (x: number, y: number, z: number) => `${x} ${y} ${z}` as const;

/** A floating text that always faces the player. */
export function label(x: number, y: number, z: number, text: string, extra: NbtCompound = {}) {
  $.summon("text_display", pos(x, y, z), {
    Tags: tags(),
    text: { text, color: "gold", bold: true },
    billboard: "center",
    background: 0,
    ...extra,
  });
}

/** A text that changes: update it with `setText(tag, ...)`. */
export function textDisplay(tag: string, x: number, y: number, z: number, text = "") {
  $.summon("text_display", pos(x, y, z), {
    Tags: tags(tag),
    text,
    billboard: "center",
    line_width: 400,
    background: nbt.int(0x60000000),
  });
}

/** Colors for squares, as 0xRRGGBB. */
export const COLOR = {
  red: 0xe5383b, orange: 0xf48c06, yellow: 0xffd60a, lime: 0x80ed99, green: 0x2d9b49, cyan: 0x4cc9f0,
  blue: 0x4361ee, purple: 0x9d4edd, magenta: 0xf72585, brown: 0x8d5524, gray: 0x8d99ae, white: 0xf8f9fa,
} as const;

/** A text display background color: opaque ARGB as a signed int. */
export const argb = (rgb: number) => nbt.int((0xff000000 | rgb) | 0);

/**
 * A colored square made from a text display: the background of " " is 5 × 10 text pixels (1/40 block
 * each), so a scale of (8s, 4s) makes it s × s, and (-0.1s, -0.5s) centers it on the entity.
 */
const square = (size: number) => transform([8 * size, 4 * size, 1], [-0.1 * size, -0.5 * size, 0]);

const squareData = (size: number, color: number) => ({
  text: " ",
  background: argb(color),
  billboard: "center",
  brightness: { sky: 15, block: 15 },
  teleport_duration: 1,
  transformation: square(size),
});

/** A square that always faces you. Move it with `moveTo` (its position, not its translation). */
export function dot(tag: string, x: number, y: number, z: number, color: number, size = 0.2) {
  $.summon("text_display", pos(x, y, z), { Tags: tags(tag), ...squareData(size, color) });
}

/** A solid 3D cube centered on its position. Move it with `moveTo`. */
export function cube(tag: string, x: number, y: number, z: number, block: string, size = 0.3) {
  $.summon("block_display", pos(x, y, z), {
    Tags: tags(tag),
    block_state: block,
    teleport_duration: 1,
    transformation: transform([size, size, size], [-size / 2, -size / 2, -size / 2]),
  });
}

/** Move entity `tag` to a position worked out in game; `teleport_duration` smooths it. */
export function moveTo(tag: string, x: Num, y: Num, z: Num) {
  setEntityFloat(tag, "Pos[0]", x);
  setEntityFloat(tag, "Pos[1]", y);
  setEntityFloat(tag, "Pos[2]", z);
}

/** A box anchored at its bottom center; set its height with `scale[1]`. */
export function bar(tag: string, x: number, y: number, z: number, block: string, width = 0.3, height = 1) {
  $.summon("block_display", pos(x, y, z), {
    Tags: tags(tag),
    block_state: block,
    interpolation_duration: 2,
    transformation: transform([width, height, width], [-width / 2, 0, -width / 2]),
  });
}

/**
 * A clickable button for a station standing on `y`: its label floats at y + 0.9, and the (invisible)
 * interaction entity tagged `tag` starts right at the label and reaches `height` blocks up, so
 * clicking the label or a result shown above it both count.
 */
export function button(tag: string, x: number, y: number, z: number, text: string, height = 3) {
  $.summon("text_display", pos(x, y + 0.9, z), {
    Tags: tags(),
    text: { text: `[ ${text} ]`, color: "aqua" },
    billboard: "center",
  });
  $.summon("interaction", pos(x, y + 0.8, z), { Tags: tags(tag), width: nbt.float(1.5), height: nbt.float(height), response: true });
}

/** Run `onClick` (as the interaction entity) whenever button `tag` is clicked. */
export function whenClicked(tag: string, onClick: () => void) {
  $.execute.as(`@e[type=interaction,tag=${tag}]`).if.data.entity("@s", "interaction").run.function(() => {
    $.data.remove.entity("@s", "interaction");
    onClick();
  });
}

/** The one entity tagged `tag` (the tag may come from macro arguments). */
const tagged = (tag: Path) => macro`@e[tag=${tag},limit=1]`;

/** Set one entity's NBT `path` (a float) from an expression. */
export function setEntityFloat(tag: Path, path: string, value: Num) {
  $.data.modify.entity(tagged(tag), path).set.compute.default.float(value);
}

/** Start interpolating to the new transformation this tick. */
export function animate(tag: Path) {
  $.data.modify.entity(tagged(tag), "start_interpolation").set.value(0);
}

export type Part = string | { path: string };

let formats = 0;
/**
 * A number for display, like `-0.8415`: parts for `setText`. (A float would show as `-.841471076011658`.)
 * Rounds |value| to `digits` decimals, then writes sign, whole part and the decimals as text, padded
 * with zeros by adding 10^digits and dropping the leading 1.
 */
export function decimal(value: Num, digits = 4): Part[] {
  const key = `ui.fmt.n${formats++}`;
  const scale = 10 ** digits;
  setInt(`${key}.scaled`, toInt(round(mul(abs(value), scale))));
  $.data.modify.storage(STORAGE, `${key}.sign`).set.value("");
  onlyIf(floatIn(value, { max: -0.5 / scale })).run.data.modify.storage(STORAGE, `${key}.sign`).set.value("-");
  setInt(`${key}.whole`, floorDiv(stored(`${key}.scaled`), scale));
  setInt(`${key}.decimals`, add(floorMod(stored(`${key}.scaled`), scale), scale));
  $.data.modify.storage(STORAGE, `${key}.text`).set.string.storage(STORAGE, `${key}.decimals`, 1);
  return [{ path: `${key}.sign` }, { path: `${key}.whole` }, ...(digits > 0 ? [".", { path: `${key}.text` }] : [])];
}

/** setText(tag, "x = ", { path: "showcase.x" }, ...decimal(...)): text from fixed parts and storage values. */
export function setText(tag: string, ...given: (Part | Part[])[]) {
  const parts = given.flat();
  const keys = parts.map((_, i) => `p${i}`);
  $.data.modify.storage(STORAGE, "ui.text").set.value({ tag });
  parts.forEach((p, i) => {
    if (typeof p === "string") $.data.modify.storage(STORAGE, `ui.text.${keys[i]}`).set.value(p);
    else $.data.modify.storage(STORAGE, `ui.text.${keys[i]}`).set.from.storage(STORAGE, p.path);
  });
  $.function(joinText(parts.length)).with.storage(STORAGE, "ui.text");
}

/** Macro functions that join p0..pN into one text, one per part count. */
const joiners = new Map<number, (args: Macro<string>) => void>();
function joinText(count: number) {
  if (!joiners.has(count)) {
    joiners.set(count, (args: Macro<string>) => {
      // macro`...` joins macro arguments into text, so fold the parts into one.
      const text = Array.from({ length: count }, (_, i) => args[`p${i}`]!).reduce((all, part) => macro`${all}${part}`);
      $.data.modify.entity(tagged(args.tag!), "text").set.value(macro`"${text}"`);
    });
  }
  return joiners.get(count)!;
}

/** A square at a position worked out in game: x/y/z/color/tag from storage `with` (color: ARGB int). */
export function Dot(args: Macro<"x" | "y" | "z" | "color" | "tag">) {
  $.summon("text_display", macro`${args.x} ${args.y} ${args.z}`, { Tags: [TAG, args.tag.quoted], ...squareData(0.15, 0), background: args.color });
}

/** setblock at a position worked out in game (x/y/z/block from storage `with`). */
export function Plot(args: Macro<"x" | "y" | "z" | "block">) {
  $.setblock(macro`${args.x} ${args.y} ${args.z}`, args.block);
}

/** Write `demo:math <path>` as a float; a shorter name for the stations. */
export const store = setFloat;
