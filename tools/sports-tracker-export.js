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

  function formatDate(msEpoch) {
    const d = new Date(msEpoch);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function buildFilename(workout) {
    return `${formatDate(workout.startTime)}_${activityName(workout.activityId)}_${workout.workoutKey}.gpx`;
  }

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

  async function fetchGpx(workoutKey, fetchImpl, headers) {
    const res = await fetchImpl(`${API}/workout/exportGpx/${workoutKey}`, { headers, credentials: "include" });
    if (!res.ok) return null;
    const text = await res.text();
    return text.includes("<trkpt") ? text : null;
  }

  // ---- browser entry + Node test hook (added in later tasks) ----
  try { module.exports = { activityName, formatDate, buildFilename, listAllWorkouts, fetchGpx }; } catch (e) { /* browser: no module */ }
})();
