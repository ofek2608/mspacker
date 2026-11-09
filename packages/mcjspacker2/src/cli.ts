import { join } from "node:path";
import { cac } from "cac";
import { loadConfig } from "./config.js";
import { generateLibrary } from "./codegen/emit.js";
import { buildPack } from "./build/build.js";
import { writePackDir, writePackZip } from "./build/pack.js";
import { dev } from "./dev/watch.js";
import { init } from "./init.js";
import { existsSync } from "node:fs";

const log = (s: string) => console.log(`[mcjs2] ${s}`);
const cli = cac("mcjs2");

cli.option("--cwd <dir>", "Project directory", { default: process.cwd() });

cli
  .command("init", "Scaffold a project in the current directory")
  .option("--mc-version <id>", "Minecraft version")
  .option("--namespace <ns>", "Datapack namespace")
  .action((o) => init(o.cwd, { version: o.mcVersion, namespace: o.namespace, log }));

cli
  .command("gen", "Run datagen on the server jar (downloaded if not provided) and generate the typed command library")
  .option("--force", "Re-run datagen even if cached")
  .action(async (o) => {
    const cfg = await loadConfig(o.cwd);
    const r = await generateLibrary(cfg, { force: o.force, log });
    for (const w of r.warnings) log(`warning: ${w}`);
    log(`Generated ${r.stats.commands} commands (${r.stats.overloads} overloads, ${r.stats.chains} chain builders) -> ${cfg.genDir}`);
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
  .command("dev", "Watch, rebuild into the server world (or a save), and /reload")
  .option("--save <name>", 'Target a singleplayer save instead of the server ("auto" = most recently played)')
  .option("--start", "Start the dedicated server too")
  .action(async (o) => {
    const cfg = await loadConfig(o.cwd);
    if (!existsSync(join(cfg.genDir, "meta.json"))) await generateLibrary(cfg, { log });
    await dev(o.cwd, { save: o.save === true ? "auto" : o.save, start: o.start, log });
  });

cli.help();
cli.version("0.1.0");

try {
  cli.parse(process.argv, { run: false });
  if (!cli.matchedCommand) cli.outputHelp();
  else await cli.runMatchedCommand();
} catch (e) {
  console.error(`[mcjs2] ${(e as Error).message}`);
  process.exit(1);
}
