// End-to-end tests over the real pipeline: GPX text → parseGpx →
// summarizeWorkout → buildModel → verdict / coachingTips.
//
// The per-module unit tests all pass against hand-written model objects, which
// means a mismatch between what one module emits and what the next expects —
// a renamed field, a changed shape, a broken import path — would not fail any
// of them. These tests import app/main.mjs itself, so the app's own wiring is
// what is under test.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installAppDom } from "./helpers/dom.mjs";
import { gpxRun, runsToWorkouts, daysAgo } from "./helpers/fixtures.mjs";
import { verdict } from "../src/analysis/verdict.mjs";
import { coachingTips } from "../src/analysis/coaching.mjs";

let dom;
let buildModel;
let bootstrap;

// app/main.mjs touches document at import time, so the stub must exist first —
// hence a dynamic import rather than a static one.
before(async () => {
  dom = installAppDom();
  ({ buildModel, bootstrap } = await import("../app/main.mjs"));
  bootstrap();
});

after(() => dom.uninstall());

/**
 * Six easy runs, one hard run, and a closing 15 km that is 1.5× the trailing
 * 30-day longest — enough history to light up every analysis in the model.
 */
function historyGpx(now = Date.now()) {
  const easy = Array.from({ length: 6 }, (_, i) =>
    gpxRun({ name: `Peruslenkki ${i + 1}`, start: daysAgo(24 - i * 3, now), km: 10, minutes: 60, hr: 130 }),
  );
  const hard = gpxRun({ name: "Vetolenkki", start: daysAgo(5, now), km: 5, minutes: 20, hr: 190 });
  const spike = gpxRun({ name: "Pitkä lenkki", start: daysAgo(1, now), km: 15, minutes: 90, hr: 135, elevGainM: 120 });
  return [...easy, hard, spike];
}

test("app/main.mjs imports and wires up its DOM handlers without throwing", () => {
  assert.equal(typeof buildModel, "function");
  // index.html declares the drop target and file input; main.mjs binds to both.
  assert.ok(dom.byId.drop.listeners.drop, "drop handler bound");
  assert.ok(dom.byId.drop.listeners.dragover, "dragover handler bound");
  assert.ok(dom.byId.file.listeners.change, "file input handler bound");
  assert.equal(dom.tabs.filter((t) => t.listeners.click).length, 5, "every tab bound");
});

test("GPX text survives the parse → summarize round trip with exact numbers", () => {
  const now = Date.now();
  const [w] = runsToWorkouts([gpxRun({ name: "Tarkkuus", start: daysAgo(1, now), km: 10, minutes: 50, hr: 150, elevGainM: 100 })]);
  assert.equal(w.name, "Tarkkuus");
  assert.ok(Math.abs(w.distanceKm - 10) < 1e-6, `distanceKm ${w.distanceKm}`);
  assert.ok(Math.abs(w.durationMin - 50) < 1e-6, `durationMin ${w.durationMin}`);
  assert.ok(Math.abs(w.paceMinKm - 5) < 1e-6, `paceMinKm ${w.paceMinKm}`);
  assert.equal(w.elevGain, 100);
  assert.equal(w.avgHr, 150);
});

test("buildModel produces every field the render layer reads", () => {
  const model = buildModel(runsToWorkouts(historyGpx()));
  for (const key of ["workouts", "agg", "frequency", "trends", "spikes", "load", "lastComeback", "detraining", "intensity", "vdot", "hr"]) {
    assert.ok(key in model, `model.${key} missing`);
  }
  for (const key of ["pace", "distance", "elev"]) {
    assert.equal(typeof model.trends[key], "number", `trends.${key} not a number`);
  }
  assert.equal(model.spikes.length, model.workouts.length, "spikes must stay parallel to workouts");
});

test("aggregates over the pipeline match the fixture inputs", () => {
  const model = buildModel(runsToWorkouts(historyGpx()));
  assert.equal(model.agg.count, 8);
  // 6 × 10 km + 5 km + 15 km = 80 km
  assert.ok(Math.abs(model.agg.totalKm - 80) < 1e-6, `totalKm ${model.agg.totalKm}`);
  assert.ok(Math.abs(model.agg.longestKm - 15) < 1e-6, `longestKm ${model.agg.longestKm}`);
  // 6 × 60 + 20 + 90 = 470 min over 80 km
  assert.ok(Math.abs(model.agg.avgPace - 470 / 80) < 1e-6, `avgPace ${model.agg.avgPace}`);
});

test("a 1.5× closing run is flagged as a high spike and drives the verdict risk", () => {
  const model = buildModel(runsToWorkouts(historyGpx()));
  const last = model.spikes[model.spikes.length - 1];
  assert.equal(last.band, "high");
  assert.equal(last.suppressed, false);
  assert.ok(Math.abs(last.ratio - 1.5) < 1e-6, `ratio ${last.ratio}`);

  const v = verdict(model);
  assert.equal(v.risk, "high");
  assert.match(v.text, /loukkaantumisriski korkea/);
});

