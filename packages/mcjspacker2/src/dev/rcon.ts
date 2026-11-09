/** Minimal Source RCON client (as implemented by Minecraft servers). */
import { Socket } from "node:net";

const TYPE_AUTH = 3;
const TYPE_COMMAND = 2;

export function encodePacket(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, "utf8");
  const buf = Buffer.alloc(14 + payload.length);
  buf.writeInt32LE(10 + payload.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  // two trailing NUL bytes already zero
  return buf;
}

export interface Packet {
  id: number;
  type: number;
  body: string;
}

/** Decode as many complete packets as `buf` holds; returns packets and the leftover bytes. */
export function decodePackets(buf: Buffer): { packets: Packet[]; rest: Buffer } {
  const packets: Packet[] = [];
  let off = 0;
  while (buf.length - off >= 4) {
    const len = buf.readInt32LE(off);
    if (buf.length - off - 4 < len) break;
    const id = buf.readInt32LE(off + 4);
    const type = buf.readInt32LE(off + 8);
    const body = buf.toString("utf8", off + 12, off + 4 + len - 2);
    packets.push({ id, type, body });
    off += 4 + len;
  }
  return { packets, rest: buf.subarray(off) };
}

export class Rcon {
  private socket: Socket;
  private buffer: Buffer = Buffer.alloc(0);
  private nextId = 1;
  private waiters = new Map<number, { resolve: (p: Packet) => void; reject: (e: Error) => void }>();
  closed = false;

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => {
      const { packets, rest } = decodePackets(Buffer.concat([this.buffer, chunk]));
      this.buffer = rest;
      for (const p of packets) {
        const w = this.waiters.get(p.id) ?? (p.id === -1 ? [...this.waiters.values()][0] : undefined);
        if (w) {
          this.waiters.delete(p.id === -1 ? [...this.waiters.keys()][0]! : p.id);
          if (p.id === -1) w.reject(new Error("RCON authentication failed (check rcon.password)."));
          else w.resolve(p);
        }
      }
    });
    const fail = (err: Error) => {
      this.closed = true;
      for (const w of this.waiters.values()) w.reject(err);
      this.waiters.clear();
    };
    socket.on("error", fail);
    socket.on("close", () => fail(new Error("RCON connection closed.")));
  }

  static connect(host: string, port: number, password: string, timeoutMs = 3000): Promise<Rcon> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`RCON connection to ${host}:${port} timed out.`));
      }, timeoutMs);
      socket.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      socket.connect(port, host, async () => {
        clearTimeout(timer);
        const rcon = new Rcon(socket);
        try {
          await rcon.send(TYPE_AUTH, password, timeoutMs);
          resolve(rcon);
        } catch (e) {
          rcon.close();
          reject(e);
        }
      });
    });
  }

  private send(type: number, body: string, timeoutMs: number): Promise<Packet> {
    if (this.closed) return Promise.reject(new Error("RCON connection closed."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error(`RCON command timed out after ${timeoutMs} ms: ${type === TYPE_AUTH ? "<auth>" : body}`));
      }, timeoutMs);
      const done = <T>(fn: (v: T) => void) => (v: T) => {
        clearTimeout(timer);
        fn(v);
      };
      this.waiters.set(id, { resolve: done(resolve), reject: done(reject) });
      this.socket.write(encodePacket(id, type, body));
    });
  }

  /** Run a command; rejects if the server doesn't answer within `timeoutMs`. */
  async command(cmd: string, timeoutMs = 10_000): Promise<string> {
    return (await this.send(TYPE_COMMAND, cmd, timeoutMs)).body;
  }

  close(): void {
    this.closed = true;
    this.socket.destroy();
  }
}
