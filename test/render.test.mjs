// Tests for app/render/* — the 280-odd lines that turn a view model into
// markup and which no unit test previously touched.
//
// These are not pixel tests. They assert the contract between the model and
// the DOM: that every card is emitted, that numbers reach the markup, that
// risk classes track the model, and that the goal buttons are wired to their
// callback. A renderer reading a field the model does not carry fails here.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installAppDom, FakeElement } from "./helpers/dom.mjs";
import { gpxRun, runsToWorkouts, daysAgo } from "./helpers/fixtures.mjs";

let dom;
let buildModel;
let renderVerdict, renderOverview, renderProgress, renderHealth, renderTable;
let coachingTips;

before(async () => {
  dom = installAppDom();
  ({ buildModel } = await import("../app/main.mjs"));
  ({ renderVerdict } = await import("../app/render/verdict.mjs"));
  ({ renderOverview } = await import("../app/render/overview.mjs"));
  ({ renderProgress } = await import("../app/render/charts.mjs"));
  ({ renderHealth } = await import("../app/render/health.mjs"));
  ({ renderTable } = await import("../app/render/table.mjs"));
  ({ coachingTips } = await import("../src/analysis/coaching.mjs"));
});

after(() => dom.uninstall());

const el = () => new FakeElement("div");

/**
 * Calm history: steady 10 km runs, no spike, no break.
 *
 * Spans 33 days on purpose. A shorter run of the same workouts would still
 * read as high risk, because ACWR divides the last 7 days by a 28-day average
 * that a short history leaves half empty — the ratio would be 2.0 with no
 * change in behaviour at all.
 */
function calmModel(now = Date.now()) {
  const gpx = Array.from({ length: 12 }, (_, i) =>
    gpxRun({ name: `Lenkki ${i + 1}`, start: daysAgo(36 - i * 3, now), km: 10, minutes: 60, hr: 130 }),
  );
  return buildModel(runsToWorkouts(gpx));
}

/** Same history but closing on a 15 km run — a high spike against a 10 km max. */
function spikyModel(now = Date.now()) {
  const gpx = [
    ...Array.from({ length: 6 }, (_, i) =>
      gpxRun({ name: `Lenkki ${i + 1}`, start: daysAgo(21 - i * 3, now), km: 10, minutes: 60, hr: 130 }),
    ),
    gpxRun({ name: "Pitkä", start: daysAgo(1, now), km: 15, minutes: 95, hr: 140, elevGainM: 90 }),
  ];
  return buildModel(runsToWorkouts(gpx));
}

// ---------------------------------------------------------------- verdict

test("renderVerdict reflects a high-risk model in both class and text", () => {
  const target = el();
  renderVerdict(target, spikyModel());
  assert.match(target.className, /risk-high/);
  assert.match(target.html(), /loukkaantumisriski korkea/);
  assert.match(target.html(), /class="vt"/);
  assert.match(target.html(), /class="vr"/);
});

test("renderVerdict reflects a calm model as low risk", () => {
  const target = el();
  renderVerdict(target, calmModel());
  assert.match(target.className, /risk-low/);
  assert.match(target.html(), /loukkaantumisriski matala/);
});

test("renderVerdict shows the data-gathering fallback on a short history", () => {
  const target = el();
  renderVerdict(target, buildModel(runsToWorkouts([gpxRun({ start: daysAgo(1, Date.now()), km: 5, minutes: 30 })])));
  assert.match(target.html(), /Kerää lisää dataa/);
});

// --------------------------------------------------------------- overview

test("renderOverview emits all four goal buttons with the active one marked", () => {
  const target = el();
  const model = calmModel();
  model.coaching = coachingTips(model, "endurance");
  renderOverview(target, model, "endurance", () => {});

  const goals = target.children[0];
  assert.equal(goals.className, "goals");
  assert.equal(goals.children.length, 4);
  assert.deepEqual(
    goals.children.map((b) => b.textContent),
    ["Nopeus", "Kestävyys", "Rasvanpoltto", "Loukkaantumissuoja"],
  );
  const active = goals.children.filter((b) => b.className === "on");
  assert.equal(active.length, 1);
  assert.equal(active[0].textContent, "Kestävyys");
});

