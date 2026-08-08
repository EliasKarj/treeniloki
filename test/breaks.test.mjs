import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBlocks, slopePerDay, comeback, activeFrequencyPerWeek } from "../src/analysis/breaks.mjs";

const DAY = 86400000;
const w = (day, extra = {}) => ({ date: day * DAY, distanceKm: 5, durationMin: 25, elevGain: 0, paceMinKm: 5, ...extra });

test("splitBlocks breaks the history at gaps >= 14 days", () => {
  const ws = [w(0), w(3), w(6), w(30), w(33)];
  const blocks = splitBlocks(ws, 14);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].length, 3);
  assert.equal(blocks[1].length, 2);
});

test("slopePerDay is positive for an increasing series vs calendar days", () => {
  const ws = [w(0, { distanceKm: 5 }), w(10, { distanceKm: 7 }), w(20, { distanceKm: 9 })];
  const slope = slopePerDay(ws, (x) => x.distanceKm);
  assert.ok(Math.abs(slope - 0.2) < 1e-6);
});

test("comeback reports gap, pre-avg, first-back pace and workouts-to-return", () => {
  const ws = [
    w(0, { paceMinKm: 5 }), w(2, { paceMinKm: 5 }), w(4, { paceMinKm: 5 }),
    w(30, { paceMinKm: 6 }), w(32, { paceMinKm: 5.5 }), w(34, { paceMinKm: 5 }),
  ];
  const cbs = comeback(ws, 14);
  assert.equal(cbs.length, 1);
  assert.equal(cbs[0].gapDays, 26);
  assert.ok(Math.abs(cbs[0].preAvgPace - 5) < 1e-9);
  assert.ok(Math.abs(cbs[0].firstBackPace - 6) < 1e-9);
  assert.equal(cbs[0].workoutsToReturn, 3);
});

test("activeFrequencyPerWeek excludes break days", () => {
  const ws = [w(0), w(3), w(6), w(30), w(33), w(36)];
  const f = activeFrequencyPerWeek(splitBlocks(ws, 14));
  assert.ok(Math.abs(f - 3) < 1e-6);
});
