import { join } from "node:path";
import { cac } from "cac";
import { loadConfig } from "./config.js";
import { generateLibrary } from "./codegen/emit.js";
import { buildPack, formatBuildError } from "./build/build.js";
import { writePackDir, writePackZip } from "./build/pack.js";
import { dev } from "./dev/watch.js";
import { existsSync } from "node:fs";

const log = (s: string) => console.log(`[mcjs2] ${s}`);
const cli = cac("mcjs2");

cli.option("--cwd <dir>", "Project directory", { default: process.cwd() });

cli
  .command("gen", "Run datagen on the server jar (downloaded if not provided) and generate the typed command library")
  .option("--force", "Re-run datagen even if cached")
  .action(async (o) => {
    const cfg = await loadConfig(o.cwd);
    const r = await generateLibrary(cfg, { force: o.force, log });
    for (const w of r.warnings) log(`warning: ${w}`);
    log(`Generated ${r.stats.commands} commands (${r.stats.nodes} node types) -> ${cfg.genDir}`);
  });

cli
  .command("build", "Build the datapack into the output directory")
  .option("--zip", "Also write <name>.zip")
  .action(async (o) => {
    const cfg = await loadConfig(o.cwd);
    if (!existsSync(join(cfg.genDir, "meta.json"))) await generateLibrary(cfg, { log });
    const { files, functionCount, warnings } = await buildPack(cfg);
    for (const w of warnings) log(`warning: ${w}`);
    const dir = join(cfg.outDir, cfg.name);
    writePackDir(dir, files);
    log(`Built ${functionCount} functions -> ${dir}`);
    if (o.zip) {
      writePackZip(join(cfg.outDir, `${cfg.name}.zip`), files);
      log(`Zipped -> ${join(cfg.outDir, cfg.name + ".zip")}`);
    }
  });

cli
  .command("dev", "Start the dev server (or use a singleplayer world), rebuild on every save and reload in game")
  .option("--save <name>", 'Use a singleplayer save instead of the server ("auto" = most recently played)')
  .action(async (o) => {
    const cfg = await loadConfig(o.cwd);
    if (!existsSync(join(cfg.genDir, "meta.json"))) await generateLibrary(cfg, { log });
    await dev(o.cwd, { save: o.save === true ? "auto" : o.save, log });
  });

cli.help();
cli.version("0.1.0");

try {
  cli.parse(process.argv, { run: false });
  if (!cli.matchedCommand) cli.outputHelp();
  else await cli.runMatchedCommand();
} catch (e) {
  console.error(`[mcjs2] ${formatBuildError(e)}`);
  process.exit(1);
}
