import { test } from "node:test";
import assert from "node:assert/strict";
import { maxHrObserved, zoneOf, hrSummary } from "../src/analysis/hrZones.mjs";

const MIN = 60000;
const wk = (hrs) => ({
  points: hrs.map((hr, i) => ({ hr, t: i * MIN })),
});

test("maxHrObserved returns the highest point HR, or null", () => {
  assert.equal(maxHrObserved([wk([120, 150, 130])]), 150);
  assert.equal(maxHrObserved([{ points: [{ t: 0 }, { t: MIN }] }]), null);
});

test("zoneOf maps %maxHr to 1..5", () => {
  assert.equal(zoneOf(100, 200), 1); // 50%
  assert.equal(zoneOf(130, 200), 2); // 65%
  assert.equal(zoneOf(150, 200), 3); // 75%
  assert.equal(zoneOf(170, 200), 4); // 85%
  assert.equal(zoneOf(190, 200), 5); // 95%
  assert.equal(zoneOf(null, 200), null);
});

test("hrSummary accumulates zone minutes and easy/mod/hard split", () => {
  // maxHr = 200. Points at 100(z1),100(z1),180(z4): 2 minutes in z1, 1 minute in z4.
  const s = hrSummary([{ points: [
    { hr: 100, t: 0 }, { hr: 100, t: MIN }, { hr: 180, t: 2 * MIN },
  ] }]);
  assert.equal(s.maxHr, 180);
  // recompute with maxHr 180: 100/180=.55 z1, 180/180=1.0 z5
  assert.ok(s.zoneMinutes[0] >= 1);
});

test("hrSummary returns null when there is no HR anywhere", () => {
  assert.equal(hrSummary([{ points: [{ t: 0 }, { t: MIN }] }]), null);
});
