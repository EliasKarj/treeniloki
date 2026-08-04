# Treeniloki Analyzer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dependency-free, client-side GPX workout analyzer: drag in GPX files → dark topographic instrument dashboard with summary stats, break-aware trends, and science-backed injury/load/comeback insights.

**Architecture:** Vanilla ESM, no build. Correctness-critical analysis in pure `.mjs` modules unit-tested with `node:test`; UI is static `index.html` + `app/main.mjs` + hand-drawn `<canvas>` charts. Zero runtime dependencies. Static-file deploy to GitHub Pages.

**Tech Stack:** Vanilla JS (ES modules), `node:test`, `<canvas>`, GitHub Actions + Pages.

**Working dir:** `in-development/treeniloki` (git repo). **Build on a new branch off `main`** (`git checkout main && git checkout -b build-analyzer`). The export script's `tools/` lives only on the separate `build-export` PR branch and is **not** present here — do not reference it. All paths below are relative to the repo root.

**Data model:** `workout = { id, name, date (ms epoch), points: [{lat, lon, ele, t(ms)}], distanceKm, durationMin, elevGain, paceMinKm }`. Workouts are always **sorted ascending by `date`** before analysis.

**Topo-syaani theme tokens** (used by the UI tasks): bg `#0a0f14`, panel `#0e151d`, line `#1c2732`, fg `#dbe6ef`, muted `#5f7183`, accent `#35d0e0`, warn `#e8a24a`; mono font `Space Mono`.

**Commit trailer** (end every commit message, blank line before it):
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 1: Project wiring + per-workout math (`workout.mjs`)

**Files:** Create `package.json`, `src/analysis/workout.mjs`, `test/workout.test.mjs`

- [ ] **Step 1: Write `package.json`** (ESM; glob test discovery)

```json
{
  "name": "treeniloki",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Client-side GPX workout analyzer (Treeniloki).",
  "scripts": {
    "test": "node --test \"test/**/*.test.mjs\"",
    "serve": "node --version >/dev/null && python -m http.server 8000"
  }
}
```

- [ ] **Step 2: Write the failing test `test/workout.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineKm, distanceKm, durationMin, elevGain, paceMinKm, summarizeWorkout, fmtPace } from "../src/analysis/workout.mjs";

test("haversineKm: ~1.11 km per 0.01° latitude", () => {
  const d = haversineKm({ lat: 60.0, lon: 25.0 }, { lat: 60.01, lon: 25.0 });
  assert.ok(Math.abs(d - 1.112) < 0.02, `got ${d}`);
});

test("distanceKm sums consecutive legs", () => {
  const pts = [{ lat: 60.0, lon: 25.0 }, { lat: 60.01, lon: 25.0 }, { lat: 60.02, lon: 25.0 }];
  assert.ok(Math.abs(distanceKm(pts) - 2.224) < 0.04);
});

test("durationMin from first/last timestamp (ms)", () => {
  const pts = [{ t: 0 }, { t: 1 }, { t: 600000 }];
  assert.equal(durationMin(pts), 10);
});

test("elevGain sums only rises exceeding the 0.3 m threshold", () => {
  const pts = [{ ele: 100 }, { ele: 100.2 }, { ele: 101.2 }, { ele: 100.0 }, { ele: 100.5 }];
  // +0.2 ignored, +1.0 counted, -1.2 ignored, +0.5 counted → 1.5
  assert.equal(elevGain(pts), 1.5);
});

test("paceMinKm = duration / distance, 0 distance → 0", () => {
  assert.equal(paceMinKm(2, 10), 5);
  assert.equal(paceMinKm(0, 10), 0);
});

test("summarizeWorkout returns all four derived fields", () => {
  const pts = [{ lat: 60, lon: 25, ele: 10, t: 0 }, { lat: 60.01, lon: 25, ele: 12, t: 600000 }];
  const s = summarizeWorkout(pts);
  assert.ok(s.distanceKm > 1 && s.distanceKm < 1.3);
  assert.equal(s.durationMin, 10);
  assert.equal(s.elevGain, 2);
  assert.ok(s.paceMinKm > 8 && s.paceMinKm < 10);
});

test("fmtPace formats min/km as m:ss", () => {
  assert.equal(fmtPace(5.2), "5:12");
  assert.equal(fmtPace(0), "–");
});
```

- [ ] **Step 3: Run — verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/analysis/workout.mjs`.

- [ ] **Step 4: Write `src/analysis/workout.mjs`**

```js
const R = 6371; // km

export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function distanceKm(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineKm(points[i - 1], points[i]);
  return sum;
}

export function durationMin(points) {
  if (points.length < 2) return 0;
  return (points[points.length - 1].t - points[0].t) / 60000;
}

export function elevGain(points, threshold = 0.3) {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
    if (d > threshold) gain += d;
  }
  return Math.round(gain * 10) / 10;
}

export function paceMinKm(distanceKm, durationMin) {
  return distanceKm > 0 ? durationMin / distanceKm : 0;
}

export function summarizeWorkout(points) {
  const dist = distanceKm(points);
  const dur = durationMin(points);
  return { distanceKm: dist, durationMin: dur, elevGain: elevGain(points), paceMinKm: paceMinKm(dist, dur) };
}

export function fmtPace(minPerKm) {
  if (!minPerKm || minPerKm <= 0) return "–";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}
