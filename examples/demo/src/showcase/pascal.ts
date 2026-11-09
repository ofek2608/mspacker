// Pascal's triangle mod 2 is the Sierpinski triangle: 32 rows, drawn on the floor.
import { $, macro } from "#mc";
import { add, floorMod, intIn, STORAGE, stored } from "../math/expr.js";
import { forLoop, onlyIf, setInt } from "../math/io.js";
import { FLOOR, label, Plot } from "./ui.js";

const at = stored;
const ROWS = 32;
// x from 14 to 45, z from -40 to -9, on the floor.
const PA = { x: 14, z: -40 };

export function buildPascal() {
  label(PA.x + ROWS / 2, FLOOR + 3, PA.z + ROWS / 2, "Pascal's triangle mod 2");
  $.fill(`${PA.x} ${FLOOR} ${PA.z}`, `${PA.x + ROWS - 1} ${FLOOR} ${PA.z + ROWS - 1}`, "minecraft:black_concrete");
  $.data.modify.storage(STORAGE, "pas.row").set.value([1]);
  forLoop("r", ROWS, {}, (row) => {
    // Draw row r: a block for every odd entry.
    forLoop("k", add(row.r, 1), { r: row.r }, (a) => {
      $.data.modify.storage(STORAGE, "ui.plot").set.value({ y: FLOOR, block: "minecraft:purple_concrete" });
      setInt("ui.plot.x", add(PA.x, a.k));
      setInt("ui.plot.z", add(PA.z, a.r));
      onlyIf(intIn(at(macro`pas.row[${a.k}]`), { min: 1 })).run.function(Plot).with.storage(STORAGE, "ui.plot");
    });
    // The next row: 1, then (row[k-1] + row[k]) mod 2 for k = 1..r, then 1.
    $.data.modify.storage(STORAGE, "pas.next").set.value([1]);
    $.data.modify.storage(STORAGE, "pas.prev").set.from.storage(STORAGE, "pas.row[0]");
    forLoop("k", add(row.r, 1), {}, (a) => {
      $.data.modify.storage(STORAGE, "pas.next").append.compute.default.integer(floorMod(add(at("pas.prev"), at(macro`pas.row[${a.k}]`)), 2));
      $.data.modify.storage(STORAGE, "pas.prev").set.from.storage(STORAGE, macro`pas.row[${a.k}]`);
    }, 1);
    $.data.modify.storage(STORAGE, "pas.next").append.value(1);
    $.data.modify.storage(STORAGE, "pas.row").set.from.storage(STORAGE, "pas.next");
  });
}
