import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "../src/analysis/verdict.mjs";

const many = (paceSlope) => ({
  workouts: [{}, {}, {}, {}],
  trends: { pace: paceSlope },
  spikes: [{ band: "none", suppressed: false }],
  load: { ratio: 1.0 },
});

test("trend up/flat/down from pace slope (negative pace slope = faster = up)", () => {
  assert.equal(verdict(many(-0.02)).trend, "up");
  assert.equal(verdict(many(0)).trend, "flat");
  assert.equal(verdict(many(0.02)).trend, "down");
});

test("trendText matches trend", () => {
  assert.equal(verdict(many(-0.02)).trendText, "Kunto nousussa");
  assert.equal(verdict(many(0.02)).trendText, "Kunto laskussa");
});

test("risk high when latest spike band high or ACWR > 1.5", () => {
  const m = many(0); m.spikes = [{ band: "high", suppressed: false }];
  assert.equal(verdict(m).risk, "high");
  const m2 = many(0); m2.load = { ratio: 1.8 };
  assert.equal(verdict(m2).risk, "high");
});

test("risk moderate when band moderate or ACWR > 1.3", () => {
  const m = many(0); m.load = { ratio: 1.4 };
  assert.equal(verdict(m).risk, "moderate");
});

test("risk ignores suppressed spikes and picks the latest real band", () => {
  const m = many(0);
  m.spikes = [{ band: "high", suppressed: true }, { band: "none", suppressed: false }];
  assert.equal(verdict(m).risk, "low");
});

test("short history (<3 workouts) falls back to a data-gathering message", () => {
  const v = verdict({ workouts: [{}], trends: { pace: -0.9 }, spikes: [], load: {} });
  assert.equal(v.trendText, "Kerää lisää dataa");
  assert.equal(v.risk, "low");
});

test("text combines trendText and riskText", () => {
  assert.equal(verdict(many(-0.02)).text, "Kunto nousussa · loukkaantumisriski matala");
});