```

- [ ] **Step 5: Run — verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json src/analysis/workout.mjs test/workout.test.mjs
git commit -m "analyzer: per-workout math (haversine, distance, duration, elevGain, pace)"
```

---

### Task 2: GPX parser (`gpx.mjs`)

Regex-based (no `DOMParser`) so it runs in Node tests **and** the browser.

**Files:** Create `src/parse/gpx.mjs`, `test/gpx.test.mjs`

- [ ] **Step 1: Write the failing test `test/gpx.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGpx } from "../src/parse/gpx.mjs";

const SAMPLE = `<?xml version="1.0"?>
<gpx><trk><name>Aamulenkki</name><trkseg>
<trkpt lat="60.1000" lon="25.0000"><ele>10.0</ele><time>2024-06-01T06:00:00Z</time></trkpt>
<trkpt lat="60.1010" lon="25.0000"><ele>12.0</ele><time>2024-06-01T06:10:00Z</time></trkpt>
</trkseg></trk></gpx>`;

test("parseGpx extracts name, date and points", () => {
  const w = parseGpx(SAMPLE);
  assert.equal(w.name, "Aamulenkki");
  assert.equal(w.points.length, 2);
  assert.equal(w.points[0].lat, 60.1);
  assert.equal(w.points[0].lon, 25);
  assert.equal(w.points[0].ele, 10);
  assert.equal(w.points[1].ele, 12);
  assert.equal(w.date, Date.parse("2024-06-01T06:00:00Z"));
  assert.equal(w.points[1].t, Date.parse("2024-06-01T06:10:00Z"));
});

test("parseGpx returns null when there are no timestamped trackpoints", () => {
  assert.equal(parseGpx("<gpx></gpx>"), null);
  assert.equal(parseGpx(`<gpx><trkpt lat="1" lon="2"><ele>3</ele></trkpt></gpx>`), null);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/parse/gpx.mjs`.

- [ ] **Step 3: Write `src/parse/gpx.mjs`**

```js
// Regex-based GPX trackpoint parser (no DOMParser → works in Node + browser).
// Returns { name, date(ms), points:[{lat,lon,ele,t}] } or null if there is no usable track.
export function parseGpx(xml) {
  const nameMatch = xml.match(/<name>([^<]*)<\/name>/);
  const name = nameMatch ? nameMatch[1].trim() : "Treeni";

  const points = [];
  const re = /<trkpt\s+[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?>([\s\S]*?)<\/trkpt>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const inner = m[3];
    const timeM = inner.match(/<time>([^<]+)<\/time>/);
    if (!timeM) continue; // need a timestamp to be useful
    const t = Date.parse(timeM[1]);
    if (Number.isNaN(t)) continue;
    const eleM = inner.match(/<ele>([-\d.]+)<\/ele>/);
    points.push({
      lat: parseFloat(m[1]),
      lon: parseFloat(m[2]),
      ele: eleM ? parseFloat(eleM[1]) : 0,
      t,
    });
  }
  if (points.length < 2) return null;
  return { name, date: points[0].t, points };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parse/gpx.mjs test/gpx.test.mjs
git commit -m "analyzer: regex GPX parser (Node + browser)"
```

---

### Task 3: Aggregate stats (`aggregate.mjs`)

**Files:** Create `src/analysis/aggregate.mjs`, `test/aggregate.test.mjs`

- [ ] **Step 1: Write the failing test `test/aggregate.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../src/analysis/aggregate.mjs";

const W = [
  { date: 1, distanceKm: 5, durationMin: 25, elevGain: 30, paceMinKm: 5 },
  { date: 2, distanceKm: 10, durationMin: 60, elevGain: 80, paceMinKm: 6 },
  { date: 3, distanceKm: 15, durationMin: 90, elevGain: 100, paceMinKm: 6 },
];

test("aggregate totals, average pace (time-weighted) and longest", () => {
  const a = aggregate(W);
  assert.equal(a.count, 3);
  assert.equal(a.totalKm, 30);
  assert.equal(a.totalMin, 175);
  assert.equal(a.totalElev, 210);
  assert.equal(a.longestKm, 15);
  // avgPace = totalMin/totalKm = 175/30
  assert.ok(Math.abs(a.avgPace - 175 / 30) < 1e-9);
});

test("aggregate of empty list is zeros", () => {
  const a = aggregate([]);
  assert.equal(a.count, 0);
  assert.equal(a.totalKm, 0);
  assert.equal(a.avgPace, 0);
  assert.equal(a.longestKm, 0);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write `src/analysis/aggregate.mjs`**

```js
export function aggregate(workouts) {
  const count = workouts.length;
  const totalKm = workouts.reduce((s, w) => s + w.distanceKm, 0);
  const totalMin = workouts.reduce((s, w) => s + w.durationMin, 0);
  const totalElev = workouts.reduce((s, w) => s + w.elevGain, 0);
  const longestKm = workouts.reduce((m, w) => Math.max(m, w.distanceKm), 0);
  const avgPace = totalKm > 0 ? totalMin / totalKm : 0;
  return { count, totalKm, totalMin, totalElev, longestKm, avgPace };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/analysis/aggregate.mjs test/aggregate.test.mjs
git commit -m "analyzer: aggregate stats"
```

---

### Task 4: Breaks, trends, comeback, frequency (`breaks.mjs`)

**Files:** Create `src/analysis/breaks.mjs`, `test/breaks.test.mjs`

- [ ] **Step 1: Write the failing test `test/breaks.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBlocks, slopePerDay, comeback, activeFrequencyPerWeek } from "../src/analysis/breaks.mjs";

