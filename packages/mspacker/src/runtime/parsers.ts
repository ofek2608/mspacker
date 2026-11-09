/**
 * ARGUMENT TYPE REGISTRY.
 *
 * One entry per brigadier parser id found in commands.json. Each entry defines:
 *   - type:      the TS type expression used in generated signatures
 *   - test:      runtime check used to pick between sibling arguments
 *   - serialize: how a value becomes command text
 *   - examples:  sample values; the version matrix "probe" turns every command path into a test
 *                command built from these and checks the real server accepts it
 *
 * Every function receives a ParserContext, so an entry can change with the game version (argument
 * formats sometimes change while the parser id stays the same).
 *
 * Projects can add or override entries with `parsers` in mcjs2.config.ts (see defineParser).
 * Unknown parsers fall back to `string`.
 */
import { nbtKind, snbt, quoteString, type NbtValue, type RawSnbt } from "./nbt.js";
import { fnId } from "./state.js";
import { MacroError } from "./macro.js";

/** An argument type's settings from `commands.json` (like `{ type: "players" }` for entities). */
export type Props = Record<string, unknown> | undefined;

/** What argument types know about the version being built. */
export interface ParserContext {
  /** Minecraft version id, e.g. "1.21.4". */
  version: string;
  /** Data pack format (major), e.g. 61 for 1.21.4. Use this for version checks. */
  packFormat: number;
  /** True when the registry (e.g. "minecraft:block") has generated id unions (codegen only). */
  hasRegistry(registry: string): boolean;
  /** Some ids of a registry from registries.json, for examples (codegen/probe only). */
  registryIds(registry: string): string[];
}

/** A command argument type: how it's typed in TypeScript, recognized and written. */
export interface ParserDef {
  /** The TypeScript type in generated signatures, e.g. `"Selector"`. */
  type(props: Props, ctx: ParserContext): string;
  /** Whether a value fits this argument (picks between arguments at the same place). */
  test(value: unknown, props: Props, ctx: ParserContext): boolean;
  /** The command text for a value. Throw to reject it with a message. */
  serialize(value: unknown, props: Props, ctx: ParserContext): string;
  /** How a macro argument (`text` is `$(name)`) is written; as-is when missing. */
  macro?(text: string, props: Props, ctx: ParserContext): string;
  /** Sample values for the version matrix's parser probe. */
  examples?(props: Props, ctx: ParserContext): unknown[];
}

/** User-facing parser definition: every field optional; `type` may be a plain string. */
export interface UserParserDef {
  /** The TypeScript type in generated signatures (re-run `mcjs2 gen` after changing it). */
  type?: string | ((props: Props, ctx: ParserContext) => string);
  /** Whether a value fits this argument. */
  test?(value: unknown, props: Props, ctx: ParserContext): boolean;
  /** The command text for a value. */
  serialize?(value: unknown, props: Props, ctx: ParserContext): string;
  /** How a macro argument (`text` is `$(name)`) is written; as-is when missing. */
  macro?(text: string, props: Props, ctx: ParserContext): string;
  /** Sample values for the version matrix's parser probe. */
  examples?: unknown[] | ((props: Props, ctx: ParserContext) => unknown[]);
}

// ---------------------------------------------------------------- version thresholds (data pack format)

/** 1.20.2 renamed the `belowName` scoreboard slot to `below_name`. */
export const FORMAT_BELOW_NAME = 18;
/** 1.21.5 (25w02a) switched text components in commands from JSON to SNBT, with snake_case event keys. */
export const FORMAT_SNBT_TEXT = 62;

// ---------------------------------------------------------------- helpers

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown) => typeof v === "object" && v !== null;

const str = (type: string, examples: unknown[] = ["probe"]): ParserDef => ({
  type: () => type,
  test: isStr,
  serialize: (v) => String(v),
  examples: () => examples,
});

const COORD = /^(?:[~^](?:-?(?:\d+\.?\d*|\.\d+))?|-?(?:\d+\.?\d*|\.\d+))$/;

/** Split a `"x y z"` coordinate string; null if it isn't `n` coordinates. */
function splitCoords(v: unknown, n: number): string[] | null {
  if (!isStr(v)) return null;
  const parts = v.trim().split(/\s+/);
  return parts.length === n && parts.every((p) => COORD.test(p)) ? parts : null;
}

