// Static argument types used by the generated command library.
import type { NbtCompound, NbtValue } from "./nbt.js";

export type { NbtCompound, NbtValue };

/** Absolute (`5`) or relative (`~5`) coordinate. */
export type WorldCoord = `${number}` | `~${number}` | "~";
/** Local coordinate (`^5`), relative to the executor's rotation. */
export type LocalCoord = `^${number}` | "^";
/** Any single coordinate. Positions can't mix local with world coordinates. */
export type PositionCoord = WorldCoord | LocalCoord;
/** `"x y z"`: all world coordinates (`"~ ~1 5"`) or all local ones (`"^ ^ ^1"`); Minecraft rejects a mix. */
export type Position = `${WorldCoord} ${WorldCoord} ${WorldCoord}` | `${LocalCoord} ${LocalCoord} ${LocalCoord}`;
/** `"x y z"` position, e.g. `"~ ~1 ~"`, `"0 64 0.5"` or `"^ ^ ^2"`. */
export type Vec3 = Position;

/** One block coordinate: absolute (`5`) or relative (`~5`). */
export type BlockCoord = WorldCoord;
/** `"x y z"` block position, e.g. `"~ ~-1 ~"` or `"0 64 0"`. */
export type BlockPos = Position;

/** `"x z"`. Two-coordinate arguments don't accept local coordinates. */
export type Vec2 = `${WorldCoord} ${WorldCoord}`;
/** `"x z"` column of the world, e.g. `"0 0"` or `"~ ~"`. */
export type ColumnPos = `${WorldCoord} ${WorldCoord}`;

/** One angle in degrees: absolute (`90`) or relative to the executor (`~10`). */
export type RotationCoord = `${number}` | `~${number}` | "~";
/** `"yaw pitch"`, e.g. `"90 0"` or `"~ ~"`. */
export type Rotation = `${RotationCoord} ${RotationCoord}`;

/** The selector letters: all players, all entities, nearest player, random player, yourself, nearest entity. */
export type SelectorBase = "@a" | "@e" | "@p" | "@r" | "@s" | "@n";
/** Target selector (`@e[type=pig]`), player name or UUID. */
export type Selector = SelectorBase | `${SelectorBase}[${string}]` | (string & {});
/** Who holds a score: a selector, a name (including fake names like `#counter`), or `*` for everyone. */
export type ScoreHolder = Selector | "*";

/** Number range: `5`, `1..`, `..10`, `1..10`. */
export type Range = number | `${number}` | `${number}..` | `..${number}` | `${number}..${number}`;

/** Ticks, or a number with a unit suffix: `20`, `1s`, `0.5d`, `20t`. */
export type Duration = number | `${number}` | `${number}${"d" | "s" | "t"}`;

/** Text component (1.21.5+): plain text, an object with styling, or a list of them. */
export type TextComponent = string | TextComponentObject | TextComponent[];
/**
 * A styled text component (1.21.5+): any NBT compound, so every field the game knows works, also
 * ones added in newer versions (like icons: `{type: "object", sprite: "item/diamond"}`). The common
 * fields below are suggested and checked.
 */
export type TextComponentObject = NbtCompound & TextHints;
/** The common fields of a text component, for suggestions; any other field works too. */
export interface TextHints {
  /** Plain text. */
  text?: string;
  /** A translation key, shown in the player's language. */
  translate?: string;
  /** Values for the `%s` placeholders of `translate`. */
  with?: TextComponent[];
  /** Shows a score: holder `name` (a selector or name) in `objective`. */
  score?: { name: string; objective: string };
  /** Shows the names of the entities a selector finds. */
  selector?: string;
  /** Shows the key bound to a control, e.g. `key.jump`. */
  keybind?: string;
  /** An NBT path; shows the value it points to (with `block`, `entity` or `storage`). */
  nbt?: string;
  /** A named color (`gold`) or `#RRGGBB`. */
  color?: ChatColor | `#${string}`;
  /** Bold text. */
  bold?: boolean;
  /** Italic text. */
  italic?: boolean;
  /** Underlined text. */
  underlined?: boolean;
  /** Struck-through text. */
  strikethrough?: boolean;
  /** Randomly changing characters. */
  obfuscated?: boolean;
  /** A font id, e.g. `minecraft:alt`. */
  font?: string;
  /** Text put into the chat box when shift-clicked. */
  insertion?: string;
  /** More components appended after this one, inheriting its style. */
  extra?: TextComponent[];
  /** What happens on click, e.g. `{action: "run_command", command: "/say hi"}`. */
  click_event?: NbtCompound;
  /** What shows on hover, e.g. `{action: "show_text", value: "hi"}`. */
  hover_event?: NbtCompound;
}

/**
 * Text component before 1.21.5, written as JSON: plain text, an object, or a list of them. Fields
 * aren't checked; see the [text component format](https://minecraft.wiki/w/Text_component_format)
 * for your version (`{text: "hi", color: "gold", clickEvent: {action: "run_command", value: "/say hi"}}`).
 * To write JSON yourself, pass `nbt.raw('{"text":"hi"}')`.
 */
export type LegacyTextComponent = string | { [key: string]: unknown } | LegacyTextComponent[];

/** A TS function (recorded into its own mcfunction) or a function id / `#tag` string. */
export type FnRef = ((...args: never[]) => unknown) | string;

/** Which point of an entity to use: its eyes or its feet. */
export type EntityAnchor = "eyes" | "feet";
/** A game mode. */
export type GameModeId = "survival" | "creative" | "adventure" | "spectator";
/** Which surface a heightmap measures (`execute positioned over`). */
export type Heightmap = "world_surface" | "motion_blocking" | "motion_blocking_no_leaves" | "ocean_floor";
/** `scoreboard players operation` operators: assign, arithmetic, min (`<`), max (`>`) and swap (`><`). */
export type Operation = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<" | ">" | "><";
/** How a structure template is mirrored. */
export type TemplateMirror = "none" | "front_back" | "left_right";
/** How a structure template is rotated. */
export type TemplateRotation = "none" | "clockwise_90" | "counterclockwise_90" | "180";
/** A set of axes for `execute align`, like `xz` or `xyz`. */
export type Swizzle = "x" | "y" | "z" | "xy" | "xz" | "yz" | "xyz" | (string & {});
/** A named text color. */
export type ChatColor =
  | "black" | "dark_blue" | "dark_green" | "dark_aqua" | "dark_red" | "dark_purple" | "gold" | "gray"
  | "dark_gray" | "blue" | "green" | "aqua" | "red" | "light_purple" | "yellow" | "white" | "reset";
/** Where a scoreboard objective is shown (1.20.2+). */
export type ScoreboardSlot = "list" | "sidebar" | "below_name" | `sidebar.team.${ChatColor}`;
/** Scoreboard slots before 1.20.2 (`belowName`). */
export type LegacyScoreboardSlot = "list" | "sidebar" | "belowName" | `sidebar.team.${ChatColor}`;
/** A dimension id, with or without `minecraft:`; data pack dimensions as plain strings. */
export type Dimension = "overworld" | "the_nether" | "the_end" | `minecraft:${"overworld" | "the_nether" | "the_end"}` | (string & {});
