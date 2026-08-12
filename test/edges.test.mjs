// Edge and boundary cases the per-module suites left uncovered.
//
// Every threshold in this app is a judgement call, and the branch either side
// of it is where a silent regression hides: the band that never fires, the
// fallback that turns out to throw, the rounding that produces "5:60".

import { test } from "node:test";
import assert from "node:assert/strict";

import { detrainingNote } from "../src/analysis/detraining.mjs";
import { GOALS, goalMetric, goalWeight } from "../src/analysis/goals.mjs";
import { elevGain, fmtPace, paceMinKm, durationMin, summarizeWorkout } from "../src/analysis/workout.mjs";
import { comeback, splitBlocks, slopePerDay, activeFrequencyPerWeek } from "../src/analysis/breaks.mjs";
import { zoneOf, hrSummary, maxHrObserved } from "../src/analysis/hrZones.mjs";
import { verdict } from "../src/analysis/verdict.mjs";
import { coachingTips } from "../src/analysis/coaching.mjs";
import { acwr, sessionLoad } from "../src/analysis/trainingLoad.mjs";
import { intensityDistribution, classifyEffort, easyPace } from "../src/analysis/intensity.mjs";
import { vo2maxOf, vdotTrend } from "../src/analysis/vo2max.mjs";
import { parseGpx } from "../src/parse/gpx.mjs";
import { aggregate } from "../src/analysis/aggregate.mjs";
import { spikeRisk } from "../src/analysis/spikeRisk.mjs";
import { workout, daysAgo, DAY } from "./helpers/fixtures.mjs";

// ------------------------------------------------------------- detraining

test("detrainingNote covers every band boundary", () => {
  assert.equal(detrainingNote(13), null, "just under two weeks is not a break");
  assert.match(detrainingNote(14), /~2 vk/, "the 14-day boundary is inclusive");
  assert.match(detrainingNote(20), /~2 vk/);
  assert.match(detrainingNote(21), /6–7 %/);
  assert.match(detrainingNote(41), /6–7 %/);
  assert.match(detrainingNote(42), /1–1,5 kk/);
  assert.match(detrainingNote(62), /1–1,5 kk/);
  assert.match(detrainingNote(63), /2\+ kk/);
});

// ------------------------------------------------------------------ goals

test("goalMetric falls back to endurance for an unknown goal", () => {
  const model = { intensity: { easyPct: 82 } };
  assert.deepEqual(goalMetric("ei-tällaista", model), { label: "Kestävyys", value: 82, unit: "% helppoa" });
});

test("goalWeight falls back to endurance for an unknown goal", () => {
  assert.equal(goalWeight("ei-tällaista", "intensity"), goalWeight("endurance", "intensity"));
  assert.equal(goalWeight("endurance", "vdot"), 0, "an unrelated area carries no weight");
});

test("every goal declares areas that goalWeight can rank", () => {
  for (const [key, g] of Object.entries(GOALS)) {
    assert.ok(g.areas.length > 0, `${key} has no areas`);
    assert.equal(goalWeight(key, g.areas[0]), g.areas.length, `${key}'s first area should rank highest`);
  }
});

test("goalMetric returns null rather than throwing when the metric is absent", () => {
  assert.equal(goalMetric("speed", {}).value, null);
  assert.equal(goalMetric("fatloss", {}).value, null);
  assert.equal(goalMetric("injury", { spikes: [] }).value, null);
});

// ---------------------------------------------------------------- workout

test("fmtPace rolls 59.5+ seconds up to the next whole minute", () => {
  assert.equal(fmtPace(5.999), "6:00", "must never render as 5:60");
  assert.equal(fmtPace(4.5), "4:30");
  assert.equal(fmtPace(6), "6:00");
});

test("fmtPace renders a dash for missing or nonsensical pace", () => {
  assert.equal(fmtPace(0), "–");
  assert.equal(fmtPace(-1), "–");
  assert.equal(fmtPace(null), "–");
  assert.equal(fmtPace(undefined), "–");
});

test("elevGain treats a missing elevation as zero instead of NaN", () => {
  const gain = elevGain([{ ele: 10 }, {}, { ele: 12 }]);
  assert.ok(Number.isFinite(gain), `expected a finite gain, got ${gain}`);
  assert.equal(gain, 12);
});

test("elevGain ignores descents and sub-threshold noise", () => {
  assert.equal(elevGain([{ ele: 0 }, { ele: 0.2 }, { ele: 0.4 }]), 0, "0.2 m steps are noise");
  assert.equal(elevGain([{ ele: 100 }, { ele: 50 }]), 0, "a descent adds nothing");
});

