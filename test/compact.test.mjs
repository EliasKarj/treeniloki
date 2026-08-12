// Kompakti vientimuoto.
//
// Tärkein väite ei ole että tiedosto on pieni, vaan että se on **riittävä**:
// kompaktista tiedostosta luetun historian pitää tuottaa sama analyysi kuin
// alkuperäisten GPX-tiedostojen. Suurin osa näistä testeistä vertaa juuri sitä.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMPACT_VERSION, hrHistogram, toCompactRecord, buildCompactFile, isCompact, parseCompact, histogramStats,
  keyFromFilename, workoutsToCompactFile,
} from "../src/parse/compact.mjs";
import { parseGpx } from "../src/parse/gpx.mjs";
import { summarizeWorkout } from "../src/analysis/workout.mjs";
import { hrSummary, maxHrObserved } from "../src/analysis/hrZones.mjs";
import { aggregate } from "../src/analysis/aggregate.mjs";
import { intensityDistribution } from "../src/analysis/intensity.mjs";
import { vdotTrend } from "../src/analysis/vo2max.mjs";
import { gpxRun, runsToWorkouts, daysAgo } from "./helpers/fixtures.mjs";

/** Sama historia kahdessa muodossa: GPX:stä luettuna ja kompaktin kautta. */
function bothForms(now = Date.now()) {
  const gpx = [
    gpxRun({ name: "Peruslenkki", start: daysAgo(20, now), km: 10, minutes: 60, hr: 130, elevGainM: 60 }),
    gpxRun({ name: "Vetolenkki", start: daysAgo(12, now), km: 5, minutes: 20, hr: 185 }),
    gpxRun({ name: "Pitkä", start: daysAgo(4, now), km: 18, minutes: 108, hr: 142, elevGainM: 150 }),
  ];
  const fromGpx = runsToWorkouts(gpx);
  const records = fromGpx.map((w, i) => toCompactRecord(w, `key${i}`));
  const fromCompact = parseCompact(JSON.stringify(buildCompactFile(records)));
  return { fromGpx, fromCompact };
}

const close = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

// ------------------------------------------------------------- riittävyys

test("a compact file reproduces the same aggregates as the original GPX", () => {
  const { fromGpx, fromCompact } = bothForms();
  const a = aggregate(fromGpx), b = aggregate(fromCompact);
  assert.equal(b.count, a.count);
  close(b.totalKm, a.totalKm, 0.01, "totalKm");
  close(b.totalMin, a.totalMin, 0.01, "totalMin");
  close(b.totalElev, a.totalElev, 0.1, "totalElev");
  close(b.avgPace, a.avgPace, 0.001, "avgPace");
  close(b.longestKm, a.longestKm, 0.01, "longestKm");
});

test("heart-rate zones survive the round trip exactly", () => {
  // Tämä on koko histogrammin olemassaolon syy: alueet riippuvat historian
  // korkeimmasta sykkeestä, joten ne on voitava laskea uudelleen jälkikäteen.
  const { fromGpx, fromCompact } = bothForms();
  const a = hrSummary(fromGpx), b = hrSummary(fromCompact);
  assert.equal(b.maxHr, a.maxHr);
  assert.equal(b.easyPct, a.easyPct);
  assert.equal(b.moderatePct, a.moderatePct);
  assert.equal(b.hardPct, a.hardPct);
  b.zoneMinutes.forEach((m, i) => close(m, a.zoneMinutes[i], 0.02, `zone ${i + 1}`));
});

test("zones are recomputed against the global maximum, not frozen per workout", () => {
  const now = Date.now();
  const easy = runsToWorkouts([gpxRun({ start: daysAgo(9, now), km: 10, minutes: 60, hr: 120 })]);
  const hard = runsToWorkouts([gpxRun({ start: daysAgo(3, now), km: 5, minutes: 22, hr: 200 })]);

  const compactEasyOnly = parseCompact(JSON.stringify(buildCompactFile(easy.map((w) => toCompactRecord(w)))));
  const compactBoth = parseCompact(JSON.stringify(buildCompactFile(
    [...easy, ...hard].map((w) => toCompactRecord(w)),
  )));

  // Yksin 120 bpm on maksimi → kova alue. Kovan lenkin kanssa se on 60 % → helppo.
  assert.equal(maxHrObserved(compactEasyOnly), 120);
  assert.equal(maxHrObserved(compactBoth), 200);
  assert.ok(hrSummary(compactEasyOnly).hardPct > 0, "alone it reads as hard");
  assert.equal(hrSummary(compactBoth).easyPct > 0, true, "against a real max it becomes easy");
});

