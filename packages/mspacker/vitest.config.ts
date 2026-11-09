import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Version matrix tests run concurrently; each one starts a JVM (datagen + a server capped at 1 GB).
    maxConcurrency: Number(process.env.MSPACKER_MATRIX_CONCURRENCY ?? 6),
  },
});
