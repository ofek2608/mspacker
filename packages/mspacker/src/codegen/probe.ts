/**
 * Parser probes: turn every command path of a version into concrete test commands, with each argument
 * filled from its parser's `examples`. Loading these as functions on a real server checks that every
 * parser's serialization is accepted by that version.
 */
import { findChainTargets, isRootRedirect, resolvePath, type TreeNode } from "../runtime/command.js";
import { parserDef } from "../runtime/parsers.js";
import { compactTree, parserContext, type Registries } from "./generate.js";

export interface Probe {
  /** Function path inside the probe namespace, e.g. "p/12". */
  path: string;
  line: string;
  /** Command path with argument names, e.g. "tp <targets> <location>". */
  syntax: string;
  /** Parser ids used in this line. */
  parsers: string[];
  /** Set for variant lines: which argument got a non-default example. */
  variant?: { parser: string; index: number };
}

interface RawNode {
  children?: Record<string, RawNode>;
  permissions?: { permission?: { level?: string } };
}

/** Commands functions can't run (need permission level > 2) on versions whose commands.json has no permission info. */
const HIGH_PERMISSION = new Set([
  "ban", "ban-ip", "banlist", "deop", "op", "pardon", "pardon-ip", "save-all", "save-off", "save-on",
  "setidletimeout", "stop", "whitelist", "publish", "debug", "perf", "jfr", "kick", "transfer", "fetchprofile",
]);

function needsHighPermission(name: string, raw: RawNode | undefined): boolean {
  const level = raw?.permissions?.permission?.level;
  if (level) return level !== "gamemasters" && level !== "moderators" && level !== "all";
  return HIGH_PERMISSION.has(name);
}

/** Data pack format where loot conditions/functions switched to a "type" key (26.3 = 121; 26.2 = 107 still used the old keys). */
const FORMAT_TYPE_KEYS = 121;

/** The command after `run` in probe lines. */
const RUN_COMMAND = "say probe";

type Slot = { parser: string; props: Record<string, unknown> | undefined; run?: true };
type Token = string | Slot;

export interface ProbeSet {
  probes: Probe[];
  /** Command paths not probed, with the reason. */
  skipped: { syntax: string; reason: string }[];
}

