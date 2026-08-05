# Page Clarity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the analyzer page into a plain-language status banner + four tabs (style B), dissolving the dense Syväanalyysi panel, without changing any analysis logic.

**Architecture:** One new tested pure module (`verdict.mjs`) produces the top-line status. The presentation layer is reorganised into per-tab render modules (`verdict`, `overview`, `health`, `charts`→progress, `table`), each rendered once per model build; `main.mjs` gains tab + goal state. The former `details.mjs`, `gauges.mjs`, and `cards.mjs` are dissolved into the new modules.

**Tech Stack:** Vanilla ESM, no build, zero deps, `node:test`, `<canvas>`.

**Spec:** `docs/superpowers/specs/2026-08-05-page-clarity-redesign-design.md`
**Branch:** `build-deep-analysis` (already checked out; builds atop deep-analysis).

---

## File Structure

- `src/analysis/verdict.mjs` — **new** (tested): `verdict(model)` → status object.
- `app/render/verdict.mjs` — **new**: renders the status banner.
- `app/render/overview.mjs` — **new**: goal chips + coaching tips + key numbers.
- `app/render/health.mjs` — **new**: spike / kuormasuhde / tauon vaikutus / 80–20 / HR, plain labels.
- `app/render/charts.mjs` — **modify**: export `renderProgress` (distance + pace + VO₂max trends).
- `app/render/table.mjs` — **modify**: plain-language headers + note wording.
- `index.html` — **modify**: verdict div + tabs nav + four panels.
- `app/main.mjs` — **modify**: imports, tab/goal state, render routing, `setTab`.
- `app/styles.css` — **modify**: tabs/verdict/keys/health styles; remove `.deep`/`#deep-body`/`.cards3`.
- `app/render/details.mjs`, `app/render/gauges.mjs`, `app/render/cards.mjs` — **delete**.
- `test/verdict.test.mjs` — **new**.

All commands run from repo root `in-development/treeniloki`; prefix bash with `cd /c/Users/elkku/Documents/AABIGBOMBOCLAT/in-development/treeniloki &&`. Test: `npm test`. Current suite: 51 tests.

---

### Task 1: Verdict status module

**Files:**
- Create: `src/analysis/verdict.mjs`
- Test: `test/verdict.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `test/verdict.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "../src/analysis/verdict.mjs";

const many = (paceSlope) => ({
  workouts: [{}, {}, {}, {}],
  trends: { pace: paceSlope },
  spikes: [{ band: "none", suppressed: false }],
  load: { ratio: 1.0 },
});

test("trend up/flat/down from pace slope (negative pace slope = faster = up)", () => {
  assert.equal(verdict(many(-0.02)).trend, "up");
  assert.equal(verdict(many(0)).trend, "flat");
  assert.equal(verdict(many(0.02)).trend, "down");
});

test("trendText matches trend", () => {
  assert.equal(verdict(many(-0.02)).trendText, "Kunto nousussa");
  assert.equal(verdict(many(0.02)).trendText, "Kunto laskussa");
});

test("risk high when latest spike band high or ACWR > 1.5", () => {
  const m = many(0); m.spikes = [{ band: "high", suppressed: false }];
  assert.equal(verdict(m).risk, "high");
  const m2 = many(0); m2.load = { ratio: 1.8 };
  assert.equal(verdict(m2).risk, "high");
});

test("risk moderate when band moderate or ACWR > 1.3", () => {
  const m = many(0); m.load = { ratio: 1.4 };
  assert.equal(verdict(m).risk, "moderate");
});

test("risk ignores suppressed spikes and picks the latest real band", () => {
  const m = many(0);
  m.spikes = [{ band: "high", suppressed: true }, { band: "none", suppressed: false }];
  assert.equal(verdict(m).risk, "low");
});

test("short history (<3 workouts) falls back to a data-gathering message", () => {
  const v = verdict({ workouts: [{}], trends: { pace: -0.9 }, spikes: [], load: {} });
  assert.equal(v.trendText, "Kerää lisää dataa");
  assert.equal(v.risk, "low");
});