/**
 * Selectors, player names and UUIDs. Rejects strings that look like coordinates (`"~ ~1 ~"`), so sibling arguments such
 * as `tp <targets> <destination>` vs `tp <targets> <location>` resolve by content.
 */
const target = (type: string, examples: unknown[] = ["@s"]): ParserDef => ({
  ...str(type, examples),
  test: (v) => isStr(v) && (v.startsWith("@") || !/^[~^]|\s/.test(v)),
});

function coords(n: number, type: string, allowLocal: boolean, examples: string[]): ParserDef {
  return {
    type: () => type,
    test: (v) => splitCoords(v, n) !== null,
    serialize: (v) => {
      const parts = splitCoords(v, n);
      if (!parts) throw new Error(`Expected ${n} coordinates like "${examples[0]}", got ${JSON.stringify(v)}.`);
      checkLocalCoords(parts, allowLocal);
      return parts.join(" ");
    },
    examples: () => examples,
  };
}

/** Throws on positions Minecraft would reject: mixed `^`/world coords, or `^` where it's unsupported. */
export function checkLocalCoords(coords: string[], allowLocal: boolean): void {
  const local = coords.filter((c) => c.startsWith("^")).length;
  if (!local) return;
  const text = coords.join(" ");
  if (!allowLocal) throw new Error(`Local coordinates (^) are not allowed here: "${text}".`);
  if (local !== coords.length) {
    throw new Error(`Cannot mix local coordinates and world coordinates together: "${text}". Use all ^ or none.`);
  }
}

function idType(registry: string, ctx: ParserContext, extra = ""): string {
  const key = registry.replace(/^minecraft:/, "");
  return (ctx.hasRegistry(registry) ? `Id<${JSON.stringify(key)}>` : "(string & {})") + extra;
}

/** Example ids for registries that registries.json doesn't list (data-driven/dynamic ones). */
const DYNAMIC_REGISTRY_EXAMPLES: Record<string, string> = {
  "minecraft:worldgen/biome": "minecraft:plains",
  "minecraft:worldgen/structure": "minecraft:village_plains",
  "minecraft:worldgen/configured_feature": "minecraft:oak",
  "minecraft:worldgen/placed_feature": "minecraft:oak",
  "minecraft:worldgen/template_pool": "minecraft:village/plains/town_centers",
  "minecraft:worldgen/structure_set": "minecraft:villages",
  "minecraft:advancement": "minecraft:story/root",
  "minecraft:recipe": "minecraft:stick",
  "minecraft:damage_type": "minecraft:generic",
  "minecraft:enchantment": "minecraft:sharpness",
  "minecraft:dimension": "minecraft:overworld",
  "minecraft:dimension_type": "minecraft:overworld",
  "minecraft:trim_material": "minecraft:gold",
  "minecraft:trim_pattern": "minecraft:coast",
  "minecraft:jukebox_song": "minecraft:cat",
  "minecraft:painting_variant": "minecraft:kebab",
  "minecraft:wolf_variant": "minecraft:pale",
  "minecraft:banner_pattern": "minecraft:stripe_top",
  "minecraft:test_instance": "minecraft:probe",
  "minecraft:test_environment": "minecraft:default",
  "minecraft:dialog": "minecraft:server_links",
  "minecraft:timeline": "minecraft:day",
  "minecraft:world_clock": "minecraft:overworld",
};

function exampleId(registry: string, ctx: ParserContext, fallback?: string): string {
  return ctx.registryIds(registry)[0] ?? DYNAMIC_REGISTRY_EXAMPLES[registry] ?? fallback ?? "minecraft:probe";
}

const resourceId = (extra: string, registryOverride?: string, preferred?: string): ParserDef => ({
  type: (p, ctx) => idType(registryOverride ?? String(p?.registry ?? ""), ctx, extra),
  test: isStr,
  serialize: (v) => String(v),
  examples: (p, ctx) => {
    const registry = registryOverride ?? String(p?.registry ?? "");
    const ids = ctx.registryIds(registry);
    return [preferred && ids.includes(preferred) ? preferred : exampleId(registry, ctx, preferred)];
  },
});

const UNQUOTED = /^[0-9A-Za-z_\-.+]+$/;

