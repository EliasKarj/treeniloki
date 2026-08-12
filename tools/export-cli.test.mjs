import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseArgs, exportAll, reportSummary, USAGE } from "./export-cli.mjs";

const quiet = () => {
  const lines = { log: [], warn: [] };
  return { log: (...a) => lines.log.push(a.join(" ")), warn: (...a) => lines.warn.push(a.join(" ")), lines };
};

const tempDir = () => mkdtemp(join(tmpdir(), "treeniloki-cli-"));

const gpxFor = (key) =>
  `<gpx><trk><name>${key}</name><trkseg><trkpt lat="60" lon="24"><time>2024-01-01T00:00:00Z</time></trkpt></trkseg></trk></gpx>`;

/** A workout list endpoint plus per-workout GPX, with optional per-key behaviour. */
function fakeApi(count, behaviour = {}) {
  const workouts = Array.from({ length: count }, (_, i) => ({
    workoutKey: `k${i}`,
    activityId: 1,
    startTime: new Date(2024, 0, 1).getTime(),
  }));
  const calls = [];
  const fetchImpl = async (url) => {
    if (url.includes("/workouts?")) {
      const offset = Number(url.match(/offset=(\d+)/)[1]);
      return { ok: true, json: async () => ({ payload: workouts.slice(offset, offset + 50) }) };
    }
    const key = url.split("/").pop();
    calls.push(key);
    const how = behaviour[key];
    if (how === "throw") throw new Error("network drop");
    if (how === "notrack") return { ok: true, text: async () => "<gpx></gpx>" };
    if (how === "404") return { ok: false, status: 404 };
    return { ok: true, text: async () => gpxFor(key) };
  };
  return { fetchImpl, calls, workouts };
}

const run = (dir, api, extra = {}) =>
  exportAll({
    key: "avain",
    outDir: dir,
    throttleMs: 0,
    sleepImpl: async () => {},
    fetchImpl: api.fetchImpl,
    log: quiet(),
    ...extra,
  });

// -------------------------------------------------------------- parseArgs

test("parseArgs applies defaults and reads the key from the environment", () => {
  const o = parseArgs([], { ST_SESSION_KEY: "ympäristöstä" });
  assert.equal(o.key, "ympäristöstä");
  assert.equal(o.outDir, "./gpx-export");
  assert.equal(o.throttleMs, 150);
  assert.equal(o.limit, 0);
  assert.equal(o.force, false);
});

test("parseArgs reads every option and lets --key override the environment", () => {
  const o = parseArgs(
    ["--key", "argumentista", "--out", "./omat", "--throttle", "500", "--limit", "10", "--force"],
    { ST_SESSION_KEY: "ympäristöstä" },
  );
  assert.deepEqual(o, { key: "argumentista", outDir: "./omat", throttleMs: 500, limit: 10, force: true, help: false });
});

test("parseArgs rejects unknown options and missing values", () => {
  assert.throws(() => parseArgs(["--roskaa"]), /Tuntematon valitsin/);
  assert.throws(() => parseArgs(["--key"]), /vaatii arvon/);
  assert.throws(() => parseArgs(["--limit", "eiluku"]), /ei-negatiivisen luvun/);
  assert.throws(() => parseArgs(["--throttle", "-5"]), /ei-negatiivisen luvun/);
});

test("--help is recognised and the usage text documents the resume behaviour", () => {
  assert.equal(parseArgs(["--help"]).help, true);
  assert.equal(parseArgs(["-h"]).help, true);
  assert.match(USAGE, /jatkuu ajamalla sama komento uudelleen/);
});

// -------------------------------------------------------------- exportAll

test("exportAll refuses to start without a session key", async () => {
  await assert.rejects(() => exportAll({ key: "" }), /Sessiotunniste puuttuu/);
});

