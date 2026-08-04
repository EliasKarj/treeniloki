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

  // ---- browser entry + Node test hook (added in later tasks) ----
  try { module.exports = { activityName, formatDate, buildFilename }; } catch (e) { /* browser: no module */ }
})();
