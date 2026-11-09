/**
 * Resource-location naming rules shared by the build and the runtime.
 *
 * `namespace` config strings are normalized so that all of these are equivalent pairs:
 *   "mypack"            == "mypack:"            -> { ns: "mypack", prefix: "" }
 *   "mypack:generated"  == "mypack:generated/"  -> { ns: "mypack", prefix: "generated/" }
 */

/** A config namespace, split up (see `parseNamespace`). */
export interface NamespaceSpec {
  /** The namespace, e.g. `mypack`. */
  ns: string;
  /** Path prefix; empty or ending with "/". */
  prefix: string;
}

const NS_RE = /^[a-z0-9_.-]+$/;
const SEGMENT_RE = /^[a-z0-9_.-]+$/;

/** Split a config namespace (`mypack:generated/`) into the namespace and the folder for function names. */
export function parseNamespace(input: string): NamespaceSpec {
  const colon = input.indexOf(":");
  const ns = colon < 0 ? input : input.slice(0, colon);
  const rawPrefix = colon < 0 ? "" : input.slice(colon + 1);
  if (!NS_RE.test(ns)) {
    throw new Error(`Invalid namespace "${ns}" in "${input}": only [a-z0-9_.-] is allowed.`);
  }
  const trimmed = rawPrefix.replace(/^\/+|\/+$/g, "");
  if (trimmed) {
    for (const seg of trimmed.split("/")) {
      if (!SEGMENT_RE.test(seg)) {
        throw new Error(`Invalid path segment "${seg}" in namespace "${input}": only [a-z0-9_.-] is allowed.`);
      }
    }
  }
  return { ns, prefix: trimmed ? trimmed + "/" : "" };
}

/** Insert "_" before every capital letter except at index 0, then lowercase. */
export function snake(name: string): string {
  let out = "";
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]!;
    if (i > 0 && ch >= "A" && ch <= "Z") out += "_";
    out += ch;
  }
  return out.toLowerCase();
}

export function isValidSegment(seg: string): boolean {
  return SEGMENT_RE.test(seg);
}

/** Convert a source-relative file path ("combat/ArenaStuff.ts") to resource path segments ("combat/arena_stuff"). */
export function filePathToResource(relFile: string): string {
  const noExt = relFile.replace(/\\/g, "/").replace(/\.[cm]?[jt]sx?$/, "");
  const segs = noExt.split("/").filter(Boolean).map(snake);
  for (const seg of segs) {
    if (!isValidSegment(seg)) {
      throw new Error(`Source file "${relFile}" maps to invalid resource segment "${seg}". Rename the file/directory.`);
    }
  }
  return segs.join("/");
}

/** Returns the function id for a named function, or null if the name is not parsable. */
export function namedFunctionId(spec: NamespaceSpec, relFile: string, name: string | undefined): string | null {
  if (!name) return null;
  const s = snake(name);
  if (!isValidSegment(s) || s === "default") return null;
  const dir = filePathToResource(relFile);
  return `${spec.ns}:${spec.prefix}${dir ? dir + "/" : ""}${s}`;
}

/** Resolve an `@mcfunction <id>` override: absolute ("ns:path") or relative to the configured prefix. */
export function overrideId(spec: NamespaceSpec, override: string): string {
  const colon = override.indexOf(":");
  const ns = colon < 0 ? spec.ns : override.slice(0, colon);
  const path = colon < 0 ? spec.prefix + override : override.slice(colon + 1);
  validateId(`${ns}:${path}`);
  return `${ns}:${path}`;
}

export function anonymousId(spec: NamespaceSpec, relFile: string | undefined, hash: string): string {
  const dir = relFile ? filePathToResource(relFile) : "";
  return `${spec.ns}:${spec.prefix}${dir ? dir + "/" : ""}__anon/${hash}`;
}

export function validateId(id: string): void {
  const colon = id.indexOf(":");
  if (colon < 0) throw new Error(`Invalid resource location "${id}": missing namespace.`);
  const ns = id.slice(0, colon);
  const path = id.slice(colon + 1);
  if (!NS_RE.test(ns) || !path || !path.split("/").every(isValidSegment)) {
    throw new Error(`Invalid resource location "${id}".`);
  }
}

/** "minecraft:foo/bar" -> ["minecraft", "foo/bar"]; bare ids default to "minecraft". */
export function splitId(id: string): [string, string] {
  const colon = id.indexOf(":");
  return colon < 0 ? ["minecraft", id] : [id.slice(0, colon), id.slice(colon + 1)];
}

/** Argument name -> parameter name in generated signatures: "max_count" -> "maxCount", "" -> "arg". */
export function camel(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) return "arg";
  return words.map((w, i) => (i ? w[0]!.toUpperCase() + w.slice(1) : w[0]!.toLowerCase() + w.slice(1))).join("");
}
