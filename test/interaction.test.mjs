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
