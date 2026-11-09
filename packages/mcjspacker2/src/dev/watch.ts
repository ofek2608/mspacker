import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connect as netConnect } from "node:net";
import { watch } from "chokidar";
import { loadConfig, type ResolvedConfig } from "../config.js";
import { buildPack, formatBuildError, type GenMeta } from "../build/build.js";
import { generateLibrary } from "../codegen/emit.js";
import { writePackDir } from "../build/pack.js";
import { findJavaFor } from "../env/java.js";
import { requireMinecraftRoot } from "../env/mcroot.js";
import { readServerProperties, resolveServer } from "../env/server.js";
import { Rcon } from "./rcon.js";
import { detectCurrentSave, findSave } from "./saves.js";

export interface DevOptions {
  /** Singleplayer save name, or "auto". When unset, dev runs the dedicated server. */
  save?: string;
  log: (s: string) => void;
}

interface Target {
  describe(): string;
  /** Directory to write the pack into (resolved per build so `auto` follows the open world). */
  packDir(cfg: ResolvedConfig): string;
  reload(): Promise<void>;
  /** `version` changed in the config while dev was running. */
  versionChanged(cfg: ResolvedConfig, from: string): Promise<void>;
  close(): void;
}

function saveTarget(cfg: ResolvedConfig, save: string, log: (s: string) => void): Target {
  const root = requireMinecraftRoot(cfg.minecraftRoot);
  return {
    describe: () => (save === "auto" ? `auto-detected singleplayer save in ${root}` : `singleplayer save "${save}"`),
    packDir: (c) => {
      if (save !== "auto") return join(findSave(root, save).dir, "datapacks", c.name);
      const { save: s, ambiguous } = detectCurrentSave(root);
      if (ambiguous.length) log(`warning: several saves were played recently (${[s, ...ambiguous].map((a) => a.name).join(", ")}); using "${s.name}". Pass --save <name> to choose.`);
      return join(s.dir, "datapacks", c.name);
    },
    reload: async () => log("Pack updated. Run /reload in game."),
    versionChanged: async (c) => log(`Open the world in Minecraft ${c.version} to use the new version.`),
    close: () => {},
  };
}