test("clicking a goal button reports the goal key to the callback", () => {
  const target = el();
  const model = calmModel();
  model.coaching = coachingTips(model, "endurance");
  const picked = [];
  renderOverview(target, model, "endurance", (g) => picked.push(g));

  target.children[0].children[3].dispatch("click"); // Loukkaantumissuoja
  assert.deepEqual(picked, ["injury"]);
});

test("renderOverview renders every coaching tip with its severity class", () => {
  const target = el();
  const model = spikyModel();
  model.coaching = coachingTips(model, "injury");
  renderOverview(target, model, "injury", () => {});

  const html = target.html();
  for (const tip of model.coaching) {
    assert.ok(html.includes(tip.text), `missing tip: ${tip.text}`);
    assert.ok(html.includes(`class="tip ${tip.severity}"`), `missing severity ${tip.severity}`);
  }
});

test("renderOverview falls back to a hint when there are no tips", () => {
  const target = el();
  const model = buildModel([]);
  renderOverview(target, model, "endurance", () => {});
  assert.match(target.html(), /Lisää treenejä saadaksesi valmennusvinkkejä/);
});

test("key numbers carry the model's aggregates into the markup", () => {
  const target = el();
  const model = calmModel();
  model.coaching = [];
  renderOverview(target, model, "endurance", () => {});
  const html = target.html();

  assert.match(html, /Kestävyyskunto/);
  assert.match(html, /Kokonaismatka/);
  assert.match(html, /Ka\. tahti/);
  assert.match(html, /Lenkkejä \/ vk/);
  // 12 × 10 km, and a 6:00 min/km pace from 60 min per 10 km.
  assert.match(html, /120<span class="u"> km<\/span>/);
  assert.match(html, /6:00/);
});

// ----------------------------------------------------------------- health

test("renderHealth emits all five cards", () => {
  const target = el();
  renderHealth(target, spikyModel());
  const html = target.html();
  for (const heading of ["Iso matkahyppäys", "Kuormasuhde", "Tauon vaikutus", "Helppo–kova-jakauma", "Sykealueet"]) {
    assert.ok(html.includes(heading), `missing card: ${heading}`);
  }
});

test("the spike card reports the high band with its percentage", () => {
  const target = el();
  renderHealth(target, spikyModel());
  const html = target.html();
  assert.match(html, /pill risk-high/);
  assert.match(html, /KORKEA/);
  assert.match(html, /\+50%/); // 15 km against a 10 km trailing max
});

test("the spike card reports OK when nothing spiked", () => {
  const target = el();
  renderHealth(target, calmModel());
  assert.match(target.html(), /pill risk-low/);
  assert.match(target.html(), /Ei ison yksittäisen lenkin hyppäystä/);
});

test("the break card reports good continuity when there are no breaks", () => {
  const target = el();
  renderHealth(target, calmModel());
  assert.match(target.html(), /Ei ≥ 14 pv taukoja/);
});

test("the break card reports the gap in days after a real break", () => {
  const now = Date.now();
  const gpx = [
    gpxRun({ start: daysAgo(100, now), km: 10, minutes: 60 }),
    gpxRun({ start: daysAgo(97, now), km: 10, minutes: 60 }),
    gpxRun({ start: daysAgo(20, now), km: 10, minutes: 66 }),
  ];
  const target = el();
  renderHealth(target, buildModel(runsToWorkouts(gpx)));
  assert.match(target.html(), /77 pv/);
});

test("the HR card degrades to a hint when no workout carries heart rate", () => {
  const now = Date.now();
  const gpx = Array.from({ length: 4 }, (_, i) => gpxRun({ start: daysAgo(12 - i * 3, now), km: 8, minutes: 48 }));
  const target = el();
  renderHealth(target, buildModel(runsToWorkouts(gpx)));
  assert.match(target.html(), /Ei sykedataa GPX-tiedostoissa/);
});

// ------------------------------------------------------------------ table