test("heart rate from GPX extensions reaches the zone summary", () => {
  const model = buildModel(runsToWorkouts(historyGpx()));
  assert.ok(model.hr, "hr summary should exist when GPX carries HR");
  assert.equal(model.hr.maxHr, 190);
  assert.equal(model.hr.zoneMinutes.length, 5);
  assert.ok(model.hr.zoneMinutes.some((m) => m > 0), "some time must land in a zone");
});

test("intensity is classified from HR and lands in the 80/20 band", () => {
  const model = buildModel(runsToWorkouts(historyGpx()));
  // 360 min easy (HR 130 → z2), 90 min moderate (135 → z3), 20 min hard (190 → z5)
  assert.equal(model.intensity.easyMin, 360);
  assert.equal(model.intensity.moderateMin, 90);
  assert.equal(model.intensity.hardMin, 20);
  assert.equal(model.intensity.drift, "ok");
  assert.equal(model.intensity.easyPct + model.intensity.moderatePct + model.intensity.hardPct, 100);
});

test("VO2max is estimated from the fastest qualifying effort", () => {
  const model = buildModel(runsToWorkouts(historyGpx()));
  assert.ok(model.vdot.current != null, "expected an estimate");
  assert.ok(model.vdot.current > 30 && model.vdot.current < 80, `implausible VO2max ${model.vdot.current}`);
  assert.ok(model.vdot.points.length >= 2, "expected a multi-week series");
});

test("coaching tips are generated from the real model and ranked by goal", () => {
  const model = buildModel(runsToWorkouts(historyGpx()));
  const tips = coachingTips(model, "injury");
  assert.ok(tips.length > 0);
  for (const t of tips) {
    assert.ok(["spike", "load", "break", "intensity", "trend", "vdot"].includes(t.area), `bad area ${t.area}`);
    assert.ok(["info", "warn", "alert"].includes(t.severity), `bad severity ${t.severity}`);
    assert.equal(typeof t.text, "string");
    assert.ok(t.text.length > 0);
  }
  // Loukkaantumissuoja weights spike highest, and the history closes on a spike.
  assert.equal(tips[0].area, "spike");
  assert.equal(tips[0].severity, "alert");
});

test("switching goal reorders tips without changing the underlying model", () => {
  const model = buildModel(runsToWorkouts(historyGpx()));
  const before = JSON.stringify(model.agg);
  const injury = coachingTips(model, "injury").map((t) => t.area);
  const speed = coachingTips(model, "speed").map((t) => t.area);
  assert.deepEqual([...injury].sort(), [...speed].sort(), "same tips, different order");
  assert.notDeepEqual(injury, speed, "goal should change the ranking");
  assert.equal(JSON.stringify(model.agg), before, "model must not be mutated");
});

test("files without timestamped trackpoints are dropped, not crashed on", () => {
  const good = gpxRun({ start: daysAgo(1, Date.now()), km: 5, minutes: 30 });
  const noTime = `<gpx><trk><name>Ei aikaa</name><trkseg><trkpt lat="60.0" lon="24.9"><ele>0</ele></trkpt></trkseg></trk></gpx>`;
  const notGpx = `{"definitely":"not gpx"}`;
  const workouts = runsToWorkouts([good, noTime, notGpx]);
  assert.equal(workouts.length, 1);
  assert.doesNotThrow(() => buildModel(workouts));
});

test("buildModel stays safe on empty and single-workout histories", () => {
  const empty = buildModel([]);
  assert.equal(empty.agg.count, 0);
  assert.equal(empty.spikes.length, 0);
  assert.equal(empty.vdot.current, null);
  assert.equal(empty.hr, null);
  assert.equal(verdict(empty).trendText, "Kerää lisää dataa");
  assert.doesNotThrow(() => coachingTips(empty, "endurance"));

  const one = buildModel(runsToWorkouts([gpxRun({ start: daysAgo(1, Date.now()), km: 5, minutes: 30 })]));
  assert.equal(one.agg.count, 1);
  assert.equal(one.trends.pace, 0, "a single point has no slope");
  assert.doesNotThrow(() => verdict(one));
});

test("a long break is detected end to end and carries a detraining note", () => {
  const now = Date.now();
  const gpx = [
    gpxRun({ start: daysAgo(120, now), km: 10, minutes: 60 }),
    gpxRun({ start: daysAgo(117, now), km: 10, minutes: 60 }),
    gpxRun({ start: daysAgo(114, now), km: 10, minutes: 60 }),
    // ~13 week gap
    gpxRun({ start: daysAgo(23, now), km: 10, minutes: 70 }),
    gpxRun({ start: daysAgo(20, now), km: 10, minutes: 68 }),
  ];
  const model = buildModel(runsToWorkouts(gpx));
  assert.ok(model.lastComeback, "expected a comeback record");
  assert.equal(model.lastComeback.gapDays, 91);
  assert.ok(model.detraining, "expected a detraining note");
  assert.match(model.detraining, /2\+ kk/);
  // The first two runs back must not be reported as distance spikes.
  assert.equal(model.spikes[3].suppressed, true);
  assert.equal(model.spikes[4].suppressed, true);
});