const numberDef = (integer: boolean): ParserDef => ({
  type: () => "number",
  test: (v) => isNum(v) && (!integer || Number.isInteger(v)),
  serialize: (v) => String(v),
  examples: (p) => {
    const min = typeof p?.min === "number" ? p.min : undefined;
    const max = typeof p?.max === "number" ? p.max : undefined;
    let v = min !== undefined ? Math.max(min, 1) : 1;
    if (max !== undefined) v = Math.min(v, max);
    if (!integer && min === undefined && max === undefined) v = 1.5;
    return [integer ? Math.ceil(v) : v];
  },
});

const nbtDef = (type: string, test: (v: unknown) => boolean, examples: unknown[]): ParserDef => ({
  type: () => type,
  test,
  serialize: (v) => snbt(v as NbtValue),
  examples: () => examples,
});

/** True if the value uses typed NBT wrappers (nbt.byte, ...), which need SNBT. */
function hasTypedNbt(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  if (Object.getOwnPropertySymbols(v).length) return true;
  return Object.values(v).some(hasTypedNbt);
}

/**
 * Text components before FORMAT_SNBT_TEXT: JSON. Macro arguments go in as JSON strings ("$(name)",
 * through their toJSON); `nbt.raw(...)` as the whole value is JSON written by hand.
 */
function legacyTextJson(v: unknown): string {
  if (nbtKind(v) === "raw") return (v as RawSnbt).text;
  return JSON.stringify(v, (_key, value: unknown) => {
    if (typeof value === "bigint" || nbtKind(value) === "num" || nbtKind(value) === "arr") {
      throw new MacroError("NBT number types (nbt.int, ...) don't exist in text components before 1.21.5. Use a plain number.");
    }
    if (nbtKind(value) === "raw") {
      throw new MacroError("nbt.raw(...) only works as a whole text component before 1.21.5, not inside one.");
    }
    return value;
  });
}

/**
 * Text components: JSON before FORMAT_SNBT_TEXT, SNBT after. On new versions plain values are written
 * as JSON, which is also valid SNBT.
 */
const textComponent: ParserDef = {
  type: (_p, ctx) => (ctx.packFormat >= FORMAT_SNBT_TEXT ? "TextComponent" : "LegacyTextComponent"),
  test: (v) => isStr(v) || isObj(v),
  serialize: (v, _p, ctx) =>
    ctx.packFormat < FORMAT_SNBT_TEXT ? legacyTextJson(v) : hasTypedNbt(v) ? snbt(v as NbtValue) : JSON.stringify(v),
  examples: (_p, ctx) => [
    "probe",
    { text: "probe", color: "red", bold: true, extra: [{ text: "!" }] },
    ctx.packFormat >= FORMAT_SNBT_TEXT
      ? { text: "x", click_event: { action: "run_command", command: "/say hi" }, hover_event: { action: "show_text", value: "hi" } }
      : { text: "x", clickEvent: { action: "run_command", value: "/say hi" }, hoverEvent: { action: "show_text", value: "hi" } },
  ],
};

const idOrInline = (type: string, example: string): ParserDef => ({
  type: () => type,
  test: (v) => isStr(v) || isObj(v),
  serialize: (v) => (isStr(v) ? v : snbt(v as NbtValue)),
  examples: () => [example],
});

/**
 * `compute` number providers (26.x): an id in a data-pack-defined registry, or an inline definition
 * `{type: "minecraft:uniform", min: 1, max: 2}`. A bare number would be read as an id, so numbers are
 * wrapped as `{type: "minecraft:constant", value: n}`.
 */
const numberProvider = (integer: boolean): ParserDef => ({
  type: () => "string | number | NbtCompound",
  test: (v) => isStr(v) || isNum(v) || (isObj(v) && !Array.isArray(v)),
  serialize: (v) => (isStr(v) ? v : snbt((isNum(v) ? { type: "minecraft:constant", value: v } : v) as NbtValue)),
  // A macro argument holds a number, which would be read as an id here.
  macro: (text) => `{type:"minecraft:constant",value:${text}}`,
  examples: () => [integer ? 3 : 1.5, { type: "minecraft:uniform", min: 1, max: 2 }],
});

/**
 * Slot sources (26.x): an id in a data-pack-defined registry, a bare slot range (`container.*`), or an
 * inline definition `{type: "minecraft:slot_range", slots: "container.0"}`.
 */
