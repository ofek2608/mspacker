import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { fileSha1, type ServerInfo } from "../env/server.js";

function isBundlerJar(jar: string): boolean {
  let found = false;
  unzipSync(readFileSync(jar), { filter: (f) => (f.name === "META-INF/versions.list" ? (found = true) : false) });
  return found;
}

export interface Reports {
  dir: string;
  commands: unknown;
  registries: Record<string, { entries: Record<string, unknown> }>;
}

export function cacheRoot(): string {
  const base = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(base, "mcjspacker2");
}

function readReports(dir: string): Reports {
  return {
    dir,
    commands: JSON.parse(readFileSync(join(dir, "reports", "commands.json"), "utf8")),
    // registries.json exists since 1.14; without it, registry ids are typed as plain strings.
    registries: existsSync(join(dir, "reports", "registries.json"))
      ? JSON.parse(readFileSync(join(dir, "reports", "registries.json"), "utf8"))
      : {},
  };
}

/**
 * Run the server's data generator (`--reports`) and cache the output per jar hash.
 * Runs in a temp cwd so the server dir is not polluted with logs/libraries.
 */
export async function runDatagen(server: ServerInfo, java: string, opts: { force?: boolean; log?: (s: string) => void } = {}): Promise<Reports> {
  const log = opts.log ?? (() => {});
  const out = join(cacheRoot(), server.version.id.split(" / ")[0]!, fileSha1(server.jar));
  if (!opts.force && existsSync(join(out, "reports", "commands.json"))) return readReports(out);

  log(`Running Minecraft ${server.version.id} datagen (this takes a while the first time)...`);
  mkdirSync(cacheRoot(), { recursive: true });
  // Work inside the cache root so the final rename never crosses filesystems.
  const work = mkdtempSync(join(cacheRoot(), ".work-"));
  const staging = join(work, "generated");
  try {
    await new Promise<void>((resolveP, reject) => {
      // 1.18+ server jars are "bundlers" that unpack the real jar; older ones contain the classes directly.
      const launch = isBundlerJar(server.jar)
        ? ["-DbundlerMainClass=net.minecraft.data.Main", "-jar", server.jar]
        : ["-cp", server.jar, "net.minecraft.data.Main"];
      const child = spawn(java, [...launch, "--reports", "--output", staging], { cwd: work, stdio: ["ignore", "pipe", "pipe"] });
      let tail = "";
      const collect = (b: Buffer) => {
        tail = (tail + b.toString()).slice(-4000);
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolveP();
        else reject(new Error(`Datagen exited with code ${code}:\n${tail}`));
      });
    });
    if (!existsSync(join(staging, "reports", "commands.json"))) throw new Error("Datagen finished without producing reports/commands.json.");
    rmSync(out, { recursive: true, force: true });
    mkdirSync(join(out, ".."), { recursive: true });
    renameSync(staging, out);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return readReports(out);
}
