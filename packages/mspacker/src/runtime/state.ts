/**
 * Build-time recorder. User code runs at build time; every generated command call appends a
 * line to the buffer of the mcfunction currently being recorded.
 *
 * State lives on globalThis so that every copy of this module (CLI, bundled user code,
 * generated library) shares it.
 */
import { createHash } from "node:crypto";
import type { ParserContext } from "./parsers.js";
import { macroArgs, withOwner } from "./macro.js";

/** Data pack format of 1.20.2, the first version with function macros. */
const FORMAT_MACROS = 18;
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
  /** For anonymous functions: a readable start of the name (`step` from `const step = () => ...`). */
  hint?: string;
}

/** A command line whose text is known when its function ends (commands are built step by step). */
export interface CommandEntry {
  head: string;
  /** The final text, or null if the command is incomplete. */
  resolve: () => string | null;
  /** Whether a macro argument was written into the line (it becomes a `$` line). */
  isMacro: () => boolean;
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
  /** Functions waiting to be recorded, in order. */
  queue: Function[];
  /** Anonymous functions, by placeholder number; named once everything is recorded. */
  anonymous: { fn: Function; origin: string; lines: string[] }[];
  functions: Map<string, FunctionRecord>;
  /** More functions claiming an id that's taken: fine if their commands turn out identical. */
  duplicates: { id: string; fn: Function; origin: string; lines: string[] }[];
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

export interface PackInfo {
  /** `mypack` */
  namespace: string;
  /** Where function names start: `mypack:`, or `mypack:generated/` with a folder prefix. */
  functionPrefix: string;
}

const INFO_KEY = Symbol.for("mcjspacker2.packInfo");
type InfoGlobal = typeof globalThis & { [INFO_KEY]?: { value: PackInfo; listeners: Set<(v: PackInfo) => void> } };

/** Shared namespace info (`__NAMESPACE__`, `__FUNCTION_PREFIX__`): every copy of the runtime subscribes. */
export function packInfo(): { value: PackInfo; listeners: Set<(v: PackInfo) => void> } {
  const g = globalThis as InfoGlobal;
  return (g[INFO_KEY] ??= { value: { namespace: "", functionPrefix: "" }, listeners: new Set() });
}

function setPackInfo(spec: NamespaceSpec): void {
  const info = packInfo();
  info.value = { namespace: spec.ns, functionPrefix: `${spec.ns}:${spec.prefix}` };
  for (const listener of info.listeners) listener(info.value);
}

export function resetState(
  spec: NamespaceSpec,
  version?: { version: string; packFormat: number },
  options: { dev?: boolean } = {},
): State {
  setDev(options.dev ?? false);
  setPackInfo(spec);
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
    duplicates: [],
    ids: new Map(),
    bodies: new Map(),
    queue: [],
    anonymous: [],
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
export function beginCommand(
  head: string,
  resolve: () => string | null,
  describe: () => string,
  isMacro: () => boolean,
): CommandEntry {
  const buffer = currentBuffer(head);
  const entry: CommandEntry = { head, resolve, describe, isMacro, origin: new Error() };
  buffer.push(entry);
  return entry;
}

/** Append a line to the current function; `macro` lines get the `$` prefix. */
export function emitLine(line: string, macro = false): void {
  currentBuffer(line.split(" ", 1)[0] ?? line).push(macro && !line.startsWith("$") ? "$" + line : line);
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
    return item.isMacro() && !text.startsWith("$") ? "$" + text : text;
  });
}

/** Run `fn` at build time and capture the lines it emits. Cached per function object. */
export function recordBody(fn: Function): string[] {
  const s = getState();
  const cached = s.bodies.get(fn);
  if (cached) return cached;
  const meta = s.metas.get(fn);
  const where = describe(fn, meta);
  const buf: BufferItem[] = [];
  s.stack.push(buf);
  try {
    // Every function gets `args`: one that uses an argument has macro lines, any other is plain.
    withOwner(fn, where, () => fn(macroArgs(fn, where, s.ctx.packFormat >= FORMAT_MACROS)));
  } finally {
    s.stack.pop();
  }
  const lines = finalize(buf, where);
  s.bodies.set(fn, lines);
  return lines;
}