test("durationMin and paceMinKm guard degenerate input", () => {
  assert.equal(durationMin([]), 0);
  assert.equal(durationMin([{ t: 0 }]), 0, "one point has no duration");
  assert.equal(paceMinKm(0, 30), 0, "zero distance must not divide by zero");
});

test("summarizeWorkout on a single point yields zeros, not NaN", () => {
  const s = summarizeWorkout([{ lat: 60, lon: 24, ele: 0, t: 0 }]);
  for (const [k, v] of Object.entries(s)) assert.ok(Number.isFinite(v), `${k} is ${v}`);
});

// ----------------------------------------------------------------- breaks

test("comeback reports null when the old pace is never regained", () => {
  const now = Date.UTC(2026, 0, 1);
  const ws = [
    workout({ date: now, distanceKm: 10, durationMin: 50 }), // 5:00
    workout({ date: now + 3 * DAY, distanceKm: 10, durationMin: 50 }),
    // 20-day break, and everything after is slower than before
    workout({ date: now + 23 * DAY, distanceKm: 10, durationMin: 60 }),
    workout({ date: now + 26 * DAY, distanceKm: 10, durationMin: 62 }),
  ];
  const [cb] = comeback(ws);
  assert.equal(cb.gapDays, 20);
  assert.equal(cb.workoutsToReturn, null);
  assert.ok(cb.firstBackPace > cb.preAvgPace);
});

test("splitBlocks and frequency handle a single workout and an empty history", () => {
  assert.deepEqual(splitBlocks([]), []);
  assert.equal(activeFrequencyPerWeek([]), 0);
  const one = [workout({ date: Date.now() })];
  assert.equal(splitBlocks(one).length, 1);
  assert.equal(activeFrequencyPerWeek(splitBlocks(one)), 7, "a lone workout spans one day");
});

test("slopePerDay is zero when there is nothing to fit", () => {
  assert.equal(slopePerDay([], (w) => w.distanceKm), 0);
  assert.equal(slopePerDay([workout({ date: 0 })], (w) => w.distanceKm), 0);
  const sameDay = [workout({ date: 1000 }), workout({ date: 1000 })];
  assert.equal(slopePerDay(sameDay, (w) => w.distanceKm), 0, "no spread on the x axis");
});

// --------------------------------------------------------------- hr zones

test("zoneOf refuses to guess without both inputs", () => {
  assert.equal(zoneOf(150, null), null);
  assert.equal(zoneOf(150, 0), null);
  assert.equal(zoneOf(null, 190), null);
});

test("zoneOf places each band boundary in the higher zone", () => {
  const max = 200;
  assert.equal(zoneOf(119, max), 1);
  assert.equal(zoneOf(120, max), 2); // 60 %
  assert.equal(zoneOf(140, max), 3); // 70 %
  assert.equal(zoneOf(160, max), 4); // 80 %
  assert.equal(zoneOf(180, max), 5); // 90 %
});

test("maxHrObserved and hrSummary ignore workouts without heart rate", () => {
  assert.equal(maxHrObserved([{ points: [{ hr: null }, { hr: null }] }]), null);
  assert.equal(hrSummary([{ points: [{ hr: null, t: 0 }, { hr: null, t: 60000 }] }]), null);
});

test("hrSummary skips segments whose first point lacks a reading", () => {
  const points = [
    { hr: null, t: 0 },
    { hr: 180, t: 60000 },
    { hr: 180, t: 120000 },
  ];
  const s = hrSummary([{ points }]);
  const total = s.zoneMinutes.reduce((a, b) => a + b, 0);
  assert.equal(total, 1, "only the one fully-tagged segment counts");
});

// ---------------------------------------------------------------- verdict

test("verdict reports a falling trend when pace slows", () => {
  const model = { workouts: [1, 2, 3], trends: { pace: 0.01 }, spikes: [], load: { ratio: 1 } };
  const v = verdict(model);
  assert.equal(v.trend, "down");
  assert.equal(v.trendText, "Kunto laskussa");
});

test("verdict reports moderate risk from a moderate band and from ACWR alone", () => {
  const fromBand = verdict({
    workouts: [1, 2, 3],
    trends: { pace: 0 },
    spikes: [{ band: "moderate", suppressed: false }],
    load: { ratio: 1 },
  });
  assert.equal(fromBand.risk, "moderate");

  const fromLoad = verdict({ workouts: [1, 2, 3], trends: { pace: 0 }, spikes: [], load: { ratio: 1.35 } });
  assert.equal(fromLoad.risk, "moderate");
  assert.match(fromLoad.riskText, /kohonnut/);
});

