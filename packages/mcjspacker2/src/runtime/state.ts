/**
 * Build-time recorder. User code runs at build time; every generated command call appends a
 * line to the buffer of the mcfunction currently being recorded.
 *
 * State lives on globalThis so that every copy of this module (CLI, bundled user code,
 * generated library) shares it.
 */
import { createHash } from "node:crypto";
import type { ParserContext } from "./parsers.js";
import { anonymousId, namedFunctionId, overrideId, splitId, type NamespaceSpec } from "./naming.js";

export interface FnMeta {
  /** Source file relative to the configured src dir, posix separators. */
  file?: string;
  name?: string;
  line?: number;
  /** `true` for a bare `@mcfunction` tag, or the override id. */
  mcfunction?: true | string;
  load?: boolean;
  tick?: boolean;
  /** Only exists in dev builds (`@dev`). */
  dev?: boolean;
}

/** A command line whose text is known when its function ends (commands are built step by step). */
export interface CommandEntry {
  head: string;
  /** The final text, or null if the command is incomplete. */
  resolve: () => string | null;
  /** The text so far, for errors. */
  describe: () => string;
  /** Where the command was started, for errors. */
  origin: Error;
}

type BufferItem = string | CommandEntry;

interface FunctionRecord {
  owner: Function | null;
  origin: string;
  lines: string[];
}

interface TagRecord {
  registry: string;
  id: string;
  replace: boolean;
  values: (string | Function)[];
}

export interface State {
  spec: NamespaceSpec;
  /** Building with `mcjs2 dev`. */
  dev: boolean;
  /** Version info for parsers (serialize/test may depend on the game version). */
  ctx: ParserContext;
  metas: Map<Function, FnMeta>;
  ids: Map<Function, string>;
  bodies: Map<Function, string[]>;
  recording: Set<Function>;
  /** Named functions waiting to be recorded, in order. */
  queue: Function[];
  functions: Map<string, FunctionRecord>;
  stack: BufferItem[][];
  tags: Map<string, TagRecord>;
  resources: Map<string, { registry: string; id: string; data: unknown }>;
}

const KEY = Symbol.for("mcjspacker2.state");
const META_KEY = Symbol.for("mcjspacker2.meta");

type G = typeof globalThis & { [KEY]?: State; [META_KEY]?: (fn: Function, meta: FnMeta) => Function };

const DEV_KEY = Symbol.for("mcjspacker2.dev");

type DevGlobal = typeof globalThis & { [DEV_KEY]?: { value: boolean; listeners: Set<(v: boolean) => void> } };

/** Shared `__DEV__` flag: every copy of the runtime module subscribes to it. */
export function devFlag(): { value: boolean; listeners: Set<(v: boolean) => void> } {
  const g = globalThis as DevGlobal;
  return (g[DEV_KEY] ??= { value: false, listeners: new Set() });
}

function setDev(value: boolean): void {
  const flag = devFlag();
  flag.value = value;
  for (const listener of flag.listeners) listener(value);
}

export function resetState(
  spec: NamespaceSpec,
  version?: { version: string; packFormat: number },
  options: { dev?: boolean } = {},
): State {
  setDev(options.dev ?? false);
  const state: State = {
    spec,
    dev: options.dev ?? false,
    ctx: {
      version: version?.version ?? "unknown",
      packFormat: version?.packFormat ?? Infinity,
      hasRegistry: () => false,
      registryIds: () => [],
    },
    metas: new Map(),
    ids: new Map(),
    bodies: new Map(),
    recording: new Set(),
    queue: [],
    functions: new Map(),
    stack: [],
    tags: new Map(),
    resources: new Map(),
  };
  const g = globalThis as G;
  g[KEY] = state;
  // Called by instrumented user code: `__mcjs_m(fn, meta)`.
  g[META_KEY] = (fn, meta) => {
    if (typeof fn === "function" && !state.metas.has(fn)) state.metas.set(fn, meta);
    return fn;
  };
  return state;
}

export function getState(): State {
  const s = (globalThis as G)[KEY];
  if (!s) throw new Error("mcjspacker2: commands can only be used while building a datapack (run `mcjs2 build`).");
  return s;
}

function describe(fn: Function, meta: FnMeta | undefined): string {
  const name = meta?.name ?? (fn.name || "<anonymous>");
  return meta?.file ? `${name} (${meta.file}${meta.line ? ":" + meta.line : ""})` : name;
}

// ---------------------------------------------------------------- buffers

function currentBuffer(head: string): BufferItem[] {
  const s = getState();
  const buf = s.stack[s.stack.length - 1];
  if (!buf) {
    throw new Error(
      `Command "${head}" was called outside of an mcfunction. Commands must run inside a function that is ` +
        "tagged with /** @mcfunction */ or referenced from one.",
    );
  }
  return buf;
}