test("intensity and VO2max come out the same from either form", () => {
  const now = Date.now();
  const { fromGpx, fromCompact } = bothForms(now);
  const a = intensityDistribution(fromGpx, now), b = intensityDistribution(fromCompact, now);
  assert.equal(b.drift, a.drift);
  assert.equal(b.easyPct, a.easyPct);
  assert.equal(b.hardPct, a.hardPct);

  const va = vdotTrend(fromGpx), vb = vdotTrend(fromCompact);
  assert.equal(vb.current, va.current);
  assert.equal(vb.points.length, va.points.length);
});

test("names, dates and per-workout numbers survive", () => {
  const { fromGpx, fromCompact } = bothForms();
  assert.equal(fromCompact.length, fromGpx.length);
  fromGpx.forEach((a, i) => {
    const b = fromCompact[i];
    assert.equal(b.name, a.name);
    assert.equal(b.date, a.date);
    close(b.distanceKm, a.distanceKm, 0.001, "distanceKm");
    close(b.durationMin, a.durationMin, 0.01, "durationMin");
    close(b.paceMinKm, a.paceMinKm, 0.001, "paceMinKm");
    assert.equal(b.maxHr, a.maxHr);
  });
});

// -------------------------------------------------------------------- koko

test("a compact record is orders of magnitude smaller than its GPX", () => {
  const gpx = gpxRun({ start: Date.now() - 86400000, km: 10, minutes: 55, hr: 140, pointCount: 600 });
  const [w] = runsToWorkouts([gpx]);
  const record = JSON.stringify(toCompactRecord(w, "abc"));
  assert.ok(record.length * 50 < gpx.length, `record ${record.length} B vs gpx ${gpx.length} B`);
});

// -------------------------------------------------------------- histogrammi

test("hrHistogram accumulates minutes per bpm from the segment before each point", () => {
  const points = [
    { hr: 140, t: 0 },
    { hr: 140, t: 60000 },
    { hr: 150, t: 120000 },
    { hr: null, t: 180000 },
  ];
  assert.deepEqual(hrHistogram(points), { 140: 2, 150: 1 });
});

test("hrHistogram ignores points without a reading and zero-length segments", () => {
  assert.deepEqual(hrHistogram([{ hr: null, t: 0 }, { hr: null, t: 1000 }]), {});
  assert.deepEqual(hrHistogram([{ hr: 140, t: 5000 }, { hr: 140, t: 5000 }]), {});
  assert.deepEqual(hrHistogram([]), {});
});

test("histogramStats weights the average by time, not by distinct values", () => {
  const stats = histogramStats({ 100: 90, 180: 10 });
  assert.equal(stats.max, 180);
  assert.equal(stats.avg, 108, "90 min at 100 must dominate 10 min at 180");
  assert.equal(stats.minutes, 100);
});

// -------------------------------------------------------- tunnistus ja versio

test("isCompact recognises the format and rejects everything else", () => {
  assert.equal(isCompact(buildCompactFile([])), true);
  assert.equal(isCompact(JSON.stringify(buildCompactFile([]))), true);
  for (const notCompact of ["", "ei json", "{}", "[]", '{"workouts":[]}', "<gpx></gpx>", null, 42]) {
    assert.equal(isCompact(notCompact), false, `should reject ${JSON.stringify(notCompact)}`);
  }
});

test("a file from a newer version is refused rather than half-read", () => {
  const future = { ...buildCompactFile([{ d: 1, n: "x", km: 1, min: 1, el: 0 }]), treeniloki: COMPACT_VERSION + 1 };
  assert.equal(parseCompact(JSON.stringify(future)), null);
});

test("parseCompact never throws on hostile or malformed input", () => {
  for (const bad of ["", "{", "null", '{"treeniloki":1}', '{"treeniloki":"x","workouts":[]}', undefined]) {
    assert.doesNotThrow(() => parseCompact(bad));
  }
});

// ------------------------------------------------------------ kelvoton data

