import { test } from "node:test";
import assert from "node:assert/strict";
import { coachingTips } from "../src/analysis/coaching.mjs";

const DAY = 86400000;
const NOW = 1_700_000_000_000;

function baseModel() {
  return {
    workouts: [
      { date: NOW - 20 * DAY, distanceKm: 10, paceMinKm: 6 },
      { date: NOW - 2 * DAY, distanceKm: 15, paceMinKm: 6 },
    ],
    spikes: [
      { ratio: 1.0, band: "none", suppressed: false },
      { ratio: 1.5, band: "high", suppressed: false },
    ],
    load: { ratio: 1.0 },
    trends: { pace: -0.01 },
    intensity: { drift: "ok", easyPct: 80, moderatePct: 10, hardPct: 10 },
    lastComeback: null,
    vdot: { current: 42, points: [] },
  };
}

test("a high spike yields an alert tip with a distance cap", () => {
  const tips = coachingTips(baseModel(), "injury", NOW);
  const spike = tips.find((t) => t.area === "spike");
  assert.equal(spike.severity, "alert");
  assert.match(spike.text, /≤ 11 km/); // trailing-30 max is 10km → cap 11
});

test("high ACWR yields a warn load tip", () => {
  const m = baseModel(); m.load.ratio = 1.8;
  const tips = coachingTips(m, "endurance", NOW);
  assert.equal(tips.find((t) => t.area === "load").severity, "warn");
});

test("grey intensity drift yields a warn intensity tip", () => {
  const m = baseModel(); m.intensity = { drift: "grey", easyPct: 55, moderatePct: 40, hardPct: 5 };
  const tips = coachingTips(m, "endurance", NOW);
  assert.equal(tips.find((t) => t.area === "intensity").severity, "warn");
});

test("recent comeback yields a break tip with detraining note", () => {
  const m = baseModel();
  m.lastComeback = { gapDays: 30 };
  const tips = coachingTips(m, "fatloss", NOW);
  assert.ok(tips.find((t) => t.area === "break"));
});

test("goal weighting floats the goal's own areas to the top", () => {
  const tips = coachingTips(baseModel(), "injury", NOW);
  assert.equal(tips[0].area, "spike"); // injury prioritises spike
});

test("empty model does not throw and returns an array", () => {
  const tips = coachingTips({}, "endurance", NOW);
  assert.ok(Array.isArray(tips));
});