/** Start a new command line in the current function; its text is resolved when the function ends. */
export function beginCommand(head: string, resolve: () => string | null, describe: () => string): CommandEntry {
  const buffer = currentBuffer(head);
  const entry: CommandEntry = { head, resolve, describe, origin: new Error() };
  buffer.push(entry);
  return entry;
}

/** Append a raw line to the current function. */
export function emitLine(line: string): void {
  currentBuffer(line.split(" ", 1)[0] ?? line).push(line);
}

function finalize(items: BufferItem[], where: string): string[] {
  return items.map((item) => {
    if (typeof item === "string") return item;
    const text = item.resolve();
    if (text === null) {
      const e = new Error(`Incomplete command "${item.describe()}" in ${where}. Continue it, e.g. with .run.say(...).`);
      // Point at the line that started the command, not at the end of the function.
      e.stack = `${e.name}: ${e.message}\n${item.origin.stack?.split("\n").slice(1).join("\n") ?? ""}`;
      throw e;
    }
    return text;
  });
}

/** Run `fn` at build time and capture the lines it emits. Cached per function object. */
export function recordBody(fn: Function): string[] {
  const s = getState();
  const cached = s.bodies.get(fn);
  if (cached) return cached;
  const buf: BufferItem[] = [];
  s.stack.push(buf);
  try {
    fn();
  } finally {
    s.stack.pop();
  }
  const lines = finalize(buf, describe(fn, s.metas.get(fn)));
  s.bodies.set(fn, lines);
  return lines;
}

// ---------------------------------------------------------------- function ids
//
// `fnId` is the one way a function gets its name and gets written:
// - Named functions have a name from their file and function name, known right away. `fnId` returns
//   it and queues the function; queued functions are recorded one at a time after the current one,
//   so long chains of functions calling each other never nest.
// - Anonymous functions are named after a hash of their commands, so `fnId` records them on the
//   spot (they see the caller's variables as they are at that moment). Identical bodies share a
//   name. Anonymous functions that reference each other in a cycle get a position-based name.

function claim(id: string, fn: Function | null, origin: string): void {
  const s = getState();
  const existing = s.functions.get(id);
  if (existing && existing.owner !== fn) {
    throw new Error(`Duplicate function id "${id}": defined by ${existing.origin} and ${origin}.`);
  }
  if (!existing) s.functions.set(id, { owner: fn, origin, lines: [] });
}

function namedIdFor(fn: Function, meta: FnMeta | undefined): string | null {
  const s = getState();
  if (typeof meta?.mcfunction === "string") return overrideId(s.spec, meta.mcfunction);
  if (!meta?.file) return null;
  return namedFunctionId(s.spec, meta.file, meta.name ?? fn.name);
}