test("records with non-finite numbers are dropped, not carried into the maths", () => {
  const file = buildCompactFile([
    { d: Date.now(), n: "hyvä", km: 10, min: 60, el: 5 },
    { d: "roskaa", n: "paha", km: 10, min: 60, el: 0 },
    { d: Date.now(), n: "paha2", km: "NaN", min: 60, el: 0 },
    { d: Date.now(), n: "paha3", km: 10, min: -5, el: 0 },
    null,
    "eiolio",
  ]);
  const parsed = parseCompact(JSON.stringify(file));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "hyvä");
  const agg = aggregate(parsed);
  assert.ok(Object.values(agg).every((v) => Number.isFinite(v)), JSON.stringify(agg));
});

test("an implausible bpm in the histogram is discarded, as in the GPX parser", () => {
  const file = buildCompactFile([
    { d: Date.now(), n: "t", km: 10, min: 60, el: 0, hr: { 999: 5, 150: 55, 0: 3 } },
  ]);
  const [w] = parseCompact(JSON.stringify(file));
  assert.deepEqual(Object.keys(w.hrHistogram), ["150"]);
  assert.equal(w.maxHr, 150, "the bogus reading must not become the zone ceiling");
});

test("a record without heart rate simply has no histogram", () => {
  const [w] = parseCompact(JSON.stringify(buildCompactFile([
    { d: Date.now(), n: "t", km: 10, min: 60, el: 0 },
  ])));
  assert.equal(w.hrHistogram, undefined);
  assert.equal(w.avgHr, undefined);
  assert.equal(hrSummary([w]), null);
});

test("records are returned in chronological order regardless of file order", () => {
  const now = Date.now();
  const parsed = parseCompact(JSON.stringify(buildCompactFile([
    { d: now, n: "uusin", km: 5, min: 30, el: 0 },
    { d: now - 86400000 * 10, n: "vanhin", km: 5, min: 30, el: 0 },
    { d: now - 86400000 * 5, n: "keski", km: 5, min: 30, el: 0 },
  ])));
  assert.deepEqual(parsed.map((w) => w.name), ["vanhin", "keski", "uusin"]);
});

test("a workout key is preserved so the analyser can de-duplicate", () => {
  const [w] = parseCompact(JSON.stringify(buildCompactFile([
    { k: "abc123", d: Date.now(), n: "t", km: 5, min: 30, el: 0 },
  ])));
  assert.equal(w.key, "abc123");
  assert.equal(w.id, "abc123");
});

// ------------------------------------------------- tallennus ladatuista

test("keyFromFilename recovers the workout key from an export filename", () => {
  assert.equal(keyFromFilename("2024-01-01_running_abc123.gpx"), "abc123");
  assert.equal(keyFromFilename("2024-12-31_act14_xY_9.gpx"), "xY_9");
  for (const other of ["random.gpx", "abc123.gpx", "", null, undefined, "2024-01-01_running_abc.json"]) {
    assert.equal(keyFromFilename(other), null, `should not guess from ${JSON.stringify(other)}`);
  }
});

test("workoutsToCompactFile keeps identity so formats de-duplicate against each other", () => {
  const now = Date.now();
  const [w] = runsToWorkouts([gpxRun({ start: daysAgo(3, now), km: 8, minutes: 48, hr: 140 })]);
  const file = workoutsToCompactFile([{ ...w, id: "2025-01-01_running_abc.gpx" }]);
  assert.equal(file.workouts[0].k, "abc", "the key must survive the GPX → compact hop");
});

test("re-saving a compact file loses nothing", () => {
  const now = Date.now();
  const original = runsToWorkouts([
    gpxRun({ name: "A", start: daysAgo(9, now), km: 10, minutes: 60, hr: 130, elevGainM: 40 }),
    gpxRun({ name: "B", start: daysAgo(3, now), km: 5, minutes: 21, hr: 180 }),
  ]);

  const once = parseCompact(JSON.stringify(workoutsToCompactFile(original)));
  const twice = parseCompact(JSON.stringify(workoutsToCompactFile(once)));

  assert.deepEqual(aggregate(twice), aggregate(once));
  assert.deepEqual(hrSummary(twice), hrSummary(once));
  assert.deepEqual(twice.map((w) => w.name), once.map((w) => w.name));
});

test("workoutsToCompactFile sorts chronologically regardless of input order", () => {
  const now = Date.now();
  const file = workoutsToCompactFile([
    { id: "b", date: now, name: "uusin", distanceKm: 5, durationMin: 30, elevGain: 0, points: [] },
    { id: "a", date: now - 86400000, name: "vanhin", distanceKm: 5, durationMin: 30, elevGain: 0, points: [] },
  ]);
  assert.deepEqual(file.workouts.map((w) => w.n), ["vanhin", "uusin"]);
});