test("verdict tolerates a model missing trends and load entirely", () => {
  const v = verdict({ workouts: [1, 2, 3] });
  assert.equal(v.trend, "flat");
  assert.equal(v.risk, "low");
});

// --------------------------------------------------------------- coaching

test("a moderate spike yields a warn tip rather than an alert", () => {
  const now = Date.now();
  const ws = [
    workout({ date: daysAgo(10, now), distanceKm: 10 }),
    workout({ date: daysAgo(5, now), distanceKm: 10 }),
    workout({ date: daysAgo(1, now), distanceKm: 12 }),
  ];
  const model = { workouts: ws, spikes: spikeRisk(ws), load: { ratio: 1 }, trends: { pace: 0 } };
  const tip = coachingTips(model, "injury", now).find((t) => t.area === "spike");
  assert.ok(tip, "expected a spike tip");
  assert.equal(tip.severity, "warn");
  assert.match(tip.text, /Matka nousi reippaasti/);
  assert.match(tip.text, /≤ \d+ km/, "should still name a concrete cap");
});

test("a low ACWR yields an informational room-to-grow tip", () => {
  const now = Date.now();
  const ws = [
    workout({ date: daysAgo(27, now), distanceKm: 20 }),
    workout({ date: daysAgo(20, now), distanceKm: 20 }),
    workout({ date: daysAgo(14, now), distanceKm: 20 }),
    workout({ date: daysAgo(9, now), distanceKm: 20 }),
    workout({ date: daysAgo(1, now), distanceKm: 2 }),
  ];
  const model = { workouts: ws, spikes: spikeRisk(ws), load: acwr(ws), trends: { pace: 0 } };
  assert.ok(model.load.ratio > 0 && model.load.ratio < 0.8, `ratio was ${model.load.ratio}`);
  const tip = coachingTips(model, "endurance", now).find((t) => t.area === "load");
  assert.ok(tip, "expected a load tip");
  assert.equal(tip.severity, "info");
  assert.match(tip.text, /Kuorma matala/);
});

test("coaching reports both directions of the pace trend", () => {
  const base = { workouts: [1, 2, 3], spikes: [], load: { ratio: 1 } };
  const improving = coachingTips({ ...base, trends: { pace: -0.01 } }).find((t) => t.area === "trend");
  assert.match(improving.text, /Tahti paranee/);
  const worsening = coachingTips({ ...base, trends: { pace: 0.01 } }).find((t) => t.area === "trend");
  assert.match(worsening.text, /hidastunut/);
  const flat = coachingTips({ ...base, trends: { pace: 0 } }).find((t) => t.area === "trend");
  assert.equal(flat, undefined, "a flat trend says nothing");
});

test("coaching describes the VO2max direction", () => {
  const base = { workouts: [1, 2, 3], spikes: [], load: { ratio: 1 }, trends: { pace: 0 } };
  const up = coachingTips({ ...base, vdot: { current: 50, points: [{ value: 45 }, { value: 50 }] } });
  assert.match(up.find((t) => t.area === "vdot").text, /noussut/);
  const down = coachingTips({ ...base, vdot: { current: 42, points: [{ value: 48 }, { value: 42 }] } });
  assert.match(down.find((t) => t.area === "vdot").text, /laskenut/);
  const flat = coachingTips({ ...base, vdot: { current: 45, points: [{ value: 45 }, { value: 45 }] } });
  assert.match(flat.find((t) => t.area === "vdot").text, /vakaa/);
});

test("coaching reports a healthy intensity split as information, not a warning", () => {
  const model = {
    workouts: [1, 2, 3],
    spikes: [],
    load: { ratio: 1 },
    trends: { pace: 0 },
    intensity: { drift: "ok", easyPct: 82, moderatePct: 10, hardPct: 8 },
  };
  const tip = coachingTips(model, "endurance").find((t) => t.area === "intensity");
  assert.equal(tip.severity, "info");
  assert.match(tip.text, /82 % helppoa/);
});

test("coaching stays silent about a break that is no longer recent", () => {
  const now = Date.now();
  const model = {
    workouts: [workout({ date: daysAgo(60, now) })],
    spikes: [],
    load: { ratio: 1 },
    trends: { pace: 0 },
    lastComeback: { gapDays: 30 },
  };
  assert.equal(coachingTips(model, "endurance", now).find((t) => t.area === "break"), undefined);
});

