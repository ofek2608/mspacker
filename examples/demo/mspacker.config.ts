import { defineConfig } from "@ofekn/mspacker";

export default defineConfig({
  version: "26.4-snapshot-7",
  namespace: "demo:generated/",
  description: "mspacker demo pack",
  // Dev server dir. A jar you put here is used; otherwise the official jar is downloaded.
  server: { dir: "server" },
});
