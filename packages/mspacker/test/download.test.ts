import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadServerJar, VERSION_MANIFEST_URL } from "../src/env/download.js";

const jarBytes = new TextEncoder().encode("fake jar");
const sha = createHash("sha1").update(jarBytes).digest("hex");

function stubFetch(serverSha1: string) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body));
    if (url === VERSION_MANIFEST_URL) return json({ versions: [{ id: "1.0", url: "https://meta/1.0.json" }] });
    if (url === "https://meta/1.0.json") return json({ downloads: { server: { url: "https://dl/server.jar", sha1: serverSha1 } } });
    if (url === "https://dl/server.jar") return new Response(jarBytes);
    return new Response("nope", { status: 404 });
  });
  return calls;
}

describe("downloadServerJar", () => {
  let cache: string;
  beforeEach(() => {
    cache = mkdtempSync(join(tmpdir(), "mspacker-dl-"));
    vi.stubEnv("XDG_CACHE_HOME", cache);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(cache, { recursive: true, force: true });
  });

  it("downloads, verifies and caches", async () => {
    const calls = stubFetch(sha);
    const jar = await downloadServerJar("1.0", () => {});
    expect(readFileSync(jar, "utf8")).toBe("fake jar");
    expect(calls).toHaveLength(3);
    await downloadServerJar("1.0", () => {});
    expect(calls).toHaveLength(3); // served from cache
  });

  it("rejects checksum mismatches", async () => {
    stubFetch("0".repeat(40));
    await expect(downloadServerJar("1.0", () => {})).rejects.toThrow(/checksum mismatch/);
  });

  it("rejects unknown versions", async () => {
    stubFetch(sha);
    await expect(downloadServerJar("9.9", () => {})).rejects.toThrow(/not in Mojang's version manifest/);
  });
});
