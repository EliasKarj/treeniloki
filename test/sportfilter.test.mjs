// Tests for the sport picker wired into app/main.mjs.
//
// Kept in its own file with its own DOM and its own module instance: the picker
// changes global page state, and sharing a history with the other interaction
// tests would make their counts depend on the order tests happen to run in.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { installAppDom } from "./helpers/dom.mjs";
import { gpxRun, daysAgo } from "./helpers/fixtures.mjs";

let dom;

before(async () => {
  dom = installAppDom();
  await import("../app/main.mjs?sportfilter");
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

/** Export-named files, because that is where the sport tag comes from. */
function mixedHistory(now = Date.now()) {
  const files = [];
  for (let i = 0; i < 6; i++) {
    files.push({
      name: `2025-01-0${i + 1}_running_r${i}.gpx`,
      text: async () => gpxRun({ name: `Lenkki ${i + 1}`, start: daysAgo(30 - i * 3, now), km: 10, minutes: 60, hr: 135 }),
    });
  }
  for (let i = 0; i < 2; i++) {
    files.push({
      name: `2025-02-0${i + 1}_act14_c${i}.gpx`,
      text: async () => gpxRun({ name: `Pyöräily ${i + 1}`, start: daysAgo(12 - i * 3, now), km: 40, minutes: 90, hr: 120 }),
    });
  }
  return files;
}

const picker = () => dom.byId.sports;
const buttons = () => picker().children;

test("no picker appears while every workout is the same sport", async () => {
  dom.byId.drop.dispatch("drop", {
    dataTransfer: {
      files: [{
        name: "2025-01-01_running_only.gpx",
        text: async () => gpxRun({ name: "Yksin", start: daysAgo(2, Date.now()), km: 10, minutes: 60 }),
      }],
    },
  });
  await waitFor(() => dom.byId["hd-meta"].textContent === "1 treeniä", "the first workout to load");
  assert.equal(picker().hidden, true, "one sport is not a choice worth offering");
});

test("a second sport reveals the picker with a count per sport", async () => {
  dom.byId.drop.dispatch("drop", { dataTransfer: { files: mixedHistory() } });
  await waitFor(() => dom.byId["hd-meta"].textContent === "9 treeniä", "the mixed history to load");

  assert.equal(picker().hidden, false);
  const labels = buttons().map((b) => b.html());
  // Kaikki ensin, sitten lajit suurimman matkan mukaan: pyöräilyä 80 km, juoksua 70 km.
  assert.equal(labels.length, 3);
  assert.match(labels[0], /Kaikki/);
  assert.match(labels[0], />9</, "the all-button counts the whole history");
  assert.match(labels[1], /Laji 14/);
  assert.match(labels[2], /Juoksu/);
  assert.match(labels[2], />7</, "seven running workouts");
});

test("choosing a sport narrows every panel, not just one", () => {
  const before = dom.byId["hd-meta"].textContent;
  buttons().find((b) => b.html().includes("Juoksu")).dispatch("click");

  assert.equal(dom.byId["hd-meta"].textContent, "7 treeniä", `was ${before}`);
  // 7 × 10 km — the 80 km of cycling must be gone from the aggregates.
  assert.match(dom.byId["tab-overview"].html(), /70<span class="u"> km<\/span>/);
  assert.match(dom.byId["tab-workouts"].html(), /Kaikki treenit <span class="tech">7 kpl/);
  assert.ok(!dom.byId["tab-workouts"].html().includes("Pyöräily"), "cycling rows must be filtered out");
});

test("the chosen sport is marked, and the breakdown still shows everything", () => {
  const running = buttons().find((b) => b.html().includes("Juoksu"));
  assert.equal(running.className, "on");
  assert.equal(buttons().filter((b) => b.className === "on").length, 1);

  // Rajaus kertoo mitä katsot; lajitaulukko kertoo mitä on olemassa.
  const periods = dom.byId["tab-periods"].html();
  assert.match(periods, /Lajit <span class="tech">koko historia/);
  assert.match(periods, /Laji 14/, "cycling must stay visible in the breakdown");
  assert.match(periods, /Juoksu/);
});

test("switching back to all restores the full history", () => {
  buttons().find((b) => b.html().includes("Kaikki")).dispatch("click");
  assert.equal(dom.byId["hd-meta"].textContent, "9 treeniä");
  assert.equal(buttons().find((b) => b.html().includes("Kaikki")).className, "on");
  assert.match(dom.byId["tab-workouts"].html(), /Kaikki treenit <span class="tech">9 kpl/);
});

test("a saved file keeps the split, so the picker survives the round trip", async () => {
  dom.byId["save-compact"].dispatch("click");
  const saved = dom.downloads[dom.downloads.length - 1];

  const fresh = installAppDom();
  try {
    await import("../app/main.mjs?sportroundtrip");
    fresh.byId.drop.dispatch("drop", {
      dataTransfer: { files: [{ name: "takaisin.json", text: async () => saved.text }] },
    });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && fresh.byId["hd-meta"].textContent === "") {
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal(fresh.byId["hd-meta"].textContent, "9 treeniä");
    assert.equal(fresh.byId.sports.hidden, false, "the light file must remember the sports");
    assert.equal(fresh.byId.sports.children.length, 3);
  } finally {
    fresh.uninstall();
  }
});
