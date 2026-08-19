// Tests for src/analysis/sports.mjs and the sport tag's journey through the
// compact format.
//
// The point of the sport split is not curiosity: pace, VO₂max and the 80/20
// balance are running measures, and a history with cycling in it produces
// numbers that look right and measure nothing. So these tests care as much
// about the tag surviving a save/load round trip as about the arithmetic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { bySport, sportOptions, filterBySport, sportLabel, isRunning } from "../src/analysis/sports.mjs";
import { sportFromFilename, keyFromFilename, workoutsToCompactFile, parseCompact } from "../src/parse/compact.mjs";

const w = (sport, km, minutes, elev = 0, date = Date.UTC(2025, 0, 1)) =>
  ({ sport, distanceKm: km, durationMin: minutes, elevGain: elev, date, name: "Treeni", points: [] });

test("sportFromFilename reads the middle segment of an export name", () => {
  assert.equal(sportFromFilename("2024-01-01_running_abc123.gpx"), "running");
  assert.equal(sportFromFilename("2024-01-01_act14_abc123.gpx"), "act14");
  // The key may contain underscores; the sport is still the second field.
  assert.equal(sportFromFilename("2024-01-01_running_a_b_c.gpx"), "running");
  assert.equal(keyFromFilename("2024-01-01_running_a_b_c.gpx"), "a_b_c");
});

test("sportFromFilename returns null for names it does not recognise", () => {
  for (const name of ["lenkki.gpx", "2024-01-01_running.gpx", "", null, undefined, "2024-13-99_x_y.gpx".replace(".gpx", "")]) {
    assert.equal(sportFromFilename(name), null, `unexpected sport for ${name}`);
  }
});

test("known sports get a Finnish name and unknown ids keep their number", () => {
  assert.equal(sportLabel("running"), "Juoksu");
  // Guessing a name for an unverified id would be worse than showing the number.
  assert.equal(sportLabel("act14"), "Laji 14");
  assert.equal(sportLabel("swimming"), "Swimming");
  assert.equal(sportLabel(null), "Tuntematon");
  assert.ok(isRunning("running"));
  assert.ok(!isRunning("act14"));
  assert.ok(!isRunning(null));
});

test("bySport totals each sport and orders by distance", () => {
  const groups = bySport([
    w("running", 10, 60, 100),
    w("running", 5, 30, 50),
    w("act14", 40, 90, 200),
  ]);
  assert.deepEqual(groups.map((g) => g.sport), ["act14", "running"], "biggest first");

  const [cycling, running] = groups;
  assert.equal(cycling.count, 1);
  assert.equal(running.count, 2);
  assert.equal(running.km, 15);
  assert.equal(running.minutes, 90);
  assert.equal(running.elev, 150);
  assert.equal(running.avgPace, 6, "90 min over 15 km");
  assert.equal(Math.round(running.share), 27, "15 of 55 km");
  assert.equal(Math.round(cycling.share + running.share), 100);
});

test("sport pace is total time over total distance, not a mean of paces", () => {
  // 4:00 for 1 km and 8:00 for 8 km: the mean of the paces would be 6:00,
  // but 68 minutes over 9 km is 7:33.
  const [group] = bySport([w("running", 1, 4), w("running", 8, 64)]);
  assert.ok(Math.abs(group.avgPace - 68 / 9) < 1e-9, `avgPace ${group.avgPace}`);
});

test("workouts without a sport are grouped as unknown rather than dropped", () => {
  const groups = bySport([w(null, 10, 60), w("running", 4, 24)]);
  assert.equal(groups.length, 2);
  const unknown = groups.find((g) => g.sport === null);
  assert.ok(unknown, "a workout with no sport must still be counted");
  assert.equal(unknown.label, "Tuntematon");
  assert.equal(unknown.km, 10);
});

test("bySport is empty for an empty history and divides by nothing safely", () => {
  assert.deepEqual(bySport([]), []);
  const [zero] = bySport([w("running", 0, 0)]);
  assert.equal(zero.avgPace, 0, "no distance means no pace, not NaN");
  assert.equal(zero.share, 0);
});

test("the picker stays hidden until there is something to choose between", () => {
  assert.deepEqual(sportOptions([]), []);
  assert.deepEqual(sportOptions([w("running", 10, 60), w("running", 8, 48)]), [],
    "one sport is not a choice");
  const options = sportOptions([w("running", 10, 60), w("act14", 30, 60)]);
  assert.deepEqual(options.map((o) => o.label), ["Laji 14", "Juoksu"]);
  assert.deepEqual(options.map((o) => o.count), [1, 1]);
});

test("filtering keeps only the chosen sport, and null keeps everything", () => {
  const all = [w("running", 10, 60), w("act14", 30, 60), w(null, 5, 30)];
  assert.equal(filterBySport(all, null).length, 3);
  assert.equal(filterBySport(all, "running").length, 1);
  assert.equal(filterBySport(all, "act14")[0].distanceKm, 30);
  assert.equal(filterBySport(all, "nosuchsport").length, 0);
});

test("the sport survives a compact save and load", () => {
  // Without this the split would vanish the moment a history is reloaded from
  // the light file — which is how the phone reads it.
  const workouts = [
    { id: "2024-01-01_running_a.gpx", date: Date.UTC(2024, 0, 1), name: "Aamulenkki",
      distanceKm: 10, durationMin: 60, elevGain: 50, paceMinKm: 6, points: [] },
    { id: "2024-01-02_act14_b.gpx", date: Date.UTC(2024, 0, 2), name: "Pyöräily",
      distanceKm: 40, durationMin: 90, elevGain: 120, paceMinKm: 2.25, points: [] },
  ];
  const file = workoutsToCompactFile(workouts);
  assert.deepEqual(file.workouts.map((r) => r.s), ["running", "act14"]);

  const back = parseCompact(file);
  assert.deepEqual(back.map((x) => x.sport), ["running", "act14"]);
  assert.deepEqual(bySport(back).map((g) => g.label), ["Laji 14", "Juoksu"]);
});

test("a compact file written before sports existed still loads", () => {
  // Old files have no "s" field. They must read as unknown, not fail.
  const old = { treeniloki: 1, exported: new Date().toISOString(), workouts: [
    { d: Date.UTC(2023, 5, 1), n: "Vanha", km: 8, min: 48, el: 20, k: "x1" },
  ] };
  const [workout] = parseCompact(old);
  assert.equal(workout.sport, undefined);
  assert.equal(bySport([workout])[0].label, "Tuntematon");
});

test("a sport tag that is not a string is ignored rather than trusted", () => {
  const file = { treeniloki: 1, workouts: [
    { d: Date.UTC(2024, 0, 1), n: "A", km: 5, min: 30, s: 14 },
    { d: Date.UTC(2024, 0, 2), n: "B", km: 5, min: 30, s: "" },
  ] };
  for (const workout of parseCompact(file)) {
    assert.equal(workout.sport, undefined);
  }
});
