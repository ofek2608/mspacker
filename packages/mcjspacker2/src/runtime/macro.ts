/**
 * Macro functions: a function with a parameter is a macro function. Its parameter is a proxy whose
 * properties are markers (`args.x` is `$(x)`); commands write markers as-is, and lines that use them
 * become macro lines (`$...`).
 */

const NBT = Symbol.for("mcjspacker2.nbt");
const MACRO = Symbol.for("mcjspacker2.macro");
declare const FITS: unique symbol;

/**
 * A macro argument: replaced in game by the value the function is called with. Nothing can check
 * those values, so `T` is just the type you declare for it: where it can be used (a `boolean` fits
 * where commands take a boolean). For anything else, write the command as text:
 * `` $(`tp @s ${args.destination}`) ``.
 */
export interface MacroArg<T> {
  readonly [FITS]: T;
  /** The argument in double quotes, for string values inside NBT: `"$(name)"`. */
  readonly quoted: MacroArg<T>;
  toString(): string;
}

/** The parameter of a macro function: `function Greet(args: Macro<{ name: string }>)`. */
export type Macro<T> = { readonly [K in keyof T]-?: MacroArg<T[K]> };

interface MarkerObject {
  [NBT]: "raw";
  [MACRO]: string;
  text: string;
}

/** Macro variable names the game accepts. */
const NAME = /^[A-Za-z0-9_]+$/;

/** Matches markers in command text. */
export const MACRO_REF = /\$\(([A-Za-z0-9_]+)\)/g;

/** `json` is the text inside a JSON string (JSON adds the quotes itself). */
function marker(name: string, text: string, json = text): MarkerObject {
  const m = { [NBT]: "raw", [MACRO]: name, text } as MarkerObject;
  Object.defineProperties(m, {
    toString: { value: () => text },
    toJSON: { value: () => json },
    [Symbol.toPrimitive]: { value: () => text },
  });
  return m;
}

export function isMacroArg(v: unknown): v is { text: string } {
  return typeof v === "object" && v !== null && MACRO in v;
}

/** Whether a value (or anything nested in it) is a macro argument. */
export function hasMacroArg(v: unknown): boolean {
  if (isMacroArg(v)) return true;
  if (typeof v !== "object" || v === null) return false;
  return Object.values(v).some(hasMacroArg);
}

/**
 * The `args` proxy passed to a macro function. Records the names it hands out in `used` (the
 * function's own) and `all` (every function's, to spot them used somewhere else).
 */
export function macroArgs(used: Set<string>, all: Set<string>, where: string): unknown {
  const cache = new Map<string, MarkerObject>();
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        if (!NAME.test(prop)) {
          throw new Error(`Invalid macro argument name "${prop}" in ${where}: only letters, digits and _ are allowed.`);
        }
        used.add(prop);
        all.add(prop);
        let m = cache.get(prop);
        if (!m) {
          m = marker(prop, `$(${prop})`);
          Object.defineProperty(m, "quoted", { value: marker(prop, `"$(${prop})"`, `$(${prop})`) });
          cache.set(prop, m);
        }
        return m;
      },
    },
  );
}