const slotSource: ParserDef = {
  type: () => "string | NbtCompound",
  test: (v) => isStr(v) || (isObj(v) && !Array.isArray(v)),
  serialize: (v) => (isStr(v) ? v : snbt(v as NbtValue)),
  examples: () => [{ type: "minecraft:slot_range", slots: "container.0" }, "container.*"],
};

const loose = (type: string, examples: unknown[]): ParserDef => ({
  type: () => type,
  test: (v) => isNum(v) || isStr(v),
  serialize: String,
  examples: () => examples,
});

// ---------------------------------------------------------------- registry

/** The built-in argument types, by parser id (`minecraft:vec3`, `brigadier:integer`, ...). */
export const PARSERS: Record<string, ParserDef> = {
  "brigadier:bool": { type: () => "boolean", test: (v) => typeof v === "boolean", serialize: String, examples: () => [true] },
  "brigadier:integer": numberDef(true),
  "brigadier:long": numberDef(true),
  "brigadier:float": numberDef(false),
  "brigadier:double": numberDef(false),
  "brigadier:string": {
    type: () => "string",
    test: isStr,
    serialize: (v, p) => {
      const s = String(v);
      if (p?.type === "phrase") return UNQUOTED.test(s) ? s : quoteString(s);
      return s;
    },
    examples: (p) => (p?.type === "word" ? ["probe"] : ["probe text"]),
  },

  "minecraft:vec3": coords(3, "Vec3", true, ["1 ~ ~1", "^ ^ ^1"]),
  "minecraft:block_pos": coords(3, "BlockPos", true, ["0 64 ~"]),
  "minecraft:vec2": coords(2, "Vec2", false, ["1 ~"]),
  "minecraft:column_pos": coords(2, "ColumnPos", false, ["0 0"]),
  "minecraft:rotation": coords(2, "Rotation", false, ["0 ~"]),

  // Player-only arguments need a selector that can only match players.
  "minecraft:entity": { ...target("Selector"), examples: (p) => [p?.type === "players" ? "@p" : "@s"] },
  "minecraft:game_profile": target("Selector", ["@p"]),
  "minecraft:score_holder": target("ScoreHolder", ["@s"]),
  "minecraft:message": str("string", ["probe text"]),
  "minecraft:uuid": str("string", ["dd12be42-52a9-4a91-a8a1-11c01849e498"]),
  "minecraft:objective": str("string", ["probe"]),
  "minecraft:objective_criteria": str("string", ["dummy"]),
  "minecraft:team": str("string", ["probe"]),
  "minecraft:nbt_path": str("string", ["a.b[0]"]),
  "minecraft:item_slot": str("string", ["container.0"]),
  "minecraft:item_slots": str("string", ["container.*"]),
  "minecraft:slot_source": slotSource,
  "minecraft:hex_color": str("string", ["FF00FF"]),
  "minecraft:resource_location": str("string", ["minecraft:probe"]),
  "minecraft:entity_anchor": str("EntityAnchor", ["eyes"]),
  "minecraft:gamemode": str("GameModeId", ["creative"]),
  "minecraft:heightmap": str("Heightmap", ["world_surface"]),
  "minecraft:operation": str("Operation", ["+="]),
  "minecraft:swizzle": str("Swizzle", ["xz"]),
  "minecraft:team_color": str("ChatColor", ["red"]),
  "minecraft:color": str("ChatColor", ["red"]),
  "minecraft:template_mirror": str("TemplateMirror", ["none"]),
  "minecraft:template_rotation": str("TemplateRotation", ["none"]),
  "minecraft:dimension": str("Dimension", ["overworld"]),
  "minecraft:scoreboard_slot": {
    type: (_p, ctx) => (ctx.packFormat >= FORMAT_BELOW_NAME ? "ScoreboardSlot" : "LegacyScoreboardSlot"),
    test: isStr,
    serialize: String,
    examples: (_p, ctx) => ["sidebar", ctx.packFormat >= FORMAT_BELOW_NAME ? "below_name" : "belowName"],
  },
  "minecraft:swing_animation": str("string", ["whack"]),
  "minecraft:feature": str("string", ["minecraft:oak"]),
  "minecraft:resource_selector": str("string", ["*"]),

  "minecraft:int_range": loose("Range", [3, "1..5"]),
  "minecraft:float_range": loose("Range", ["0.5.."]),
  "minecraft:time": loose("Duration", [20, "1s"]),
  "minecraft:angle": loose("number | RotationCoord", [0]),

  "minecraft:component": textComponent,
  "minecraft:style": {
    type: () => "NbtCompound",
    test: isObj,
    serialize: (v) => (hasTypedNbt(v) ? snbt(v as NbtValue) : JSON.stringify(v)),
    examples: () => [{ color: "red" }],
  },
  "minecraft:nbt_compound_tag": nbtDef("NbtCompound", (v) => isObj(v) && !Array.isArray(v), [{ a: 1, b: "x" }]),
  "minecraft:nbt_tag": nbtDef("NbtValue", (v) => v !== undefined && v !== null, [{ a: 1 }]),

  "minecraft:function": {
    type: () => "FnRef",
    test: (v) => isStr(v) || typeof v === "function",
    serialize: (v) => fnId(v),
    examples: () => ["probe:target"],
  },

  "minecraft:resource": resourceId(""),
  "minecraft:resource_key": resourceId(""),
  "minecraft:resource_or_tag": resourceId(" | `#${string}`"),
  "minecraft:resource_or_tag_key": resourceId(" | `#${string}`"),
  "minecraft:block_state": resourceId("", "minecraft:block", "minecraft:stone"),
  "minecraft:block_predicate": resourceId(" | `#${string}`", "minecraft:block", "minecraft:stone"),
  "minecraft:item_stack": resourceId("", "minecraft:item", "minecraft:diamond"),
  "minecraft:item_predicate": resourceId(' | `#${string}` | "*"', "minecraft:item", "minecraft:diamond"),
  "minecraft:particle": resourceId("", "minecraft:particle_type", "minecraft:flame"),
  "minecraft:loot_table": idOrInline("string | NbtCompound", "minecraft:chests/simple_dungeon"),
  // The probe pack defines probe:p (predicate) and probe:m (item modifier); newer versions check ids at load.
  "minecraft:loot_predicate": idOrInline("string | NbtCompound", "probe:p"),
  "minecraft:loot_modifier": idOrInline("string | NbtCompound", "probe:m"),
  "minecraft:dialog": idOrInline("string | NbtCompound", "minecraft:server_links"),

  // Pre-1.19.3 names for things that later became resource arguments.
  "minecraft:nbt": nbtDef("NbtCompound", (v) => isObj(v) && !Array.isArray(v), [{ a: 1, b: "x" }]),
  "minecraft:mob_effect": resourceId("", "minecraft:mob_effect", "minecraft:speed"),
  "minecraft:entity_summon": resourceId("", "minecraft:entity_type", "minecraft:pig"),
  "minecraft:item_enchantment": resourceId("", "minecraft:enchantment", "minecraft:sharpness"),

  "minecraft:context_float_provider": numberProvider(false),
  "minecraft:context_int_provider": numberProvider(true),
};

