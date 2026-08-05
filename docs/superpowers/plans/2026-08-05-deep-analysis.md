# Deep Analysis ("Lisätietoja" panel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a progressive-disclosure "Syväanalyysi · Lisätietoja" panel with coaching tips, 80/20 intensity distribution, VO2max/VDOT trend, a goal selector, and (conditional) HR zones.

**Architecture:** Five new pure `.mjs` analysis modules + an HR extension to the GPX parser, each unit-tested with `node:test`. A new `app/render/details.mjs` draws the panel (hand-drawn canvas sparkline, no libraries). Wired into `buildModel`/`render` in `app/main.mjs`, plus a `<details>` shell in `index.html` and styles in `app/styles.css`.

**Tech Stack:** Vanilla ESM, no build step, `node:test`, `<canvas>`. Zero runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-05-deep-analysis-design.md`

---

## File Structure

- `src/parse/gpx.mjs` — **modify**: capture per-point `hr`; add workout `avgHr`/`maxHr`.
- `src/analysis/hrZones.mjs` — **new**: `maxHrObserved`, `zoneOf`, `hrSummary`.
- `src/analysis/intensity.mjs` — **new**: `easyPace`, `classifyEffort`, `intensityDistribution` (80/20).
- `src/analysis/vo2max.mjs` — **new**: `vo2Cost`, `pctMax`, `vo2maxOf`, `vdotTrend`.
- `src/analysis/goals.mjs` — **new**: `GOALS`, `goalMetric`, `goalWeight`.
- `src/analysis/coaching.mjs` — **new**: `coachingTips`.
- `app/render/details.mjs` — **new**: `renderDetails`.
- `app/main.mjs` — **modify**: extend `buildModel`, add goal state, call `renderDetails`.
- `index.html` — **modify**: add `<details class="deep">` shell.
- `app/styles.css` — **modify**: add `.deep`, `.goals`, `.tips`, `.bar8020`, `.zbar` rules.
- `test/*.test.mjs` — **new/extend**: one per module.

All commands run from the repo root `in-development/treeniloki`. Test command: `npm test` (glob `node --test "test/**/*.test.mjs"`).

---

### Task 1: Branch off main

- [ ] **Step 1: Create and switch to the feature branch**

Run:
```bash
git checkout main && git checkout -b build-deep-analysis
```
Expected: `Switched to a new branch 'build-deep-analysis'`

---

### Task 2: GPX heart-rate parsing

**Files:**
- Modify: `src/parse/gpx.mjs`
- Test: `test/gpx.test.mjs` (append)

- [ ] **Step 1: Add failing HR tests**

Append to `test/gpx.test.mjs`:
```js
const HR_SAMPLE = `<?xml version="1.0"?>
<gpx><trk><name>Sykelenkki</name><trkseg>
<trkpt lat="60.1" lon="25.0"><ele>10</ele><time>2024-06-01T06:00:00Z</time>
<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
<trkpt lat="60.101" lon="25.0"><ele>12</ele><time>2024-06-01T06:10:00Z</time>
<extensions><hr>160</hr></extensions></trkpt>
</trkseg></trk></gpx>`;

test("parseGpx reads heart rate from gpxtpx:hr and plain <hr>", () => {
  const w = parseGpx(HR_SAMPLE);
  assert.equal(w.points[0].hr, 140);
  assert.equal(w.points[1].hr, 160);
  assert.equal(w.avgHr, 150);
  assert.equal(w.maxHr, 160);
});

test("parseGpx leaves hr null and omits avgHr when no HR present", () => {
  const w = parseGpx(SAMPLE);
  assert.equal(w.points[0].hr, null);
  assert.equal(w.avgHr, undefined);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `w.points[0].hr` is `undefined`, not `140`.

- [ ] **Step 3: Implement HR capture**

In `src/parse/gpx.mjs`, inside the `while` loop add an HR match after the `eleM` line and include `hr` in the pushed point:
```js
    const eleM = inner.match(/<ele>([-\d.]+)<\/ele>/);
    const hrM = inner.match(/<(?:[a-zA-Z0-9]+:)?hr>(\d+)<\/(?:[a-zA-Z0-9]+:)?hr>/);
    points.push({
      lat: parseFloat(m[1]),
      lon: parseFloat(m[2]),
      ele: eleM ? parseFloat(eleM[1]) : 0,
      hr: hrM ? parseInt(hrM[1], 10) : null,
      t,
    });