// ---------------------------------------------------------------- function ids
//
// `fnId` is the one way a function gets its name and gets written. Every function is queued and
// recorded after the current one, one at a time, so long chains of functions calling each other
// never nest. The only difference between named and anonymous functions is the name:
// - Named functions have a name from their file and function name, known right away.
// - Anonymous functions are named after a hash of their commands, known only once everything is
//   recorded. Until then `fnId` returns a placeholder, which is replaced in every output file
//   (function lines, tags, resources). Identical bodies share a name; anonymous functions that
//   reference each other in a cycle get a position-based name.

function claim(id: string, fn: Function, origin: string): void {
  const s = getState();
  const existing = s.functions.get(id);
  if (!existing) s.functions.set(id, { owner: fn, origin, lines: [] });
  // Checked once everything is recorded: the same commands may share the id (a helper that runs twice).
  else if (existing.owner !== fn) s.duplicates.push({ id, fn, origin, lines: [] });
}

/** Throw for functions that share an id but not their commands. */
function checkDuplicates(replace: (text: string) => string): void {
  const s = getState();
  for (const d of s.duplicates) {
    const rec = s.functions.get(d.id)!;
    if (d.lines.map(replace).join("\n") !== rec.lines.map(replace).join("\n")) {
      throw new Error(`Duplicate function id "${d.id}": defined by ${rec.origin} and ${d.origin}, with different commands.`);
    }
  }
}

/**
 * Give a function a fixed name (`named()` in `#mc`): a path under your function prefix, or a full
 * id. Like `@mcfunction <id>`, it's written to the pack even if nothing calls it.
 */
export function nameFunction(fn: Function, id: string): void {
  const s = getState();
  overrideId(s.spec, id); // validates
  if (s.ids.has(fn)) throw new Error(`named("${id}", ...): ${describe(fn, s.metas.get(fn))} already has a name. Name it before using it.`);
  const meta = s.metas.get(fn);
  if (typeof meta?.mcfunction === "string" && meta.mcfunction !== id) {
    throw new Error(`named("${id}", ...): ${describe(fn, meta)} is already named "${meta.mcfunction}".`);
  }
  s.metas.set(fn, { ...meta, mcfunction: id });
}

function namedIdFor(meta: FnMeta | undefined): string | null {
  const s = getState();
  if (typeof meta?.mcfunction === "string") return overrideId(s.spec, meta.mcfunction);
  // Named by the build (top-level functions); anything else is anonymous.
  if (!meta?.file || !meta.name) return null;
  return namedFunctionId(s.spec, meta.file, meta.name);
}

