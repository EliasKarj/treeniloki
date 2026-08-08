# Treeniloki — Deep Analysis ("Lisätietoja") Design

**Date:** 2026-08-05
**Status:** Approved (direction + scope), pending spec review

## Goal

Make the analyzer's insights *smarter* by adding a progressive-disclosure
**"Syväanalyysi · Lisätietoja"** panel below the existing dashboard. The clean
instrument view stays as-is; a single expandable panel houses five deeper,
interpreted, goal-aware analyses. Same vanilla ESM, no build step, pure
`.mjs` analysis modules unit-tested with `node:test`, hand-drawn `<canvas>`.

## Non-goals

- No user account / server. Everything stays client-side.
- No age/profile form. HR ceilings are data-derived (observed max), clearly
  labelled estimates.
- No TCX support this cycle (GPX only; HR read from GPX extensions if present).

## UX / placement

- One `<details class="deep">` panel after `#charts`, before `#table`, styled
  like the existing `.help` panel (topo-syaani theme, `--accent` summary).
- Summary label: **"Syväanalyysi — valmennus, 80/20, VO2max, tavoitteet"**.
- Rendered by a new `app/render/details.mjs`, called from `render()` in
  `app/main.mjs` after the view model is built.
- Panel content, top to bottom:
  1. **Tavoitevalitsin** (goal selector) — a segmented row of 4 buttons.
     Selection reorders/emphasises the coaching tips and highlights the goal's
     key metric. Selection held in a module-level variable; changing it
     re-renders only the panel (no re-parse).
  2. **Valmennus** — ranked list of actionable tips (`coaching.mjs`).
  3. **80/20-intensiteettijakauma** — a horizontal easy/moderate/hard bar +
     rolling 4-week easy-% and a drift note (`intensity.mjs`).
  4. **VO2max / VDOT-trendi** — current estimate + a small sparkline over the
     last estimates (`vo2max.mjs`).
  5. **Syke** (conditional) — shown only if any workout has HR: 5-zone time
     distribution bar + HR-based 80/20 (`hrZones.mjs`). Absent otherwise, with
     a one-line hint that HR data was not found.

## Data model additions

`app/main.mjs buildModel(ws)` gains:
- `intensity` — output of `intensityDistribution(workouts)`.
- `vdot` — output of `vdotTrend(workouts)`.
- `coaching` — output of `coachingTips(model, goal)` (recomputed on goal change).
- `hr` — output of `hrSummary(workouts)` or `null` if no HR present.

Each workout object already carries `{date, distanceKm, durationMin, elevGain,
paceMinKm, points}`. Parsing gains an optional per-point `hr` (number) and an
optional workout-level `avgHr` / `maxHr` when HR extensions exist.

## Modules & concrete methods

### `src/parse/gpx.mjs` (extend)
Per trackpoint, additionally capture heart rate when an extension tag is
present. Match any of (case-insensitive, namespace-agnostic):
`<gpxtpx:hr>`, `<ns3:hr>`, `<hr>` inside `<extensions>`. Regex captures the
integer. Points without HR get `hr: null`. Add derived `avgHr` (mean of
non-null point HR, rounded) and `maxHr` (max) to the parsed workout when at
least one point has HR; otherwise leave them `undefined`.

### `src/analysis/intensity.mjs` (new) — 80/20 distribution
Pace-relative effort classification (works without HR):
- `easyPace(workouts)` → reference = **median `paceMinKm`** across the given
  workouts (min/km; larger = slower).
- `classifyEffort(paceMinKm, ref)` →
  - `"hard"`  if `paceMinKm < ref * 0.95` (≥5% faster than typical),
  - `"easy"`  if `paceMinKm > ref * 1.05` (≥5% slower than typical),
  - `"moderate"` otherwise (the grey zone).
