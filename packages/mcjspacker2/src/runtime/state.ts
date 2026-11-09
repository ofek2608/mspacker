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
}

export interface CommandEntry {
  parts: string[];
  complete: boolean;
  head: string;
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
  /** Version info for parsers (serialize/test may depend on the game version). */
  ctx: ParserContext;
  metas: Map<Function, FnMeta>;
  ids: Map<Function, string>;
  bodies: Map<Function, string[]>;
  recording: Set<Function>;
  /** Functions waiting to be recorded, in order, and everything ever queued. */
  queue: Function[];
  queued: Set<Function>;
  /** Placeholder tokens for functions whose id is assigned after recording. */
  tokens: Map<Function, number>;
  tokenFns: Function[];
  functions: Map<string, FunctionRecord>;
  stack: BufferItem[][];
  tags: Map<string, TagRecord>;
  resources: Map<string, { registry: string; id: string; data: unknown }>;
}

const KEY = Symbol.for("mcjspacker2.state");
const META_KEY = Symbol.for("mcjspacker2.meta");

type G = typeof globalThis & { [KEY]?: State; [META_KEY]?: (fn: Function, meta: FnMeta) => Function };

export function resetState(spec: NamespaceSpec, version?: { version: string; packFormat: number }): State {
  const state: State = {
    spec,
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
    queued: new Set(),
    tokens: new Map(),
    tokenFns: [],
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

/** Start a new command line in the current function. Generated code fills in `parts`. */
export function beginCommand(head: string): CommandEntry {
  const entry: CommandEntry = { parts: [head], complete: false, head };
  currentBuffer(head).push(entry);
  return entry;
}

/** Append a raw line to the current function. */
export function emitLine(line: string): void {
  currentBuffer(line.split(" ", 1)[0] ?? line).push(line);
}

function finalize(items: BufferItem[], where: string): string[] {
  return items.map((item) => {
    if (typeof item === "string") return item;
    if (!item.complete) {
      throw new Error(`Incomplete command "${item.parts.join(" ")}" in ${where}. Continue the chain (e.g. .Run(...)).`);
    }
    return item.parts.join(" ");
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
// Functions are recorded one at a time from a queue, never nested inside each other: a reference
// (`Function(B)`, `if function B`, `fnId(B)`, a tag) only queues B and writes its id, or a placeholder
// token when the id isn't known yet. Named functions have path-based ids that are known up front.
// Anonymous ids are content hashes, so they are assigned after the queue is drained (bottom-up over
// the reference graph) and the tokens are replaced when the output is rendered.
//
// The exception is `.Run(() => ...)`: an anonymous callback runs immediately, so it sees the
// surrounding JS state, and is inlined when it emits a single command. That nests only as deep as
// callbacks are nested in the source.

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

const TOKEN = /\u0000fn:(\d+)\u0000/g;

/** Add `fn` to the recording queue (once). Returns true if it was new. */
function enqueue(fn: Function): boolean {
  const s = getState();
  if (s.queued.has(fn)) return false;
  s.queued.add(fn);
  s.queue.push(fn);
  return true;
}

/** Give a named function its id now (ids of named functions don't depend on their body). */
function assignNamed(fn: Function): string | null {
  const s = getState();
  const known = s.ids.get(fn);
  if (known) return known;
  const meta = s.metas.get(fn);
  const named = namedIdFor(fn, meta);
  if (!named) return null;
  claim(named, fn, describe(fn, meta));
  s.ids.set(fn, named);
  return named;
}

/** Placeholder for a function whose id is assigned later. */
function tokenFor(fn: Function): string {
  const s = getState();
  let n = s.tokens.get(fn);
  if (n === undefined) {
    n = s.tokenFns.length;
    s.tokenFns.push(fn);
    s.tokens.set(fn, n);
  }
  return `\u0000fn:${n}\u0000`;
}

/**
 * Serialize a function reference: TS function -> its id (or a placeholder resolved at output),
 * string -> as-is. The function is queued for recording, not recorded here.
 */
export function functionRef(ref: unknown): string {
  if (typeof ref === "string") return ref;
  if (typeof ref !== "function") throw new Error(`Expected a function or function id, got ${typeof ref}.`);
  enqueue(ref);
  return assignNamed(ref) ?? tokenFor(ref);
}

/** Text after `run`: a single anonymous command is inlined, everything else becomes `function <id>`. */
export function runTarget(target: unknown): string {
  if (typeof target === "string") return target;
  if (typeof target !== "function") throw new Error(`run expects a callback, function or command string.`);
  const s = getState();
  const isAnonymous = !s.ids.has(target) && !namedIdFor(target, s.metas.get(target));
  if (isAnonymous && !s.tokens.has(target) && !s.recording.has(target)) {
    // Run the callback now (it may depend on the caller's JS state) and inline a single command.
    s.recording.add(target);
    let lines: string[];
    try {
      lines = recordBody(target);
    } finally {
      s.recording.delete(target);
    }
    // A callback that referenced itself while recording must stay a function.
    if (!s.tokens.has(target) && lines.length === 1 && !lines[0]!.startsWith("$")) return lines[0]!;
  }
  return `function ${functionRef(target)}`;
}

/** Record every queued function, one at a time. */
function drainQueue(): void {
  const s = getState();
  while (s.queue.length) {
    const fn = s.queue.shift()!;
    if (s.bodies.has(fn)) continue;
    s.recording.add(fn);
    try {
      recordBody(fn);
    } finally {
      s.recording.delete(fn);
    }
  }
}

/** Replace placeholder tokens with function ids. */
function resolveTokens(text: string): string {
  if (!text.includes("\u0000")) return text;
  const s = getState();
  return text.replace(TOKEN, (_, n: string) => {
    const fn = s.tokenFns[Number(n)]!;
    const id = s.ids.get(fn);
    if (!id) throw new Error(`mcjspacker2 internal error: no id for ${describe(fn, s.metas.get(fn))}.`);
    return id;
  });
}

function resolveDeep(value: unknown): unknown {
  if (typeof value === "string") return resolveTokens(value);
  if (Array.isArray(value)) return value.map(resolveDeep);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v)]));
  }
  return value;
}

