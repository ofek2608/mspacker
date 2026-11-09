// Writing results: into storage, into a score, or as the function's return value.
import { $, type Macro, type MacroArg, type NbtCompound } from "#mc";
import { add, constant, intIn, OBJECTIVE, STORAGE, stored, sub, type Condition, type Num } from "./expr.js";

const top = (v: Num): NbtCompound => (typeof v === "number" || !("type" in Object(v)) ? constant(v) : (v as NbtCompound));

/** `demo:math <path> = value` as a float. */
export function setFloat(path: string, value: Num) {
  $.data.modify.storage(STORAGE, path).set.compute.default.float(top(value));
}

/** `demo:math <path> = value` as an int. */
export function setInt(path: string, value: Num) {
  $.data.modify.storage(STORAGE, path).set.compute.default.integer(top(value));
}

/** `<holder> math = value`. */
export function setScore(holder: string, value: Num) {
  $.execute.store.result.score(holder, OBJECTIVE).run.compute.default.integer(top(value));
}

/** End the function, returning an int. */
export function returnInt(value: Num) {
  $.return.run.compute.default.integer(top(value));
}

/** A chain that only runs when `condition` holds: `onlyIf(c).run.say("yes")`. */
export function onlyIf(condition: Condition) {
  return $.execute.if.predicate(condition);
}

let loops = 0;

/**
 * An in-game `for` loop: runs `body` for `name` = start .. end - 1. `end` (and `start`) are worked out
 * in game, so sizes can come from storage. `body` gets the loop variable and `pass` as macro
 * arguments; pass the variables of outer loops in `pass` (integers only).
 *
 * Each loop keeps its counter in storage (`demo:math loop.<name><n>`) and calls itself for the next
 * step, so the commands run one after another, never nested inside each other.
 */
export function forLoop<V extends string, P extends Record<string, MacroArg<number>> = {}>(
  name: V,
  end: Num,
  pass: P,
  body: (args: Macro<Record<V, number>> & P) => void,
  start: Num = 0,
) {
  const frame = `loop.${name}${loops++}`;
  // In an object so it stays anonymous: a `const step = ...` would name every loop "step".
  const loop = {
    step: (args: Macro<Record<V | "end", number>>) => {
      body(args as Macro<Record<V, number>> & P);
      setInt(`${frame}.${name}`, add(args[name], 1));
      // Next step while name + 1 < end.
      onlyIf(intIn(sub(args.end, args[name]), { min: 2 })).run.function(loop.step).with.storage(STORAGE, frame);
    },
  };
  $.data.modify.storage(STORAGE, frame).set.value({ ...pass });
  setInt(`${frame}.${name}`, start);
  setInt(`${frame}.end`, end);
  // Run while start < end.
  onlyIf(intIn(sub(stored(`${frame}.end`), stored(`${frame}.${name}`)), { min: 1 })).run.function(loop.step).with.storage(STORAGE, frame);
}
