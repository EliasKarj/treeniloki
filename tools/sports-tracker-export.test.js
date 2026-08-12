const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  activityName, formatDate, buildFilename, listAllWorkouts, fetchGpx, downloadAll, resumeOffset,
  authHeaders,
} = require("./sports-tracker-export.js");

/** Console stand-in so the loop's progress output does not pollute test output. */
const quiet = () => {
  const lines = { log: [], warn: [] };
  return { log: (m) => lines.log.push(m), warn: (m) => lines.warn.push(m), lines };
};

const gpxFor = (key) => `<gpx><trkpt lat="1" lon="2"><time>2024-01-01T00:00:00Z</time></trkpt><!--${key}--></gpx>`;

/** `count` workouts keyed k0..k(n-1), all running, all on the same day. */
const workoutList = (count) =>
  Array.from({ length: count }, (_, i) => ({
    workoutKey: `k${i}`,
    activityId: 1,
    startTime: new Date(2024, 0, 1).getTime(),
  }));

/** downloadAll with the throttle and backoff sleeps removed. */
const fast = (extra = {}) => ({ sleepImpl: async () => {}, throttleMs: 0, log: quiet(), ...extra });

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

test("fetchGpx does not retry a clean non-ok response", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return { ok: false, status: 403 };
  };
  const gpx = await fetchGpx("x", fakeFetch, {}, async () => {});
  assert.equal(gpx, null);
  assert.equal(calls, 1);
});

test("fetchGpx retries a thrown network error and succeeds once the network recovers", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    if (calls < 2) throw new Error("network drop");
    return { ok: true, text: async () => "<gpx><trkpt lat=\"1\" lon=\"2\"/></gpx>" };
  };
  const gpx = await fetchGpx("x", fakeFetch, {}, async () => {});
  assert.match(gpx, /<trkpt/);
  assert.equal(calls, 2);
});

test("fetchGpx throws after exhausting retries on a persistent network error", async () => {
  const fakeFetch = async () => {
    throw new Error("network drop");
  };
  await assert.rejects(() => fetchGpx("x", fakeFetch, {}, async () => {}), /network drop/);
});

// ---- downloadAll: the loop that must survive a partial failure ----

test("downloadAll collects a GPX file for every workout that has one", async () => {
  const fakeFetch = async (url) => ({ ok: true, text: async () => gpxFor(url.split("/").pop()) });
  const res = await downloadAll(workoutList(5), fakeFetch, {}, fast());
  assert.equal(res.files.length, 5);
  assert.equal(res.skipped, 0);
  assert.deepEqual(res.failedKeys, []);
  assert.deepEqual(res.byActivity, { 1: 5 });
  assert.equal(res.files[0].name, "2024-01-01_running_k0.gpx");
});

test("downloadAll skips track-less workouts without counting them as failures", async () => {
  const fakeFetch = async (url) => {
    const key = url.split("/").pop();
    return key === "k2"
      ? { ok: true, text: async () => "<gpx></gpx>" } // manually added / indoor
      : { ok: true, text: async () => gpxFor(key) };
  };
  const res = await downloadAll(workoutList(5), fakeFetch, {}, fast());
  assert.equal(res.files.length, 4);
  assert.equal(res.skipped, 1);
  assert.deepEqual(res.failedKeys, []);
});

test("one workout failing does not abort the run — the rest still download", async () => {
  // Regression: a thrown fetch used to kill the whole export mid-history.
  const fakeFetch = async (url) => {
    if (url.endsWith("k2")) throw new Error("network drop");
    return { ok: true, text: async () => gpxFor(url.split("/").pop()) };
  };
  const res = await downloadAll(workoutList(6), fakeFetch, {}, fast());
  assert.deepEqual(res.failedKeys, ["k2"]);
  assert.equal(res.files.length, 5, "every other workout must still be fetched");
  assert.ok(
    res.files.every((f) => !f.name.includes("k2")),
    "the failed workout must not appear in the output",
  );
});