function hash(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** Placeholder names of anonymous functions: `<ns>:mcjs2_pending/<n>/fn`. */
function placeholder(n: number): string {
  return `${getState().spec.ns}:mcjs2_pending/${n}/fn`;
}

function placeholderPattern(): RegExp {
  return new RegExp(`${getState().spec.ns.replace(/[.]/g, "\\.")}:mcjs2_pending/(\\d+)/fn`, "g");
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

  const named = namedIdFor(meta);
  if (named) {
    claim(named, ref, origin);
    s.ids.set(ref, named);
  } else {
    const id = placeholder(s.anonymous.length);
    s.anonymous.push({ fn: ref, origin, lines: [] });
    s.ids.set(ref, id);
  }
  s.queue.push(ref);
  return s.ids.get(ref)!;
}

/** Record queued functions, one at a time. */
function drainQueue(): void {
  const s = getState();
  while (s.queue.length) {
    const fn = s.queue.shift()!;
    const lines = recordBody(fn);
    const id = s.ids.get(fn)!;
    const anon = /^.*:mcjs2_pending\/(\d+)\/fn$/.exec(id);
    const rec = anon ? undefined : s.functions.get(id)!;
    if (anon) s.anonymous[Number(anon[1])]!.lines = lines;
    else if (rec!.owner === fn) rec!.lines = lines;
    else for (const d of s.duplicates) if (d.fn === fn) d.lines = lines;
  }
}

/**
 * Name every anonymous function after its commands, then replace the placeholders. Functions are
 * named after the functions they reference, so this goes through the reference graph's strongly
 * connected components, references first; members of a cycle are named by position instead.
 * Returns the placeholder replacer.
 */
function resolveAnonymous(): (text: string) => string {
  const s = getState();
  const anon = s.anonymous;
  const names: (string | undefined)[] = new Array(anon.length);
  const pattern = placeholderPattern();
  const refs = anon.map((a) => [...new Set([...a.lines.join("\n").matchAll(pattern)].map((m) => Number(m[1])))]);
  const replace = (text: string) =>
    text.replace(pattern, (whole, n: string) => names[Number(n)] ?? whole);

  const allocate = (index: number, base: string, body: string | null): string => {
    const a = anon[index]!;
    const meta = s.metas.get(a.fn);
    for (let len = 8; len <= base.length; len += 4) {
      const id = anonymousId(s.spec, meta?.file, (body === null ? "p" : "") + base.slice(0, len), meta?.hint);
      const existing = s.functions.get(id);
      if (!existing) {
        s.functions.set(id, { owner: a.fn, origin: a.origin, lines: [] });
        return id;
      }
      // Identical body: share the function.
      if (body !== null && existing.lines.join("\n") === body) return id;
    }
    throw new Error(`Could not allocate an id for ${a.origin}.`);
  };

  const named = (members: number[]) => {
    const cyclic = members.length > 1 || refs[members[0]!]!.includes(members[0]!);
    if (!cyclic) {
      const i = members[0]!;
      const lines = anon[i]!.lines.map(replace);
      const body = lines.join("\n");
      const id = allocate(i, hash(body), body);
      names[i] = id;
      const rec = s.functions.get(id)!;
      if (rec.owner === anon[i]!.fn) rec.lines = lines;
      return;
    }
    for (const i of members) {
      const a = anon[i]!;
      const meta = s.metas.get(a.fn);
      names[i] = allocate(i, hash(`${meta?.file}:${meta?.line}:${a.fn.toString()}:${i}`), null);
    }
    for (const i of members) s.functions.get(names[i]!)!.lines = anon[i]!.lines.map(replace);
  };

  // Tarjan's algorithm, iterative (reference chains can be long). Components come out references first.
  const index: number[] = new Array(anon.length).fill(-1);
  const low: number[] = new Array(anon.length).fill(0);
  const onStack: boolean[] = new Array(anon.length).fill(false);
  const stack: number[] = [];
  let counter = 0;
  for (let root = 0; root < anon.length; root++) {
    if (index[root] !== -1) continue;
    const work: [number, number][] = [[root, 0]];
    index[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = true;
    while (work.length) {
      const frame = work[work.length - 1]!;
      const [v, next] = frame;
      const out = refs[v]!;
      if (next < out.length) {
        frame[1]++;
        const w = out[next]!;
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = true;
          work.push([w, 0]);
        } else if (onStack[w]) low[v] = Math.min(low[v]!, index[w]!);
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low[parent[0]] = Math.min(low[parent[0]]!, low[v]!);
      if (low[v] === index[v]) {
        const members: number[] = [];
        let w: number;
        do {
          w = stack.pop()!;
          onStack[w] = false;
          members.push(w);
        } while (w !== v);
        named(members.reverse());
      }
    }
  }

  for (const [fn, id] of s.ids) {
    const m = /:mcjs2_pending\/(\d+)\/fn$/.exec(id);
    if (m) s.ids.set(fn, names[Number(m[1])]!);
  }
  return replace;
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
    if (!namedIdFor(meta) && (meta.mcfunction || meta.dev)) {
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
  const replace = resolveAnonymous();
  checkDuplicates(replace);

  const files = new Map<string, string>();
  const tagFiles: [string, string][] = [];
  for (const tag of [...s.tags.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const values = tag.values.map((v) => replace(fnId(v)));
    const [ns, path] = splitId(tag.id);
    tagFiles.push([
      `data/${ns}/tags/${tagFolder(tag.registry)}/${path}.json`,
      JSON.stringify({ ...(tag.replace ? { replace: true } : {}), values: [...new Set(values)] }, null, 2) + "\n",
    ]);
  }
  for (const [id, rec] of [...s.functions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [ns, path] = splitId(id);
    files.set(`data/${ns}/${folder("function")}/${path}.mcfunction`, rec.lines.map(replace).join("\n") + (rec.lines.length ? "\n" : ""));
  }
  for (const [p, c] of tagFiles) files.set(p, c);
  for (const res of s.resources.values()) {
    const [ns, path] = splitId(res.id);
    const data = replace(typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2) + "\n");
    files.set(`data/${ns}/${folder(res.registry)}/${path}.json`, data);
  }
  return { files, functionCount: s.functions.size };
}
