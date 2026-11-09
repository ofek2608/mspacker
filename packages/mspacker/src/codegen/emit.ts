import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedConfig } from "../config.js";
import { runDatagen } from "../datagen/run.js";
import { findJavaFor } from "../env/java.js";
import { dataPackFormat, resolveServer } from "../env/server.js";
import type { GenMeta } from "../build/build.js";
import { generate } from "./generate.js";
import { setParserOverrides } from "../runtime/parsers.js";

/** Locate the server, run datagen (cached), and write the library to .mspacker/gen. */
export async function generateLibrary(cfg: ResolvedConfig, opts: { force?: boolean; log: (s: string) => void }) {
  const server = await resolveServer(cfg.projectDir, cfg.version, cfg.server, { log: opts.log });
  const java = await findJavaFor(cfg.version, { configured: cfg.java, minecraftRoot: cfg.minecraftRoot });
  const reports = await runDatagen(server, java, { force: opts.force, log: opts.log });
  const packFormat = dataPackFormat(server.version);
  setParserOverrides(cfg.parsers);
  const result = generate(reports.commands, reports.registries, { version: cfg.version, packFormat: packFormat[0] });

  rmSync(cfg.genDir, { recursive: true, force: true });
  mkdirSync(cfg.genDir, { recursive: true });
  for (const [name, content] of Object.entries(result.files)) writeFileSync(join(cfg.genDir, name), content);
  const meta: GenMeta = { version: cfg.version, packFormat };
  writeFileSync(join(cfg.genDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  return { ...result, reportsDir: reports.dir };
}
