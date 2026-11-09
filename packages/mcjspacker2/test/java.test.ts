import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findJava } from "../src/env/java.js";

describe("findJava", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("uses JAVA_HOME_<major>_<arch> for the version's Java when the launcher runtime is missing", () => {
    const home = mkdtempSync(join(tmpdir(), "mcjs2-java-"));
    const java = join(home, "bin", process.platform === "win32" ? "java.exe" : "java");
    mkdirSync(join(home, "bin"));
    writeFileSync(java, "");
    chmodSync(java, 0o755);
    process.env.MINECRAFT_ROOT = join(home, "no-launcher");
    process.env.JAVA_HOME_99_X64 = home;
    process.env.JAVA_HOME = join(home, "elsewhere");
    expect(findJava({ component: "java-runtime-omega", majorVersion: 99 })).toBe(java);
  });
});
