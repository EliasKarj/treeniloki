import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionLoad, acwr } from "../src/analysis/trainingLoad.mjs";

const DAY = 86400000;
const w = (day, distanceKm, elevGain = 0) => ({ date: day * DAY, distanceKm, elevGain, durationMin: 0, paceMinKm: 5 });

test("sessionLoad = distanceKm * (1 + elevGain/500)", () => {
  assert.equal(sessionLoad(w(0, 10, 0)), 10);
  assert.equal(sessionLoad(w(0, 10, 500)), 20);
});

test("acwr = acute (last 7d load) / chronic (avg weekly over last 28d)", () => {
  const ws = [];
  for (let d = 0; d <= 27; d++) ws.push(w(d, 10, 0));
  const a = acwr(ws);
  assert.ok(Math.abs(a.ratio - 1.0) < 0.2, `ratio ${a.ratio}`);
});

test("acwr of empty history is zeros", () => {
  const a = acwr([]);
  assert.equal(a.ratio, 0);
});
