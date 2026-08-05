import { test } from "node:test";
import assert from "node:assert/strict";
import { vo2maxOf, vdotTrend } from "../src/analysis/vo2max.mjs";

const DAY = 86400000;

test("vo2maxOf for 5km in 25min is ~38 (Daniels)", () => {
  const v = vo2maxOf(5, 25);
  assert.ok(v > 37 && v < 40, `got ${v}`);
});

test("vo2maxOf guards zero/invalid input", () => {
  assert.equal(vo2maxOf(0, 25), null);
  assert.equal(vo2maxOf(5, 0), null);
});

test("vdotTrend keeps one best (fastest) effort per 7-day bucket", () => {
  const w = (date, distanceKm, durationMin, paceMinKm) => ({ date, distanceKm, durationMin, paceMinKm });
  const t = vdotTrend([
    w(0, 5, 30, 6),                 // week 0 slower
    w(1 * DAY, 5, 25, 5),           // week 0 faster -> kept
    w(10 * DAY, 5, 24, 4.8),        // week 1
    w(2 * DAY, 2, 10, 5),           // too short, ignored
  ]);
  assert.equal(t.points.length, 2);
  assert.ok(t.current > 0);
});

test("vdotTrend with no qualifying effort returns nulls", () => {
  const t = vdotTrend([{ date: 0, distanceKm: 2, durationMin: 12, paceMinKm: 6 }]);
  assert.equal(t.current, null);
  assert.deepEqual(t.points, []);
});