- `intensityDistribution(workouts)` → duration-weighted split over the trailing
  **28 days**: `{easyPct, moderatePct, hardPct, easyMin, moderateMin, hardMin,
  ref, drift}` where `drift` is one of:
  - `"ok"` when `easyPct >= 75`,
  - `"grey"` when `moderatePct >= 35` (intensity blindness — too much grey),
  - `"tooHard"` when `hardPct > 25`.
  When HR is available for a workout, effort is taken from HR zone instead of
  pace: zones 1–2 → easy, zone 3 → moderate, zones 4–5 → hard (see hrZones).

### `src/analysis/vo2max.mjs` (new) — VDOT/VO2max estimate
- Pick the **best sustained effort**: among workouts of the trailing 90 days
  with `distanceKm >= 3`, the one with the smallest `paceMinKm`.
- Convert to velocity `v = 1000 / (paceMinKm * 60)` … expressed as m/min:
  `vMetersPerMin = distanceKm*1000 / durationMin` of that effort.
- Daniels running VO2 cost:
  `vo2 = -4.60 + 0.182258*v + 0.000104*v*v` (ml/kg/min at velocity `v` m/min).
- Fraction of VO2max sustained for the effort's duration `t` (min):
  `pct = 0.8 + 0.1894393*exp(-0.012778*t) + 0.2989558*exp(-0.1932605*t)`.
- `vo2maxEstimate = vo2 / pct`, rounded to 1 decimal.
- `vdotTrend(workouts)` → `{current, points:[{date, value}]}` where `points`
  is one estimate per calendar week that had a qualifying effort (best effort
  of that week), so the sparkline shows progression. `current` = latest.
  Returns `{current: null, points: []}` if no qualifying effort exists.

### `src/analysis/goals.mjs` (new) — goal metadata & tailoring
Pure metadata + selectors (no side effects). Goals from dev brief §1.7:
```
GOALS = {
  speed:    { label:"Nopeus",      metricKey:"vdot",   ... },
  endurance:{ label:"Kestävyys",   metricKey:"easyPct",... },
  fatloss:  { label:"Rasvanpoltto",metricKey:"easyMin",... },
  injury:   { label:"Loukkaantumissuoja", metricKey:"spike", ... },
}
```
- `goalMetric(goal, model)` → `{label, value, unit}` for the highlighted metric.
- `goalWeight(goal, tipArea)` → number used to sort coaching tips so the
  selected goal's relevant areas float to the top.

### `src/analysis/coaching.mjs` (new) — actionable tips
`coachingTips(model, goal)` → sorted `Array<{area, severity, text}>` where
`area ∈ {"spike","load","break","intensity","trend","vdot"}`,
`severity ∈ {"info","warn","alert"}`. Rules (Finnish text, concrete numbers):
- **spike**: if the latest non-suppressed spike band is `"high"` →
  alert `"Viime lenkki oli iso hyppäys. Pidä seuraava pitkä ≤ {cap} km."`
  where `cap = round(trailing30MaxKm * 1.1)`. If `"moderate"` → warn.
- **load**: from `model.load.ratio` (ACWR): `>1.5` warn
  `"Kuorma noussut nopeasti (ACWR {ratio}). Harkitse kevennysviikkoa."`;
  `<0.8 && count>3` info `"Kuorma matala — tilaa lisätä maltilla."`.
- **break**: if `model.lastComeback` exists and its block is recent
  (last workout within 21 days of today) → info with the detraining note and
  a ramp tip `"Aloita ~60 % entisestä volyymista, +10 %/vk."`.
- **intensity**: from `model.intensity.drift`:
  `"grey"` → warn `"Liikaa keskitehoa ({moderatePct} %). Helpot helpommaksi,
  kovat kovemmaksi (80/20)."`; `"tooHard"` → warn; `"ok"` → info
  `"Intensiteettijakauma hyvä ({easyPct} % helppoa)."`.
- **trend**: from `model.trends.pace` slope: improving (pace slope < 0) → info;
  worsening → info with gentle note.
