/** SNBT serialization with typed wrappers for numeric tags and arrays. */
import type { MacroArg } from "./macro.js";

const NBT = Symbol.for("mcjspacker2.nbt");

type Suffix = "b" | "s" | "" | "L" | "f" | "d";
interface TypedNumber {
  [NBT]: "num";
  value: number | bigint;
  suffix: Suffix;
}
interface TypedArray {
  [NBT]: "arr";
  kind: "B" | "I" | "L";
  values: (number | bigint)[];
}
interface RawSnbt {
  [NBT]: "raw";
  text: string;
}

export type NbtValue =
  | string
  | number
  | boolean
  | bigint
  | TypedNumber
  | TypedArray
  | RawSnbt
  | MacroArg<unknown>
  | NbtValue[]
  | { [key: string]: NbtValue | undefined };
export type NbtCompound = { [key: string]: NbtValue | undefined };

const num = (suffix: Suffix) => (value: number | bigint): TypedNumber => ({ [NBT]: "num", value, suffix });
const arr = (kind: TypedArray["kind"]) => (values: (number | bigint)[]): TypedArray => ({ [NBT]: "arr", kind, values });

export const nbt = {
  byte: num("b"),
  short: num("s"),
  int: num(""),
  long: num("L"),
  float: num("f"),
  double: num("d"),
  byteArray: arr("B"),
  intArray: arr("I"),
  longArray: arr("L"),
  /** Insert SNBT text verbatim. */
  raw: (text: string): RawSnbt => ({ [NBT]: "raw", text }),
  stringify: snbt,
};

const BARE_KEY = /^[A-Za-z0-9._+-]+$/;

export function quoteString(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

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
