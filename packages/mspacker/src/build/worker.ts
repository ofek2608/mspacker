/**
 * Runs one build of the user's code in a worker thread (see `BuildOptions.isolate`). The worker is
 * terminated afterwards, which frees the loaded copy of the bundle.
 */
import { parentPort, workerData } from "node:worker_threads";
import { loadConfig } from "../config.js";
import { executeBundle, readGenMeta, type WorkerInput, type WorkerResult } from "./build.js";

const input = workerData as WorkerInput;
let result: WorkerResult;
try {
  const cfg = await loadConfig(input.projectDir);
  const out = await executeBundle(cfg, readGenMeta(cfg), input.outfile, input.dev);
  result = { ok: true, files: [...out.files], functionCount: out.functionCount };
} catch (e) {
  const err = e instanceof Error ? e : new Error(String(e));
  result = { ok: false, message: err.message, ...(err.stack ? { stack: err.stack } : {}) };
}
parentPort!.postMessage(result);
