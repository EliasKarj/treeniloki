import { test } from "node:test";
import assert from "node:assert/strict";
import { spikeRisk } from "../src/analysis/spikeRisk.mjs";

const DAY = 86400000;
const w = (day, distanceKm) => ({ date: day * DAY, distanceKm, durationMin: 0, elevGain: 0, paceMinKm: 5 });

test("classifies a >30% single-session distance spike as high", () => {
  const ws = [w(0, 10), w(2, 10), w(4, 14)];
  const r = spikeRisk(ws);
  assert.equal(r[2].band, "high");
  assert.ok(Math.abs(r[2].ratio - 1.4) < 1e-9);
});

test("10–30% spike is moderate; within 10% is none", () => {
  assert.equal(spikeRisk([w(0, 10), w(2, 12)])[1].band, "moderate");
  assert.equal(spikeRisk([w(0, 10), w(2, 10.5)])[1].band, "none");
});

test("first workout after a >=14d break is suppressed (not flagged)", () => {
  const ws = [w(0, 10), w(2, 10), w(30, 20)];
  const r = spikeRisk(ws);
  assert.equal(r[2].suppressed, true);
  assert.equal(r[2].band, "none");
});

test("the very first workout has no baseline → none, not suppressed", () => {
  const r = spikeRisk([w(0, 8)]);
  assert.equal(r[0].band, "none");
  assert.equal(r[0].suppressed, false);
});