function hash(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** Anonymous functions are recorded where they're referenced, so a chain of them nests. */
const MAX_ANONYMOUS_DEPTH = 400;

/** Record `fn`'s body, marking it as being recorded (for cycle detection). */
function record(fn: Function): string[] {
  const s = getState();
  s.recording.add(fn);
  try {
    return recordBody(fn);
  } finally {
    s.recording.delete(fn);
  }
}

/**
 * The in-game name of a function, making sure it's written to the pack. Strings (ids, `#tags`)
 * are returned as-is.
 */
export function fnId(ref: unknown): string {
  if (typeof ref === "string") return ref;
  if (typeof ref !== "function") throw new Error(`Expected a function or function id, got ${typeof ref}.`);
  const s = getState();
  const known = s.ids.get(ref);
  if (known) return known;
  const meta = s.metas.get(ref);
  const origin = describe(ref, meta);
  if (meta?.dev && !s.dev) {
    throw new Error(
      `${origin} is marked @dev, so it doesn't exist in this build. ` +
        "Only use it from dev-only code, e.g. inside `if (__DEV__) { ... }`.",
    );
  }

  const named = namedIdFor(ref, meta);
  if (named) {
    claim(named, ref, origin);
    s.ids.set(ref, named);
    s.queue.push(ref);
    return named;
  }

  // Anonymous and already being recorded: it references itself through a cycle.
  if (s.recording.has(ref)) {
    const id = anonymousId(s.spec, meta?.file, "p" + hash(`${meta?.file}:${meta?.line}:${ref.toString()}`).slice(0, 8));
    claim(id, ref, origin);
    s.ids.set(ref, id);
    return id;
  }

  if (s.recording.size >= MAX_ANONYMOUS_DEPTH) {
    throw new Error(
      `${origin}: more than ${MAX_ANONYMOUS_DEPTH} anonymous functions call each other in a chain. ` +
        "Give the functions in the chain names (named functions don't have this limit).",
    );
  }
  const lines = record(ref);
  const assigned = s.ids.get(ref);
  if (assigned) {
    s.functions.get(assigned)!.lines = lines;
    return assigned;
  }
  const body = lines.join("\n");
  const full = hash(body);
  for (let len = 8; len <= full.length; len += 4) {
    const id = anonymousId(s.spec, meta?.file, full.slice(0, len));
    const existing = s.functions.get(id);
    if (!existing) {
      s.functions.set(id, { owner: ref, origin, lines });
      s.ids.set(ref, id);
      return id;
    }
    if (existing.lines.join("\n") === body) {
      s.ids.set(ref, id); // identical body: share the function
      return id;
    }
  }
  throw new Error(`Could not allocate an id for ${origin}.`);
}

/** Record queued named functions, one at a time. */
function drainQueue(): void {
  const s = getState();
  while (s.queue.length) {
    const fn = s.queue.shift()!;
    s.functions.get(s.ids.get(fn)!)!.lines = record(fn);
  }
}

// ---------------------------------------------------------------- tags and resources

export function addTag(registry: string, id: string, values: (string | Function)[], replace = false): void {
  const s = getState();
  const key = `${registry}|${id}`;
  const rec = s.tags.get(key) ?? { registry, id, replace, values: [] };
  rec.values.push(...values);
  rec.replace ||= replace;
  s.tags.set(key, rec);
}

export function addResource(registry: string, id: string, data: unknown): void {
  const s = getState();
  const key = `${registry}|${id}`;
  if (s.resources.has(key)) throw new Error(`Duplicate ${registry} resource "${id}".`);
  s.resources.set(key, { registry, id, data });
}

// ---------------------------------------------------------------- output

export interface BuildOutput {
  /** Relative path inside the pack -> file contents. */
  files: Map<string, string>;
  functionCount: number;
}

/**
 * Folder names before data pack format 45 (24w21a / 1.21) were plural. Singular names are the
 * modern ones users write; this maps them for older versions.
 */
const LEGACY_FOLDERS: Record<string, string> = {
  function: "functions",
  advancement: "advancements",
  loot_table: "loot_tables",
  predicate: "predicates",
  recipe: "recipes",
  item_modifier: "item_modifiers",
  structure: "structures",
};
const LEGACY_TAG_FOLDERS: Record<string, string> = {
  function: "functions",
  block: "blocks",
  item: "items",
  entity_type: "entity_types",
  fluid: "fluids",
  game_event: "game_events",
};

export interface OutputOptions {
  /** Data pack format major version; < 45 uses the legacy plural folder names. */
  packFormat?: number;
}

/** Record all entry points and render the collected state into datapack files. */
export function collectOutput(options: OutputOptions = {}): BuildOutput {
  const legacy = (options.packFormat ?? Infinity) < 45;
  const folder = (name: string) => (legacy ? (LEGACY_FOLDERS[name] ?? name) : name);
  const tagFolder = (name: string) => (legacy ? (LEGACY_TAG_FOLDERS[name] ?? name) : name);
  const s = getState();
  const entries = [...s.metas.entries()]
    .filter(([, m]) => m.mcfunction || m.load || m.tick || m.dev)
    .filter(([, m]) => s.dev || !m.dev)
    .sort(([, a], [, b]) => (a.file ?? "").localeCompare(b.file ?? "") || (a.line ?? 0) - (b.line ?? 0));

  for (const [fn, meta] of entries) {
    if (!namedIdFor(fn, meta) && (meta.mcfunction || meta.dev)) {
      throw new Error(`Entry point ${describe(fn, meta)} has no usable name. Give it a name or an id: /** @mcfunction my/id */`);
    }
    fnId(fn);
    if (meta.load) addTag("function", "minecraft:load", [fn]);
    if (meta.tick) addTag("function", "minecraft:tick", [fn]);
  }

  // Record everything reachable. Functions can add tags while recording, so repeat until stable.
  do {
    drainQueue();
    for (const tag of s.tags.values()) for (const v of tag.values) if (typeof v === "function") fnId(v);
  } while (s.queue.length);

  const files = new Map<string, string>();
  const tagFiles: [string, string][] = [];
  for (const tag of [...s.tags.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const values = tag.values.map((v) => fnId(v));
    const [ns, path] = splitId(tag.id);
    tagFiles.push([
      `data/${ns}/tags/${tagFolder(tag.registry)}/${path}.json`,
      JSON.stringify({ ...(tag.replace ? { replace: true } : {}), values: [...new Set(values)] }, null, 2) + "\n",
    ]);
  }
  for (const [id, rec] of [...s.functions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [ns, path] = splitId(id);
    files.set(`data/${ns}/${folder("function")}/${path}.mcfunction`, rec.lines.join("\n") + (rec.lines.length ? "\n" : ""));
  }
  for (const [p, c] of tagFiles) files.set(p, c);
  for (const res of s.resources.values()) {
    const [ns, path] = splitId(res.id);
    const data = typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2) + "\n";
    files.set(`data/${ns}/${folder(res.registry)}/${path}.json`, data);
  }
  return { files, functionCount: s.functions.size };
}
