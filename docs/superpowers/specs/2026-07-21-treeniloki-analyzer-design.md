# Treeniloki — GPX Workout Analyzer — Design

**Date:** 2026-07-21
**Status:** Approved (brainstorming) → ready for implementation planning
**Scope:** Sub-project 2 of Treeniloki. Sub-project 1 (the Sports Tracker export script) is
already built (`tools/sports-tracker-export.js`, PR #1) and produces the GPX this app consumes.
Source blueprint: the Treeniloki dev brief (running-science + roadmap). This cycle builds the
**Part 2 base app + the Part 3.1 science features**. Later cycles: goal-selector, HR/cadence,
VO2max estimate, TCX (Part 3.2/3.3).

## Goal

A dependency-free, client-side web app: drag in GPX workout files and see a running
dashboard — summary stats, break-aware trends, and science-backed injury/load/comeback
insights — in a dark topographic instrument-panel style. Nothing is uploaded; all analysis
runs in the browser.

## Decisions (locked in brainstorming)

- **Scope:** Part 2 base **+** Part 3.1 science features (spike detector, rolling load/freshness, post-break decay note).
- **Architecture:** vanilla ESM, **no build step**. Analysis logic in pure `.mjs` modules unit-tested with `node:test`; UI is static `index.html` + `main.mjs` with hand-drawn `<canvas>` charts. Zero runtime dependencies. Deployed as static files to GitHub Pages.
- **Layout:** "instrument grid" — dropzone → summary gauge row → three science cards → (trend chart + elevation profile) → workout table.
- **Style:** "topo-syaani" — near-black (`#0a0f14`) with a faint contour-line texture, panels `#0e151d` / borders `#1c2732`, **cyan accent `#35d0e0`**, muted `#5f7183`, monospace numbers; **warnings amber `#e8a24a`** regardless of accent.
- **Input:** GPX files with `<trkpt>` points `{lat, lon, ele, t}` (from the export script). Multi-file drag-drop + file picker. (Direct `.zip` drop is a future nice-to-have; extract-first for now.)

## Module layout (in the `treeniloki` repo)

```
index.html                     # app shell; <script type="module" src="app/main.mjs">
app/
  main.mjs                     # orchestrate: files → parse → analyze → render; drop/picker wiring
  styles.css                   # topo-syaani instrument theme
  render/
    gauges.mjs · cards.mjs · charts.mjs (canvas) · table.mjs
src/
  parse/gpx.mjs                # DOMParser → [{lat, lon, ele, t}]; workout {id,name,date,points,...}
  analysis/
    workout.mjs                # per-workout: haversine distance, duration, elevGain, pace
    aggregate.mjs              # totals, averages, longest, active-day frequency
    breaks.mjs                 # block split (≥14d) + linear-regression trends + comeback
    spikeRisk.mjs              # §3.1-1 single-session distance spike (headline injury metric)
    trainingLoad.mjs           # §3.1-2 rolling load + ACWR
    detraining.mjs             # §3.1-3 decay-context note for a gap length
test/*.test.mjs
tools/                         # existing export script (unchanged)
.github/workflows/ci.yml
```

Each analysis file is a pure function of `workouts[]` (or numbers) → number/object — no DOM,
no globals — so it's cheap to test and safe to change independently. `render/*` and `main.mjs`
are the only DOM-touching code.

## Data model

```
workout = { id, name, date (Date), points: [{lat, lon, ele, t}], distanceKm, durationMin, elevGain, paceMinKm }
```

## The analysis (correctness-critical — from the brief)

- **Per-workout** (`workout.mjs`): `distanceKm` = sum of haversine between consecutive points;
  `durationMin` = (last.t − first.t); `elevGain` = sum of positive `ele` deltas that exceed a
  **0.3 m** noise threshold; `paceMinKm` = durationMin / distanceKm.
- **Breaks & trends** (`breaks.mjs`): split the date-sorted history into **blocks** wherever the
  gap between consecutive workouts is **≥ 14 days**. Compute pace/distance/elevation trends via
  **linear regression against calendar days since the first workout** (not workout index — this
  avoids a naive first/second-half split being skewed by where a break lands). For each break,
  **comeback** = the first post-break workout's pace vs. the mean pace of the last 3 pre-break
  workouts, plus how many workouts it took to return to that level. Weekly **frequency** counts
  only active days (break days excluded).
- **Spike risk** (`spikeRisk.mjs`, the **headline** injury metric): per workout,
  `spikeRatio = distanceKm / max(distanceKm over the trailing 30 days before that workout)`;
  risk bands at **>10%** and **>30%** (2025 BJSM study). **Suppressed for the first 1–2 workouts
  after a detected break** — a comeback run is definitionally "spiky" vs. a stale 30-day window,
  and the break card already explains the difference. Takes the break info as input to do this.
- **Training load** (`trainingLoad.mjs`): per session `load = distanceKm · (1 + elevGain/500)`;
  7-day rolling sum vs. 28-day rolling average (ACWR). Rendered **labelled "secondary/contested
  signal"** per the research caveat (the spike metric is primary).
- **Detraining note** (`detraining.mjs`): for a gap ≥ 14 days, return a one-line, **normal-not-
  alarming** context string from the decay timeline (little loss <10 d; ~6–7% VO2max at 2–3 wk;
  larger at 9+ wk), framed as physiologically expected.

## Data flow

```
files (drag-drop / picker)
  → gpx.mjs parse each → workouts[] (sorted by date)
  → aggregate + breaks/trends + spikeRisk(per workout, break-aware) + trainingLoad + detraining
  → view model
  → render gauges · science cards · trend chart + elevation profile (canvas) · sortable table (spike badges)
Dropping more files re-runs the whole pipeline.
```

## Error handling (all client-side)

- Non-GPX / unparseable file → skip with a message; process the rest.
- GPX with no `<trkpt>` or no timestamps → skip (can't derive duration/pace), counted as skipped.
- `< 2` workouts → guard regressions/breaks (no trends shown); still show per-workout + aggregate stats.
- Missing elevation → `elevGain = 0`; elevation profile renders empty for that workout.
- Day-bucketing uses the **local date** of each timestamp, consistently (matches the export filename convention).

## Testing

- `node:test` (no framework) over every analysis module, using synthetic `workouts[]` with known
  gaps/paces/distances: assert regression slopes, break-block boundaries, comeback counts,
  spike bands **and the post-break suppression**, load/ACWR values, and detraining-note thresholds.
- `gpx.mjs` parse test against a small inline fixture GPX string (asserts point count + first point).
- `package.json` `test` runs `node --test` over `test/` and the existing `tools/` test.
- A Playwright smoke test (load `index.html`, drop fixtures, assert rendered numbers) is a
  **future** add — omitted now to stay dependency-light.

## CI/CD

`.github/workflows/ci.yml`:
- On push/PR: `npm test`.
- On push to `main`: deploy the static site to **GitHub Pages** (`upload-pages-artifact` + `deploy-pages`).
- One-time manual: enable Pages (Settings → Pages → Source: GitHub Actions). No secrets — fully client-side.

## Out of scope (later cycles)

Goal-selector UI; HR/cadence parsing + zones + 80/20 tracker; VO2max estimate; TCX parsing;
direct `.zip` import; Playwright E2E.
