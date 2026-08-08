const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activityName, formatDate, buildFilename, listAllWorkouts, fetchGpx } = require("./sports-tracker-export.js");

test("activityName maps known ids and falls back to act<id>", () => {
  assert.equal(activityName(1), "running");
  assert.equal(activityName(99), "act99");
});

test("formatDate pads to YYYY-MM-DD (local date)", () => {
  assert.equal(formatDate(new Date(2024, 0, 5).getTime()), "2024-01-05");
  assert.equal(formatDate(new Date(2024, 11, 25).getTime()), "2024-12-25");
});

test("buildFilename is date_sport_key.gpx", () => {
  const w = { startTime: new Date(2024, 5, 1).getTime(), activityId: 1, workoutKey: "abc123" };
  assert.equal(buildFilename(w), "2024-06-01_running_abc123.gpx");
});

test("listAllWorkouts pages until a short page and collects all", async () => {
  const pages = {
    0: Array.from({ length: 50 }, (_, i) => ({ workoutKey: "k" + i })),
    50: Array.from({ length: 7 }, (_, i) => ({ workoutKey: "k" + (50 + i) })),
  };
  const fakeFetch = async (url) => {
    const off = Number(url.match(/offset=(\d+)/)[1]);
    return { ok: true, json: async () => ({ payload: pages[off] || [] }) };
  };
  const all = await listAllWorkouts(fakeFetch, {});
  assert.equal(all.length, 57);
  assert.equal(all[56].workoutKey, "k56");
});

test("listAllWorkouts throws on a non-ok response", async () => {
  const fakeFetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(() => listAllWorkouts(fakeFetch, {}), /403/);
});

test("fetchGpx returns the GPX text when it has trackpoints", async () => {
  const fakeFetch = async () => ({ ok: true, text: async () => "<gpx><trkpt lat=\"1\" lon=\"2\"/></gpx>" });
  const gpx = await fetchGpx("abc", fakeFetch, {});
  assert.match(gpx, /<trkpt/);
});

test("fetchGpx returns null for non-ok or track-less GPX", async () => {
  assert.equal(await fetchGpx("x", async () => ({ ok: false, status: 404 }), {}), null);
  assert.equal(await fetchGpx("y", async () => ({ ok: true, text: async () => "<gpx></gpx>" }), {}), null);
});
