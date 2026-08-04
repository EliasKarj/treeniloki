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

## License

2026 EliasKarj. See [LICENSE](./LICENSE).
