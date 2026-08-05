import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineKm, distanceKm, durationMin, elevGain, paceMinKm, summarizeWorkout, fmtPace } from "../src/analysis/workout.mjs";

test("haversineKm: ~1.11 km per 0.01° latitude", () => {
  const d = haversineKm({ lat: 60.0, lon: 25.0 }, { lat: 60.01, lon: 25.0 });
  assert.ok(Math.abs(d - 1.112) < 0.02, `got ${d}`);
});

test("distanceKm sums consecutive legs", () => {
  const pts = [{ lat: 60.0, lon: 25.0 }, { lat: 60.01, lon: 25.0 }, { lat: 60.02, lon: 25.0 }];
  assert.ok(Math.abs(distanceKm(pts) - 2.224) < 0.04);
});

test("durationMin from first/last timestamp (ms)", () => {
  const pts = [{ t: 0 }, { t: 1 }, { t: 600000 }];
  assert.equal(durationMin(pts), 10);
});

test("elevGain sums only rises exceeding the 0.3 m threshold", () => {
  const pts = [{ ele: 100 }, { ele: 100.2 }, { ele: 101.2 }, { ele: 100.0 }, { ele: 100.5 }];
  assert.equal(elevGain(pts), 1.5);
});

test("paceMinKm = duration / distance, 0 distance → 0", () => {
  assert.equal(paceMinKm(2, 10), 5);
  assert.equal(paceMinKm(0, 10), 0);
});

test("summarizeWorkout returns all four derived fields", () => {
  const pts = [{ lat: 60, lon: 25, ele: 10, t: 0 }, { lat: 60.01, lon: 25, ele: 12, t: 600000 }];
  const s = summarizeWorkout(pts);
  assert.ok(s.distanceKm > 1 && s.distanceKm < 1.3);
  assert.equal(s.durationMin, 10);
  assert.equal(s.elevGain, 2);
  assert.ok(s.paceMinKm > 8 && s.paceMinKm < 10);
});

test("fmtPace formats min/km as m:ss", () => {
  assert.equal(fmtPace(5.2), "5:12");
  assert.equal(fmtPace(0), "–");
});
