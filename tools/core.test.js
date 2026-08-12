const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  activityName, formatDate, buildFilename, listAllWorkouts, fetchGpx, downloadAll, resumeOffset,
  authHeaders,
} = require("./core.js");

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
  const res = await fetchGpx("abc", fakeFetch, {});
  assert.equal(res.reason, "ok");
  assert.match(res.gpx, /<trkpt/);
});

test("fetchGpx tells a track-less workout apart from an HTTP error", async () => {
  // Ratkaiseva ero: "notrack" on pysyvä tosiasia treenistä, HTTP-virhe ei ole.
  const http = await fetchGpx("x", async () => ({ ok: false, status: 403 }), {});
  assert.deepEqual(http, { gpx: null, reason: "http", status: 403 });

  const noTrack = await fetchGpx("y", async () => ({ ok: true, text: async () => "<gpx></gpx>" }), {});
  assert.deepEqual(noTrack, { gpx: null, reason: "notrack" });
});

test("fetchGpx does not retry a clean non-ok response", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return { ok: false, status: 403 };
  };
  const res = await fetchGpx("x", fakeFetch, {}, async () => {});
  assert.equal(res.reason, "http");
  assert.equal(calls, 1);
});

test("fetchGpx retries a thrown network error and succeeds once the network recovers", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    if (calls < 2) throw new Error("network drop");
    return { ok: true, text: async () => "<gpx><trkpt lat=\"1\" lon=\"2\"/></gpx>" };
  };
  const res = await fetchGpx("x", fakeFetch, {}, async () => {});
  assert.match(res.gpx, /<trkpt/);
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

