# Sports Tracker Export Script — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single browser-console script that downloads a Sports Tracker user's entire workout history as GPX files in one zip, with sport type in each filename.

**Architecture:** One self-contained file `tools/sports-tracker-export.js` — an IIFE that auto-runs in the browser (`typeof window !== "undefined"`) and exposes its pure/injectable helpers via `module.exports` (in a `try/catch`, ignored in the browser) so Node can unit-test them. Network functions take `fetch` as a parameter (dependency injection) so they're testable with a fake. GPX comes straight from Sports Tracker's `exportGpx` endpoint.

**Tech Stack:** Vanilla JS (no build). Tests: Node's built-in `node:test` (CommonJS). Zip: JSZip loaded from CDN at runtime in the browser.

**Working dir:** `in-development/treeniloki` (git repo, branch `main` — this is a fresh project; committing to `main` is fine, or the executor may branch). All paths relative to it.

**Verified API facts (probed live — do not change):**
- Base `https://api.sports-tracker.com/apiserver/v1`. Auth header **`STTAuthorization: <sessionkey>`**, `sessionkey` = `localStorage.getItem("sessionkey")`.
- List (paged): `GET /workouts?sortonst=true&limit=<n>&offset=<m>` → `{ error, payload: [ { workoutKey, activityId, startTime(ms), totalDistance, … } ], metadata }`.
- GPX: `GET /workout/exportGpx/<workoutKey>` → GPX 1.1 XML with `<trkpt>` elements.

**Commit trailer** (end every commit message, blank line before it):
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

### Task 1: Project wiring + `activityName` (TDD)

**Files:**
- Create: `package.json`, `tools/sports-tracker-export.js`, `tools/sports-tracker-export.test.js`

- [ ] **Step 1: Write `package.json`**

(No `"type": "module"` — the script must stay CommonJS-compatible so `require` works and so `module.exports` is valid when Node loads it.)

```json
{
  "name": "treeniloki",
  "version": "0.1.0",
  "private": true,
  "description": "Sports Tracker export + GPX workout analyzer (client-side).",
  "scripts": {
    "test": "node --test tools/"
  }
}
```

- [ ] **Step 2: Write the failing test `tools/sports-tracker-export.test.js`**

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activityName } = require("./sports-tracker-export.js");

test("activityName maps known ids and falls back to act<id>", () => {
  assert.equal(activityName(1), "running");
  assert.equal(activityName(99), "act99");
});
```

- [ ] **Step 3: Run it — verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `./sports-tracker-export.js`.

- [ ] **Step 4: Create `tools/sports-tracker-export.js` (skeleton + `activityName` + export hook)**

```js
// Sports Tracker → GPX export.
// Paste this whole file into the DevTools Console at https://www.sports-tracker.com
// while logged in. It downloads your entire workout history as GPX files in one .zip.
(function () {
  const API = "https://api.sports-tracker.com/apiserver/v1";
  const PAGE_LIMIT = 50;
  const THROTTLE_MS = 150;
  const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  // Sports Tracker activityId → sport name. Only id 1 is verified; extend as you learn
  // your own ids (the run summary prints which activityIds were found). Unknown → "act<id>",
  // so the sport is never lost even without a friendly name.
  const ACTIVITY_NAMES = { 1: "running" };

  function activityName(activityId) {
    return ACTIVITY_NAMES[activityId] || `act${activityId}`;
  }

  // ---- browser entry + Node test hook (added in later tasks) ----
  try { module.exports = { activityName }; } catch (e) { /* browser: no module */ }
})();
```

- [ ] **Step 5: Run it — verify it passes**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add package.json tools/sports-tracker-export.js tools/sports-tracker-export.test.js
git commit -m "export: project wiring + activityName helper (TDD)"
```

---

### Task 2: `formatDate` + `buildFilename` (TDD)

**Files:**
- Modify: `tools/sports-tracker-export.js`, `tools/sports-tracker-export.test.js`

- [ ] **Step 1: Add failing tests**

```js
const { formatDate, buildFilename } = require("./sports-tracker-export.js");

test("formatDate pads to YYYY-MM-DD (local date)", () => {
  assert.equal(formatDate(new Date(2024, 0, 5).getTime()), "2024-01-05");
  assert.equal(formatDate(new Date(2024, 11, 25).getTime()), "2024-12-25");
});

test("buildFilename is date_sport_key.gpx", () => {
  const w = { startTime: new Date(2024, 5, 1).getTime(), activityId: 1, workoutKey: "abc123" };
  assert.equal(buildFilename(w), "2024-06-01_running_abc123.gpx");
});
```

- [ ] **Step 2: Run — verify new tests fail**

Run: `npm test`
Expected: FAIL — `formatDate`/`buildFilename` are undefined.

- [ ] **Step 3: Add the functions** (inside the IIFE, after `activityName`)

```js
  function formatDate(msEpoch) {
    const d = new Date(msEpoch);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function buildFilename(workout) {
    return `${formatDate(workout.startTime)}_${activityName(workout.activityId)}_${workout.workoutKey}.gpx`;
  }
```

