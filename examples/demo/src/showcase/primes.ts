// Primes: a sieve of Eratosthenes in storage, drawn as an Ulam spiral on the floor.
import { $, macro, type Macro } from "#mc";
import { add, floorDiv, intIn, mul, STORAGE, stored } from "../math/expr.js";
import { forLoop, onlyIf, setInt } from "../math/io.js";
import { FLOOR, label, setText, textDisplay } from "./ui.js";

const at = stored;
const SIZE = 25;
const N = SIZE * SIZE;
// The spiral covers x and z from -36 to -12 on the floor; text above its middle.
const PR = { x: -24, z: -24 };

/** Ulam spiral: 1 in the middle, then outward counter-clockwise. Worked out at build time. */
function spiral(): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  let [x, z, dx, dz, len] = [0, 0, 1, 0, 1];
  while (out.length < N) {
    for (let turn = 0; turn < 2; turn++) {
      for (let s = 0; s < len && out.length < N; s++) {
        x += dx;
        z += dz;
        out.push([x, z]);
      }
      [dx, dz] = [-dz, dx];
    }
    len++;
  }
  return out;
}

/** Mark index `showcase.mark.i` of the sieve as composite. */
function Unmark(args: Macro<"i">) {
  $.data.modify.storage(STORAGE, macro`showcase.sieve[${args.i}]`).set.value(0);
}

export function buildPrimes() {
  label(PR.x + 0.5, FLOOR + 3.5, PR.z + 0.5, "primes (Ulam spiral)");
  // sieve[n] = 1 for n = 0..N, then 0 and 1 aren't prime.
  $.data.modify.storage(STORAGE, "showcase.sieve").set.value(Array.from({ length: N + 1 }, (_, i) => (i < 2 ? 0 : 1)));
  // For p = 2..√N, cross out p·k for k = p..N/p.
  forLoop("p", Math.floor(Math.sqrt(N)) + 1, {}, (a) => {
    forLoop("k", add(floorDiv(N, a.p), 1), { p: a.p }, (b) => {
      setInt("showcase.mark.i", mul(b.p, b.k));
      $.function(Unmark).with.storage(STORAGE, "showcase.mark");
    }, a.p);
  }, 2);
  // Draw: one block per number, its place in the spiral known at build time.
  $.fill(`${PR.x - 12} ${FLOOR} ${PR.z - 12}`, `${PR.x + 12} ${FLOOR} ${PR.z + 12}`, "minecraft:light_gray_concrete");
  spiral().forEach(([dx, dz], i) => {
    const n = i + 1;
    onlyIf(intIn(at(`showcase.sieve[${n}]`), { min: 1 })).run.setblock(`${PR.x + dx} ${FLOOR} ${PR.z + dz}`, "minecraft:red_concrete");
  });
  $.setblock(`${PR.x} ${FLOOR} ${PR.z}`, "minecraft:gold_block");
  // Count them.
  setInt("showcase.primes", 0);
  forLoop("n", N + 1, {}, (a) => setInt("showcase.primes", add(at("showcase.primes"), at(macro`showcase.sieve[${a.n}]`))));
  textDisplay("primes_text", PR.x + 0.5, FLOOR + 2.6, PR.z + 0.5);
  setText("primes_text", `primes up to ${N}: `, { path: "showcase.primes" });
}