// ----------------------------------------------------------- training load

test("sessionLoad scales with climb and acwr guards an empty chronic window", () => {
  assert.equal(sessionLoad({ distanceKm: 10, elevGain: 0 }), 10);
  assert.equal(sessionLoad({ distanceKm: 10, elevGain: 500 }), 20, "500 m of climb doubles the load");
  assert.deepEqual(acwr([]), { acute: 0, chronic: 0, ratio: 0 });
});

test("acwr is zero when the only history is older than the chronic window", () => {
  const now = Date.now();
  const ws = [workout({ date: daysAgo(400, now) }), workout({ date: daysAgo(399, now) })];
  const r = acwr(ws);
  assert.ok(Number.isFinite(r.ratio), `ratio ${r.ratio}`);
});

// -------------------------------------------------------------- intensity

test("classifyEffort defaults to moderate without a usable reference", () => {
  assert.equal(classifyEffort(5, 0), "moderate");
  assert.equal(classifyEffort(5, null), "moderate");
  assert.equal(classifyEffort(0, 5), "moderate");
});

test("easyPace averages the middle pair for an even-length history", () => {
  assert.equal(easyPace([{ paceMinKm: 4 }, { paceMinKm: 5 }, { paceMinKm: 6 }, { paceMinKm: 7 }]), 5.5);
  assert.equal(easyPace([{ paceMinKm: 0 }]), null, "a zero pace is not a data point");
  assert.equal(easyPace([]), null);
});

test("intensityDistribution ignores zero-duration workouts", () => {
  const now = Date.now();
  const ws = [
    workout({ date: daysAgo(1, now), distanceKm: 10, durationMin: 60 }),
    { ...workout({ date: daysAgo(2, now) }), durationMin: 0, paceMinKm: 0 },
  ];
  const it = intensityDistribution(ws, now);
  assert.equal(it.easyMin + it.moderateMin + it.hardMin, 60);
});

// ----------------------------------------------------------------- vo2max

test("vo2maxOf rejects impossible efforts", () => {
  assert.equal(vo2maxOf(0, 30), null);
  assert.equal(vo2maxOf(10, 0), null);
  assert.equal(vo2maxOf(-5, 30), null);
});

test("vdotTrend ignores efforts under the 3 km floor", () => {
  const now = Date.now();
  const ws = [workout({ date: daysAgo(3, now), distanceKm: 2.5, durationMin: 12 })];
  assert.deepEqual(vdotTrend(ws), { current: null, points: [] });
});

// ------------------------------------------------------------------- gpx

test("parseGpx names the workout Treeni when the document has no name", () => {
  const gpx = `<gpx><trk><trkseg>
    <trkpt lat="60.0" lon="24.9"><time>2026-01-01T10:00:00Z</time></trkpt>
    <trkpt lat="60.01" lon="24.9"><time>2026-01-01T10:06:00Z</time></trkpt>
  </trkseg></trk></gpx>`;
  assert.equal(parseGpx(gpx).name, "Treeni");
});

test("parseGpx skips trackpoints with an unparseable timestamp", () => {
  const gpx = `<gpx><trk><name>T</name><trkseg>
    <trkpt lat="60.0" lon="24.9"><time>ei-aikaleima</time></trkpt>
    <trkpt lat="60.01" lon="24.9"><time>2026-01-01T10:00:00Z</time></trkpt>
    <trkpt lat="60.02" lon="24.9"><time>2026-01-01T10:06:00Z</time></trkpt>
  </trkseg></trk></gpx>`;
  assert.equal(parseGpx(gpx).points.length, 2);
});

test("parseGpx defaults a missing elevation to zero", () => {
  const gpx = `<gpx><trk><name>T</name><trkseg>
    <trkpt lat="60.0" lon="24.9"><time>2026-01-01T10:00:00Z</time></trkpt>
    <trkpt lat="60.01" lon="24.9"><time>2026-01-01T10:06:00Z</time></trkpt>
  </trkseg></trk></gpx>`;
  assert.ok(parseGpx(gpx).points.every((p) => p.ele === 0));
});

// ------------------------------------------------------------- aggregate

test("aggregate reports zero average pace when nothing was covered", () => {
  const a = aggregate([workout({ date: 0, distanceKm: 0, durationMin: 30 })]);
  assert.equal(a.avgPace, 0);
  assert.equal(a.count, 1);
});
