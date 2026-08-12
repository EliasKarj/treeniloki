import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBy, byYear, byMonth, peakKm } from "../src/analysis/periods.mjs";
import { records, longestWeeklyStreak, weekKey } from "../src/analysis/records.mjs";
import { workout, DAY } from "./helpers/fixtures.mjs";

/** Paikallinen aika, koska ryhmittely käyttää käyttäjän kalenteria. */
const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime();

// ------------------------------------------------------------- ryhmittely

test("byYear sums distance, time, elevation and count per year", () => {
  const ws = [
    workout({ date: at(2024, 3, 1), distanceKm: 10, durationMin: 60, elevGain: 100 }),
    workout({ date: at(2024, 8, 1), distanceKm: 5, durationMin: 25, elevGain: 20 }),
    workout({ date: at(2025, 1, 1), distanceKm: 20, durationMin: 120, elevGain: 300 }),
  ];
  const [y2025, y2024] = byYear(ws);
  assert.equal(y2025.label, "2025");
  assert.equal(y2025.count, 1);
  assert.equal(y2025.km, 20);
  assert.equal(y2024.count, 2);
  assert.equal(y2024.km, 15);
  assert.equal(y2024.minutes, 85);
  assert.equal(y2024.elev, 120);
});

test("newest period comes first so the current one needs no scrolling", () => {
  const ws = [
    workout({ date: at(2021, 5, 1) }),
    workout({ date: at(2025, 5, 1) }),
    workout({ date: at(2023, 5, 1) }),
  ];
  assert.deepEqual(byYear(ws).map((p) => p.label), ["2025", "2023", "2021"]);
});

test("period pace is time over distance, not a mean of paces", () => {
  // 2 km at 8:00 and 30 km at 5:00. Naive averaging would say 6:30; the honest
  // figure is dominated by the long run.
  const ws = [
    workout({ date: at(2025, 4, 1), distanceKm: 2, durationMin: 16 }),
    workout({ date: at(2025, 4, 2), distanceKm: 30, durationMin: 150 }),
  ];
  const [period] = byYear(ws);
  assert.ok(Math.abs(period.avgPace - 166 / 32) < 1e-9, `got ${period.avgPace}`);
  assert.ok(period.avgPace < 5.3, "the long run must dominate");
});

test("byMonth labels months in Finnish and keys them sortably", () => {
  const ws = [
    workout({ date: at(2025, 1, 15) }),
    workout({ date: at(2025, 11, 3) }),
  ];
  const months = byMonth(ws);
  assert.deepEqual(months.map((m) => m.label), ["marras 2025", "tammi 2025"]);
  assert.deepEqual(months.map((m) => m.key), ["2025-11", "2025-01"]);
});

test("byMonth keeps different years apart even in the same calendar month", () => {
  const ws = [workout({ date: at(2024, 6, 1) }), workout({ date: at(2025, 6, 1) })];
  assert.equal(byMonth(ws).length, 2);
});

test("longestKm per period tracks the single biggest run", () => {
  const ws = [
    workout({ date: at(2025, 2, 1), distanceKm: 12 }),
    workout({ date: at(2025, 2, 9), distanceKm: 31 }),
    workout({ date: at(2025, 2, 20), distanceKm: 8 }),
  ];
  assert.equal(byMonth(ws)[0].longestKm, 31);
});

test("grouping an empty history yields no rows and no peak", () => {
  assert.deepEqual(byYear([]), []);
  assert.deepEqual(byMonth([]), []);
  assert.equal(peakKm([]), 0);
});

test("peakKm finds the largest period for scaling bars", () => {
  assert.equal(peakKm([{ km: 120 }, { km: 340 }, { km: 90 }]), 340);
});

test("groupBy tolerates a period whose distance is zero", () => {
  const [p] = groupBy([workout({ date: at(2025, 1, 1), distanceKm: 0, durationMin: 30 })],
    () => "x", () => "X");
  assert.equal(p.avgPace, 0, "must not divide by zero");
});

// ------------------------------------------------------------- ennätykset

test("weekKey anchors to Monday regardless of the day given", () => {
  // 2025-02-05 on keskiviikko; viikko alkaa maanantaista 2025-02-03.
  const monday = weekKey(at(2025, 2, 5));
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getDate(), 3);
  // Sunnuntai kuuluu edeltävään viikkoon, ei seuraavaan.
  assert.equal(weekKey(at(2025, 2, 9)).getDate(), 3);
  assert.equal(weekKey(at(2025, 2, 10)).getDate(), 10);
});

