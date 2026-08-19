// Tests for the collapsing file-loader area.
//
// Its own DOM and its own module instance: the loader's state depends on how
// much has been loaded, and sharing a history with the other interaction tests
// would make this depend on the order tests happen to run in.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installAppDom } from "./helpers/dom.mjs";
import { gpxRun, daysAgo } from "./helpers/fixtures.mjs";

let dom;
let bootstrap;

before(async () => {
  dom = installAppDom();
  ({ bootstrap } = await import("../app/main.mjs"));
  bootstrap();
});

after(() => dom.uninstall());

async function waitFor(predicate, what, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

const files = (count, now) =>
  Array.from({ length: count }, (_, i) => ({
    name: `2025-01-0${i + 1}_running_l${now}${i}.gpx`,
    text: async () => gpxRun({ name: `Lenkki ${i + 1}`, start: daysAgo(30 - i * 3, now), km: 10, minutes: 60 }),
  }));

test("the loader stays full-size while the page is empty", () => {
  // Tyhjällä sivulla pudotusalue on ainoa asia jolla on merkitystä.
  assert.ok(!dom.byId.loader.classList.contains("has-data"));
});

test("loading workouts folds the loader into a single row", async () => {
  dom.byId.drop.dispatch("drop", { dataTransfer: { files: files(3, Date.now()) } });
  await waitFor(() => dom.byId["hd-meta"].textContent === "3 treeniä", "the first load");

  const loader = dom.byId.loader;
  assert.ok(loader.classList.contains("has-data"), "loading data shrinks the area");
  assert.equal(loader.open, false, "and folds it away");
  assert.equal(dom.byId["save-compact"].hidden, false, "the save button stays reachable");
});

test("the folded row still accepts a drop, so nothing is lost by shrinking", async () => {
  dom.byId.loader.dispatch("drop", { dataTransfer: { files: files(2, Date.now() - 400 * 86400000) } });
  await waitFor(() => dom.byId["hd-meta"].textContent === "5 treeniä", "a drop on the folded row");
  assert.equal(dom.byId.loader.open, false, "it stays folded");
});

test("dragging over the folded row highlights it", () => {
  const loader = dom.byId.loader;
  loader.dispatch("dragover");
  assert.ok(loader.classList.contains("over"));
  loader.dispatch("dragleave");
  assert.ok(!loader.classList.contains("over"));
});

test("skipped files are reported outside the folded area", async () => {
  dom.byId.drop.dispatch("drop", {
    dataTransfer: { files: [{ name: "roska.gpx", text: async () => "ei gpx:ää" }] },
  });
  await waitFor(() => dom.byId["drop-note"].textContent !== "", "the skip note");
  assert.match(dom.byId["drop-note"].textContent, /roska\.gpx/);
  // Viesti on oma elementtinsä, ei kutistetun paneelin sisällä.
  assert.equal(dom.byId["drop-note"].className, "");
});