```
Replace the final `return { name, date: points[0].t, points };` with:
```js
  const hrs = points.map((p) => p.hr).filter((h) => h != null);
  const out = { name, date: points[0].t, points };
  if (hrs.length) {
    out.avgHr = Math.round(hrs.reduce((s, h) => s + h, 0) / hrs.length);
    out.maxHr = Math.max(...hrs);
  }
  return out;
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS (all gpx tests green).

- [ ] **Step 5: Commit**
```bash
git add src/parse/gpx.mjs test/gpx.test.mjs
git commit -m "gpx: parse heart rate (gpxtpx:hr / <hr>) + workout avgHr/maxHr"
```

---

### Task 3: HR zones (`hrZones.mjs`)

**Files:**
- Create: `src/analysis/hrZones.mjs`
- Test: `test/hrZones.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `test/hrZones.test.mjs`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `hrZones.mjs`.

- [ ] **Step 3: Implement**

Create `src/analysis/hrZones.mjs`:
```js
const Z = [0.60, 0.70, 0.80, 0.90];

/** Highest point HR across all workouts, or null when no point has HR. */
export function maxHrObserved(workouts) {
  let max = null;
  for (const w of workouts) for (const p of (w.points || [])) {
    if (p.hr != null && (max === null || p.hr > max)) max = p.hr;
  }
  return max;
}

/** HR zone 1..5 by fraction of maxHr, or null if inputs missing. */
export function zoneOf(hr, maxHr) {
  if (!maxHr || hr == null) return null;
  const f = hr / maxHr;
  if (f < Z[0]) return 1;
  if (f < Z[1]) return 2;
  if (f < Z[2]) return 3;
  if (f < Z[3]) return 4;
  return 5;
}

