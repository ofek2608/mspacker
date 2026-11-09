/**
 * Macro functions: a function with a parameter is a macro function. Its parameter is a proxy whose
 * properties are markers (`args.x` stands for `$(x)`).
 *
 * Markers are objects, recognized by a symbol, never by their text: a plain string containing
 * "$(x)" is never a macro. A command line becomes a macro line (`$...`) when a marker is written
 * into it, which is tracked while the line is built (see `collectMacros`). Markers refuse to turn
 * into plain strings; `` macro`...` `` builds text from them instead.
 */

const NBT = Symbol.for("mcjspacker2.nbt");
const MACRO = Symbol.for("mcjspacker2.macro");
declare const FITS: unique symbol;

/**
 * A macro argument: replaced in game by the value the function is called with. Nothing can check
 * those values, so `T` is just the type you declare for it: where it can be used (a `boolean` fits
 * where commands take a boolean). To put it into text, use `` macro`...` ``.
 */
export interface MacroArg<T> {
  /** @internal The type it fits (only for TypeScript). */
  readonly [FITS]: T;
  /** The argument in double quotes, for string values inside NBT: `"$(name)"`. */
  readonly quoted: MacroArg<T>;
}

/** The parameter of a macro function: `function Greet(args: Macro<{ name: string }>)`. */
export type Macro<T> = { readonly [K in keyof T]-?: MacroArg<T[K]> };

/** `T`, where any value, also inside objects and lists, may be a macro argument. */
export type MacroValue<T> =
  | MacroArg<T>
  | (T extends (...args: never[]) => unknown
      ? T
      : T extends readonly (infer E)[]
        ? MacroValue<E>[]
        : T extends object
          ? { [K in keyof T]: MacroValue<T[K]> }
          : T);

// ---------------------------------------------------------------- who is using markers right now

/** The functions being recorded (markers belong to one) and the line being built (if any). */
interface Context {
  owners: { token: object; where: string }[];
  collector: { used: boolean } | null;
}
const CONTEXT = Symbol.for("mcjspacker2.macroContext");
function context(): Context {
  const g = globalThis as typeof globalThis & { [CONTEXT]?: Context };
  return (g[CONTEXT] ??= { owners: [], collector: null });
}

/** While `fn` runs, markers used in commands must belong to `token` (the function being recorded). */
export function withOwner<T>(token: object, where: string, fn: () => T): T {
  const c = context();
  c.owners.push({ token, where });
  try {
    return fn();
  } finally {
    c.owners.pop();
  }
}

/** Run `build` (which writes values into one command line); reports whether it used any marker. */
export function collectMacros<T>(build: () => T): { result: T; macro: boolean } {
  const c = context();
  const outer = c.collector;
  const mine = { used: false };
  c.collector = mine;
  try {
    const result = build();
    return { result, macro: mine.used };
  } finally {
    c.collector = outer;
    if (outer && mine.used) outer.used = true;
  }
}

/** Thrown for misuse of macro arguments; never swallowed while trying argument types. */
export class MacroError extends Error {
  override name = "MacroError";
}

// ---------------------------------------------------------------- markers

interface MarkerInfo {
  owner: object;
  ownerName: string;
  label: string;
  /** From `` macro`...` ``: written exactly as given, never adapted by the argument type. */
  verbatim?: boolean;
}
interface MarkerObject {
  [NBT]: "raw";
  [MACRO]: MarkerInfo;
  readonly text: string;
}

/** Macro variable names the game accepts. */
const NAME = /^[A-Za-z0-9_]+$/;
const RAW = Symbol("raw text");

