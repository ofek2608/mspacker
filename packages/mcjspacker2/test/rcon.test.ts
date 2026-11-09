import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { decodePackets, encodePacket, Rcon } from "../src/dev/rcon.js";

describe("rcon packets", () => {
  it("round-trips", () => {
    const buf = Buffer.concat([encodePacket(7, 2, "reload"), encodePacket(8, 2, "list")]);
    const { packets, rest } = decodePackets(buf);
    expect(packets).toEqual([
      { id: 7, type: 2, body: "reload" },
      { id: 8, type: 2, body: "list" },
    ]);
    expect(rest.length).toBe(0);
  });

  it("keeps partial packets", () => {
    const buf = encodePacket(1, 2, "hello");
    const { packets, rest } = decodePackets(buf.subarray(0, 8));
    expect(packets).toEqual([]);
    expect(rest.length).toBe(8);
  });
});

describe("rcon client", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  function fakeServer(password: string, silentOn?: string): Promise<number> {
    server = createServer((sock) => {
      let buf: Buffer = Buffer.alloc(0);
      sock.on("data", (d: Buffer) => {
        const { packets, rest } = decodePackets(Buffer.concat([buf, d]));
        buf = rest;
        for (const p of packets) {
          if (p.type === 3) sock.write(encodePacket(p.body === password ? p.id : -1, 2, ""));
          else if (p.body !== silentOn) sock.write(encodePacket(p.id, 0, `ran: ${p.body}`));
        }
      });
    });
    return new Promise((r) => server!.listen(0, "127.0.0.1", () => r((server!.address() as { port: number }).port)));
  }

  it("authenticates and runs commands", async () => {
    const port = await fakeServer("pw");
    const rcon = await Rcon.connect("127.0.0.1", port, "pw");
    expect(await rcon.command("reload")).toBe("ran: reload");
    rcon.close();
  });

  it("rejects a bad password", async () => {
    const port = await fakeServer("pw");
    await expect(Rcon.connect("127.0.0.1", port, "nope")).rejects.toThrow(/authentication failed/);
  });

  it("times out when the server never answers", async () => {
    const port = await fakeServer("pw", "hang");
    const rcon = await Rcon.connect("127.0.0.1", port, "pw");
    await expect(rcon.command("hang", 200)).rejects.toThrow(/timed out after 200 ms: hang/);
    expect(await rcon.command("after")).toBe("ran: after");
    rcon.close();
  });
});