const DAY = 86400000;
// helper: workout on day N (0-based) with given pace/distance
const w = (day, extra = {}) => ({ date: day * DAY, distanceKm: 5, durationMin: 25, elevGain: 0, paceMinKm: 5, ...extra });

test("splitBlocks breaks the history at gaps >= 14 days", () => {
  const ws = [w(0), w(3), w(6), w(30), w(33)]; // gap 24 days between day6 and day30
  const blocks = splitBlocks(ws, 14);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].length, 3);
  assert.equal(blocks[1].length, 2);
});

test("slopePerDay is positive for an increasing series vs calendar days", () => {
  const ws = [w(0, { distanceKm: 5 }), w(10, { distanceKm: 7 }), w(20, { distanceKm: 9 })];
  const slope = slopePerDay(ws, (x) => x.distanceKm);
  assert.ok(Math.abs(slope - 0.2) < 1e-6); // +4 km over 20 days = 0.2/day
});

test("comeback reports gap, pre-avg, first-back pace and workouts-to-return", () => {
  // pre-break paces 5,5,5 (avg 5); break; comeback paces 6, 5.5, 5 → returns on the 3rd
  const ws = [
    w(0, { paceMinKm: 5 }), w(2, { paceMinKm: 5 }), w(4, { paceMinKm: 5 }),
    w(30, { paceMinKm: 6 }), w(32, { paceMinKm: 5.5 }), w(34, { paceMinKm: 5 }),
  ];
  const cbs = comeback(ws, 14);
  assert.equal(cbs.length, 1);
  assert.equal(cbs[0].gapDays, 26);
  assert.ok(Math.abs(cbs[0].preAvgPace - 5) < 1e-9);
  assert.ok(Math.abs(cbs[0].firstBackPace - 6) < 1e-9);
  assert.equal(cbs[0].workoutsToReturn, 3);
});