test("a workout recovers when the connection comes back mid-retry", async () => {
  let attempts = 0;
  const fakeFetch = async (url) => {
    if (url.endsWith("k1")) {
      attempts++;
      if (attempts < 3) throw new Error("network drop");
    }
    return { ok: true, text: async () => gpxFor(url.split("/").pop()) };
  };
  const res = await downloadAll(workoutList(3), fakeFetch, {}, fast());
  assert.deepEqual(res.failedKeys, []);
  assert.equal(res.files.length, 3);
  assert.equal(attempts, 3, "should have retried twice before succeeding");
});

test("every workout failing still returns cleanly instead of throwing", async () => {
  const fakeFetch = async () => {
    throw new Error("offline");
  };
  const res = await downloadAll(workoutList(4), fakeFetch, {}, fast());
  assert.equal(res.files.length, 0);
  assert.deepEqual(res.failedKeys, ["k0", "k1", "k2", "k3"]);
});

test("downloadAll resumes from startFrom and skips what was already fetched", async () => {
  const seen = [];
  const fakeFetch = async (url) => {
    const key = url.split("/").pop();
    seen.push(key);
    return { ok: true, text: async () => gpxFor(key) };
  };
  const res = await downloadAll(workoutList(10), fakeFetch, {}, fast({ startFrom: 7 }));
  assert.deepEqual(seen, ["k7", "k8", "k9"]);
  assert.equal(res.files.length, 3);
});

test("downloadAll logs progress against the full total, not the remaining slice", async () => {
  const log = quiet();
  const fakeFetch = async (url) => ({ ok: true, text: async () => gpxFor(url.split("/").pop()) });
  await downloadAll(workoutList(10), fakeFetch, {}, fast({ startFrom: 7, log }));
  assert.deepEqual(log.lines.log, ["8 / 10", "9 / 10", "10 / 10"]);
});

test("downloadAll counts activities even for workouts that fail", async () => {
  const workouts = [
    { workoutKey: "a", activityId: 1, startTime: Date.now() },
    { workoutKey: "b", activityId: 22, startTime: Date.now() },
  ];
  const fakeFetch = async (url) => {
    if (url.endsWith("b")) throw new Error("drop");
    return { ok: true, text: async () => gpxFor("a") };
  };
  const res = await downloadAll(workouts, fakeFetch, {}, fast());
  assert.deepEqual(res.byActivity, { 1: 1, 22: 1 });
});

test("an empty history is a no-op, not an error", async () => {
  const res = await downloadAll([], async () => {
    throw new Error("should not be called");
  }, {}, fast());
  assert.deepEqual(res, { files: [], byActivity: {}, failedKeys: [], skipped: 0 });
});

// ---- resumeOffset ----

test("resumeOffset reads the window flag and floors it at zero", () => {
  assert.equal(resumeOffset({ TREENI_RESUME_FROM: 414 }), 414);
  assert.equal(resumeOffset({ TREENI_RESUME_FROM: "414" }), 414);
  assert.equal(resumeOffset({ TREENI_RESUME_FROM: -5 }), 0, "negative must not walk off the array");
  assert.equal(resumeOffset({ TREENI_RESUME_FROM: 12.9 }), 12, "must be a whole index");
});

test("resumeOffset defaults to 0 when the flag is absent or unusable", () => {
  assert.equal(resumeOffset({}), 0);
  assert.equal(resumeOffset(undefined), 0);
  assert.equal(resumeOffset({ TREENI_RESUME_FROM: "roskaa" }), 0);
  assert.equal(resumeOffset({ TREENI_RESUME_FROM: null }), 0);
});

// ---- authHeaders ----

test("authHeaders builds the session header from localStorage", () => {
  const store = { getItem: (k) => (k === "sessionkey" ? "abc123" : null) };
  assert.deepEqual(authHeaders(store), { STTAuthorization: "abc123" });
});

test("authHeaders explains what to do when the user is not logged in", () => {
  const empty = { getItem: () => null };
  assert.throws(() => authHeaders(empty), /kirjaudu sisään/);
  assert.throws(() => authHeaders(null), /Ei sessionkeytä/);
});
