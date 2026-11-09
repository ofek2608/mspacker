// SNBT serialization with typed wrappers for numeric tags and arrays.
import type { MacroArg } from "./macro.js";

const NBT = Symbol.for("mcjspacker2.nbt");

/** The letter after an NBT number: byte, short, int, long, float, double. */
export type Suffix = "b" | "s" | "" | "L" | "f" | "d";
/** A number of a specific NBT type (`5b`, `1.5f`, ...); made with `nbt.byte(5)`, `nbt.float(1.5)`, ... */
export interface TypedNumber {
  /** @internal */
  [NBT]: "num";
  /** The number. */
  value: number | bigint;
  /** Its NBT type letter. */
  suffix: Suffix;
}
/** A typed NBT array (`[I; 1, 2]`); made with `nbt.intArray([1, 2])`, ... */
export interface TypedArray {
  /** @internal */
  [NBT]: "arr";
  /** Byte, int or long array. */
  kind: "B" | "I" | "L";
  /** The numbers. */
  values: (number | bigint)[];
}
/** SNBT text inserted as it is; made with `nbt.raw("...")`. */
export interface RawSnbt {
  /** @internal */
  [NBT]: "raw";
  /** The SNBT text. */
  text: string;
}

/**
 * A value written as NBT: strings, booleans, numbers (whole numbers become ints, others doubles;
 * use `nbt.byte(...)` and friends for other types), lists, compounds, and macro arguments.
 */
export type NbtValue =
  | string
  | number
  | boolean
  | bigint
  | TypedNumber
  | TypedArray
  | RawSnbt
  | MacroArg
  | NbtValue[]
  | { [key: string]: NbtValue | undefined };
/** An NBT compound: `{ key: value }`. */
export type NbtCompound = { [key: string]: NbtValue | undefined };

const num = (suffix: Suffix) => (value: number | bigint): TypedNumber => ({ [NBT]: "num", value, suffix });
const arr = (kind: TypedArray["kind"]) => (values: (number | bigint)[]): TypedArray => ({ [NBT]: "arr", kind, values });

/**
 * NBT values of a specific type, for when a plain number isn't enough:
 *
 *     $.data.merge.entity("@s", { Count: nbt.byte(3), Rotation: [nbt.float(90), nbt.float(0)] });
 */
export const nbt = {
  /** `3b` */
  byte: num("b"),
  /** `3s` */
  short: num("s"),
  /** `3` (plain whole numbers are ints already) */
  int: num(""),
  /** `3L` (also takes a bigint) */
  long: num("L"),
  /** `1.5f` */
  float: num("f"),
  /** `1.5d` (plain fractional numbers are doubles already) */
  double: num("d"),
  /** `[B; 1b, 2b]` */
  byteArray: arr("B"),
  /** `[I; 1, 2]` */
  intArray: arr("I"),
  /** `[L; 1L, 2L]` */
  longArray: arr("L"),
  /** Insert SNBT text verbatim. */
  raw: (text: string): RawSnbt => ({ [NBT]: "raw", text }),
  /** The SNBT text of a value (same as `snbt`). */
  stringify: snbt,
};

const BARE_KEY = /^[A-Za-z0-9._+-]+$/;

export function quoteString(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

/** The SNBT text of a value: `snbt({ a: 1, b: "x" })` is `{a:1,b:"x"}`. */
export function snbt(value: NbtValue): string {
  if (typeof value === "string") return quoteString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return `${value}L`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot serialize ${value} as NBT.`);
    if (Number.isInteger(value)) {
      return value >= -2147483648 && value <= 2147483647 ? String(value) : `${value}L`;
    }
    return `${value}d`;
  }
  if (Array.isArray(value)) return "[" + value.map(snbt).join(",") + "]";
  if (value && typeof value === "object") {
    const tagged = (value as { [NBT]?: string })[NBT];
    if (tagged === "num") {
      const v = value as TypedNumber;
      return `${v.value}${v.suffix}`;
    }
    if (tagged === "arr") {
      const v = value as TypedArray;
      return `[${v.kind};` + v.values.map((x) => `${x}${v.kind === "I" ? "" : v.kind === "B" ? "b" : "L"}`).join(",") + "]";
    }
    if (tagged === "raw") return (value as RawSnbt).text;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      parts.push(`${BARE_KEY.test(k) ? k : quoteString(k)}:${snbt(v)}`);
    }
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`Cannot serialize ${String(value)} as NBT.`);
}
