const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activityName, formatDate, buildFilename } = require("./sports-tracker-export.js");

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
