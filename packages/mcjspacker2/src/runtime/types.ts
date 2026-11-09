/** Static argument types used by the generated command library. */
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
export type Vec3 = Position;

export type BlockCoord = WorldCoord;
/** `"x y z"` block position, e.g. `"~ ~-1 ~"` or `"0 64 0"`. */
export type BlockPos = Position;

/** `"x z"`. Two-coordinate arguments don't accept local coordinates. */
export type Vec2 = `${WorldCoord} ${WorldCoord}`;
export type ColumnPos = `${WorldCoord} ${WorldCoord}`;

export type RotationCoord = `${number}` | `~${number}` | "~";
/** `"yaw pitch"`, e.g. `"90 0"` or `"~ ~"`. */
export type Rotation = `${RotationCoord} ${RotationCoord}`;

export type SelectorBase = "@a" | "@e" | "@p" | "@r" | "@s" | "@n";
/** Target selector (`@e[type=pig]`), player name or UUID. */
export type Selector = SelectorBase | `${SelectorBase}[${string}]` | (string & {});
export type ScoreHolder = Selector | "*";

/** Number range: `5`, `1..`, `..10`, `1..10`. */
export type Range = number | `${number}` | `${number}..` | `..${number}` | `${number}..${number}`;

/** Ticks, or a number with a unit suffix: `20`, `1s`, `0.5d`, `20t`. */
export type Duration = number | `${number}` | `${number}${"d" | "s" | "t"}`;

/** Text component in SNBT form. */
export type TextComponent = string | TextComponentObject | TextComponent[];
export interface TextComponentObject {
  text?: string;
  translate?: string;
  with?: TextComponent[];
  score?: { name: string; objective: string };
  selector?: string;
  keybind?: string;
  nbt?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
  font?: string;
  insertion?: string;
  extra?: TextComponent[];
  click_event?: NbtCompound;
  hover_event?: NbtCompound;
  [key: string]: NbtValue | undefined;
}

/** Text component for versions before 1.21.5 (JSON form, camelCase event keys). */
export type LegacyTextComponent = string | LegacyTextComponentObject | LegacyTextComponent[];
export interface LegacyTextComponentObject {
  text?: string;
  translate?: string;
  with?: LegacyTextComponent[];
  score?: { name: string; objective: string };
  selector?: string;
  keybind?: string;
  nbt?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
  font?: string;
  insertion?: string;
  extra?: LegacyTextComponent[];
  clickEvent?: { action: string; value: string };
  hoverEvent?: { action: string; value?: unknown; contents?: unknown };
  [key: string]: unknown;
}

/** A TS function (recorded into its own mcfunction) or a function id / `#tag` string. */
export type FnRef = ((...args: never[]) => unknown) | string;

export type EntityAnchor = "eyes" | "feet";
export type GameModeId = "survival" | "creative" | "adventure" | "spectator";
export type Heightmap = "world_surface" | "motion_blocking" | "motion_blocking_no_leaves" | "ocean_floor";
export type Operation = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "<" | ">" | "><";
export type TemplateMirror = "none" | "front_back" | "left_right";
export type TemplateRotation = "none" | "clockwise_90" | "counterclockwise_90" | "180";
export type Swizzle = "x" | "y" | "z" | "xy" | "xz" | "yz" | "xyz" | (string & {});
export type ChatColor =
  | "black" | "dark_blue" | "dark_green" | "dark_aqua" | "dark_red" | "dark_purple" | "gold" | "gray"
  | "dark_gray" | "blue" | "green" | "aqua" | "red" | "light_purple" | "yellow" | "white" | "reset";
export type ScoreboardSlot = "list" | "sidebar" | "below_name" | `sidebar.team.${ChatColor}`;
/** Scoreboard slots before 1.20.2 (`belowName`). */
export type LegacyScoreboardSlot = "list" | "sidebar" | "belowName" | `sidebar.team.${ChatColor}`;
export type Dimension = "overworld" | "the_nether" | "the_end" | `minecraft:${"overworld" | "the_nether" | "the_end"}` | (string & {});
