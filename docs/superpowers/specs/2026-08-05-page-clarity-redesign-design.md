# Treeniloki — Page Clarity Redesign

**Date:** 2026-08-05
**Status:** Approved (design), pending spec review
**Branch:** continues on `build-deep-analysis` (built atop the deep-analysis feature)

## Goal

Make the analyzer page clearer on all four axes the user flagged: (1) weaker
hierarchy / too much at once, (2) jargon, (3) the dense Syväanalyysi panel,
(4) visual style that doesn't guide the eye. Presentation-layer only — the
tested analysis modules do not change behaviour.

## Design decisions (validated via visual companion)

- **Layout:** an always-visible **status banner** ("tilannearvio") + **four
  tabs**, only one panel visible at a time (chosen: option C).
- **Style:** "Ryhdikäs" instrument look (chosen: option B) — Space Mono
  headings/labels, cyan accents, tight cards, but with clear hierarchy and
  breathing room.
- **Terminology:** every metric gets a plain-Finnish heading + a one-line
  "what it means / good or bad", with the technical term (ACWR, VO₂max) kept as
  small muted secondary text.

## Information architecture

Above the tabs (persistent): existing dropzone + the `.help` export details
(unchanged) + the new status banner.

**Status banner** — one plain-language verdict, always visible:
`{trend phrase} · {risk phrase}`, e.g. "Kunto nousussa · loukkaantumisriski
matala". Computed by `verdict.mjs` (below).

**Tabs:**

| Tab id | Label | Content |
|---|---|---|
| `overview` | Yleiskuva | goal chips → top coaching tips → 4 key numbers |
| `progress` | Kehitys | distance, pace, and VO₂max trend charts |
| `health` | Terveys & riski | spike, load (ACWR), detraining, 80/20, HR zones |
| `workouts` | Treenit | the workout table |

The former `<details class="deep">` Syväanalyysi panel is **dissolved**; its
parts move: goal selector + coaching tips → Overview; 80/20 + HR zones →
Health; VO₂max number/sparkline → Progress. This directly addresses the
"panel too dense" complaint by distributing it into scannable tabs.

## Plain-language relabeling (applied in render modules)

| Current term | Heading | Technical (muted) | One-line meaning |
|---|---|---|---|
| spike / spike risk | Iso matkahyppäys | — | "viime lenkki vs. 30 pv pisin — iso hyppäys nostaa loukkaantumisriskiä" |
| ACWR | Kuormasuhde | ACWR | "viime viikon kuorma vs. tavallinen — yli 1,5 = noussut nopeasti" |
| VO₂max | Kestävyyskunto | VO₂max | "arvio parhaasta tuoreesta suorituksesta" |
| 80/20 / drift | Helppo–kova-jakauma | 80/20 | "80 % helppoa on tavoite" |
| detraining | Tauon vaikutus | — | (existing note text) |
| pace | Tahti | min/km | — |
| elevGain | Nousumetrit | — | — |
| trend/slope | Kehityssuunta | — | — |

Wording lives in the render modules only; analysis outputs are unchanged.

## New module: `src/analysis/verdict.mjs`

Pure, tested. `verdict(model)` → `{ trend, trendText, risk, riskText, text }`:
- **trend** ∈ `"up" | "flat" | "down"` from `model.trends.pace` (min/km slope;
  negative = faster = improving): `< -0.005` → up, `> 0.005` → down, else flat.
  `trendText`: "Kunto nousussa" / "Kunto vakaa" / "Kunto laskussa".
  With `< 3` workouts → trend `"flat"`, trendText "Kerää lisää dataa".
- **risk** ∈ `"low" | "moderate" | "high"` from the latest non-suppressed spike
  band and ACWR: high if latest spike band `"high"` or `model.load.ratio > 1.5`;
  moderate if band `"moderate"` or ratio `> 1.3`; else low.
  `riskText`: "loukkaantumisriski matala/kohonnut/korkea".
- **text** = `` `${trendText} · ${riskText}` ``.
- Guards empty/short history (returns the "Kerää lisää dataa · riski matala"
  shape). Unit-tested for each branch.

## Rendering changes

- `index.html` — replace the flat `#summary/#cards/#charts/#table` sections with:
  a `#verdict` banner div, a `<nav id="tabs">` with four buttons, and four
  panels `#tab-overview`, `#tab-progress`, `#tab-health`, `#tab-workouts`.
  Dropzone + `.help` stay above `#verdict`.
- `app/main.mjs` — add `let tab = "overview"` state and `setTab(id)` that toggles
  the active panel + button; `render(model)` renders the verdict banner and each
  panel via its render module; goal + tab state re-render without re-parsing.
- `app/render/verdict.mjs` (new) — renders the status banner from `verdict(model)`.
- `app/render/overview.mjs` (new) — goal chips (from `details.mjs` logic) +
  coaching tips + a compact 4-number key row (reuses gauge values).
- `app/render/charts.mjs` — add a VO₂max trend sparkline alongside the existing
  distance + elevation; used by the Progress panel.
- `app/render/health.mjs` (new) — spike / kuormasuhde / tauon vaikutus / 80/20 /
  HR zones with plain-language labels (absorbs `cards.mjs` + the 80/20 & HR bits
  of `details.mjs`).
- `app/render/table.mjs` — relabel headers to plain language; otherwise unchanged.
- `app/render/details.mjs` — **removed**; its rendering split into `overview.mjs`
  and `health.mjs`. `app/render/gauges.mjs` + `cards.mjs` are folded into
  `overview.mjs`/`health.mjs` and removed if no longer referenced.
- `app/styles.css` — add `.tabs`/`.tab`, `.verdict`, plain-label styles; retune
  spacing/typography to style B; remove now-unused `.deep`/`.cards3` rules.

## Error handling / edge cases

- No workouts yet: verdict shows "Kerää lisää dataa · riski matala"; tabs render
  their empty states (existing "ei riittävästi dataa" messages carried over).
- Tab switching never re-parses files; it only toggles panel visibility (all
  panels are rendered once per model build).
- All existing per-analysis guards remain; relabeling adds no new computation.

## Testing

- `test/verdict.test.mjs` (new) — trend up/flat/down thresholds, risk
  low/moderate/high from spike band + ACWR, and the short-history fallback.
- Existing 51 analysis tests stay green (no analysis logic changes).
- Render modules are DOM; verified in-browser (drop GPX, click each tab + goal,
  confirm no console errors, banner + labels read plainly).

## Out of scope

No new analyses, no theme change beyond style-B retuning, no persistence of the
selected tab/goal across reloads.
