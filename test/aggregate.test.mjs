import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../src/analysis/aggregate.mjs";

const W = [
  { date: 1, distanceKm: 5, durationMin: 25, elevGain: 30, paceMinKm: 5 },
  { date: 2, distanceKm: 10, durationMin: 60, elevGain: 80, paceMinKm: 6 },
  { date: 3, distanceKm: 15, durationMin: 90, elevGain: 100, paceMinKm: 6 },
];

test("aggregate totals, average pace (time-weighted) and longest", () => {
  const a = aggregate(W);
  assert.equal(a.count, 3);
  assert.equal(a.totalKm, 30);
  assert.equal(a.totalMin, 175);
  assert.equal(a.totalElev, 210);
  assert.equal(a.longestKm, 15);
  assert.ok(Math.abs(a.avgPace - 175 / 30) < 1e-9);
});

test("aggregate of empty list is zeros", () => {
  const a = aggregate([]);
  assert.equal(a.count, 0);
  assert.equal(a.totalKm, 0);
  assert.equal(a.avgPace, 0);
  assert.equal(a.longestKm, 0);
});