Update the export hook line to include them:

```js
  try { module.exports = { activityName, formatDate, buildFilename }; } catch (e) { /* browser */ }
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/sports-tracker-export.js tools/sports-tracker-export.test.js
git commit -m "export: formatDate + buildFilename (TDD)"
```

---

### Task 3: `listAllWorkouts` — paged fetch (TDD, fake fetch)

**Files:**
- Modify: `tools/sports-tracker-export.js`, `tools/sports-tracker-export.test.js`

- [ ] **Step 1: Add failing tests**

```js
const { listAllWorkouts } = require("./sports-tracker-export.js");

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
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test`
Expected: FAIL — `listAllWorkouts` undefined.

- [ ] **Step 3: Add the function** (inside the IIFE)

```js
  async function listAllWorkouts(fetchImpl, headers) {
    const all = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const res = await fetchImpl(`${API}/workouts?sortonst=true&limit=${PAGE_LIMIT}&offset=${offset}`, { headers, credentials: "include" });
      if (!res.ok) throw new Error(`Workout-listaus epäonnistui (HTTP ${res.status}).`);
      const json = await res.json();
      const page = (json && json.payload) || [];
      all.push(...page);
      if (page.length < PAGE_LIMIT) break;
    }
    return all;
  }
```

Update the export hook:

```js
  try { module.exports = { activityName, formatDate, buildFilename, listAllWorkouts }; } catch (e) { /* browser */ }
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/sports-tracker-export.js tools/sports-tracker-export.test.js
git commit -m "export: listAllWorkouts paged fetch (TDD)"
```

---

### Task 4: `fetchGpx` — per-workout GPX (TDD, fake fetch)

**Files:**
- Modify: `tools/sports-tracker-export.js`, `tools/sports-tracker-export.test.js`

- [ ] **Step 1: Add failing tests**

```js
const { fetchGpx } = require("./sports-tracker-export.js");

test("fetchGpx returns the GPX text when it has trackpoints", async () => {
  const fakeFetch = async () => ({ ok: true, text: async () => "<gpx><trkpt lat=\"1\" lon=\"2\"/></gpx>" });
  const gpx = await fetchGpx("abc", fakeFetch, {});
  assert.match(gpx, /<trkpt/);
});

test("fetchGpx returns null for non-ok or track-less GPX", async () => {
  assert.equal(await fetchGpx("x", async () => ({ ok: false, status: 404 }), {}), null);
  assert.equal(await fetchGpx("y", async () => ({ ok: true, text: async () => "<gpx></gpx>" }), {}), null);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npm test`
Expected: FAIL — `fetchGpx` undefined.

- [ ] **Step 3: Add the function** (inside the IIFE)

```js
  async function fetchGpx(workoutKey, fetchImpl, headers) {
    const res = await fetchImpl(`${API}/workout/exportGpx/${workoutKey}`, { headers, credentials: "include" });
    if (!res.ok) return null;
    const text = await res.text();
    return text.includes("<trkpt") ? text : null;
  }
```

Update the export hook:

```js
  try { module.exports = { activityName, formatDate, buildFilename, listAllWorkouts, fetchGpx }; } catch (e) { /* browser */ }
```

- [ ] **Step 4: Run — verify pass**

Run: `npm test`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/sports-tracker-export.js tools/sports-tracker-export.test.js
git commit -m "export: fetchGpx per-workout GPX (TDD)"
```

---

### Task 5: Browser orchestration + README

The browser-only glue (`authHeaders`, `loadJSZip`, `triggerDownload`, `run`) can't be unit-tested (needs `localStorage`/`document`/`fetch`), so it's added here and verified by a real run.

**Files:**
- Modify: `tools/sports-tracker-export.js`
- Create: `README.md`

- [ ] **Step 1: Add the browser functions + orchestrator** (inside the IIFE, before the export hook)

```js
  function authHeaders() {
    const key = typeof localStorage !== "undefined" && localStorage.getItem("sessionkey");
    if (!key) throw new Error("Ei sessionkeytä — kirjaudu sisään sports-tracker.comiin ja aja uudelleen.");
    return { STTAuthorization: key };
  }

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = JSZIP_CDN;
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => reject(new Error("JSZip-lataus epäonnistui"));
      document.head.appendChild(s);
    });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run() {
    const headers = authHeaders();
    console.log("Haetaan treenilista…");
    const workouts = await listAllWorkouts(fetch, headers);
    console.log(`Löytyi ${workouts.length} treeniä. Ladataan GPX:t…`);

    const files = [];
    const byActivity = {};
    let skipped = 0;
    for (let i = 0; i < workouts.length; i++) {
      const w = workouts[i];
      byActivity[w.activityId] = (byActivity[w.activityId] || 0) + 1;
      const gpx = await fetchGpx(w.workoutKey, fetch, headers);
      if (gpx) files.push({ name: buildFilename(w), gpx });
      else skipped++;
      console.log(`${i + 1} / ${workouts.length}${gpx ? "" : "  (ohitettu — ei reittiä)"}`);
      await sleep(THROTTLE_MS);
    }

    const dateTag = formatDate(Date.now());
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f.gpx);
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `sports-tracker-export-${dateTag}.zip`);
      console.log(`✅ Valmis: ${files.length} GPX zipissä, ${skipped} ohitettu.`);
    } catch (e) {
      console.warn("JSZip ei latautunut — ladataan tiedostot yksittäin.", e);
      for (const f of files) {
        triggerDownload(new Blob([f.gpx], { type: "application/gpx+xml" }), f.name);
        await sleep(120);
      }
      console.log(`✅ Valmis (yksittäiset tiedostot): ${files.length} GPX, ${skipped} ohitettu.`);
    }
    console.log("Treenit lajeittain (activityId → määrä):", byActivity);
  }

  if (typeof window !== "undefined") run();