/**
 * Assign ids to all recorded functions: named ones by path, anonymous ones by the hash of their body
 * with references resolved. Walks the reference graph iteratively (no recursion); anonymous functions
 * in a reference cycle get a position-based id instead.
 */
function assignIds(): void {
  const s = getState();
  const recorded = [...s.queued];
  for (const fn of recorded) assignNamed(fn);

  const deps = (fn: Function): Function[] => {
    const out: Function[] = [];
    for (const line of s.bodies.get(fn) ?? []) {
      for (const m of line.matchAll(TOKEN)) out.push(s.tokenFns[Number(m[1])]!);
    }
    return out;
  };

  const positionId = (fn: Function) => {
    const meta = s.metas.get(fn);
    const id = anonymousId(s.spec, meta?.file, "p" + hash(`${meta?.file}:${meta?.line}:${fn.toString()}`).slice(0, 8));
    claim(id, fn, describe(fn, meta));
    s.ids.set(fn, id);
  };

  const hashId = (fn: Function) => {
    const meta = s.metas.get(fn);
    const body = s.bodies.get(fn)!.map(resolveTokens).join("\n");
    const full = hash(body);
    for (let len = 8; len <= full.length; len += 4) {
      const id = anonymousId(s.spec, meta?.file, full.slice(0, len));
      const existing = s.functions.get(id);
      if (!existing) {
        s.functions.set(id, { owner: fn, origin: describe(fn, meta), lines: [] });
        s.ids.set(fn, id);
        return;
      }
      const other = existing.owner && s.bodies.get(existing.owner);
      if (other && other.map(resolveTokens).join("\n") === body) {
        // Identical body: share the function.
        s.ids.set(fn, id);
        return;
      }
    }
    throw new Error(`Could not allocate an id for ${describe(fn, meta)}.`);
  };

  const visit = new Map<Function, "open" | "done">();
  for (const root of recorded) {
    if (s.ids.has(root) || visit.has(root)) continue;
    visit.set(root, "open");
    const stack = [{ fn: root, deps: deps(root), i: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      if (top.i < top.deps.length) {
        const d = top.deps[top.i++]!;
        if (s.ids.has(d)) continue;
        const state = visit.get(d);
        if (state === undefined) {
          visit.set(d, "open");
          stack.push({ fn: d, deps: deps(d), i: 0 });
        } else if (state === "open") {
          positionId(d); // cycle back to a function still being resolved
        }
        continue;
      }
      stack.pop();
      visit.set(top.fn, "done");
      if (!s.ids.has(top.fn)) hashId(top.fn);
    }
  }

  for (const fn of recorded) {
    const rec = s.functions.get(s.ids.get(fn)!)!;
    if (rec.owner === fn) rec.lines = s.bodies.get(fn)!.map(resolveTokens);
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
    .filter(([, m]) => m.mcfunction || m.load || m.tick)
    .sort(([, a], [, b]) => (a.file ?? "").localeCompare(b.file ?? "") || (a.line ?? 0) - (b.line ?? 0));

  for (const [fn, meta] of entries) {
    if (!namedIdFor(fn, meta) && meta.mcfunction) {
      throw new Error(`Entry point ${describe(fn, meta)} has no usable name. Give it a name or an id: /** @mcfunction my/id */`);
    }
    enqueue(fn);
    if (meta.load) addTag("function", "minecraft:load", [fn]);
    if (meta.tick) addTag("function", "minecraft:tick", [fn]);
  }

  // Record everything reachable. Functions can add tags while recording, so repeat until stable.
  let more = true;
  while (more) {
    drainQueue();
    more = false;
    for (const tag of s.tags.values()) for (const v of tag.values) if (typeof v === "function" && enqueue(v)) more = true;
  }
  assignIds();

  const files = new Map<string, string>();
  const tagFiles: [string, string][] = [];
  for (const tag of [...s.tags.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const values = tag.values.map((v) => (typeof v === "function" ? s.ids.get(v)! : resolveTokens(v)));
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
    const data = typeof res.data === "string" ? resolveTokens(res.data) : JSON.stringify(resolveDeep(res.data), null, 2) + "\n";
    files.set(`data/${ns}/${folder(res.registry)}/${path}.json`, data);
  }
  return { files, functionCount: s.functions.size };
}
