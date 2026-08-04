const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activityName } = require("./sports-tracker-export.js");

test("activityName maps known ids and falls back to act<id>", () => {
  assert.equal(activityName(1), "running");
  assert.equal(activityName(99), "act99");
});