/** The marker's text, recording that the line being built uses it. */
function use(info: MarkerInfo, text: string): string {
  const c = context();
  if (!c.collector) {
    throw new MacroError(
      `${info.label} can only be used in commands of ${info.ownerName}, not in other data (tags, resources, nbt.stringify, ...).`,
    );
  }
  const current = c.owners[c.owners.length - 1];
  if (current?.token !== info.owner) {
    throw new MacroError(
      `${info.label} belongs to ${info.ownerName}, but is used in ${current?.where ?? "no function"}. Macro arguments only ` +
        "work in their own function's commands. To use one in a function you call, pass it on: $.function(Other, { x: args.x }).",
    );
  }
  c.collector.used = true;
  return text;
}

/** `json` is the text inside a JSON string (JSON adds the quotes itself). */
function marker(info: MarkerInfo, text: string, json = text): MarkerObject {
  const m = { [NBT]: "raw", [MACRO]: info } as unknown as MarkerObject;
  const asText = () => {
    throw new MacroError(
      `${info.label} can't become plain text. Use the macro template: $(macro\`tp @s \${args.x}\`) or $.say(macro\`hi \${args.name}\`).`,
    );
  };
  Object.defineProperties(m, {
    text: { get: () => use(info, text) },
    [RAW]: { value: text },
    toJSON: { value: () => use(info, json) },
    toString: { value: asText },
    [Symbol.toPrimitive]: { value: asText },
  });
  return m;
}

/** A marker plus its `.quoted` version. */
function markerWithQuoted(info: MarkerInfo, text: string): MarkerObject {
  const m = marker(info, text);
  Object.defineProperty(m, "quoted", { value: marker({ ...info, label: `${info.label}.quoted` }, `"${text}"`, text) });
  return m;
}

export function isMacroArg(v: unknown): v is { readonly text: string } {
  return typeof v === "object" && v !== null && MACRO in v;
}

/** Whether a marker comes from `` macro`...` `` (its text is used exactly as given). */
export function isVerbatimMacro(v: unknown): boolean {
  return isMacroArg(v) && !!(v as unknown as MarkerObject)[MACRO].verbatim;
}

/** Whether a value (or anything nested in it) is a macro argument. */
export function hasMacroArg(v: unknown): boolean {
  if (isMacroArg(v)) return true;
  if (typeof v !== "object" || v === null) return false;
  return Object.values(v).some(hasMacroArg);
}

/** The `args` proxy passed to the macro function `owner` (called `where` in errors). */
export function macroArgs(owner: object, where: string): unknown {
  const cache = new Map<string, MarkerObject>();
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        if (!NAME.test(prop)) {
          throw new MacroError(`Invalid macro argument name "${prop}" in ${where}: only letters, digits and _ are allowed.`);
        }
        let m = cache.get(prop);
        if (!m) {
          m = markerWithQuoted({ owner, ownerName: where, label: `args.${prop}` }, `$(${prop})`);
          cache.set(prop, m);
        }
        return m;
      },
    },
  );
}

/**
 * Text made from macro arguments: `` $(macro`tp @s ${args.x} ${args.y} ${args.z}`) ``. The result is
 * itself a macro argument, so it fits anywhere a value goes; it isn't type-checked, that's up to you.
 * Other values (strings, numbers) are written as they are. Without macro arguments it's a plain string.
 */
export function macro(strings: TemplateStringsArray, ...values: unknown[]): MacroArg<any> {
  const markers = values.filter(isMacroArg) as unknown as MarkerObject[];
  let text = strings[0]!;
  values.forEach((v, i) => {
    text += (isMacroArg(v) ? (v as unknown as { [RAW]: string })[RAW] : String(v)) + strings[i + 1]!;
  });
  if (!markers.length) return text as unknown as MacroArg<any>;
  const info = markers[0]![MACRO];
  const other = markers.find((m) => m[MACRO].owner !== info.owner);
  if (other) throw new MacroError(`macro\`${text}\` mixes macro arguments of ${info.ownerName} and ${other[MACRO].ownerName}.`);
  return markerWithQuoted({ owner: info.owner, ownerName: info.ownerName, label: `macro\`${text}\``, verbatim: true }, text) as unknown as MacroArg<any>;
}