test("text combines trendText and riskText", () => {
  assert.equal(verdict(many(-0.02)).text, "Kunto nousussa · loukkaantumisriski matala");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot find module `verdict.mjs`.

- [ ] **Step 3: Implement**

Create `src/analysis/verdict.mjs`:
```js
/** Plain-language top-line status derived from the view model. */
export function verdict(model) {
  const ws = model.workouts || [];
  if (ws.length < 3) {
    return {
      trend: "flat", trendText: "Kerää lisää dataa",
      risk: "low", riskText: "loukkaantumisriski matala",
      text: "Kerää lisää dataa · loukkaantumisriski matala",
    };
  }
  const slope = model.trends?.pace ?? 0;
  const trend = slope < -0.005 ? "up" : slope > 0.005 ? "down" : "flat";
  const trendText = trend === "up" ? "Kunto nousussa" : trend === "down" ? "Kunto laskussa" : "Kunto vakaa";

  const spikes = model.spikes || [];
  let band = "none";
  for (let i = spikes.length - 1; i >= 0; i--) {
    if (!spikes[i].suppressed && spikes[i].band !== "none") { band = spikes[i].band; break; }
  }
  const ratio = model.load?.ratio ?? 0;
  const risk = (band === "high" || ratio > 1.5) ? "high"
    : (band === "moderate" || ratio > 1.3) ? "moderate" : "low";
  const riskText = risk === "high" ? "loukkaantumisriski korkea"
    : risk === "moderate" ? "loukkaantumisriski kohonnut" : "loukkaantumisriski matala";

  return { trend, trendText, risk, riskText, text: `${trendText} · ${riskText}` };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS (54 tests).

- [ ] **Step 5: Commit**
```bash
git add src/analysis/verdict.mjs test/verdict.test.mjs
git commit -m "analysis: plain-language verdict (trend + risk status)"
```

---

### Task 2: Verdict banner render

**Files:**
- Create: `app/render/verdict.mjs`

- [ ] **Step 1: Implement**

Create `app/render/verdict.mjs`:
```js
import { verdict } from "../../src/analysis/verdict.mjs";

export function renderVerdict(el, model) {
  const v = verdict(model);
  const riskCls = v.risk === "high" ? "risk-high" : v.risk === "moderate" ? "risk-mod" : "risk-low";
  const arrow = v.trend === "up" ? "↑" : v.trend === "down" ? "↓" : "→";
  el.className = `verdict ${riskCls}`;
  el.innerHTML = `<span class="vt">${arrow} ${v.trendText}</span><span class="vr">${v.riskText}</span>`;
}
```

- [ ] **Step 2: Syntax check + commit**
```bash
node --check app/render/verdict.mjs && git add app/render/verdict.mjs && git commit -m "render: status banner (verdict)"
```
Expected: no output from `node --check`; commit succeeds.

---

### Task 3: Overview panel render

**Files:**
- Create: `app/render/overview.mjs`

- [ ] **Step 1: Implement**

Create `app/render/overview.mjs`:
```js
import { GOALS } from "../../src/analysis/goals.mjs";
import { fmtPace } from "../../src/analysis/workout.mjs";

function keyNumbers(model) {
  const a = model.agg;
  const vdot = model.vdot?.current;
  const n = (k, tech, v, u) =>
    `<div class="key"><div class="kk">${k}${tech ? ` <span class="tech">${tech}</span>` : ""}</div>` +
    `<div class="kv num">${v}${u ? `<span class="u"> ${u}</span>` : ""}</div></div>`;
  return `<div class="keys">` +
    n("Kestävyyskunto", "VO₂max", vdot != null ? vdot : "–", "") +
    n("Kokonaismatka", "", Math.round(a.totalKm).toLocaleString("fi-FI"), "km") +
    n("Ka. tahti", "min/km", fmtPace(a.avgPace), "") +
    n("Lenkkejä / vk", "", model.frequency.toFixed(1), "") +
    `</div>`;
}

export function renderOverview(el, model, goal, onGoalChange) {
  el.innerHTML = "";

  const goalsEl = document.createElement("div");
  goalsEl.className = "goals";
  for (const [key, g] of Object.entries(GOALS)) {
    const b = document.createElement("button");
    b.textContent = g.label;
    if (key === goal) b.className = "on";
    b.addEventListener("click", () => onGoalChange(key));
    goalsEl.appendChild(b);
  }
  el.appendChild(goalsEl);

  const tips = document.createElement("div");
  tips.className = "tips";
  tips.innerHTML = (model.coaching || []).map((t) => `<div class="tip ${t.severity}">${t.text}</div>`).join("")
    || `<div class="tip info">Lisää treenejä saadaksesi valmennusvinkkejä.</div>`;
  el.appendChild(tips);

  el.insertAdjacentHTML("beforeend", keyNumbers(model));
}
```

- [ ] **Step 2: Syntax check + commit**
```bash
node --check app/render/overview.mjs && git add app/render/overview.mjs && git commit -m "render: overview panel (goal chips + tips + key numbers)"
```

---

### Task 4: Health panel render

**Files:**
- Create: `app/render/health.mjs`

- [ ] **Step 1: Implement**

Create `app/render/health.mjs`:
```js
function spikeCard(model) {
  const spikes = model.spikes || [];
  let s = null;
  for (let i = spikes.length - 1; i >= 0; i--) { if (spikes[i].band !== "none" && !spikes[i].suppressed) { s = spikes[i]; break; } }
  if (!s) s = spikes[spikes.length - 1];
  const pct = s ? Math.round((s.ratio - 1) * 100) : 0;
  const pill = s && s.band === "high" ? `<span class="pill risk-high">KORKEA</span>`
    : s && s.band === "moderate" ? `<span class="pill risk-mod">KOHONNUT</span>`
    : `<span class="pill risk-low">OK</span>`;
  const body = s && s.band !== "none"
    ? `Viime lenkki <b class="num warn">+${pct}%</b> pidempi kuin 30 pv:n pisin. Iso yksittäinen hyppäys nostaa rasitusvammariskiä.`
    : `Ei ison yksittäisen lenkin hyppäystä viime 30 pv:n aikana — hyvä.`;
  return `<div class="ins"><div class="h">Iso matkahyppäys</div>${pill}<div class="sub">${body}</div></div>`;
}

function loadCard(model) {
  const r = model.load?.ratio;
  const cls = !r ? "" : r > 1.5 ? "warn" : r < 0.8 ? "good" : "";
  const meaning = !r ? "Ei riittävästi dataa."
    : r > 1.5 ? "Kuorma noussut nopeasti — harkitse kevennystä."
    : r < 0.8 ? "Kuorma matala — tilaa lisätä maltilla." : "Kuorma tasapainossa.";
  return `<div class="ins"><div class="h">Kuormasuhde <span class="tech">ACWR</span></div>` +
    `<div class="big ${cls}">${r ? r.toFixed(2) : "–"}</div>` +
    `<div class="sub">Viime viikko vs. tavallinen. ${meaning}</div></div>`;
}

function breakCard(model) {
  const cb = model.lastComeback;
  return `<div class="ins"><div class="h">Tauon vaikutus</div>` +
    (cb ? `<div class="big warn">${cb.gapDays} pv</div><div class="sub">Paluu vei <b class="num">${cb.workoutsToReturn ?? "–"}</b> lenkkiä entiseen tahtiin.${model.detraining ? " " + model.detraining : ""}</div>`
        : `<div class="big good">–</div><div class="sub">Ei ≥ 14 pv taukoja — hyvä jatkuvuus.</div>`) +
    `</div>`;
}

const DRIFT = {
  ok: ["good", "Jakauma kunnossa (~80/20)."],
  grey: ["warn", "Liikaa keskitehoa — polarisoi helppo/kova."],
  tooHard: ["warn", "Kovaa on paljon — lisää helppoja lenkkejä."],
  none: ["", "Ei riittävästi dataa 28 pv:ltä."],
};

function intensityCard(model) {
  const it = model.intensity;
  const [cls, txt] = DRIFT[(it && it.drift) || "none"];
  let bar = "";
  if (it && it.drift !== "none") {
    const seg = (c, pct, label) => pct > 0 ? `<span class="seg ${c}" style="width:${pct}%">${pct >= 12 ? label : ""}</span>` : "";
    bar = `<div class="bar8020">${seg("e", it.easyPct, "helppo")}${seg("m", it.moderatePct, "keski")}${seg("h", it.hardPct, "kova")}</div>`;
  }
  return `<div class="ins wide"><div class="h">Helppo–kova-jakauma <span class="tech">80/20</span></div>${bar}<div class="sub ${cls}">${txt}</div></div>`;
}

function hrCard(model) {
  if (!model.hr) return `<div class="ins wide"><div class="h">Sykealueet</div><div class="sub">Ei sykedataa GPX-tiedostoissa.</div></div>`;
  const z = model.hr.zoneMinutes.map((m) => Math.round(m));
  const total = z.reduce((s, x) => s + x, 0) || 1;
  const zbar = z.map((m, i) => m > 0 ? `<span class="zseg z${i + 1}" style="width:${(m / total) * 100}%"></span>` : "").join("");
  return `<div class="ins wide"><div class="h">Sykealueet <span class="tech">max ${model.hr.maxHr}</span></div><div class="zbar">${zbar}</div><div class="sub">Helppo ${model.hr.easyPct}% · keski ${model.hr.moderatePct}% · kova ${model.hr.hardPct}%</div></div>`;
}

export function renderHealth(el, model) {
  el.innerHTML = `<div class="health">${spikeCard(model)}${loadCard(model)}${breakCard(model)}${intensityCard(model)}${hrCard(model)}</div>`;
}
```

- [ ] **Step 2: Syntax check + commit**
```bash
node --check app/render/health.mjs && git add app/render/health.mjs && git commit -m "render: health panel (spike, kuormasuhde, tauko, 80/20, syke)"
```

---

### Task 5: Progress charts (distance + pace + VO₂max trends)

**Files:**
- Modify: `app/render/charts.mjs` (full rewrite)

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `app/render/charts.mjs` with:
```js
function canvas(w, h) {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  return { c, ctx, w, h };
}

function distanceChart(model) {
  const { c, ctx, w, h } = canvas(560, 140);
  const ws = model.workouts;
  const max = Math.max(1, ...ws.map((x) => x.distanceKm));
  const bw = w / Math.max(ws.length, 1);
  ws.forEach((x, i) => {
    const bh = (x.distanceKm / max) * (h - 10);
    const flagged = model.spikes[i].band !== "none" && !model.spikes[i].suppressed;
    ctx.fillStyle = flagged ? "#e8a24a" : "#1d6f7a";
    ctx.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
  });
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

function lineChart(points, color) {
  const { c, ctx, w, h } = canvas(560, 120);
  if (points.length < 2) return c;
  const t0 = points[0].date, span = (points[points.length - 1].date - t0) || 1;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
  points.forEach((p, i) => {
    const x = ((p.date - t0) / span) * w;
    const y = h - 6 - ((p.value - lo) / (hi - lo || 1)) * (h - 12);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  return c;
}

export function renderProgress(el, model) {
  el.innerHTML = "";
  const ws = model.workouts;

  const d = document.createElement("div"); d.className = "panel";
  const trendCls = model.trends.distance >= 0 ? "good" : "warn";
  d.innerHTML = `<div class="lbl" style="margin-bottom:8px">Matka / aika · kehityssuunta <span class="${trendCls}">${model.trends.distance >= 0 ? "↑" : "↓"} ${(model.trends.distance * 30).toFixed(1)} km/kk</span></div>`;
  d.appendChild(distanceChart(model));

  const p = document.createElement("div"); p.className = "panel";
  p.innerHTML = `<div class="lbl" style="margin-bottom:8px">Tahti <span class="tech">min/km · ylös = hitaampi</span></div>`;
  p.appendChild(lineChart(ws.map((x) => ({ date: x.date, value: x.paceMinKm })), "#35d0e0"));

  const v = document.createElement("div"); v.className = "panel";
  v.innerHTML = `<div class="lbl" style="margin-bottom:8px">Kestävyyskunto <span class="tech">VO₂max-arvio</span></div>`;
  if (model.vdot?.points?.length >= 2) v.appendChild(lineChart(model.vdot.points, "#7fd97f"));
  else v.insertAdjacentHTML("beforeend", `<div class="sub">Tarvitaan ≥ 3 km suorituksia arvioon.</div>`);

  el.append(d, p, v);
}
```

- [ ] **Step 2: Syntax check + commit**
```bash
node --check app/render/charts.mjs && git add app/render/charts.mjs && git commit -m "render: progress panel (distance + pace + VO2max trends)"
```

---

### Task 6: Relabel the workout table

**Files:**
- Modify: `app/render/table.mjs`

- [ ] **Step 1: Update wording**

In `app/render/table.mjs`, change the spike note strings and the header row to plain language. Replace the `note` ternary's `⚠ spike +` with `⚠ hyppäys +` and `▲ +` stays, and replace the `<thead>` row. Specifically:
- Change `` `<span class="warn">⚠ spike +${... `` to `` `<span class="warn">⚠ hyppäys +${... ``.
- Replace the header `<tr>` with:
```html
<tr><th>Päivä</th><th>Nimi</th><th>Matka</th><th>Tahti</th><th>Nousumetrit</th><th>Huom.</th></tr>
```
- Change the panel label from `Treenit` to `Kaikki treenit`.

- [ ] **Step 2: Syntax check + commit**
```bash
node --check app/render/table.mjs && git add app/render/table.mjs && git commit -m "render: plain-language table headers + note wording"
```

---

### Task 7: Restructure index.html + styles

**Files:**
- Modify: `index.html`
- Modify: `app/styles.css`

- [ ] **Step 1: Replace the content sections in `index.html`**

Replace this block:
```html
    <section id="summary"></section>
    <section id="cards" class="cards3"></section>
    <section id="charts" class="two"></section>
    <details class="deep">
      <summary>Syväanalyysi — valmennus, 80/20, VO2max, tavoitteet</summary>
      <div id="deep-body"></div>
    </details>
    <section id="table"></section>
```
with:
```html
    <div id="verdict" class="verdict"></div>
    <nav id="tabs">
      <button class="tab on" data-tab="overview">Yleiskuva</button>
      <button class="tab" data-tab="progress">Kehitys</button>
      <button class="tab" data-tab="health">Terveys &amp; riski</button>
      <button class="tab" data-tab="workouts">Treenit</button>
    </nav>
    <section id="tab-overview" class="tabpanel"></section>
    <section id="tab-progress" class="tabpanel" hidden></section>
    <section id="tab-health" class="tabpanel" hidden></section>
    <section id="tab-workouts" class="tabpanel" hidden></section>
```

- [ ] **Step 2: Update `app/styles.css`**

Remove the now-unused rules: the `.deep { ... }`, `.deep > summary ...`, `.deep[open] ...`, `#deep-body { ... }` block (added for the old panel) and the `.cards3 { ... }` rule.

Append:
```css
/* tabs */
#tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); }
#tabs .tab { background: none; border: none; border-bottom: 2px solid transparent; color: var(--muted); font: inherit; font-size: 13px; padding: 9px 14px; cursor: pointer; }
#tabs .tab.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 700; }
.tabpanel { display: flex; flex-direction: column; gap: 12px; }
.tabpanel[hidden] { display: none; }
/* verdict banner */
.verdict { display: flex; align-items: baseline; gap: 12px; border-radius: 10px; padding: 12px 16px; border: 1px solid var(--line); background: linear-gradient(90deg, rgba(53,208,224,.14), transparent); }
.verdict .vt { font-family: var(--mono); font-weight: 700; font-size: 16px; color: var(--accent); }
.verdict .vr { font-size: 12px; color: #8fa0b3; }
.verdict.risk-mod { background: linear-gradient(90deg, rgba(232,162,74,.14), transparent); border-color: #3a2f18; }
.verdict.risk-mod .vt { color: var(--warn); }
.verdict.risk-high { background: linear-gradient(90deg, rgba(224,90,90,.16), transparent); border-color: #3a1c1c; }
.verdict.risk-high .vt { color: #e05a5a; }
/* overview key numbers */
.keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.key { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; }
.key .kk { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.key .kv { font-size: 18px; margin-top: 3px; } .key .kv .u { font-size: 10px; color: var(--muted); }
.tech { color: #4a5a6b; font-size: 9px; }
/* health grid */
.health { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.health .ins.wide { grid-column: 1 / -1; }
.pill.risk-low { background: #12261f; color: var(--accent); }
.pill.risk-mod { background: #2c2718; color: var(--warn); }
.pill.risk-high { background: #3a2513; color: var(--warn); }
@media (max-width: 720px) { .keys { grid-template-columns: repeat(2, 1fr); } .health { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Commit**
```bash
git add index.html app/styles.css
git commit -m "app: tabbed shell + verdict banner + style B (index/css)"
```

---

### Task 8: Wire main.mjs + remove dissolved modules

**Files:**
- Modify: `app/main.mjs`
- Delete: `app/render/details.mjs`, `app/render/gauges.mjs`, `app/render/cards.mjs`

- [ ] **Step 1: Replace the imports and render wiring in `app/main.mjs`**

Replace the render-module import lines (the block importing `renderGauges`, `renderTable`, `renderCards`, `renderCharts`, `renderDetails`, plus the deep-analysis render imports) so the import section reads exactly:
```js
import { parseGpx } from "../src/parse/gpx.mjs";
import { summarizeWorkout } from "../src/analysis/workout.mjs";
import { aggregate } from "../src/analysis/aggregate.mjs";
import { splitBlocks, slopePerDay, comeback, activeFrequencyPerWeek } from "../src/analysis/breaks.mjs";
import { spikeRisk } from "../src/analysis/spikeRisk.mjs";
import { acwr } from "../src/analysis/trainingLoad.mjs";
import { detrainingNote } from "../src/analysis/detraining.mjs";
import { intensityDistribution } from "../src/analysis/intensity.mjs";
import { vdotTrend } from "../src/analysis/vo2max.mjs";
import { hrSummary } from "../src/analysis/hrZones.mjs";
import { coachingTips } from "../src/analysis/coaching.mjs";
import { renderVerdict } from "./render/verdict.mjs";
import { renderOverview } from "./render/overview.mjs";
import { renderProgress } from "./render/charts.mjs";
import { renderHealth } from "./render/health.mjs";
import { renderTable } from "./render/table.mjs";
```
(`buildModel` stays exactly as it is — it already returns `intensity`, `vdot`, `hr`.)

Replace the state line block so it reads:
```js
let workouts = [];
let goal = "endurance";
let tab = "overview";
let currentModel = null;
```

Replace the `render` and `setGoal` functions with:
```js
function render(model) {
  currentModel = model;
  model.coaching = coachingTips(model, goal);
  document.getElementById("hd-meta").textContent = `${model.agg.count} treeniä`;
  renderVerdict(document.getElementById("verdict"), model);
  renderOverview(document.getElementById("tab-overview"), model, goal, setGoal);
  renderProgress(document.getElementById("tab-progress"), model);
  renderHealth(document.getElementById("tab-health"), model);
  renderTable(document.getElementById("tab-workouts"), model);
}

function setGoal(g) {
  goal = g;
  currentModel.coaching = coachingTips(currentModel, goal);
  renderOverview(document.getElementById("tab-overview"), currentModel, goal, setGoal);
}

function setTab(id) {
  tab = id;
  for (const b of document.querySelectorAll("#tabs .tab")) b.classList.toggle("on", b.dataset.tab === id);
  for (const p of document.querySelectorAll(".tabpanel")) p.hidden = p.id !== `tab-${id}`;
}
```

Add the tab wiring next to the existing drop/file listeners (before `export { buildModel };`):
```js
for (const b of document.querySelectorAll("#tabs .tab")) b.addEventListener("click", () => setTab(b.dataset.tab));
```

- [ ] **Step 2: Delete the dissolved render modules**
```bash
git rm app/render/details.mjs app/render/gauges.mjs app/render/cards.mjs
```

- [ ] **Step 3: Verify nothing testable broke + syntax check**
```bash
cd /c/Users/elkku/Documents/AABIGBOMBOCLAT/in-development/treeniloki && node --check app/main.mjs && npm test
```
Expected: `node --check` silent; `# tests 54 / # pass 54 / # fail 0`.

- [ ] **Step 4: Confirm no dangling imports of the deleted modules**

Run: `grep -rn "gauges.mjs\|cards.mjs\|details.mjs" app/ index.html`
Expected: no matches.

- [ ] **Step 5: Commit**
```bash
git add app/main.mjs
git commit -m "app: route model into tabs; remove dissolved render modules"
```

---

### Task 9: In-browser verification

**Files:** none (manual check)

- [ ] **Step 1: Serve** (from repo root)
```bash
node ../../../scratchpad/serve.mjs
```
(Or any static server serving the repo root at `http://localhost:8000/`.)

- [ ] **Step 2: Verify** — open `http://localhost:8000/`, drop GPX files, confirm:
- The **verdict banner** shows a plain-language status ("Kunto … · loukkaantumisriski …") and tints by risk.
- The **four tabs** switch panels; only one panel is visible at a time; the active tab is highlighted.
- **Yleiskuva**: goal chips reorder tips on click (no re-parse); 4 key numbers show.
- **Kehitys**: distance, pace, and VO₂max charts render.
- **Terveys & riski**: spike/kuormasuhde/tauko cards + 80/20 bar + HR block (or "Ei sykedataa").
- **Treenit**: table with plain headers.
- No console errors.

- [ ] **Step 3: Stop the server** (Ctrl-C).

---

## After all tasks

Announce and use **superpowers:finishing-a-development-branch** to run the full suite and present merge/PR options (this branch now carries deep-analysis + the clarity redesign).

---

## Self-Review

**Spec coverage:**
- Status banner + `verdict.mjs` → Task 1–2 ✓
- Four tabs (overview/progress/health/workouts), one visible → Task 7 (markup) + Task 8 (`setTab`) ✓
- Syväanalyysi panel dissolved: goal+tips→overview (Task 3), 80/20+HR→health (Task 4), VO₂max→progress (Task 5) ✓
- Plain-language relabeling: overview/health/table/progress use plain headings + `.tech` technical subtitles → Tasks 3–6 ✓
- Style B: `.tabs`/`.verdict`/`.keys`/`.health`, mono headings, removed `.deep`/`.cards3` → Task 7 ✓
- Analysis unchanged; 51 existing tests + 3 verdict = 54 green → Task 1 & Task 8 verification ✓
- Tab/goal switching never re-parses → `setTab` toggles visibility; `setGoal` re-renders overview only → Task 8 ✓
- Deleted `details.mjs`/`gauges.mjs`/`cards.mjs` → Task 8 ✓

**Placeholder scan:** none — every code/edit step shows the exact content; Task 6 names exact strings to change.

**Type consistency:** `renderVerdict(el, model)`, `renderOverview(el, model, goal, onGoalChange)`, `renderProgress(el, model)`, `renderHealth(el, model)`, `renderTable(el, model)` — all match `main.mjs` call sites in Task 8. `verdict(model)` shape `{trend,trendText,risk,riskText,text}` consumed by `render/verdict.mjs`. Panel ids `tab-overview/tab-progress/tab-health/tab-workouts` match between `index.html` (Task 7) and `main.mjs` (Task 8). `.tech`, `.keys`, `.health`, `.verdict`, `.pill.risk-*` classes defined in Task 7 match the markup emitted in Tasks 2–4.