test("an HTTP error is never remembered as track-less — an expired session must not poison the list", async () => {
  // Regressio: aiemmin sekä 403 että reidittömyys palauttivat nullin, joten
  // vanhentunut sessio olisi kirjannut koko loppuhistorian pysyvästi
  // ohitettavaksi ja treenit olisivat kadonneet hiljaa.
  const fakeFetch = async (url) => {
    const key = url.split("/").pop();
    if (key === "k0") return { ok: true, text: async () => "<gpx></gpx>" }; // aito reiditön
    return { ok: false, status: 403 };                                       // sessio vanhentui
  };
  const noted = [];
  const res = await downloadAll(workoutList(5), fakeFetch, {}, fast({
    onNoTrack: async (w) => noted.push(w.workoutKey),
  }));
  assert.deepEqual(noted, ["k0"], "only the genuinely track-less workout may be remembered");
  assert.equal(res.skipped, 1);
  assert.equal(res.httpSkipped, 4);
  assert.deepEqual(res.httpStatuses, { 403: 4 });
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

test("onProgress distinguishes an HTTP skip from a track-less skip", async () => {
  const fakeFetch = async (url) => {
    const key = url.split("/").pop();
    if (key === "k0") return { ok: true, text: async () => "<gpx></gpx>" };
    if (key === "k1") return { ok: false, status: 404 };
    return { ok: true, text: async () => gpxFor(key) };
  };
  const states = [];
  await downloadAll(workoutList(3), fakeFetch, {}, fast({ onProgress: (p) => states.push(p.state) }));
  assert.deepEqual(states, ["notrack", "http", "saved"]);
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
  assert.deepEqual(
    log.lines.log.map((l) => l.split("  ")[0]),
    ["8 / 10", "9 / 10", "10 / 10"],
  );
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
  assert.deepEqual(res, {
    files: [], byActivity: {}, failedKeys: [],
    skipped: 0, skippedExisting: 0, downloaded: 0,
    httpSkipped: 0, httpStatuses: {}, cancelled: false,
  });
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

// ---- downloadAll: onFile / shouldSkip / onProgress / isCancelled ----

test("onFile receives each GPX instead of accumulating it in memory", async () => {
  const fakeFetch = async (url) => ({ ok: true, text: async () => gpxFor(url.split("/").pop()) });
  const written = [];
  const res = await downloadAll(workoutList(4), fakeFetch, {}, fast({
    onFile: async (name, gpx) => { written.push(name); assert.match(gpx, /<trkpt/); },
  }));
  assert.equal(written.length, 4);
  assert.deepEqual(res.files, [], "nothing may be retained when onFile is given");
  assert.equal(res.downloaded, 4);
});

test("shouldSkip avoids the network entirely for workouts already saved", async () => {
  const seen = [];
  const fakeFetch = async (url) => {
    const key = url.split("/").pop();
    if (!url.includes("/workouts?")) seen.push(key);
    return { ok: true, text: async () => gpxFor(key) };
  };
  const done = new Set(["2024-01-01_running_k0.gpx", "2024-01-01_running_k2.gpx"]);
  const res = await downloadAll(workoutList(4), fakeFetch, {}, fast({
    shouldSkip: (name) => done.has(name),
    onFile: async () => {},
  }));
  assert.deepEqual(seen, ["k1", "k3"]);
  assert.equal(res.skippedExisting, 2);
  assert.equal(res.downloaded, 2);
});

test("onProgress reports one event per workout with its outcome", async () => {
  const fakeFetch = async (url) => {
    const key = url.split("/").pop();
    if (key === "k1") return { ok: true, text: async () => "<gpx></gpx>" };
    if (key === "k2") throw new Error("drop");
    return { ok: true, text: async () => gpxFor(key) };
  };
  const events = [];
  await downloadAll(workoutList(4), fakeFetch, {}, fast({
    onProgress: (p) => events.push(p.state),
  }));
  assert.deepEqual(events, ["saved", "notrack", "failed", "saved"]);
});

test("isCancelled stops the run cleanly and reports what was done", async () => {
  const fakeFetch = async (url) => ({ ok: true, text: async () => gpxFor(url.split("/").pop()) });
  let seen = 0;
  const res = await downloadAll(workoutList(10), fakeFetch, {}, fast({
    onProgress: () => { seen++; },
    isCancelled: () => seen >= 3,
  }));
  assert.equal(res.cancelled, true);
  assert.equal(res.downloaded, 3, "work done before the stop is kept");
});

test("byActivity counts the whole history, including workouts already saved", async () => {
  const fakeFetch = async (url) => ({ ok: true, text: async () => gpxFor(url.split("/").pop()) });
  const res = await downloadAll(workoutList(4), fakeFetch, {}, fast({
    shouldSkip: (name) => name.includes("k0"),
    onFile: async () => {},
  }));
  assert.deepEqual(res.byActivity, { 1: 4 });
});

// ---- reidittömien muistilista: formaatti ----

const { NO_TRACK_FILE, parseNoTrack, serializeNoTrack } = require("./core.js");

test("parseNoTrack reads keys and ignores comments and blank lines", () => {
  const set = parseNoTrack("# selitys\n\nw001\n  w002  \n\n# toinen\nw003\n");
  assert.deepEqual([...set].sort(), ["w001", "w002", "w003"]);
});

test("parseNoTrack tolerates a missing, empty or garbled file", () => {
  for (const input of ["", null, undefined, "# vain kommentti\n", "\n\n\n"]) {
    assert.equal(parseNoTrack(input).size, 0, `input ${JSON.stringify(input)}`);
  }
});

test("parseNoTrack handles Windows line endings", () => {
  assert.deepEqual([...parseNoTrack("# c\r\nw1\r\nw2\r\n")].sort(), ["w1", "w2"]);
});

test("serializeNoTrack round-trips through parseNoTrack", () => {
  const original = new Set(["w9", "w1", "w5"]);
  const text = serializeNoTrack(original);
  assert.deepEqual([...parseNoTrack(text)].sort(), ["w1", "w5", "w9"]);
});

test("the serialized file explains itself and is sorted", () => {
  const text = serializeNoTrack(new Set(["w3", "w1"]));
  const lines = text.split("\n");
  assert.ok(lines[0].startsWith("#"), "should open with an explanation");
  assert.match(text, /GPS-reitti/, "should say what the file is about");
  assert.match(text, /Voit poistaa/, "should say how to undo it");
  assert.deepEqual(lines.filter((l) => l && !l.startsWith("#")), ["w1", "w3"]);
});

test("the marker filename is hidden-ish and not mistaken for a GPX", () => {
  assert.ok(NO_TRACK_FILE.startsWith("."), "a dot prefix keeps it out of the way");
  assert.ok(!NO_TRACK_FILE.endsWith(".gpx"), "must not be picked up by the .gpx scan");
});

// ---- onNoTrack ----

test("onNoTrack fires for track-less workouts only", async () => {
  const fakeFetch = async (url) => {
    const key = url.split("/").pop();
    if (key === "k1" || key === "k3") return { ok: true, text: async () => "<gpx></gpx>" };
    if (key === "k2") throw new Error("drop");
    return { ok: true, text: async () => gpxFor(key) };
  };
  const noted = [];
  const res = await downloadAll(workoutList(5), fakeFetch, {}, fast({
    onNoTrack: async (w) => noted.push(w.workoutKey),
  }));
  assert.deepEqual(noted, ["k1", "k3"], "not the failure, not the successes");
  assert.equal(res.skipped, 2);
});

test("a workout in the no-track list costs no network call on the next run", async () => {
  const seen = [];
  const fakeFetch = async (url) => {
    const key = url.split("/").pop();
    if (!url.includes("/workouts?")) seen.push(key);
    if (key === "k1") return { ok: true, text: async () => "<gpx></gpx>" };
    return { ok: true, text: async () => gpxFor(key) };
  };

  // Ensimmäinen ajo oppii, että k1 on reiditön.
  const learned = new Set();
  const saved = new Set();
  await downloadAll(workoutList(3), fakeFetch, {}, fast({
    onFile: async (name) => { saved.add(name); },
    onNoTrack: async (w) => { learned.add(w.workoutKey); },
  }));
  assert.deepEqual([...learned], ["k1"]);

  // Toinen ajo ohittaa sekä tallennetut että opitut reidittömät.
  seen.length = 0;
  const res = await downloadAll(workoutList(3), fakeFetch, {}, fast({
    shouldSkip: (name, w) => saved.has(name) || learned.has(w.workoutKey),
    onFile: async () => {},
  }));
  assert.deepEqual(seen, [], "nothing at all should be re-fetched");
  assert.equal(res.skippedExisting, 3);
});
