import { test } from "node:test";
import assert from "node:assert/strict";
import { easyPace, classifyEffort, intensityDistribution } from "../src/analysis/intensity.mjs";

const DAY = 86400000;
const NOW = 1_700_000_000_000;
const w = (ageDays, paceMinKm, durationMin = 60, extra = {}) =>
  ({ date: NOW - ageDays * DAY, paceMinKm, durationMin, points: [], ...extra });

test("easyPace is the median pace of workouts with a positive pace", () => {
  assert.equal(easyPace([w(0, 6), w(0, 5), w(0, 7)]), 6);
  assert.equal(easyPace([w(0, 0)]), null);
});

test("classifyEffort splits hard/easy at ±5% of the reference", () => {
  assert.equal(classifyEffort(5.6, 6), "hard");   // >5% faster
  assert.equal(classifyEffort(6.4, 6), "easy");    // >5% slower
  assert.equal(classifyEffort(6.0, 6), "moderate");
});

test("intensityDistribution is duration-weighted over the trailing 28 days", () => {
  // ref median = 6. Easy 60min (7:00), hard 30min (5:00) → easy 66%, hard 33%.
  const d = intensityDistribution([w(1, 7, 60), w(2, 5, 30), w(3, 6, 0)], NOW);
  assert.equal(d.easyMin, 60);
  assert.equal(d.hardMin, 30);
  assert.equal(d.easyPct, 67);
  assert.equal(d.hardPct, 33);
});

test("intensityDistribution ignores workouts older than 28 days", () => {
  const d = intensityDistribution([w(40, 5, 60), w(1, 6, 60)], NOW);
  assert.equal(d.easyMin + d.moderateMin + d.hardMin, 60);
});

test("empty window returns a safe zero shape with drift none", () => {
  const d = intensityDistribution([], NOW);
  assert.equal(d.drift, "none");
  assert.equal(d.easyPct, 0);
});

test("HR-tagged workout is classified by zone, not pace", () => {
  // maxHr observed 190; avgHr 120 → ~63% → zone2 → easy even though pace is fast.
  const d = intensityDistribution([
    w(1, 4.0, 60, { avgHr: 120, points: [{ hr: 190, t: 0 }] }),
  ], NOW);
  assert.equal(d.easyMin, 60);
});
