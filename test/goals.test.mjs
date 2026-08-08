import { test } from "node:test";
import assert from "node:assert/strict";
import { GOALS, goalMetric, goalWeight } from "../src/analysis/goals.mjs";

const model = {
  vdot: { current: 42.5 },
  intensity: { easyPct: 78, easyMin: 240 },
  spikes: [{ ratio: 1.0, band: "none", suppressed: false }, { ratio: 1.4, band: "high", suppressed: false }],
};

test("goalMetric selects the goal's headline metric", () => {
  assert.deepEqual(goalMetric("speed", model), { label: "Nopeus", value: 42.5, unit: "VO₂max" });
  assert.equal(goalMetric("endurance", model).value, 78);
  assert.equal(goalMetric("fatloss", model).value, 240);
  assert.equal(goalMetric("injury", model).value, 1.4);
});

test("goalMetric tolerates missing model fields", () => {
  assert.equal(goalMetric("speed", {}).value, null);
});

test("goalWeight ranks a goal's own areas above others", () => {
  assert.ok(goalWeight("injury", "spike") > goalWeight("injury", "vdot"));
  assert.equal(goalWeight("injury", "vdot"), 0);
});

test("GOALS has the four expected keys", () => {
  assert.deepEqual(Object.keys(GOALS), ["speed", "endurance", "fatloss", "injury"]);
});