test("renderTable emits one row per workout, newest first", () => {
  const target = el();
  const model = spikyModel();
  renderTable(target, model);
  const html = target.html();

  const rows = html.match(/<tr><td class="num">/g) || [];
  assert.equal(rows.length, model.workouts.length);

  const names = model.workouts.map((w) => w.name);
  const positions = names.map((n) => html.indexOf(`<td>${n}</td>`));
  assert.ok(positions.every((p) => p !== -1), "every workout name should appear");
  // Reversed: the last workout in the model appears before the first.
  assert.ok(positions[positions.length - 1] < positions[0], "newest row should come first");
});

test("renderTable annotates a spike row and marks clean rows", () => {
  const target = el();
  renderTable(target, spikyModel());
  const html = target.html();
  assert.match(html, /⚠ hyppäys \+50%/);
  assert.match(html, /class="good">✓/);
});

test("renderTable marks post-break rows instead of flagging them", () => {
  const now = Date.now();
  const gpx = [
    gpxRun({ start: daysAgo(100, now), km: 5, minutes: 30 }),
    gpxRun({ start: daysAgo(97, now), km: 5, minutes: 30 }),
    gpxRun({ start: daysAgo(20, now), km: 12, minutes: 78 }),
  ];
  const target = el();
  renderTable(target, buildModel(runsToWorkouts(gpx)));
  assert.match(target.html(), /tauon jälkeen/);
});

// --------------------------------------------------------------- progress

test("renderProgress builds the three chart panels", () => {
  const target = el();
  renderProgress(target, spikyModel());
  assert.equal(target.children.length, 3);
  const html = target.html();
  assert.match(html, /Matka \/ aika/);
  assert.match(html, /Tahti/);
  assert.match(html, /Kestävyyskunto/);
  assert.match(html, /km\/kk/);
});

test("renderProgress hints instead of drawing when VO2max has too few points", () => {
  const now = Date.now();
  const target = el();
  // Sub-3 km runs never qualify for a VO2max estimate.
  const gpx = Array.from({ length: 3 }, (_, i) => gpxRun({ start: daysAgo(9 - i * 3, now), km: 2, minutes: 14 }));
  renderProgress(target, buildModel(runsToWorkouts(gpx)));
  assert.match(target.html(), /Tarvitaan ≥ 3 km suorituksia/);
});

// -------------------------------------------------------------- stability

test("every renderer survives an empty model", () => {
  const model = buildModel([]);
  model.coaching = [];
  for (const [name, render] of [
    ["verdict", renderVerdict],
    ["health", renderHealth],
    ["table", renderTable],
    ["progress", renderProgress],
  ]) {
    assert.doesNotThrow(() => render(el(), model), `${name} threw on an empty model`);
  }
  assert.doesNotThrow(() => renderOverview(el(), model, "endurance", () => {}));
});

test("renderers are idempotent — a second pass replaces rather than appends", () => {
  const target = el();
  const model = spikyModel();
  renderHealth(target, model);
  const once = target.html();
  renderHealth(target, model);
  assert.equal(target.html(), once, "re-rendering must not duplicate content");

  const progressTarget = el();
  renderProgress(progressTarget, model);
  renderProgress(progressTarget, model);
  assert.equal(progressTarget.children.length, 3, "re-rendering must not stack panels");
});

test("renderVerdict shows a falling trend with a down arrow and moderate class", () => {
  const target = el();
  renderVerdict(target, {
    workouts: [1, 2, 3],
    trends: { pace: 0.02 },
    spikes: [{ band: "moderate", suppressed: false }],
    load: { ratio: 1 },
  });
  assert.match(target.className, /risk-mod/);
  assert.match(target.html(), /↓ Kunto laskussa/);
  assert.match(target.html(), /loukkaantumisriski kohonnut/);
});

test("renderTable marks a moderate spike with the softer triangle", () => {
  const target = el();
  const now = Date.now();
  const gpx = [
    gpxRun({ name: "A", start: daysAgo(9, now), km: 10, minutes: 60 }),
    gpxRun({ name: "B", start: daysAgo(5, now), km: 10, minutes: 60 }),
    gpxRun({ name: "C", start: daysAgo(1, now), km: 12, minutes: 72 }),
  ];
  renderTable(target, buildModel(runsToWorkouts(gpx)));
  assert.match(target.html(), /▲ \+20%/);
});
