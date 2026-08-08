import { test } from "node:test";
import assert from "node:assert/strict";
import { detrainingNote } from "../src/analysis/detraining.mjs";

test("no note for short gaps (<14 days)", () => {
  assert.equal(detrainingNote(10), null);
});

test("2–3 week gap mentions ~6–7% and frames as normal", () => {
  const s = detrainingNote(21);
  assert.match(s, /6–7 %|6-7 %/);
  assert.match(s, /normaali/i);
});

test("long gap (9+ weeks) mentions ~20 %", () => {
  assert.match(detrainingNote(70), /20 %/);
});