async function serverTarget(cfg: ResolvedConfig, opts: DevOptions): Promise<Target> {
  const server = await resolveServer(cfg.projectDir, cfg.version, cfg.server, { log: opts.log, forDev: true });
  const propsFile = join(server.dir, "server.properties");
  if (!existsSync(propsFile)) {
    // Fresh server dir: enable RCON so dev can /reload. The server fills in all other defaults.
    writeFileSync(propsFile, `enable-rcon=true\nrcon.port=25575\nrcon.password=${randomBytes(12).toString("hex")}\n`);
    opts.log(`Created ${propsFile} with RCON enabled for auto-reload.`);
  }
  const props = readServerProperties(server.dir);
  const levelName = props["level-name"] || "world";
  const rconEnabled = props["enable-rcon"] === "true";
  const host = cfg.server?.host ?? "127.0.0.1";
  const port = Number(props["rcon.port"] || 25575);
  const password = props["rcon.password"] ?? "";
  if (!rconEnabled || !password) {
    opts.log(
      `warning: RCON is not configured, so /reload can't be sent automatically. In ${join(server.dir, "server.properties")} set:\n` +
        "  enable-rcon=true\n  rcon.password=<something>\n  rcon.port=25575",
    );
  }
  let child: ChildProcess | null = null;
  const eulaFile = join(server.dir, "eula.txt");
  const eulaAccepted = () => existsSync(eulaFile) && /^\s*eula\s*=\s*true\s*$/m.test(readFileSync(eulaFile, "utf8"));
  const gamePort = Number(props["server-port"] || 25565);
  if (await isListening(host, gamePort)) {
    opts.log(`A server is already running on port ${gamePort}; using it instead of starting one.`);
  } else {
    const java = await findJavaFor(cfg.version, { configured: cfg.java, minecraftRoot: cfg.minecraftRoot });
    opts.log(`Starting server in ${server.dir}...`);
    child = spawn(java, [...(cfg.server?.jvmArgs ?? []), "-jar", server.jar, "nogui"], { cwd: server.dir, stdio: "inherit" });
    child.on("exit", (code) => {
      child = null;
      if (!eulaAccepted()) {
        // The server writes eula.txt itself and stops until the user accepts it. Keep watching.
        opts.log(
          `Server stopped: the Minecraft EULA (https://aka.ms/MinecraftEULA) is not accepted.\n` +
            `  To accept it, set eula=true in ${eulaFile}, then run \`mcjs2 dev\` again. Still watching and rebuilding.`,
        );
        return;
      }
      opts.log(`Server exited (${code}).`);
      process.exit(code ?? 0);
    });
  }
  let rcon: Rcon | null = null;
  const connect = async () => {
    if (rcon && !rcon.closed) return rcon;
    // While a server we started is still booting, RCON refuses connections; wait for it.
    const deadline = Date.now() + (child ? 120_000 : 0);
    for (;;) {
      try {
        rcon = await Rcon.connect(host, port, password);
        return rcon;
      } catch (e) {
        if (!child || Date.now() > deadline) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  };
  // A server we just started loads the pack itself on boot, so the first build needs no reload.
  let skipNextReload = child !== null;
  return {
    describe: () => `server ${server.dir} (world "${levelName}")`,
    packDir: (c) => join(server.dir, levelName, "datapacks", c.name),
    reload: async () => {
      if (skipNextReload) {
        skipNextReload = false;
        opts.log("Pack ready; the server loads it on startup.");
        return;
      }
      if (!rconEnabled || !password) {
        opts.log("Pack updated. Run /reload on the server.");
        return;
      }
      try {
        const res = await (await connect()).command("reload");
        opts.log(`Reloaded via RCON${res ? `: ${res.trim()}` : "."}`);
      } catch (e) {
        rcon = null;
        opts.log(`Pack updated, but RCON reload failed (${(e as Error).message}). Is the server running?`);
      }
    },
    versionChanged: async (c, from) => {
      try {
        // Swaps the jar if mcjs2 installed it (a jar you put there yourself is never replaced).
        await resolveServer(c.projectDir, c.version, c.server, { log: opts.log, forDev: true });
      } catch (e) {
        opts.log(`warning: couldn't set up the Minecraft ${c.version} server jar: ${(e as Error).message}`);
      }
      opts.log(
        child
          ? `The server is still running Minecraft ${from}. To play on ${c.version}, type \`stop\` in the server console, then run \`mcjs2 dev\` again.`
          : `If the server is running, restart it to play on Minecraft ${c.version}.`,
      );
    },
    close: () => {
      rcon?.close();
      child?.kill();
    },
  };
}

export async function dev(projectDir: string, opts: DevOptions): Promise<void> {
  let cfg = await loadConfig(projectDir);
  const target = opts.save ? saveTarget(cfg, opts.save, opts.log) : await serverTarget(cfg, opts);
  opts.log(`Dev target: ${target.describe()}`);

  let running = false;
  let queued = false;
  let reloadConfig = false;
  // The version the generated commands are for; regenerated when the config's version changes.
  let libVersion = generatedVersion(cfg);
  // Our own regeneration writes .mcjs2/gen, which shouldn't trigger another rebuild.
  let generatedAt = 0;
  const run = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      if (reloadConfig) {
        cfg = await loadConfig(projectDir);
        reloadConfig = false;
      }
      if (cfg.version !== libVersion) {
        const from = libVersion;
        if (from) opts.log(`Minecraft version changed from ${from} to ${cfg.version}; regenerating commands...`);
        await generateLibrary(cfg, { log: opts.log });
        generatedAt = Date.now();
        libVersion = cfg.version;
        if (from) await target.versionChanged(cfg, from);
      }
      const t0 = Date.now();
      const { files, functionCount, warnings } = await buildPack(cfg, { dev: true });
      for (const w of warnings) opts.log(`warning: ${w}`);
      const dir = target.packDir(cfg);
      writePackDir(dir, files);
      opts.log(`Built ${functionCount} functions -> ${dir} (${Date.now() - t0} ms)`);
      await target.reload();
    } catch (e) {
      opts.log(`Build failed, keeping the previous pack:\n${formatBuildError(e)}`);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void run();
      }
    }
  };

  await run();
  let timer: NodeJS.Timeout | undefined;
  const watcher = watch([cfg.srcDir, cfg.rawDir, cfg.configFile, cfg.genDir], { ignoreInitial: true });
  watcher.on("all", (_event, path) => {
    if (path.startsWith(cfg.genDir) && Date.now() - generatedAt < 2000) return;
    if (path === cfg.configFile) reloadConfig = true;
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  });
  opts.log("Watching for changes. Ctrl+C to stop.");
  const stop = () => {
    void watcher.close();
    target.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

/** The version `.mcjs2/gen` was generated for, or null if it hasn't been generated. */
function generatedVersion(cfg: ResolvedConfig): string | null {
  const file = join(cfg.genDir, "meta.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as GenMeta).version : null;
}

/** Whether something accepts TCP connections on host:port (a server that's already running). */
function isListening(host: string, port: number): Promise<boolean> {
  return new Promise((resolveP) => {
    const socket = netConnect({ host, port });
    const done = (result: boolean) => {
      socket.destroy();
      resolveP(result);
    };
    socket.setTimeout(500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}