const FALLBACK: ParserDef = {
  type: () => "string",
  test: (v) => isStr(v) || isNum(v),
  serialize: String,
  examples: () => ["probe"],
};

// ---------------------------------------------------------------- user overrides

const OVERRIDES = Symbol.for("mcjspacker2.parserOverrides");
type G = typeof globalThis & { [OVERRIDES]?: Record<string, UserParserDef> };

/**
 * Install project-level parser definitions (from `parsers` in mcjs2.config.ts). Stored on globalThis
 * so the CLI and the bundled user code share them.
 */
export function setParserOverrides(overrides: Record<string, UserParserDef> | undefined): void {
  (globalThis as G)[OVERRIDES] = overrides ?? {};
}

function withOverride(base: ParserDef, o: UserParserDef): ParserDef {
  const type = o.type;
  const examples = o.examples;
  return {
    type: type === undefined ? base.type : typeof type === "string" ? () => type : type,
    test: o.test ?? base.test,
    serialize: o.serialize ?? base.serialize,
    macro: o.macro ?? base.macro,
    examples: examples === undefined ? base.examples : Array.isArray(examples) ? () => examples : examples,
  };
}

export function parserDef(id: string): ParserDef {
  const base = PARSERS[id] ?? FALLBACK;
  const o = (globalThis as G)[OVERRIDES]?.[id];
  return o ? withOverride(base, o) : base;
}

export function isKnownParser(id: string): boolean {
  return id in PARSERS || !!(globalThis as G)[OVERRIDES]?.[id];
}