- **vdot**: if `model.vdot.current` and ≥2 points → info stating current value
  and direction vs first point.
Tips are sorted by `goalWeight(goal, area)` desc, then severity
(alert>warn>info). Every rule guards missing inputs and is individually tested.

### `src/analysis/hrZones.mjs` (new) — heart-rate zones (conditional)
- `maxHrObserved(workouts)` → max point HR across all workouts (or null).
- `zoneOf(hr, maxHr)` → 1..5 by %maxHr thresholds `[.60,.70,.80,.90]`
  (z1 <60 %, z2 60–70, z3 70–80, z4 80–90, z5 ≥90 %).
- `hrSummary(workouts)` → `null` if no HR anywhere; else
  `{maxHr, zoneMinutes:[z1..z5], easyPct, moderatePct, hardPct}` where
  time-in-zone is accumulated per-segment (duration between consecutive HR
  points) and the easy/mod/hard split maps z1–2 / z3 / z4–5.

## Rendering

### `app/render/details.mjs` (new)
`renderDetails(container, model, {goal, onGoalChange})`:
- Builds the goal segmented control (highlights active goal; calls
  `onGoalChange`).
- Renders the highlighted goal metric line.
- Renders coaching tips as a list with severity color (`--accent`/`--warn`).
- Draws the 80/20 bar (three stacked segments) with legend + drift note.
- Draws the VDOT sparkline on a small `<canvas>` (reuse chart idioms from
  `app/render/charts.mjs`; no library).
- Renders the HR block if `model.hr`, else the "ei sykedataa" hint.

### `app/main.mjs` (modify)
- Extend `buildModel` with `intensity`, `vdot`, `hr`, and `coaching`.
- Hold `let goal = "endurance"` (default). On goal change, recompute
  `model.coaching = coachingTips(model, goal)` and re-run `renderDetails` only.
- Call `renderDetails` in `render()`.

### `index.html` (modify)
Add `<details class="deep">…</details>` shell (empty; filled by JS) between
`#charts` and `#table`, plus its `<section>`/summary markup.

### `app/styles.css` (modify)
Add `.deep` (mirrors `.help`), `.deep .goals`/`.goals button` (segmented
control), `.tips`/`.tip` (severity list), `.bar8020` (stacked bar), `.zbar`
(zone bar), reusing existing tokens. Add mobile stacking in the existing
`@media (max-width:720px)` block.

## Error handling / edge cases

- Empty or single-workout history: every analysis returns a safe empty shape
  (`null`/`0`/`[]`); the panel shows "ei riittävästi dataa" per sub-section
  rather than throwing.
- No qualifying effort for VDOT (all runs <3 km): VDOT section hidden with a
  short hint.
- No HR anywhere: HR section shows the "ei sykedataa" hint; 80/20 falls back to
  pace classification (already the default).
- All numbers guard divide-by-zero (`durationMin>0`, `distanceKm>0`).

## Testing

New `node:test` files, one per module, following existing style:
- `test/intensity.test.mjs` — median ref, classify thresholds, duration-weighted
  split, drift bands.
- `test/vo2max.test.mjs` — Daniels cost + pct at known velocity/duration
  (assert VO2max within tolerance of a hand-computed value), weekly points,
  empty case.
- `test/goals.test.mjs` — metric selection per goal, tip weighting order.
- `test/coaching.test.mjs` — each rule fires on crafted models; guards on
  missing inputs; sort order by goal + severity.
- `test/hrZones.test.mjs` — zoneOf thresholds, zoneMinutes accumulation,
  null when no HR.
- `test/gpx.test.mjs` — extend: parses HR from `gpxtpx:hr` and `<hr>`; workouts
  without HR keep `hr:null` and no `avgHr`.

All run under the existing `npm test` glob and the CI job. No new runtime deps.

## Out of scope / future

TCX import, per-goal training-plan generation, cadence/running-economy, and
cross-referencing spike history with comeback outcomes remain future cycles.
