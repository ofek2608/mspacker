import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { findConfig } from "./config.js";

const TSCONFIG = {
  compilerOptions: {
    target: "ES2023",
    module: "ESNext",
    moduleResolution: "bundler",
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  },
  include: ["src", ".mcjs2/gen", "mcjs2.config.ts"],
};

/** Scaffold a project: config, package.json `#mc` import, tsconfig, .gitignore, sample source. */
export function init(dir: string, opts: { version?: string; namespace?: string; log: (s: string) => void }): void {
  const ns = opts.namespace ?? basename(dir).toLowerCase().replace(/[^a-z0-9_.-]/g, "_");
  const write = (rel: string, content: string) => {
    const p = join(dir, rel);
    if (existsSync(p)) {
      opts.log(`skip ${rel} (exists)`);
      return;
    }
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
    opts.log(`create ${rel}`);
  };

  if (!findConfig(dir)) {
    write(
      "mcjs2.config.ts",
      `import { defineConfig } from "mcjspacker2";

export default defineConfig({
  version: ${JSON.stringify(opts.version ?? "26.3")},
  namespace: ${JSON.stringify(ns)},
  // Dev server directory. A server jar you put here is used as-is; otherwise the
  // official jar for \`version\` is downloaded. Override with MCJS2_SERVER_DIR.
  server: { dir: "server" },
});
`,
    );
  }

  const pkgPath = join(dir, "package.json");
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")) : { name: basename(dir), private: true };
  pkg.type ??= "module";
  pkg.imports = { ...(pkg.imports ?? {}), "#mc": "./.mcjs2/gen/index.ts" };
  pkg.scripts = { gen: "mcjs2 gen", build: "mcjs2 build", dev: "mcjs2 dev", ...(pkg.scripts ?? {}) };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  opts.log("update package.json (imports #mc, scripts)");

  write("tsconfig.json", JSON.stringify(TSCONFIG, null, 2) + "\n");

  const gi = join(dir, ".gitignore");
  const lines = existsSync(gi) ? readFileSync(gi, "utf8").split("\n") : [];
  const want = [".mcjs2/", "dist/", "node_modules/", "server/"].filter((l) => !lines.includes(l));
  if (want.length) {
    writeFileSync(gi, [...lines.filter(Boolean), ...want].join("\n") + "\n");
    opts.log("update .gitignore");
  }

  write(
    "src/main.ts",
    `import { Say, Tellraw, Execute } from "#mc";

/** @load */
export function Init() {
  Say("Datapack loaded!");
}

/** @mcfunction */
export function Greet() {
  Execute().As("@a").At("@s").Run(() => Tellraw("@s", { text: "Hello!", color: "gold" }));
}
`,
  );
}