```

Ensure the export hook remains the **last** statement in the IIFE:

```js
  try { module.exports = { activityName, formatDate, buildFilename, listAllWorkouts, fetchGpx }; } catch (e) { /* browser */ }
```

- [ ] **Step 2: Verify tests still pass (Node loads the file, browser guard prevents `run()`)**

Run: `npm test`
Expected: PASS (7 tests) — Node requires the module, `typeof window === "undefined"` so `run()` does not execute, and `module.exports` is set.

- [ ] **Step 3: Write `README.md`**

```markdown
# Treeniloki

Client-side running/workout tooling. **Part 1: Sports Tracker export.**

## `tools/sports-tracker-export.js` — export your Sports Tracker history to GPX

Sports Tracker has no bulk export. This console script downloads your whole history
as GPX files in one zip, using your existing logged-in session (no passwords).

**How to run:**
1. Open <https://www.sports-tracker.com> and log in.
2. Open DevTools → **Console**.
3. Paste the entire contents of `tools/sports-tracker-export.js` and press Enter.
4. Watch the progress log; a `sports-tracker-export-YYYY-MM-DD.zip` downloads when done.

Files are named `YYYY-MM-DD_<sport>_<workoutKey>.gpx`. Workouts without a GPS track
(manually added / indoor) are skipped. The summary prints which `activityId`s you have —
add them to `ACTIVITY_NAMES` in the script for friendlier names.

**Security:** the script only reads the session token from `localStorage` at runtime and
only fetches your own data. Nothing is uploaded anywhere. Log out/in afterwards if you
want to rotate your session token.

## Development

```bash
npm test   # node --test on the pure/injectable helpers
```

_Next: a GPX workout analyzer app (separate build)._
```

- [ ] **Step 4: Manual verification (real run)**

Open sports-tracker.com logged in, paste the script into the console. Confirm: progress
logs `N / total`, a zip downloads, the GPX count roughly matches your workout total, and
the "Treenit lajeittain" summary prints. (If you can't run it now, at minimum confirm
`npm test` passes and the browser guard/export hook are correct.)

- [ ] **Step 5: Commit**

```bash
git add tools/sports-tracker-export.js README.md
git commit -m "export: browser orchestration (zip download) + README"
```

---

## Self-Review

**Spec coverage:**
- Console script, uses session from localStorage → Task 5 (`authHeaders`, browser guard). ✓
- `STTAuthorization` header + `localStorage.sessionkey` → Task 5. ✓
- Page full history (`/workouts` limit/offset) → Task 3 (`listAllWorkouts`). ✓
- Per-workout GPX via `exportGpx` → Task 4 (`fetchGpx`). ✓
- Filename `YYYY-MM-DD_<sport>_<workoutKey>.gpx`, activityId map + `act<id>` fallback → Tasks 1–2 (`activityName`, `buildFilename`). ✓
- Zip via JSZip CDN + single download, individual-file fallback → Task 5. ✓
- Throttle ~150 ms, skip failures/track-less, progress + summary (incl. activityId histogram) → Tasks 4–5. ✓
- No-sessionkey / non-ok error handling → Tasks 3, 5. ✓
- Single testable file, pure helpers unit-tested + `listAllWorkouts` with fake fetch → Tasks 1–4. ✓
- Testing strategy (`node --test`) → Task 1 wiring. ✓

**Placeholder scan:** none — every step has complete code and exact commands. `ACTIVITY_NAMES` intentionally ships with the one verified id (`1: running`) plus a documented extension path; the `act<id>` fallback guarantees no sport data is lost.

**Type/name consistency:** `activityName`, `formatDate`, `buildFilename`, `listAllWorkouts(fetchImpl, headers)`, `fetchGpx(workoutKey, fetchImpl, headers)` are defined once and referenced consistently in `run()` (called with the global `fetch`) and in tests (called with a fake fetch). The `module.exports` set grows monotonically and always lists exactly the functions the tests import. `PAGE_LIMIT` (50) is shared by `listAllWorkouts` and its paging test.