export function buildProbes(commandsJson: unknown, registries: Registries, meta: { version: string; packFormat: number }): ProbeSet {
  const raw = commandsJson as RawNode;
  const root = compactTree(commandsJson as never);
  const chains = findChainTargets(root);
  const ctx = parserContext(registries, meta);
  const paths: { tokens: Token[]; syntax: string[] }[] = [];
  const skipped: { syntax: string; reason: string }[] = [];

  const walk = (node: TreeNode, tokens: Token[], syntax: string[], hops: number) => {
    if (node.q) {
      skipped.push({ syntax: syntax.join(" "), reason: `needs permission level ${node.q}` });
      return;
    }
    if (node.l && isRootRedirect(node)) {
      paths.push({ tokens: [...tokens, { parser: "", props: undefined, run: true }], syntax: [...syntax, "<command>"] });
      return;
    }
    const target = node.r && node.r.length ? resolvePath(root, node.r) : null;
    // A redirect into a chain node (execute subcommands), or the chain node itself (root `execute`).
    const chainTarget = target && chains.has(target) ? target : chains.has(node) ? node : null;
    if (node.x) paths.push({ tokens, syntax });
    if (chainTarget) {
      // Continue the chain once through each subcommand, then close it with `run say probe`.
      if (hops >= 1) {
        paths.push({ tokens: [...tokens, "run", { parser: "", props: undefined, run: true }], syntax: [...syntax, "run", "<command>"] });
        return;
      }
      for (const [name, child] of Object.entries(chainTarget.c ?? {})) {
        walk(child, [...tokens, name], [...syntax, name], hops + 1);
      }
      return;
    }
    const source = target ?? node;
    for (const [name, child] of Object.entries(source.c ?? {})) {
      if (child.l) walk(child, [...tokens, name], [...syntax, name], hops);
      else walk(child, [...tokens, { parser: child.p ?? "", props: child.o }], [...syntax, `<${name}>`], hops);
    }
  };

  for (const [name, node] of Object.entries(root.c ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (needsHighPermission(name, raw.children?.[name])) {
      skipped.push({ syntax: name, reason: "needs permission level > 2" });
      continue;
    }
    walk(node, [name], [name], 0);
  }

  const probes: Probe[] = [];
  const seen = new Set<string>();
  const render = (tokens: Token[], pick: (slot: Slot, i: number) => unknown): string =>
    tokens
      .map((t, i) => {
        if (typeof t === "string") return t;
        if (t.run) return RUN_COMMAND;
        return parserDef(t.parser).serialize(pick(t, i), t.props, ctx);
      })
      .join(" ");

  for (const { tokens, syntax } of paths) {
    const slots = tokens.map((t, i) => [t, i] as const).filter(([t]) => typeof t !== "string" && !t.run) as [Slot, number][];
    const parsers = [...new Set(slots.map(([s]) => s.parser))];
    const examplesOf = (s: Slot) => parserDef(s.parser).examples?.(s.props, ctx) ?? ["probe"];
    const noExamples = slots.find(([s]) => examplesOf(s).length === 0);
    if (noExamples) {
      skipped.push({ syntax: syntax.join(" "), reason: `no examples for ${noExamples[0].parser} (needs data-pack-defined entries)` });
      continue;
    }
    const add = (line: string, variant?: Probe["variant"]) => {
      if (seen.has(line)) return;
      seen.add(line);
      probes.push({ path: `p/${probes.length}`, line, syntax: syntax.join(" "), parsers, variant });
    };
    add(render(tokens, (s) => examplesOf(s)[0]));
    // One variant line per extra example, changing only that argument.
    for (const [slot, pos] of slots) {
      const ex = examplesOf(slot);
      for (let k = 1; k < ex.length; k++) {
        add(render(tokens, (s, i) => (i === pos ? ex[k] : examplesOf(s)[0])), { parser: slot.parser, index: k });
      }
    }
  }
  return { probes, skipped };
}

/** Datapack files for the probes: one function per probe plus the target function used by `function` args. */
export function probeFiles(probes: Probe[], packFormat: number): Map<string, string> {
  const legacy = packFormat < 45;
  const functionFolder = legacy ? "functions" : "function";
  const files = new Map<string, string>();
  files.set(`data/probe/${functionFolder}/target.mcfunction`, "say probe target\n");
  // Resources referenced by loot_predicate / loot_modifier examples. 26.3 renamed the discriminator
  // keys ("condition" / "function") to "type".
  const typeKey = packFormat >= FORMAT_TYPE_KEYS;
  files.set(
    `data/probe/${legacy ? "predicates" : "predicate"}/p.json`,
    JSON.stringify({ [typeKey ? "type" : "condition"]: "minecraft:random_chance", chance: 0.5 }),
  );
  files.set(
    `data/probe/${legacy ? "item_modifiers" : "item_modifier"}/m.json`,
    JSON.stringify({ [typeKey ? "type" : "function"]: "minecraft:set_count", count: 1 }),
  );
  for (const p of probes) files.set(`data/probe/${functionFolder}/${p.path}.mcfunction`, p.line + "\n");
  return files;
}

export interface ProbeResult {
  /** Argument formats the server rejected: these are parser bugs for this version. */
  failed: { probe: Probe; error: string }[];
  /** A literal was rejected (experimental feature or a subcommand needing higher permission). */
  unavailable: { probe: Probe; error: string }[];
}

/** Classify probes that failed to load, from server log output. */
export function probeResults(log: string, probes: Probe[]): ProbeResult {
  const byPath = new Map(probes.map((p) => [p.path, p]));
  const lines = log.split("\n");
  const seen = new Set<string>();
  const result: ProbeResult = { failed: [], unavailable: [] };
  lines.forEach((line, i) => {
    if (!/(Failed to load|Couldn't load) function/i.test(line)) return;
    const m = /probe:(?:functions?\/)?(p\/\d+)/.exec(line);
    if (!m) return;
    const probe = byPath.get(m[1]!);
    if (!probe || seen.has(probe.path)) return;
    seen.add(probe.path);
    const detail = lines.slice(i + 1, i + 5).find((l) => l.includes("Whilst parsing")) ?? line;
    const error = detail.replace(/^.*Whilst parsing command on line \d+: /, "").trim();
    // "Unknown command at position 0" / "Incorrect argument for command at position N: <literal>": the
    // command or subcommand itself isn't available to functions, not an argument format problem.
    const unavailable =
      /^(Unknown command|Incorrect argument for command)/.test(error) ||
      /^Unknown or incomplete command.* at position 0:/.test(error) ||
      // Some versions print only the position: the marker right after a literal of the command.
      /^at position \d+: (\S+ )?<--\[HERE\]$/.test(error);
    (unavailable ? result.unavailable : result.failed).push({ probe, error });
  });
  return result;
}