test("exportAll writes one GPX file per workout", async () => {
  const dir = await tempDir();
  try {
    const summary = await run(dir, fakeApi(5));
    assert.equal(summary.downloaded, 5);
    assert.equal(summary.total, 5);
    assert.deepEqual(summary.failed, []);

    const files = (await readdir(dir)).sort();
    assert.equal(files.length, 5);
    assert.ok(files.every((f) => /^2024-01-01_running_k\d\.gpx$/.test(f)), files.join(", "));
    assert.match(await readFile(join(dir, "2024-01-01_running_k0.gpx"), "utf8"), /<trkpt/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("exportAll creates the output directory when it does not exist", async () => {
  const parent = await tempDir();
  const nested = join(parent, "syva", "kansio");
  try {
    await run(nested, fakeApi(2));
    assert.equal((await readdir(nested)).length, 2);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a second run skips what is already on disk — this is the resume path", async () => {
  const dir = await tempDir();
  try {
    await run(dir, fakeApi(6));

    const second = fakeApi(6);
    const summary = await run(dir, second);
    assert.equal(summary.alreadyOnDisk, 6);
    assert.equal(summary.downloaded, 0);
    assert.deepEqual(second.calls, [], "nothing should be re-fetched");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an interrupted run resumes and fetches only the missing workouts", async () => {
  const dir = await tempDir();
  try {
    // Simulate a run that died after three files.
    await run(dir, fakeApi(3));

    const rest = fakeApi(8);
    const summary = await run(dir, rest);
    assert.equal(summary.alreadyOnDisk, 3);
    assert.equal(summary.downloaded, 5);
    assert.deepEqual(rest.calls, ["k3", "k4", "k5", "k6", "k7"]);
    assert.equal((await readdir(dir)).length, 8);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--force re-downloads files that are already present", async () => {
  const dir = await tempDir();
  try {
    await run(dir, fakeApi(3));
    const again = fakeApi(3);
    const summary = await run(dir, again, { force: true });
    assert.equal(summary.downloaded, 3);
    assert.equal(summary.alreadyOnDisk, 0);
    assert.deepEqual(again.calls, ["k0", "k1", "k2"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("one workout failing does not stop the run and leaves no partial file", async () => {
  const dir = await tempDir();
  try {
    const summary = await run(dir, fakeApi(5, { k2: "throw" }));
    assert.deepEqual(summary.failed, ["k2"]);
    assert.equal(summary.downloaded, 4);

    const files = await readdir(dir);
    assert.equal(files.length, 4);
    assert.ok(!files.some((f) => f.includes("k2")), "the failed workout must not be written");
    assert.ok(!files.some((f) => f.endsWith(".part")), "no temp file may survive");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a failed workout is retried by the next run, since it was never written", async () => {
  const dir = await tempDir();
  try {
    await run(dir, fakeApi(4, { k1: "throw" }));
    const retry = fakeApi(4);
    const summary = await run(dir, retry);
    assert.deepEqual(retry.calls, ["k1"], "only the previously failed workout is re-fetched");
    assert.equal(summary.downloaded, 1);
    assert.equal((await readdir(dir)).length, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("track-less and 404 workouts are skipped without being treated as failures", async () => {
  const dir = await tempDir();
  try {
    const summary = await run(dir, fakeApi(4, { k1: "notrack", k2: "404" }));
    assert.equal(summary.skippedNoTrack, 2);
    assert.deepEqual(summary.failed, []);
    assert.equal(summary.downloaded, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--limit caps how many workouts are fetched", async () => {
  const dir = await tempDir();
  try {
    const api = fakeApi(20);
    const summary = await run(dir, api, { limit: 3 });
    assert.equal(summary.total, 3);
    assert.equal(summary.downloaded, 3);
    assert.deepEqual(api.calls, ["k0", "k1", "k2"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a stray .part file from a killed process is ignored by the resume scan", async () => {
  const dir = await tempDir();
  try {
    await writeFile(join(dir, "2024-01-01_running_k0.gpx.part"), "puolikas", "utf8");
    const api = fakeApi(2);
    const summary = await run(dir, api);
    assert.equal(summary.alreadyOnDisk, 0, "a .part file must not count as done");
    assert.deepEqual(api.calls, ["k0", "k1"]);
    assert.match(await readFile(join(dir, "2024-01-01_running_k0.gpx"), "utf8"), /<trkpt/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("exportAll paginates through a history longer than one page", async () => {
  const dir = await tempDir();
  try {
    const summary = await run(dir, fakeApi(57));
    assert.equal(summary.total, 57);
    assert.equal(summary.downloaded, 57);
    assert.equal((await readdir(dir)).length, 57);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------- reportSummary

test("reportSummary exits zero on a clean run and one when workouts failed", () => {
  const clean = { total: 3, alreadyOnDisk: 0, downloaded: 3, skippedNoTrack: 0, failed: [], byActivity: { 1: 3 } };
  assert.equal(reportSummary(clean, "./ulos", quiet()), 0);

  const log = quiet();
  const dirty = { ...clean, downloaded: 2, failed: ["k9"] };
  assert.equal(reportSummary(dirty, "./ulos", log), 1);
  assert.ok(log.lines.warn.some((l) => /uudelleen/.test(l)), "should tell the user how to retry");
});
