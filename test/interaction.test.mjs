// Tests that drive app/main.mjs through its own DOM event handlers.
//
// addFiles, render, setGoal and setTab are module-private — reachable only the
// way a user reaches them, by dropping files and clicking. Driving the real
// listeners covers that path and asserts the app actually redraws, rather than
// re-testing buildModel (pipeline.test.mjs already does that).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installAppDom } from "./helpers/dom.mjs";
import { gpxRun, daysAgo } from "./helpers/fixtures.mjs";

let dom;

before(async () => {
  dom = installAppDom();
  await import("../app/main.mjs");
});

after(() => dom.uninstall());

/** A File stand-in exposing just the .name and .text() addFiles uses. */
const fakeFile = (name, text) => ({ name, text: async () => text });

/** Poll until `predicate` holds — addFiles is fired and forgotten by the handler. */
async function waitFor(predicate, what, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

function gpxFiles(count, now = Date.now()) {
  return Array.from({ length: count }, (_, i) =>
    fakeFile(
      `run${i}.gpx`,
      gpxRun({ name: `Lenkki ${i + 1}`, start: daysAgo(30 - i * 3, now), km: 10, minutes: 60, hr: 135 }),
    ),
  );
}

test("dragover and dragleave toggle the drop target's highlight", () => {
  const drop = dom.byId.drop;
  drop.dispatch("dragover");
  assert.ok(drop.classList.contains("over"), "dragover should highlight");
  drop.dispatch("dragleave");
  assert.ok(!drop.classList.contains("over"), "dragleave should clear the highlight");
});

test("dropping GPX files parses them and redraws every panel", async () => {
  dom.byId.drop.dispatch("drop", { dataTransfer: { files: gpxFiles(6) } });
  await waitFor(() => dom.byId["hd-meta"].textContent !== "", "the header count to be written");

  assert.equal(dom.byId["hd-meta"].textContent, "6 treeniä");
  assert.ok(!dom.byId.drop.classList.contains("over"), "drop should clear the highlight");

  assert.match(dom.byId.verdict.html(), /loukkaantumisriski/);
  assert.match(dom.byId["tab-overview"].html(), /Kokonaismatka/);
  assert.match(dom.byId["tab-health"].html(), /Kuormasuhde/);
  assert.match(dom.byId["tab-workouts"].html(), /Kaikki treenit/);
  assert.ok(dom.byId["tab-progress"].children.length === 3, "progress should hold three charts");
});

test("the file input takes the same path as a drop", async () => {
  dom.byId.file.dispatch("change", { target: { files: gpxFiles(2) } });
  // The previous test already added 6; addFiles appends rather than replaces.
  await waitFor(() => dom.byId["hd-meta"].textContent === "8 treeniä", "the count to reach 8");
  assert.match(dom.byId["tab-workouts"].html(), /Kaikki treenit/);
});

test("files that are not usable GPX are ignored without disturbing the count", async () => {
  const before = dom.byId["hd-meta"].textContent;
  dom.byId.drop.dispatch("drop", {
    dataTransfer: { files: [fakeFile("notes.txt", "ei tämä ole gpx"), fakeFile("empty.gpx", "<gpx></gpx>")] },
  });
  // Give addFiles a chance to run before asserting nothing changed.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(dom.byId["hd-meta"].textContent, before);
});

test("clicking a tab shows its panel and hides the others", () => {
  const health = dom.tabs.find((t) => t.dataset.tab === "health");
  health.dispatch("click");

  assert.ok(health.classList.contains("on"), "clicked tab should be active");
  assert.equal(dom.tabs.filter((t) => t.classList.contains("on")).length, 1);
  assert.equal(dom.byId["tab-health"].hidden, false);
  for (const name of ["overview", "progress", "workouts"]) {
    assert.equal(dom.byId[`tab-${name}`].hidden, true, `tab-${name} should be hidden`);
  }
});

test("switching tabs again moves the active state", () => {
  dom.tabs.find((t) => t.dataset.tab === "workouts").dispatch("click");
  assert.equal(dom.byId["tab-workouts"].hidden, false);
  assert.equal(dom.byId["tab-health"].hidden, true);
});

test("choosing a goal re-renders the overview with the new goal active", () => {
  const overview = dom.byId["tab-overview"];
  const goalButtons = () => overview.children[0].children;

  assert.equal(goalButtons().find((b) => b.className === "on").textContent, "Kestävyys");

  goalButtons().find((b) => b.textContent === "Nopeus").dispatch("click");

  const active = goalButtons().filter((b) => b.className === "on");
  assert.equal(active.length, 1, "exactly one goal stays active");
  assert.equal(active[0].textContent, "Nopeus");
});

test("changing the goal reorders tips but leaves the key numbers alone", () => {
  const overview = dom.byId["tab-overview"];
  const goalButtons = () => overview.children[0].children;
  const kmBefore = overview.html().match(/(\d+)<span class="u"> km<\/span>/)[1];

  goalButtons().find((b) => b.textContent === "Loukkaantumissuoja").dispatch("click");

  const kmAfter = overview.html().match(/(\d+)<span class="u"> km<\/span>/)[1];
  assert.equal(kmAfter, kmBefore, "the goal must not change the underlying totals");
  assert.equal(goalButtons().find((b) => b.className === "on").textContent, "Loukkaantumissuoja");
});

test("skipped files are named instead of failing silently", async () => {
  // Regressio: addFiles ei napannut virheitä, joten yksi lukukelvoton tiedosto
  // keskeytti koko pudotuksen eikä mitään renderöity.
  const now = Date.now();
  const good = fakeFile("hyva.gpx", gpxRun({ start: daysAgo(2, now), km: 7, minutes: 42 }));
  const exploding = { name: "rikki.gpx", text: async () => { throw new Error("lukuvirhe"); } };
  const notGpx = fakeFile("muistio.txt", "ei tämä ole gpx");

  const countBefore = dom.byId["hd-meta"].textContent;
  dom.byId.drop.dispatch("drop", { dataTransfer: { files: [good, exploding, notGpx] } });
  await waitFor(() => dom.byId["hd-meta"].textContent !== countBefore, "the good file to be added");

  const note = dom.byId["drop-note"].textContent;
  assert.match(note, /2 tiedostoa ohitettiin/);
  assert.match(note, /rikki\.gpx|muistio\.txt/, "should name what was skipped");
  assert.match(dom.byId["tab-workouts"].html(), /Kaikki treenit/, "the good file still rendered");
});

test("a clean batch clears the skipped-files note", async () => {
  const now = Date.now();
  const countBefore = dom.byId["hd-meta"].textContent;
  dom.byId.drop.dispatch("drop", {
    dataTransfer: { files: [fakeFile("puhdas.gpx", gpxRun({ start: daysAgo(1, now), km: 9, minutes: 54 }))] },
  });
  await waitFor(() => dom.byId["hd-meta"].textContent !== countBefore, "the file to be added");
  assert.equal(dom.byId["drop-note"].textContent, "", "the note must not linger");
});

test("dropping a compact export loads a whole history from one file", async () => {
  const now = Date.now();
  const records = Array.from({ length: 12 }, (_, i) => ({
    k: `w${i}`, d: daysAgo(40 - i * 3, now), n: `Kompakti ${i + 1}`,
    km: 10, min: 60, el: 20, hr: { 130: 45, 150: 15 },
  }));
  const file = { treeniloki: 1, exported: new Date().toISOString(), workouts: records };

  const before = dom.byId["hd-meta"].textContent;
  dom.byId.drop.dispatch("drop", {
    dataTransfer: { files: [fakeFile("treeniloki-2026-08-12.json", JSON.stringify(file))] },
  });
  await waitFor(() => dom.byId["hd-meta"].textContent !== before, "the compact file to load");

  assert.match(dom.byId["tab-workouts"].html(), /Kompakti 1/);
  assert.match(dom.byId["tab-health"].html(), /Sykealueet/, "HR zones must work without points");
  assert.doesNotMatch(dom.byId["tab-health"].html(), /Ei sykedataa/, "the histogram should supply HR");
  assert.equal(dom.byId["drop-note"].textContent, "", "a valid compact file is not a rejection");
});

test("the same compact file dropped twice does not duplicate workouts", async () => {
  const now = Date.now();
  const file = JSON.stringify({
    treeniloki: 1,
    workouts: [{ k: "dupli", d: daysAgo(2, now), n: "Kerran", km: 8, min: 48, el: 0 }],
  });
  const first = dom.byId["hd-meta"].textContent;
  dom.byId.drop.dispatch("drop", { dataTransfer: { files: [fakeFile("a.json", file)] } });
  await waitFor(() => dom.byId["hd-meta"].textContent !== first, "the first load");
  const after = dom.byId["hd-meta"].textContent;

  dom.byId.drop.dispatch("drop", { dataTransfer: { files: [fakeFile("a-kopio.json", file)] } });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(dom.byId["hd-meta"].textContent, after, "the count must not grow");
  assert.match(dom.byId["drop-note"].textContent, /1 tiedostoa ohitettiin/);
});

test("a JSON file that is not a compact export is rejected, not misread", async () => {
  const before = dom.byId["hd-meta"].textContent;
  dom.byId.drop.dispatch("drop", {
    dataTransfer: { files: [fakeFile("muu.json", JSON.stringify({ jotain: "muuta" }))] },
  });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(dom.byId["hd-meta"].textContent, before);
  assert.match(dom.byId["drop-note"].textContent, /ohitettiin/);
});

// ---- kevyen tiedoston tallennus ladatuista treeneistä ----

test("saving turns loaded GPX workouts into one compact file", async () => {
  const now = Date.now();
  const files = Array.from({ length: 4 }, (_, i) =>
    fakeFile(
      `2025-01-0${i + 1}_running_key${i}.gpx`,
      gpxRun({ name: `Tallennus ${i + 1}`, start: daysAgo(20 - i * 4, now), km: 10, minutes: 60, hr: 140 }),
    ),
  );
  const before = dom.byId["hd-meta"].textContent;
  dom.byId.drop.dispatch("drop", { dataTransfer: { files } });
  await waitFor(() => dom.byId["hd-meta"].textContent !== before, "the GPX files to load");

  assert.equal(dom.byId["save-compact"].hidden, false, "the button appears once there is data");

  const countBefore = dom.downloads.length;
  dom.byId["save-compact"].dispatch("click");
  assert.equal(dom.downloads.length, countBefore + 1, "a download should have started");

  const saved = dom.downloads[dom.downloads.length - 1];
  assert.match(saved.name, /^treeniloki-\d{4}-\d{2}-\d{2}\.json$/);

  const parsed = JSON.parse(saved.text);
  assert.equal(parsed.treeniloki, 1);
  assert.ok(parsed.workouts.length >= 4);
  const mine = parsed.workouts.filter((w) => /^key\d$/.test(w.k || ""));
  assert.equal(mine.length, 4, "the workout key should be recovered from the export filename");
  assert.ok(mine.every((w) => w.hr && Object.keys(w.hr).length), "heart rate must survive as a histogram");
});

test("the saved file is far smaller than the GPX it came from", async () => {
  const now = Date.now();
  const gpx = gpxRun({ name: "Iso", start: daysAgo(1, now), km: 12, minutes: 70, hr: 145, pointCount: 400 });
  const before = dom.byId["hd-meta"].textContent;
  dom.byId.drop.dispatch("drop", {
    dataTransfer: { files: [fakeFile("2025-02-02_running_iso.gpx", gpx)] },
  });
  await waitFor(() => dom.byId["hd-meta"].textContent !== before, "the file to load");

  dom.byId["save-compact"].dispatch("click");
  const saved = dom.downloads[dom.downloads.length - 1];
  const record = saved.text.match(/\{[^{}]*"k":"iso"[^{}]*\{[^{}]*\}[^{}]*\}/);
  assert.ok(record, "the saved file should contain the workout");
  assert.ok(record[0].length * 20 < gpx.length, `record ${record[0].length} B vs gpx ${gpx.length} B`);
});

test("a saved file loads back with the same analysis — the round trip closes", async () => {
  dom.byId["save-compact"].dispatch("click");
  const saved = dom.downloads[dom.downloads.length - 1];
  const expected = dom.byId["hd-meta"].textContent;
  const healthBefore = dom.byId["tab-health"].html();

  // Uusi istunto: vain tallennettu tiedosto, ei yhtään GPX:ää.
  const fresh = installAppDom();
  try {
    const mod = await import("../app/main.mjs?roundtrip");
    void mod;
    fresh.byId.drop.dispatch("drop", {
      dataTransfer: { files: [{ name: "takaisin.json", text: async () => saved.text }] },
    });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && fresh.byId["hd-meta"].textContent === "") {
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal(fresh.byId["hd-meta"].textContent, expected, "the same number of workouts comes back");
    assert.ok(/Sykealueet/.test(fresh.byId["tab-health"].html()), "HR zones survive the round trip");
    assert.ok(!/Ei sykedataa/.test(healthBefore), "and were present to begin with");
  } finally {
    fresh.uninstall();
  }
});