/** Time-in-zone summary, or null when no workout has HR. */
export function hrSummary(workouts) {
  const maxHr = maxHrObserved(workouts);
  if (maxHr == null) return null;
  const zoneMinutes = [0, 0, 0, 0, 0];
  for (const w of workouts) {
    const pts = w.points || [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      if (a.hr == null) continue;
      const z = zoneOf(a.hr, maxHr);
      const min = (pts[i].t - a.t) / 60000;
      if (min > 0 && z) zoneMinutes[z - 1] += min;
    }
  }
  const total = zoneMinutes.reduce((s, x) => s + x, 0) || 1;
  const easy = zoneMinutes[0] + zoneMinutes[1];
  const moderate = zoneMinutes[2];
  const hard = zoneMinutes[3] + zoneMinutes[4];
  return {
    maxHr,
    zoneMinutes,
    easyPct: Math.round((easy / total) * 100),
    moderatePct: Math.round((moderate / total) * 100),
    hardPct: Math.round((hard / total) * 100),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/analysis/hrZones.mjs test/hrZones.test.mjs
git commit -m "analysis: HR zones (maxHrObserved, zoneOf, hrSummary)"
```

---

### Task 4: 80/20 intensity distribution (`intensity.mjs`)

**Files:**
- Create: `src/analysis/intensity.mjs`
- Test: `test/intensity.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `test/intensity.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { easyPace, classifyEffort, intensityDistribution } from "../src/analysis/intensity.mjs";

const DAY = 86400000;
const NOW = 1_700_000_000_000;
const w = (ageDays, paceMinKm, durationMin = 60, extra = {}) =>
  ({ date: NOW - ageDays * DAY, paceMinKm, durationMin, points: [], ...extra });

test("easyPace is the median pace of workouts with a positive pace", () => {
  assert.equal(easyPace([w(0, 6), w(0, 5), w(0, 7)]), 6);
  assert.equal(easyPace([w(0, 0)]), null);
});

test("classifyEffort splits hard/easy at ±5% of the reference", () => {
  assert.equal(classifyEffort(5.6, 6), "hard");   // >5% faster
  assert.equal(classifyEffort(6.4, 6), "easy");    // >5% slower
  assert.equal(classifyEffort(6.0, 6), "moderate");
});

test("intensityDistribution is duration-weighted over the trailing 28 days", () => {
  // ref median = 6. Easy 60min (7:00), hard 30min (5:00) → easy 66%, hard 33%.
  const d = intensityDistribution([w(1, 7, 60), w(2, 5, 30), w(3, 6, 0)], NOW);
  assert.equal(d.easyMin, 60);
  assert.equal(d.hardMin, 30);
  assert.equal(d.easyPct, 67);
  assert.equal(d.hardPct, 33);
});

test("intensityDistribution ignores workouts older than 28 days", () => {
  const d = intensityDistribution([w(40, 5, 60), w(1, 6, 60)], NOW);
  assert.equal(d.easyMin + d.moderateMin + d.hardMin, 60);
});

test("empty window returns a safe zero shape with drift none", () => {
  const d = intensityDistribution([], NOW);
  assert.equal(d.drift, "none");
  assert.equal(d.easyPct, 0);
});

test("HR-tagged workout is classified by zone, not pace", () => {
  // maxHr observed 190; avgHr 120 → ~63% → zone2 → easy even though pace is fast.
  const d = intensityDistribution([
    w(1, 4.0, 60, { avgHr: 120, points: [{ hr: 190, t: 0 }] }),
  ], NOW);
  assert.equal(d.easyMin, 60);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `intensity.mjs`.

- [ ] **Step 3: Implement**

Create `src/analysis/intensity.mjs`:
```js
import { maxHrObserved, zoneOf } from "./hrZones.mjs";

const DAY = 86400000;

/** Median pace (min/km) across workouts with a positive pace, or null. */
export function easyPace(workouts) {
  const paces = workouts.map((w) => w.paceMinKm).filter((p) => p > 0).sort((a, b) => a - b);
  if (!paces.length) return null;
  const mid = Math.floor(paces.length / 2);
  return paces.length % 2 ? paces[mid] : (paces[mid - 1] + paces[mid]) / 2;
}

/** "hard" if >5% faster than ref, "easy" if >5% slower, else "moderate". */
export function classifyEffort(paceMinKm, ref) {
  if (!ref || !(paceMinKm > 0)) return "moderate";
  if (paceMinKm < ref * 0.95) return "hard";
  if (paceMinKm > ref * 1.05) return "easy";
  return "moderate";
}

function effortFromHr(avgHr, maxHr) {
  const z = zoneOf(avgHr, maxHr);
  if (z == null) return null;
  if (z <= 2) return "easy";
  if (z === 3) return "moderate";
  return "hard";
}

/** Duration-weighted easy/moderate/hard split over the trailing 28 days. */
export function intensityDistribution(workouts, now = Date.now()) {
  const win = workouts.filter((w) => (now - w.date) / DAY <= 28);
  const ref = easyPace(win);
  const maxHr = maxHrObserved(workouts);
  const min = { easy: 0, moderate: 0, hard: 0 };
  for (const w of win) {
    const dur = w.durationMin || 0;
    if (dur <= 0) continue;
    let eff = w.avgHr != null ? effortFromHr(w.avgHr, maxHr) : null;
    if (!eff) eff = classifyEffort(w.paceMinKm, ref);
    min[eff] += dur;
  }
  const total = min.easy + min.moderate + min.hard;
  if (total === 0) {
    return { easyPct: 0, moderatePct: 0, hardPct: 0, easyMin: 0, moderateMin: 0, hardMin: 0, ref, drift: "none" };
  }
  const easyPct = Math.round((min.easy / total) * 100);
  const moderatePct = Math.round((min.moderate / total) * 100);
  const hardPct = Math.round((min.hard / total) * 100);
  const drift = hardPct > 25 ? "tooHard" : moderatePct >= 35 ? "grey" : easyPct >= 75 ? "ok" : "grey";
  return {
    easyPct, moderatePct, hardPct,
    easyMin: Math.round(min.easy), moderateMin: Math.round(min.moderate), hardMin: Math.round(min.hard),
    ref, drift,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/analysis/intensity.mjs test/intensity.test.mjs
git commit -m "analysis: 80/20 intensity distribution (pace- or HR-based)"
```

---

### Task 5: VO2max / VDOT trend (`vo2max.mjs`)

**Files:**
- Create: `src/analysis/vo2max.mjs`
- Test: `test/vo2max.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `test/vo2max.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { vo2maxOf, vdotTrend } from "../src/analysis/vo2max.mjs";

const DAY = 86400000;

test("vo2maxOf for 5km in 25min is ~38 (Daniels)", () => {
  const v = vo2maxOf(5, 25);
  assert.ok(v > 37 && v < 40, `got ${v}`);
});

test("vo2maxOf guards zero/invalid input", () => {
  assert.equal(vo2maxOf(0, 25), null);
  assert.equal(vo2maxOf(5, 0), null);
});

test("vdotTrend keeps one best (fastest) effort per 7-day bucket", () => {
  const w = (date, distanceKm, durationMin, paceMinKm) => ({ date, distanceKm, durationMin, paceMinKm });
  const t = vdotTrend([
    w(0, 5, 30, 6),                 // week 0 slower
    w(1 * DAY, 5, 25, 5),           // week 0 faster -> kept
    w(10 * DAY, 5, 24, 4.8),        // week 1
    w(2 * DAY, 2, 10, 5),           // too short, ignored
  ]);
  assert.equal(t.points.length, 2);
  assert.ok(t.current > 0);
});

test("vdotTrend with no qualifying effort returns nulls", () => {
  const t = vdotTrend([{ date: 0, distanceKm: 2, durationMin: 12, paceMinKm: 6 }]);
  assert.equal(t.current, null);
  assert.deepEqual(t.points, []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `vo2max.mjs`.

- [ ] **Step 3: Implement**

Create `src/analysis/vo2max.mjs`:
```js
const DAY = 86400000;

/** Daniels O2 cost of running at velocity v (m/min), ml/kg/min. */
export function vo2Cost(v) {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction of VO2max sustainable for t minutes (Daniels). */
export function pctMax(t) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

/** VO2max estimate from a single sustained effort, rounded to 0.1. Null if invalid. */
export function vo2maxOf(distanceKm, durationMin) {
  if (!(distanceKm > 0) || !(durationMin > 0)) return null;
  const v = (distanceKm * 1000) / durationMin; // m/min
  return Math.round((vo2Cost(v) / pctMax(durationMin)) * 10) / 10;
}

/** One estimate per 7-day bucket (best/fastest qualifying effort), plus latest as `current`. */
export function vdotTrend(workouts, minKm = 3) {
  const weeks = new Map();
  for (const w of workouts) {
    if (!(w.distanceKm >= minKm) || !(w.durationMin > 0)) continue;
    const wk = Math.floor(w.date / (7 * DAY));
    const prev = weeks.get(wk);
    if (!prev || w.paceMinKm < prev.paceMinKm) weeks.set(wk, w);
  }
  const points = [...weeks.values()]
    .sort((a, b) => a.date - b.date)
    .map((w) => ({ date: w.date, value: vo2maxOf(w.distanceKm, w.durationMin) }));
  return { current: points.length ? points[points.length - 1].value : null, points };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/analysis/vo2max.mjs test/vo2max.test.mjs
git commit -m "analysis: VO2max/VDOT estimate + weekly trend (Daniels)"
```

---

### Task 6: Goal metadata (`goals.mjs`)

**Files:**
- Create: `src/analysis/goals.mjs`
- Test: `test/goals.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `test/goals.test.mjs`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `goals.mjs`.

- [ ] **Step 3: Implement**

Create `src/analysis/goals.mjs`:
```js
export const GOALS = {
  speed:     { label: "Nopeus",             metricKey: "vdot",    unit: "VO₂max",    areas: ["vdot", "intensity", "trend"] },
  endurance: { label: "Kestävyys",          metricKey: "easyPct", unit: "% helppoa", areas: ["intensity", "load", "trend"] },
  fatloss:   { label: "Rasvanpoltto",       metricKey: "easyMin", unit: "min/28pv",  areas: ["intensity", "break", "load"] },
  injury:    { label: "Loukkaantumissuoja", metricKey: "spike",   unit: "×",         areas: ["spike", "load", "break"] },
};

/** Headline {label, value, unit} for the selected goal. value may be null. */
export function goalMetric(goal, model) {
  const g = GOALS[goal] || GOALS.endurance;
  let value = null;
  switch (g.metricKey) {
    case "vdot": value = model.vdot?.current ?? null; break;
    case "easyPct": value = model.intensity?.easyPct ?? null; break;
    case "easyMin": value = model.intensity?.easyMin ?? null; break;
    case "spike": {
      const s = model.spikes?.[model.spikes.length - 1];
      value = s ? Math.round(s.ratio * 100) / 100 : null;
      break;
    }
  }
  return { label: g.label, value, unit: g.unit };
}

/** Sort weight for a coaching area under a goal (higher = more relevant). */
export function goalWeight(goal, area) {
  const g = GOALS[goal] || GOALS.endurance;
  const idx = g.areas.indexOf(area);
  return idx === -1 ? 0 : g.areas.length - idx;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/analysis/goals.mjs test/goals.test.mjs
git commit -m "analysis: goal metadata (metric selection + area weighting)"
```

---

### Task 7: Coaching tips (`coaching.mjs`)

**Files:**
- Create: `src/analysis/coaching.mjs`
- Test: `test/coaching.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `test/coaching.test.mjs`:
```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `coaching.mjs`.

- [ ] **Step 3: Implement**

Create `src/analysis/coaching.mjs`:
```js
import { detrainingNote } from "./detraining.mjs";
import { goalWeight } from "./goals.mjs";

const DAY = 86400000;
const RANK = { alert: 3, warn: 2, info: 1 };

function trailing30MaxKm(workouts, refDate) {
  let max = 0;
  for (const w of workouts) {
    const age = (refDate - w.date) / DAY;
    if (age > 0 && age <= 30 && w.distanceKm > max) max = w.distanceKm;
  }
  return max;
}

/** Ranked, goal-aware coaching tips derived from the view model. */
export function coachingTips(model, goal = "endurance", now = Date.now()) {
  const ws = model.workouts || [];
  const lastW = ws[ws.length - 1];
  const tips = [];

  // spike
  const lastSpike = model.spikes?.[model.spikes.length - 1];
  if (lastSpike && lastW && !lastSpike.suppressed && lastSpike.band !== "none") {
    const cap = Math.round(trailing30MaxKm(ws.slice(0, -1), lastW.date) * 1.1) || Math.round(lastW.distanceKm);
    if (lastSpike.band === "high") {
      tips.push({ area: "spike", severity: "alert", text: `Viime lenkki oli iso hyppäys. Pidä seuraava pitkä ≤ ${cap} km.` });
    } else {
      tips.push({ area: "spike", severity: "warn", text: `Matka nousi reippaasti. Vältä seuraavaa isoa hyppäystä (≤ ${cap} km).` });
    }
  }

  // load (ACWR)
  const ratio = model.load?.ratio ?? 0;
  if (ratio > 1.5) {
    tips.push({ area: "load", severity: "warn", text: `Kuorma noussut nopeasti (ACWR ${ratio.toFixed(2)}). Harkitse kevennysviikkoa.` });
  } else if (ratio > 0 && ratio < 0.8 && ws.length > 3) {
    tips.push({ area: "load", severity: "info", text: `Kuorma matala (ACWR ${ratio.toFixed(2)}) — tilaa lisätä maltilla.` });
  }

  // break / comeback (only when the last workout is recent)
  if (model.lastComeback && lastW && (now - lastW.date) / DAY <= 21) {
    const note = detrainingNote(model.lastComeback.gapDays);
    if (note) tips.push({ area: "break", severity: "info", text: `${note} Aloita ~60 % entisestä volyymista, +10 %/vk.` });
  }

  // intensity 80/20
  const it = model.intensity;
  if (it && it.drift && it.drift !== "none") {
    if (it.drift === "grey") {
      tips.push({ area: "intensity", severity: "warn", text: `Liikaa keskitehoa (${it.moderatePct} %). Helpot helpommaksi, kovat kovemmaksi (80/20).` });
    } else if (it.drift === "tooHard") {
      tips.push({ area: "intensity", severity: "warn", text: `Kovaa on paljon (${it.hardPct} %). Lisää helppoja lenkkejä palautumiseen.` });
    } else {
      tips.push({ area: "intensity", severity: "info", text: `Intensiteettijakauma hyvä (${it.easyPct} % helppoa).` });
    }
  }

  // pace trend
  if (ws.length >= 3 && model.trends) {
    if (model.trends.pace < 0) {
      tips.push({ area: "trend", severity: "info", text: `Tahti paranee tasaisesti — jatka samaan malliin.` });
    } else if (model.trends.pace > 0) {
      tips.push({ area: "trend", severity: "info", text: `Tahti on hieman hidastunut. Tarkista lepo ja 80/20-jakauma.` });
    }
  }

  // vdot direction
  if (model.vdot?.current != null && model.vdot.points?.length >= 2) {
    const first = model.vdot.points[0].value, cur = model.vdot.current;
    const dir = cur > first ? "noussut" : cur < first ? "laskenut" : "vakaa";
    tips.push({ area: "vdot", severity: "info", text: `VO₂max-estimaatti ${cur} (${dir}). Paras tuore suoritus ratkaisee.` });
  }

  return tips.sort((a, b) =>
    (goalWeight(goal, b.area) - goalWeight(goal, a.area)) || (RANK[b.severity] - RANK[a.severity]));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/analysis/coaching.mjs test/coaching.test.mjs
git commit -m "analysis: goal-aware coaching tips"
```

---

### Task 8: Render the panel (`app/render/details.mjs`)

**Files:**
- Create: `app/render/details.mjs`

*(No unit test — this is DOM rendering, verified in-browser in Task 10. Keep logic thin; all math already lives in tested modules.)*

- [ ] **Step 1: Implement the render module**

Create `app/render/details.mjs`:
```js
import { GOALS, goalMetric } from "../../src/analysis/goals.mjs";

function sparkline(points) {
  const w = 220, h = 40, pad = 3;
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.width = w + "px"; c.style.height = h + "px";
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  ctx.strokeStyle = "#35d0e0"; ctx.lineWidth = 1.5; ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (w - 2 * pad);
    const y = h - pad - ((p.value - lo) / (hi - lo || 1)) * (h - 2 * pad);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  return c;
}

function bar8020(it) {
  const seg = (cls, pct, label) =>
    pct > 0 ? `<span class="seg ${cls}" style="width:${pct}%">${pct >= 12 ? label : ""}</span>` : "";
  return `<div class="bar8020">${seg("e", it.easyPct, "helppo")}${seg("m", it.moderatePct, "keski")}${seg("h", it.hardPct, "kova")}</div>`;
}

const DRIFT = {
  ok: ["good", "Jakauma kunnossa (~80/20)."],
  grey: ["warn", "Liikaa keskitehoa — polarisoi helppo/kova."],
  tooHard: ["warn", "Kovaa on paljon — lisää helppoja lenkkejä."],
  none: ["", "Ei riittävästi dataa 28 pv:ltä."],
};

export function renderDetails(container, model, goal, onGoalChange) {
  container.innerHTML = "";

  // goal selector
  const goalsEl = document.createElement("div");
  goalsEl.className = "goals";
  for (const [key, g] of Object.entries(GOALS)) {
    const b = document.createElement("button");
    b.textContent = g.label;
    if (key === goal) b.className = "on";
    b.addEventListener("click", () => onGoalChange(key));
    goalsEl.appendChild(b);
  }
  container.appendChild(goalsEl);

  // headline goal metric
  const gm = goalMetric(goal, model);
  const metric = document.createElement("div");
  metric.className = "gmetric";
  metric.innerHTML = `<span class="lbl">${gm.label}</span> <span class="num">${gm.value ?? "–"}</span> <span class="u">${gm.unit}</span>`;
  container.appendChild(metric);

  // coaching tips
  const tips = document.createElement("div");
  tips.className = "tips";
  tips.innerHTML = (model.coaching || []).map((t) => `<div class="tip ${t.severity}">${t.text}</div>`).join("")
    || `<div class="tip info">Lisää treenejä saadaksesi valmennusvinkkejä.</div>`;
  container.appendChild(tips);

  // 80/20
  const it = model.intensity;
  const iv = document.createElement("div"); iv.className = "block";
  const [dcls, dtext] = DRIFT[(it && it.drift) || "none"];
  iv.innerHTML = `<div class="lbl">Intensiteetti · 80/20</div>${it && it.drift !== "none" ? bar8020(it) : ""}<div class="sub ${dcls}">${dtext}</div>`;
  container.appendChild(iv);

  // VO2max
  const vv = document.createElement("div"); vv.className = "block";
  vv.innerHTML = `<div class="lbl">VO₂max-estimaatti</div>`;
  if (model.vdot?.current != null) {
    const num = document.createElement("div"); num.className = "num big"; num.textContent = model.vdot.current;
    vv.appendChild(num);
    if (model.vdot.points.length >= 2) vv.appendChild(sparkline(model.vdot.points));
  } else {
    vv.insertAdjacentHTML("beforeend", `<div class="sub">Tarvitaan ≥ 3 km suoritus arvioon.</div>`);
  }
  container.appendChild(vv);

  // HR (conditional)
  const hv = document.createElement("div"); hv.className = "block";
  if (model.hr) {
    const z = model.hr.zoneMinutes.map((m) => Math.round(m));
    const total = z.reduce((s, x) => s + x, 0) || 1;
    const zbar = z.map((m, i) => (m > 0 ? `<span class="zseg z${i + 1}" style="width:${(m / total) * 100}%"></span>` : "")).join("");
    hv.innerHTML = `<div class="lbl">Sykealueet · max ${model.hr.maxHr}</div><div class="zbar">${zbar}</div><div class="sub">Helppo ${model.hr.easyPct}% · keski ${model.hr.moderatePct}% · kova ${model.hr.hardPct}%</div>`;
  } else {
    hv.innerHTML = `<div class="lbl">Syke</div><div class="sub">Ei sykedataa GPX-tiedostoissa.</div>`;
  }
  container.appendChild(hv);
}
```

- [ ] **Step 2: Commit**
```bash
git add app/render/details.mjs
git commit -m "render: deep-analysis panel (goal, coaching, 80/20, VO2max, HR)"
```

---

### Task 9: Wire into the app shell

**Files:**
- Modify: `index.html`
- Modify: `app/main.mjs`
- Modify: `app/styles.css`

- [ ] **Step 1: Add the panel shell to `index.html`**

In `index.html`, between `<section id="charts" class="two"></section>` and `<section id="table"></section>`, insert:
```html
    <details class="deep">
      <summary>Syväanalyysi — valmennus, 80/20, VO2max, tavoitteet</summary>
      <div id="deep-body"></div>
    </details>
```

- [ ] **Step 2: Wire `app/main.mjs`**

Add these imports after the existing render imports (after line 11):
```js
import { intensityDistribution } from "../src/analysis/intensity.mjs";
import { vdotTrend } from "../src/analysis/vo2max.mjs";
import { hrSummary } from "../src/analysis/hrZones.mjs";
import { coachingTips } from "../src/analysis/coaching.mjs";
import { renderDetails } from "./render/details.mjs";
```
Add module state next to `let workouts = [];`:
```js
let goal = "endurance";
let currentModel = null;
```
In `buildModel`, add three fields to the returned object (after `detraining: ...`):
```js
    intensity: intensityDistribution(ws),
    vdot: vdotTrend(ws),
    hr: hrSummary(ws),
```
Replace the `render` function body so it stores the model, computes coaching, and renders the panel:
```js
function render(model) {
  currentModel = model;
  model.coaching = coachingTips(model, goal);
  document.getElementById("hd-meta").textContent = `${model.agg.count} treeniä`;
  renderGauges(document.getElementById("summary"), model);
  renderCards(document.getElementById("cards"), model);
  renderCharts(document.getElementById("charts"), model);
  renderDetails(document.getElementById("deep-body"), model, goal, setGoal);
  renderTable(document.getElementById("table"), model);
}

function setGoal(g) {
  goal = g;
  currentModel.coaching = coachingTips(currentModel, goal);
  renderDetails(document.getElementById("deep-body"), currentModel, goal, setGoal);
}
```

- [ ] **Step 3: Add styles to `app/styles.css`**

Append to `app/styles.css`:
```css
.deep { border: 1px solid var(--line); border-radius: 10px; background: var(--panel); padding: 0 12px; }
.deep > summary { cursor: pointer; padding: 11px 0; color: var(--accent); font-weight: 600; list-style: none; }
.deep > summary::-webkit-details-marker { display: none; }
.deep > summary::before { content: "▸ "; color: var(--muted); }
.deep[open] > summary::before { content: "▾ "; }
#deep-body { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 12px; }
.goals { display: flex; gap: 6px; flex-wrap: wrap; }
.goals button { background: #0d141c; color: var(--muted); border: 1px solid var(--line); border-radius: 20px; padding: 5px 12px; font: inherit; font-size: 12px; cursor: pointer; }
.goals button.on { color: var(--bg); background: var(--accent); border-color: var(--accent); font-weight: 700; }
.gmetric .num { font-size: 20px; } .gmetric .u { color: var(--muted); font-size: 11px; }
.tips { display: flex; flex-direction: column; gap: 6px; }
.tip { font-size: 13px; line-height: 1.5; padding: 8px 10px; border-radius: 8px; border-left: 3px solid var(--line); background: #0d141c; }
.tip.alert { border-left-color: #e05a5a; } .tip.warn { border-left-color: var(--warn); } .tip.info { border-left-color: var(--accent); }
.block .lbl { margin-bottom: 6px; } .block .big { font-size: 22px; }
.bar8020 { display: flex; height: 22px; border-radius: 6px; overflow: hidden; margin-bottom: 6px; font-size: 10px; }
.bar8020 .seg { display: flex; align-items: center; justify-content: center; color: #06121a; font-weight: 700; overflow: hidden; white-space: nowrap; }
.bar8020 .e { background: #35d0e0; } .bar8020 .m { background: var(--warn); } .bar8020 .h { background: #e05a5a; }
.zbar { display: flex; height: 16px; border-radius: 5px; overflow: hidden; }
.zbar .zseg.z1 { background: #2a6b74; } .zbar .zseg.z2 { background: #35d0e0; } .zbar .zseg.z3 { background: #7fd97f; } .zbar .zseg.z4 { background: var(--warn); } .zbar .zseg.z5 { background: #e05a5a; }
.sub.good { color: var(--accent); } .sub.warn { color: var(--warn); }
```

- [ ] **Step 4: Full test run**

Run: `npm test`
Expected: PASS — all existing + new tests green.

- [ ] **Step 5: Commit**
```bash
git add index.html app/main.mjs app/styles.css
git commit -m "app: wire deep-analysis panel + goal selector into the dashboard"
```

---

### Task 10: In-browser verification

**Files:** none (manual check)

- [ ] **Step 1: Serve the app locally**

Run (from repo root):
```bash
node ../../../scratchpad/serve.mjs
```
(If the scratchpad server is gone, run any static server that serves the repo root on `http://localhost:8000/`.)

- [ ] **Step 2: Verify in the browser**

Open `http://localhost:8000/`. Drop a folder of exported GPX files. Confirm:
- The "Syväanalyysi" panel expands and shows the goal buttons, coaching tips, an 80/20 bar, and a VO2max number/sparkline.
- Clicking a goal re-highlights it and reorders the coaching tips without re-parsing.
- With HR-less GPX, the HR block shows "Ei sykedataa"; no console errors.

- [ ] **Step 3: Stop the server** (Ctrl-C).

---

## After all tasks

Announce and use **superpowers:finishing-a-development-branch** to run the full test suite, then present merge/PR options.

---

## Self-Review

**Spec coverage:**
- Placement `<details class="deep">` between `#charts`/`#table` → Task 9 ✓
- Goal selector + tailoring → `goals.mjs` (Task 6) + render + `setGoal` (Tasks 8–9) ✓
- Coaching → `coaching.mjs` (Task 7), all six areas + guards ✓
- 80/20 (pace + HR fallback) → `intensity.mjs` (Task 4) ✓
- VO2max/VDOT weekly trend → `vo2max.mjs` (Task 5) ✓
- HR parse + zones (conditional, graceful) → `gpx.mjs` (Task 2) + `hrZones.mjs` (Task 3) + render ✓
- Data-model additions `intensity`/`vdot`/`hr`/`coaching` → Task 9 `buildModel`/`render` ✓
- Error/edge cases (empty history, no qualifying VDOT, no HR, divide-by-zero) → guarded in each module + tests ✓
- Testing: one `node:test` per module under existing glob → Tasks 2–7 ✓

**Placeholder scan:** No TBD/TODO; every code + test step is complete.

**Type consistency:** `intensityDistribution`→`{easyPct,moderatePct,hardPct,easyMin,moderateMin,hardMin,ref,drift}` consumed consistently by `goals.mjs`, `coaching.mjs`, `details.mjs`. `vdotTrend`→`{current,points:[{date,value}]}` consumed consistently. `hrSummary`→`{maxHr,zoneMinutes,easyPct,moderatePct,hardPct}` consumed consistently. `coachingTips(model, goal, now)` and `goalMetric/goalWeight(goal, …)` signatures match call sites. `zoneOf`/`maxHrObserved` shared by `hrZones` + `intensity`.