test("activeFrequencyPerWeek excludes break days", () => {
  // block A: days 0..6 (7 active days, 3 workouts); block B: days 30..36 (3 workouts)
  const ws = [w(0), w(3), w(6), w(30), w(33), w(36)];
  const f = activeFrequencyPerWeek(splitBlocks(ws, 14));
  // 6 workouts over (7 + 7) = 14 active-span days = 2 weeks → 3.0 / week
  assert.ok(Math.abs(f - 3) < 1e-6);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write `src/analysis/breaks.mjs`**

```js
const DAY = 86400000;

/** Split date-sorted workouts into blocks wherever the gap between consecutive workouts >= gapDays. */
export function splitBlocks(workouts, gapDays = 14) {
  const blocks = [];
  let cur = [];
  for (let i = 0; i < workouts.length; i++) {
    if (i > 0 && (workouts[i].date - workouts[i - 1].date) / DAY >= gapDays) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(workouts[i]);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/** Least-squares slope of keyFn(workout) vs. days since the first workout. 0 if <2 points. */
export function slopePerDay(workouts, keyFn) {
  if (workouts.length < 2) return 0;
  const t0 = workouts[0].date;
  const xs = workouts.map((w) => (w.date - t0) / DAY);
  const ys = workouts.map(keyFn);
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : num / den;
}

/** For each break (gap >= gapDays), analyse the return: pre-break-average pace vs. comeback. */
export function comeback(workouts, gapDays = 14) {
  const out = [];
  for (let i = 1; i < workouts.length; i++) {
    const gap = (workouts[i].date - workouts[i - 1].date) / DAY;
    if (gap < gapDays) continue;
    const pre = workouts.slice(Math.max(0, i - 3), i);
    const preAvgPace = pre.reduce((s, w) => s + w.paceMinKm, 0) / pre.length;
    const firstBackPace = workouts[i].paceMinKm;
    // workouts (counting the first back) until pace returns to <= preAvgPace
    let workoutsToReturn = null;
    for (let j = i; j < workouts.length; j++) {
      if (workouts[j].paceMinKm <= preAvgPace + 1e-9) { workoutsToReturn = j - i + 1; break; }
    }
    out.push({ gapDays: Math.round(gap), preAvgPace, firstBackPace, workoutsToReturn });
  }
  return out;
}

/** Workouts per week counting only active-span days within each block (break days excluded). */
export function activeFrequencyPerWeek(blocks) {
  let workouts = 0, activeDays = 0;
  for (const b of blocks) {
    workouts += b.length;
    const span = b.length ? (b[b.length - 1].date - b[0].date) / DAY + 1 : 0;
    activeDays += span;
  }
  return activeDays > 0 ? workouts / (activeDays / 7) : 0;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/analysis/breaks.mjs test/breaks.test.mjs
git commit -m "analyzer: break blocks, calendar-day regression, comeback, frequency"
```

---

### Task 5: Spike risk (`spikeRisk.mjs`)

**Files:** Create `src/analysis/spikeRisk.mjs`, `test/spikeRisk.test.mjs`

- [ ] **Step 1: Write the failing test `test/spikeRisk.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spikeRisk } from "../src/analysis/spikeRisk.mjs";

const DAY = 86400000;
const w = (day, distanceKm) => ({ date: day * DAY, distanceKm, durationMin: 0, elevGain: 0, paceMinKm: 5 });

test("classifies a >30% single-session distance spike as high", () => {
  const ws = [w(0, 10), w(2, 10), w(4, 14)]; // 14 vs trailing-30d max 10 → ratio 1.4
  const r = spikeRisk(ws);
  assert.equal(r[2].band, "high");
  assert.ok(Math.abs(r[2].ratio - 1.4) < 1e-9);
});

test("10–30% spike is moderate; within 10% is none", () => {
  assert.equal(spikeRisk([w(0, 10), w(2, 12)])[1].band, "moderate"); // 1.2
  assert.equal(spikeRisk([w(0, 10), w(2, 10.5)])[1].band, "none");   // 1.05
});

test("first workout after a >=14d break is suppressed (not flagged)", () => {
  const ws = [w(0, 10), w(2, 10), w(30, 20)]; // 20 vs 10 = 2.0 but it's a comeback run
  const r = spikeRisk(ws);
  assert.equal(r[2].suppressed, true);
  assert.equal(r[2].band, "none");
});

test("the very first workout has no baseline → none, not suppressed", () => {
  const r = spikeRisk([w(0, 8)]);
  assert.equal(r[0].band, "none");
  assert.equal(r[0].suppressed, false);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write `src/analysis/spikeRisk.mjs`**

```js
import { splitBlocks } from "./breaks.mjs";

const DAY = 86400000;

/**
 * Per-workout single-session distance spike vs. the trailing-30-day longest run.
 * Returns [{ ratio, band: "none"|"moderate"|"high", suppressed }] parallel to `workouts`.
 * The first `postBreakSuppress` workouts of any post-break block are suppressed (a comeback
 * run is definitionally "spiky" vs. a stale window; the break card explains that instead).
 */
export function spikeRisk(workouts, { windowDays = 30, postBreakSuppress = 2, gapDays = 14 } = {}) {
  // Mark which workouts start / sit at the front of a post-break block.
  const suppressedSet = new Set();
  const blocks = splitBlocks(workouts, gapDays);
  for (let b = 1; b < blocks.length; b++) {
    for (let k = 0; k < Math.min(postBreakSuppress, blocks[b].length); k++) suppressedSet.add(blocks[b][k]);
  }

  return workouts.map((wk, i) => {
    let maxPrev = 0;
    for (let j = i - 1; j >= 0; j--) {
      if ((wk.date - workouts[j].date) / DAY > windowDays) break;
      if (workouts[j].distanceKm > maxPrev) maxPrev = workouts[j].distanceKm;
    }
    const suppressed = suppressedSet.has(wk);
    if (maxPrev === 0 || suppressed) return { ratio: maxPrev === 0 ? 1 : wk.distanceKm / maxPrev, band: "none", suppressed };
    const ratio = wk.distanceKm / maxPrev;
    const band = ratio > 1.30 ? "high" : ratio > 1.10 ? "moderate" : "none";
    return { ratio, band, suppressed };
  });
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/analysis/spikeRisk.mjs test/spikeRisk.test.mjs
git commit -m "analyzer: break-aware single-session spike detector"
```

---

### Task 6: Training load / ACWR (`trainingLoad.mjs`)

**Files:** Create `src/analysis/trainingLoad.mjs`, `test/trainingLoad.test.mjs`

- [ ] **Step 1: Write the failing test `test/trainingLoad.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionLoad, acwr } from "../src/analysis/trainingLoad.mjs";

const DAY = 86400000;
const w = (day, distanceKm, elevGain = 0) => ({ date: day * DAY, distanceKm, elevGain, durationMin: 0, paceMinKm: 5 });

test("sessionLoad = distanceKm * (1 + elevGain/500)", () => {
  assert.equal(sessionLoad(w(0, 10, 0)), 10);
  assert.equal(sessionLoad(w(0, 10, 500)), 20);
});

test("acwr = acute (last 7d load) / chronic (avg weekly over last 28d)", () => {
  // one 10-load session/day for 28 days ending at day 27.
  const ws = [];
  for (let d = 0; d <= 27; d++) ws.push(w(d, 10, 0));
  const a = acwr(ws);
  // acute = last 7 days inclusive = 8 sessions? window is strict 7 days back → days 21..27 = 7 sessions = 70
  // chronic = last 28 days total / 4 = 280/4 = 70 → ratio ~1.0
  assert.ok(Math.abs(a.ratio - 1.0) < 0.2, `ratio ${a.ratio}`);
});

test("acwr of empty history is zeros", () => {
  const a = acwr([]);
  assert.equal(a.ratio, 0);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write `src/analysis/trainingLoad.mjs`**

```js
const DAY = 86400000;

export function sessionLoad(workout) {
  return workout.distanceKm * (1 + workout.elevGain / 500);
}

/** Acute:chronic workload ratio as of the most recent workout. Contested signal — label it. */
export function acwr(workouts) {
  if (workouts.length === 0) return { acute: 0, chronic: 0, ratio: 0 };
  const now = workouts[workouts.length - 1].date;
  let acute = 0, chronic = 0;
  for (const w of workouts) {
    const ageDays = (now - w.date) / DAY;
    const load = sessionLoad(w);
    if (ageDays <= 7) acute += load;
    if (ageDays <= 28) chronic += load;
  }
  const chronicWeekly = chronic / 4;
  return { acute, chronic: chronicWeekly, ratio: chronicWeekly > 0 ? acute / chronicWeekly : 0 };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/analysis/trainingLoad.mjs test/trainingLoad.test.mjs
git commit -m "analyzer: training load + ACWR (labelled contested)"
```

---

### Task 7: Detraining note (`detraining.mjs`)

**Files:** Create `src/analysis/detraining.mjs`, `test/detraining.test.mjs`

- [ ] **Step 1: Write the failing test `test/detraining.test.mjs`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { detrainingNote } from "../src/analysis/detraining.mjs";

test("no note for short gaps (<14 days)", () => {
  assert.equal(detrainingNote(10), null);
});

test("2–3 week gap mentions ~6–7% and frames as normal", () => {
  const s = detrainingNote(21);
  assert.match(s, /6–7 %|6-7 %/);
  assert.match(s, /normaali/i);
});

test("long gap (9+ weeks) mentions ~20 %", () => {
  assert.match(detrainingNote(70), /20 %/);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write `src/analysis/detraining.mjs`**

```js
/** One-line, normal-not-alarming detraining context for a break of `gapDays`. null if <14d. */
export function detrainingNote(gapDays) {
  if (gapDays < 14) return null;
  if (gapDays < 21) return "~2 vk tauko: pieni notkahdus tahtiin on odotettavaa — fysiologisesti normaalia.";
  if (gapDays < 42) return "~2–3 vk tauko: odota noin 6–7 % VO2max-laskua. Tämä on normaalia, ei merkki virheestä.";
  if (gapDays < 63) return "~1–1,5 kk tauko: kunto on laskenut selvästi mutta palautuu rakenteellisella paluulla — normaalia.";
  return "2+ kk tauko: jopa ~20 % VO2max-lasku on tässä kohtaa normaalia. Aloita maltilla, kunto palaa.";
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/analysis/detraining.mjs test/detraining.test.mjs
git commit -m "analyzer: detraining context note by gap length"
```

---

### Task 8: App shell — `index.html`, theme, `main.mjs` (parse → model)

Builds the page + drop/pick wiring and the analysis pipeline into a view model (rendering follows in Tasks 9–10). Verified by loading in a browser (ES-module `import` needs http, not `file://`).

**Files:** Create `index.html`, `app/styles.css`, `app/main.mjs`

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Treeniloki</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="app/styles.css" />
</head>
<body>
  <main id="app">
    <header class="hd"><span class="brand">TREENI<b>LOKI</b></span><span id="hd-meta" class="lbl"></span></header>
    <div id="drop" class="drop">⤢ Raahaa GPX-tiedostot tähän — tai <label class="pick">valitse<input id="file" type="file" accept=".gpx" multiple hidden></label></div>
    <section id="summary"></section>
    <section id="cards" class="cards3"></section>
    <section id="charts" class="two"></section>
    <section id="table"></section>
  </main>
  <script type="module" src="app/main.mjs"></script>
</body>
</html>
```

- [ ] **Step 2: Write `app/styles.css`** (topo-syaani instrument theme)

```css
:root {
  --bg:#0a0f14; --panel:#0e151d; --line:#1c2732; --fg:#dbe6ef; --muted:#5f7183; --accent:#35d0e0; --warn:#e8a24a;
  --mono:'Space Mono', ui-monospace, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0; color: var(--fg); font-family: 'Inter', system-ui, sans-serif;
  background: repeating-radial-gradient(circle at 85% -10%, rgba(53,208,224,.045) 0 1px, transparent 1px 16px), var(--bg);
  min-height: 100dvh;
}
#app { max-width: 1100px; margin: 0 auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.hd { display: flex; justify-content: space-between; align-items: baseline; }
.brand { font-weight: 800; letter-spacing: .04em; } .brand b { color: var(--accent); }
.lbl { font-size: 10px; letter-spacing: .11em; text-transform: uppercase; color: var(--muted); }
.num { font-family: var(--mono); font-weight: 700; }
.warn { color: var(--warn); } .good { color: var(--accent); }
.drop { border: 1px dashed #35506a; border-radius: 10px; padding: 14px; text-align: center; color: var(--muted); font-size: 13px; }
.drop.over { border-color: var(--accent); color: var(--fg); }
.pick { color: var(--accent); text-decoration: underline; cursor: pointer; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.gauges { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.g { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.g .v { font-size: 18px; } .g .v .u { font-size: 10px; color: var(--muted); }
.cards3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ins { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 11px; display: flex; flex-direction: column; gap: 6px; }
.ins .h { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.ins .big { font-family: var(--mono); font-weight: 700; font-size: 16px; }
.ins .sub { font-size: 11px; color: #8fa0b3; line-height: 1.5; }
.pill { align-self: flex-start; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 20px; }
.two { display: grid; grid-template-columns: 1.1fr 1fr; gap: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { text-align: left; padding: 6px; border-bottom: 1px solid #172029; }
th { color: var(--muted); font-size: 9px; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
canvas { width: 100%; display: block; }
@media (max-width: 720px) { .gauges { grid-template-columns: repeat(3,1fr);} .cards3, .two { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Write `app/main.mjs`** (pipeline → view model; rendering stubbed to console for now)

```js
import { parseGpx } from "../src/parse/gpx.mjs";
import { summarizeWorkout } from "../src/analysis/workout.mjs";
import { aggregate } from "../src/analysis/aggregate.mjs";
import { splitBlocks, slopePerDay, comeback, activeFrequencyPerWeek } from "../src/analysis/breaks.mjs";
import { spikeRisk } from "../src/analysis/spikeRisk.mjs";
import { acwr } from "../src/analysis/trainingLoad.mjs";
import { detrainingNote } from "../src/analysis/detraining.mjs";

let workouts = [];

function buildModel(ws) {
  const blocks = splitBlocks(ws);
  const cbs = comeback(ws);
  const lastGap = cbs.length ? cbs[cbs.length - 1] : null;
  return {
    workouts: ws,
    agg: aggregate(ws),
    frequency: activeFrequencyPerWeek(blocks),
    trends: {
      pace: slopePerDay(ws, (w) => w.paceMinKm),
      distance: slopePerDay(ws, (w) => w.distanceKm),
      elev: slopePerDay(ws, (w) => w.elevGain),
    },
    spikes: spikeRisk(ws),
    load: acwr(ws),
    lastComeback: lastGap,
    detraining: lastGap ? detrainingNote(lastGap.gapDays) : null,
  };
}

async function addFiles(fileList) {
  for (const file of fileList) {
    const text = await file.text();
    const parsed = parseGpx(text);
    if (!parsed) continue; // skip non-GPX / track-less
    workouts.push({ id: file.name, ...parsed, ...summarizeWorkout(parsed.points) });
  }
  workouts.sort((a, b) => a.date - b.date);
  render(buildModel(workouts));
}

function render(model) {
  // Replaced by real renderers in Tasks 9–10.
  console.log("model", model);
  document.getElementById("hd-meta").textContent = `${model.agg.count} treeniä`;
}

const drop = document.getElementById("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
document.getElementById("file").addEventListener("change", (e) => addFiles(e.target.files));

export { buildModel }; // for potential future tests
```

- [ ] **Step 4: Verify in a browser**

Run a static server from the repo root, e.g. `python -m http.server 8000`, open <http://localhost:8000/>, drop a GPX (or a couple exported from Sports Tracker). Confirm the console logs a `model` object with sensible `agg`/`spikes`/`trends`, and the header shows the count. (ES-module imports require http; `file://` won't work.)

- [ ] **Step 5: Commit**

```bash
git add index.html app/styles.css app/main.mjs
git commit -m "analyzer: app shell, topo theme, parse→model pipeline"
```

---

### Task 9: Render gauges + table

**Files:** Create `app/render/gauges.mjs`, `app/render/table.mjs`; Modify `app/main.mjs`

- [ ] **Step 1: Write `app/render/gauges.mjs`**

```js
import { fmtPace } from "../../src/analysis/workout.mjs";

const g = (v, unit, label, cls = "") =>
  `<div class="g"><div class="v num ${cls}">${v}<span class="u"> ${unit}</span></div><div class="lbl">${label}</div></div>`;

export function renderGauges(el, model) {
  const a = model.agg;
  el.innerHTML =
    `<div class="lbl" style="margin-bottom:6px">Yhteenveto</div><div class="gauges">` +
    g(Math.round(a.totalKm).toLocaleString("fi-FI"), "km", "Matka", "good") +
    g(Math.round(a.totalMin / 60), "h", "Aika") +
    g(Math.round(a.totalElev).toLocaleString("fi-FI"), "m", "Nousu") +
    g(fmtPace(a.avgPace), "/km", "Ka. tahti") +
    g(a.longestKm.toFixed(1), "km", "Pisin") +
    g(model.frequency.toFixed(1), "/vk", "Frekvenssi") +
    `</div>`;
}
```

- [ ] **Step 2: Write `app/render/table.mjs`**

```js
import { fmtPace } from "../../src/analysis/workout.mjs";

const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10);

export function renderTable(el, model) {
  const rows = model.workouts.map((w, i) => {
    const s = model.spikes[i];
    const note = s.suppressed ? `<span style="color:var(--muted)">tauon jälkeen</span>`
      : s.band === "high" ? `<span class="warn">⚠ spike +${Math.round((s.ratio - 1) * 100)}%</span>`
      : s.band === "moderate" ? `<span class="warn">▲ +${Math.round((s.ratio - 1) * 100)}%</span>`
      : `<span class="good">✓</span>`;
    return `<tr><td class="num">${fmtDate(w.date)}</td><td>${w.name}</td><td class="num">${w.distanceKm.toFixed(1)} km</td><td class="num">${fmtPace(w.paceMinKm)}</td><td class="num">${Math.round(w.elevGain)} m</td><td>${note}</td></tr>`;
  }).reverse().join("");
  el.innerHTML = `<div class="panel"><div class="lbl" style="margin-bottom:6px">Treenit</div><table><thead><tr><th>Päivä</th><th>Nimi</th><th>Matka</th><th>Tahti</th><th>Nousu</th><th>Huom.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
```

- [ ] **Step 3: Wire into `app/main.mjs`** — replace the placeholder `render`:

Add imports at the top:

```js
import { renderGauges } from "./render/gauges.mjs";
import { renderTable } from "./render/table.mjs";
```

Replace the `render` function body with:

```js
function render(model) {
  document.getElementById("hd-meta").textContent = `${model.agg.count} treeniä`;
  renderGauges(document.getElementById("summary"), model);
  renderTable(document.getElementById("table"), model);
}
```

- [ ] **Step 4: Verify in a browser** — reload, drop GPX files, confirm the gauge row and the workout table render with correct numbers and spike badges (a big jump shows ⚠, a first-back-from-break row shows "tauon jälkeen").

- [ ] **Step 5: Commit**

```bash
git add app/render/gauges.mjs app/render/table.mjs app/main.mjs
git commit -m "analyzer: render gauges + workout table"
```

---

### Task 10: Render science cards + canvas charts

**Files:** Create `app/render/cards.mjs`, `app/render/charts.mjs`; Modify `app/main.mjs`

- [ ] **Step 1: Write `app/render/cards.mjs`**

```js
export function renderCards(el, model) {
  // Injury / spike — use the most recent non-suppressed flagged workout, else the latest.
  const spikes = model.spikes;
  let idx = -1;
  for (let i = spikes.length - 1; i >= 0; i--) { if (spikes[i].band !== "none" && !spikes[i].suppressed) { idx = i; break; } }
  const s = idx >= 0 ? spikes[idx] : spikes[spikes.length - 1];
  const pct = s ? Math.round((s.ratio - 1) * 100) : 0;
  const spikeCard = `<div class="ins"><div class="h">Loukkaantumisriski · spike</div>` +
    (s && s.band === "high" ? `<span class="pill" style="background:#3a2513;color:var(--warn)">KORKEA</span>`
      : s && s.band === "moderate" ? `<span class="pill" style="background:#2c2718;color:var(--warn)">KOHONNUT</span>`
      : `<span class="pill" style="background:#12261f;color:var(--accent)">OK</span>`) +
    `<div class="sub">${s && s.band !== "none"
      ? `Lenkki <b class="num warn">+${pct}%</b> vs. 30 pv pisin. >30% piikki ≈ 2× rasitusvammariski (BJSM 2025).`
      : `Ei yksittäisen lenkin piikkiä 30 pv ikkunassa.`}</div></div>`;

  const load = model.load;
  const loadCard = `<div class="ins"><div class="h">Kuormitus &amp; tuoreus</div>` +
    `<div class="big">${load.ratio ? load.ratio.toFixed(2) : "–"} <span style="font-size:11px;color:var(--muted)">ACWR</span></div>` +
    `<div class="sub">7 pv kuorma vs. 28 pv ka. <span style="color:var(--muted)">(toissijainen / kiistelty signaali)</span>.</div></div>`;

  const cb = model.lastComeback;
  const breakCard = `<div class="ins"><div class="h">Tauko &amp; paluu</div>` +
    (cb ? `<div class="big warn">${cb.gapDays} pv</div><div class="sub">Paluu vei <b class="num">${cb.workoutsToReturn ?? "–"}</b> lenkkiä pre-tauko-tahtiin.${model.detraining ? " " + model.detraining : ""}</div>`
        : `<div class="big good">–</div><div class="sub">Ei ≥14 pv taukoja historiassa.</div>`) +
    `</div>`;

  el.innerHTML = spikeCard + loadCard + breakCard;
}
```

- [ ] **Step 2: Write `app/render/charts.mjs`** (hand-drawn canvas: distance-over-time bars + regression line, and elevation profile of the latest workout)

```js
function canvas(w, h) {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  return { c, ctx, w, h };
}

function distanceChart(model) {
  const { c, ctx, w, h } = canvas(560, 150);
  const ws = model.workouts;
  const max = Math.max(1, ...ws.map((x) => x.distanceKm));
  const bw = w / Math.max(ws.length, 1);
  ws.forEach((x, i) => {
    const bh = (x.distanceKm / max) * (h - 10);
    const flagged = model.spikes[i].band !== "none" && !model.spikes[i].suppressed;
    ctx.fillStyle = flagged ? "#e8a24a" : "#1d6f7a";
    ctx.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
  });
  // regression trend line for distance (slope per day → over the date span)
  if (ws.length >= 2) {
    const t0 = ws[0].date, span = (ws[ws.length - 1].date - t0) / 86400000 || 1;
    const meanX = ws.reduce((s, x) => s + (x.date - t0) / 86400000, 0) / ws.length;
    const meanY = ws.reduce((s, x) => s + x.distanceKm, 0) / ws.length;
    const b = model.trends.distance;
    const y0 = meanY + b * (0 - meanX), y1 = meanY + b * (span - meanX);
    ctx.strokeStyle = "#e8a24a"; ctx.setLineDash([4, 3]); ctx.beginPath();
    ctx.moveTo(0, h - (y0 / max) * (h - 10)); ctx.lineTo(w, h - (y1 / max) * (h - 10)); ctx.stroke(); ctx.setLineDash([]);
  }
  return c;
}

function elevationChart(model) {
  const { c, ctx, w, h } = canvas(420, 150);
  const last = model.workouts[model.workouts.length - 1];
  const pts = (last && last.points) || [];
  const eles = pts.map((p) => p.ele);
  const lo = Math.min(...eles, 0), hi = Math.max(...eles, 1);
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = (i / Math.max(pts.length - 1, 1)) * w;
    const y = h - ((p.ele - lo) / (hi - lo || 1)) * (h - 8);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#35d0e0"; ctx.lineWidth = 1; ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = "rgba(53,208,224,.15)"; ctx.fill();
  return c;
}

export function renderCharts(el, model) {
  el.innerHTML = "";
  const left = document.createElement("div"); left.className = "panel";
  const trend = model.trends.distance >= 0 ? "good" : "warn";
  left.innerHTML = `<div class="lbl" style="margin-bottom:8px">Matka / aika + trendi <span class="${trend}">${model.trends.distance >= 0 ? "↑" : "↓"} ${(model.trends.distance * 30).toFixed(1)} km/kk</span></div>`;
  left.appendChild(distanceChart(model));
  const right = document.createElement("div"); right.className = "panel";
  right.innerHTML = `<div class="lbl" style="margin-bottom:6px">Korkeusprofiili · viimeisin lenkki</div>`;
  right.appendChild(elevationChart(model));
  el.append(left, right);
}
```

- [ ] **Step 3: Wire into `app/main.mjs`** — add imports and calls:

```js
import { renderCards } from "./render/cards.mjs";
import { renderCharts } from "./render/charts.mjs";
```

Extend `render`:

```js
function render(model) {
  document.getElementById("hd-meta").textContent = `${model.agg.count} treeniä`;
  renderGauges(document.getElementById("summary"), model);
  renderCards(document.getElementById("cards"), model);
  renderCharts(document.getElementById("charts"), model);
  renderTable(document.getElementById("table"), model);
}
```

- [ ] **Step 4: Verify in a browser** — reload, drop a real Sports Tracker GPX export, and confirm: the three science cards show sensible values (spike pill, ACWR, break/comeback + detraining note), the distance bar chart draws with the dashed trend line (spiky bars amber), and the elevation profile of the latest workout renders. Compare to the mockup feel.

- [ ] **Step 5: Commit**

```bash
git add app/render/cards.mjs app/render/charts.mjs app/main.mjs
git commit -m "analyzer: science cards + canvas charts (distance trend, elevation)"
```

---

### Task 11: CI/CD + README

**Files:** Create `.github/workflows/ci.yml`; Modify `README.md`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions: { contents: read, pages: write, id-token: write }
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: "." }
      - id: deployment
        uses: actions/deploy-pages@v4
```

Note: `upload-pages-artifact` with `path: "."` publishes the repo root as the static site (`index.html` + `app/` + `src/`). Extra files (`test/`, `docs/`, `package.json`) are harmless. One-time: repo **Settings → Pages → Source: GitHub Actions**.

- [ ] **Step 2: Update `README.md`** — add an analyzer section (keep the existing export section if present on this branch; on `build-analyzer` off `main` the README is the scaffold stub, so replace it):

```markdown
# Treeniloki

Client-side running tools. **GPX workout analyzer** + Sports Tracker export script.

## Analyzer

Drag GPX files into the page → a dark topographic instrument dashboard: summary stats,
break-aware trends, and science-backed injury-spike / training-load / comeback insights.
100% client-side, no build, no dependencies.

**Run locally:** serve the folder over http (ES modules need it), e.g. `python -m http.server 8000`, then open <http://localhost:8000/>.

**Test:** `npm test` (node:test over `test/`).

Deployed to GitHub Pages via `.github/workflows/ci.yml` on push to `main`.

## License

2026 EliasKarj. See [LICENSE](./LICENSE).
```

- [ ] **Step 3: Final verification**

Run: `npm test` (all analysis tests pass). Load the app once more in a browser with real GPX to confirm nothing regressed.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "analyzer: CI (node:test) + GitHub Pages deploy + README"
```

---

## Self-Review

**Spec coverage:**
- Per-workout math (haversine, duration, elevGain 0.3 m, pace) → Task 1. ✓
- GPX parse `{lat,lon,ele,t}` → Task 2 (regex, Node+browser). ✓
- Aggregate stats → Task 3. ✓
- Break blocks ≥14 d + calendar-day regression + comeback + active frequency → Task 4. ✓
- Spike detector (trailing-30-day, >10/>30 bands) + post-break suppression → Task 5. ✓
- Training load + ACWR (labelled contested) → Task 6 + card in Task 10. ✓
- Detraining note by gap length → Task 7 + card in Task 10. ✓
- Instrument-grid layout + topo-syaani style → Tasks 8–10 (html/css/render). ✓
- Gauges, science cards, canvas charts (distance trend + elevation), sortable-ready table with spike badges → Tasks 9–10. ✓
- Error handling (skip non-GPX/track-less; sort by date; <2 guarded in slopePerDay/comeback) → Tasks 2, 4, 8. ✓
- `node:test` testing → Tasks 1–7. ✓
- CI + Pages deploy → Task 11. ✓

**Placeholder scan:** none — every code step is complete. The table header `cursor:pointer` hints sortability; full click-to-sort is deferred (YAGNI for MVP) and not claimed as done. `render()` is defined as a stub in Task 8 and fully replaced in Tasks 9–10 (explicitly).

**Type/name consistency:** `parseGpx`, `summarizeWorkout`, `aggregate`, `splitBlocks`, `slopePerDay`, `comeback`, `activeFrequencyPerWeek`, `spikeRisk(workouts,opts)→[{ratio,band,suppressed}]`, `sessionLoad`, `acwr(ws)→{acute,chronic,ratio}`, `detrainingNote(gapDays)`, `fmtPace`, `renderGauges/renderTable/renderCards/renderCharts(el,model)` are defined once and consumed consistently. The `model` shape built in Task 8 (`agg`, `frequency`, `trends`, `spikes`, `load`, `lastComeback`, `detraining`, `workouts`) matches every renderer's reads in Tasks 9–10.
