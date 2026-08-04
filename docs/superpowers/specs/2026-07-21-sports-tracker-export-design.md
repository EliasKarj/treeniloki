# Treeniloki — Sports Tracker Export Script — Design

**Date:** 2026-07-21
**Status:** Approved (brainstorming) → ready for implementation planning
**Scope:** Sub-project 1 of Treeniloki. The full project has two independent pieces:
1. **This spec — the Sports Tracker export script** (get the workout data out; there is no bulk export in Sports Tracker's UI).
2. *(Later, own spec)* the GPX workout **analyzer app** described in the dev brief.

Both are needed; the export script comes first because there's nothing to analyze without the data.

## Goal

A single browser-console script the user pastes into DevTools while logged in at
sports-tracker.com. It downloads the user's **entire workout history as GPX files,
bundled into one .zip**, with the sport type preserved — ready to feed into the
analyzer later.

## Verified data source (probed live from the user's session)

Base: `https://api.sports-tracker.com/apiserver/v1`. Auth: header
**`STTAuthorization: <sessionkey>`**, where `sessionkey` is read from
`localStorage.getItem("sessionkey")`. (Cookies alone → 403; the header is required.)

- **List (paged):** `GET /workouts?sortonst=true&limit=<n>&offset=<m>`
  → envelope `{ error, payload: [workout…], metadata }`. `payload` is the array of
  workout summaries. Relevant fields per workout: **`workoutKey`** (24-hex id used in
  URLs), **`activityId`** (sport type, e.g. `1` = running), **`startTime`** (ms epoch),
  `totalDistance` (m), `totalTime` (s). Page by increasing `offset` until `payload` is empty.
- **GPX export:** `GET /workout/exportGpx/<workoutKey>` → **GPX 1.1 XML** directly
  (`<gpx xmlns="http://www.topografix.com/GPX/1/1">…` with time-stamped trackpoints).
  Verified 200 for a real workout. We use this as-is — no need to build GPX from raw samples.

(Other endpoints exist — `/workouts/<key>` detail, `/workouts/<key>/data` samples — but
`exportGpx` is sufficient and simplest.)

## Behaviour

1. Read `sessionkey` from localStorage; if missing → clear message ("log in to
   sports-tracker.com first"), stop.
2. Page through the **full** workout list (`limit=50`, `offset += 50`) until an empty page.
3. For each workout, `GET exportGpx/<workoutKey>` with the auth header. Skip (and count)
   any that return non-200 or an empty/track-less GPX (e.g. manually-added/indoor workouts).
4. Name each file `YYYY-MM-DD_<sport>_<workoutKey>.gpx` — date from `startTime`, sport from
   an `activityId → name` map (known ids mapped, unknown → `act<id>`, so nothing is lost).
5. Bundle all GPX into one zip via **JSZip** (loaded dynamically from a CDN in the console),
   and trigger a single download: `sports-tracker-export-YYYY-MM-DD.zip`.
6. Log progress to the console (`"37 / 240 …"`) and print a final summary
   (downloaded N, skipped M, elapsed).

**Throttling:** ~150 ms between GPX requests to avoid hammering / rate-limiting.

## Structure (single pasteable file, still testable)

One file: `tools/sports-tracker-export.js`. It's a paste-in console script, but structured
so the pure helpers are unit-testable in Node:

- Pure helpers (top of file): `activityName(activityId)`, `buildFilename(workout)`,
  `formatDate(msEpoch)`, `pageOffsets(total, limit)` (or the paging predicate).
- Side-effecting functions: `getSessionKey()`, `listAllWorkouts(fetchImpl)`,
  `fetchGpx(workoutKey, fetchImpl)`, `zipAndDownload(files)`, and a `run()` orchestrator.
- **Browser guard:** the orchestrator only auto-runs under `if (typeof window !== "undefined")`.
- **Test hook:** the file ends with `try { module.exports = { activityName, buildFilename, formatDate }; } catch {}` so Node can `require`/import the pure helpers while the browser ignores it. `fetch` is passed in (dependency-injected) so `listAllWorkouts` can be tested with a fake.

## Error handling / edge cases

- **No sessionkey** → instruct to log in; stop.
- **401/403** on the first list call → "session expired, reload the page and log in again"; stop.
- **Per-workout GPX failure** → skip, increment skipped count, continue (never abort the whole run).
- **Empty history** → "no workouts found".
- **JSZip CDN blocked** → fall back to sequential individual-file downloads with a warning.
- **Unknown `activityId`** → `act<id>` in the filename (data preserved, analyzer can map later).

## Testing

- Unit tests (`node --test`) for the pure helpers using synthetic inputs:
  `activityName` (known + unknown ids), `buildFilename` (date + sport + key format),
  `formatDate`, and `listAllWorkouts` against a **fake fetch** returning canned pages
  (asserts it pages until empty and collects all workoutKeys).
- Manual verification: run the real script in the logged-in browser, confirm a zip of GPX
  files downloads and the count matches the Sports Tracker workout total.

## Out of scope

- The analyzer app (separate sub-project / spec).
- Incremental/delta export (just full export for now).
- Non-GPX formats (TCX etc.).

## Security note

The script uses the existing logged-in session token from `localStorage`; it is never
stored, transmitted anywhere, or hard-coded. All requests read only the user's own data.
