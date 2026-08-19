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

test("a workout with no distance does not slow the average pace", () => {
  // Salitreeni on 45 minuuttia ilman kilometrejä. Jos sen minuutit jaettaisiin
  // juoksun kilometreillä, keskitahti hidastuisi ilman että yksikään lenkki
  // muuttui — luku olisi väärä eikä sitä huomaisi mistään.
  const run = { distanceKm: 10, durationMin: 60, elevGain: 0 };
  const gym = { distanceKm: 0, durationMin: 45, elevGain: 0 };

  const alone = aggregate([run]);
  const together = aggregate([run, gym]);
  assert.equal(together.avgPace, alone.avgPace, "6:00/km stays 6:00/km");

  // Kokonaisajassa salitreeni on silti mukana: se on tehtyä työtä.
  assert.equal(together.totalMin, 105);
  assert.equal(together.totalKm, 10);
  assert.equal(together.count, 2);
});

test("a history with no distance at all reports no pace rather than infinity", () => {
  const only = aggregate([{ distanceKm: 0, durationMin: 45, elevGain: 0 }]);
  assert.equal(only.avgPace, 0);
  assert.equal(only.totalMin, 45);
});