test("records reports the longest run with its date and name", () => {
  const ws = [
    workout({ date: at(2025, 1, 1), distanceKm: 10, name: "Perus" }),
    workout({ date: at(2025, 3, 1), distanceKm: 42.2, name: "Maraton" }),
    workout({ date: at(2025, 5, 1), distanceKm: 15, name: "Pitkä" }),
  ];
  const r = records(ws);
  assert.equal(r.longest.km, 42.2);
  assert.equal(r.longest.name, "Maraton");
  assert.equal(r.longest.date, at(2025, 3, 1));
});

test("the pace record ignores runs too short to mean anything", () => {
  const ws = [
    workout({ date: at(2025, 1, 1), distanceKm: 1, durationMin: 3 }),   // 3:00 — kiihdytys
    workout({ date: at(2025, 1, 2), distanceKm: 10, durationMin: 45 }), // 4:30
    workout({ date: at(2025, 1, 3), distanceKm: 8, durationMin: 40 }),  // 5:00
  ];
  const r = records(ws);
  assert.equal(r.fastest.km, 10, "the 1 km sprint must not win");
  assert.ok(Math.abs(r.fastest.paceMinKm - 4.5) < 1e-9);
});

test("with no run long enough there is no pace record rather than a wrong one", () => {
  const r = records([workout({ date: at(2025, 1, 1), distanceKm: 1.5, durationMin: 7 })]);
  assert.equal(r.fastest, null);
});

test("records finds the biggest week and the week with most runs separately", () => {
  const ws = [
    // Viikko 1: yksi pitkä
    workout({ date: at(2025, 2, 3), distanceKm: 30, durationMin: 180 }),
    // Viikko 2: neljä lyhyttä, vähemmän kilometrejä
    workout({ date: at(2025, 2, 10), distanceKm: 5 }),
    workout({ date: at(2025, 2, 11), distanceKm: 5 }),
    workout({ date: at(2025, 2, 12), distanceKm: 5 }),
    workout({ date: at(2025, 2, 13), distanceKm: 5 }),
  ];
  const r = records(ws);
  assert.equal(r.biggestWeek.km, 30);
  assert.equal(r.mostRunsWeek.count, 4);
  assert.notEqual(r.biggestWeek.start, r.mostRunsWeek.start, "these are different weeks here");
});

test("the streak counts consecutive weeks, so rest days do not break it", () => {
  const ws = [
    workout({ date: at(2025, 1, 6) }),   // vko 1
    workout({ date: at(2025, 1, 15) }),  // vko 2
    workout({ date: at(2025, 1, 20) }),  // vko 3
    // vko 4 väliin jää tyhjäksi
    workout({ date: at(2025, 2, 10) }),  // vko 5
  ];
  const r = records(ws);
  assert.equal(r.streak.weeks, 3);
  assert.equal(new Date(r.streak.from).getDate(), 6);
});

test("a single workout is a one-week streak, not zero", () => {
  const r = records([workout({ date: at(2025, 6, 4) })]);
  assert.equal(r.streak.weeks, 1);
});

test("longestWeeklyStreak keeps the longest run, not the latest", () => {
  const ws = [];
  // Viiden viikon putki, tauko, sitten kahden viikon putki.
  for (let i = 0; i < 5; i++) ws.push(workout({ date: at(2025, 1, 6) + i * 7 * DAY }));
  for (let i = 0; i < 2; i++) ws.push(workout({ date: at(2025, 4, 7) + i * 7 * DAY }));
  assert.equal(longestWeeklyStreak(ws).weeks, 5);
});

test("the climb record is omitted when nothing had any elevation", () => {
  const flat = records([workout({ date: at(2025, 1, 1), elevGain: 0 })]);
  assert.equal(flat.highestClimb, null);
  const hilly = records([workout({ date: at(2025, 1, 1), elevGain: 450 })]);
  assert.equal(hilly.highestClimb.elev, 450);
});

test("records on an empty history is all nulls, never zeros posing as facts", () => {
  const r = records([]);
  for (const [key, value] of Object.entries(r)) {
    assert.equal(value, null, `${key} should be null`);
  }
});
