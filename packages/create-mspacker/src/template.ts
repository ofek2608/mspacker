import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const TSCONFIG = {
  compilerOptions: {
    target: "ES2023",
    module: "ESNext",
    moduleResolution: "bundler",
    strict: true,
    noImplicitOverride: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  },
  include: ["src", ".mcjs2/gen", "mcjs2.config.ts"],
};

const CONFIG_NAMES = ["mcjs2.config.ts", "mcjs2.config.mts", "mcjs2.config.js", "mcjs2.config.mjs"];

export interface InitOptions {
  version?: string;
  namespace?: string;
  description?: string;
  log: (s: string) => void;
}

/** Version of this package; mcjspacker2 and create-mcjspacker2 are released together. */
const OWN_VERSION: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

/** Scaffold a project: config, package.json `#mc` import, tsconfig, .gitignore, sample source. */
export function scaffold(dir: string, opts: InitOptions): void {
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

  if (!CONFIG_NAMES.some((n) => existsSync(join(dir, n)))) {
    write(
      "mcjs2.config.ts",
      `import { defineConfig } from "mcjspacker2";

export default defineConfig({
  version: ${JSON.stringify(opts.version ?? "26.3")},
  namespace: ${JSON.stringify(ns)},${opts.description ? `\n  description: ${JSON.stringify(opts.description)},` : ""}
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
  pkg.scripts = { gen: "mcjs2 gen", build: "mcjs2 build", dev: "mcjs2 dev", typecheck: "tsc --noEmit", ...(pkg.scripts ?? {}) };
  if (!pkg.dependencies?.mcjspacker2 && !pkg.devDependencies?.mcjspacker2) {
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}), mcjspacker2: `^${OWN_VERSION}` };
  }
  if (!pkg.dependencies?.typescript && !pkg.devDependencies?.typescript) {
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}), typescript: "^7.0.2" };
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  opts.log("update package.json");

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
    `import { $ } from "#mc";

/** @load */
export function Init() {
  $.say("Datapack loaded!");
}

/** @mcfunction */
export function Greet() {
  $.execute.as("@a").at("@s").run.tellraw("@s", { text: "Hello!", color: "gold" });
}
`,
  );
}
