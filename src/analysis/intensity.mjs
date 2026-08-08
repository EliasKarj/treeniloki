import { maxHrObserved, zoneOf } from "./hrZones.mjs";

const DAY = 86400000;

/** Median pace (min/km) across workouts with a positive pace, or null. */
export function easyPace(workouts) {
  const paces = workouts.map((w) => w.paceMinKm).filter((p) => p > 0).sort((a, b) => a - b);
  if (!paces.length) return null;
  const mid = Math.floor(paces.length / 2);
  return paces.length % 2 ? paces[mid] : (paces[mid - 1] + paces[mid]) / 2;
}

/** "hard" if >5% faster than ref, "easy" if >5% slower, else "moderate". */
export function classifyEffort(paceMinKm, ref) {
  if (!ref || !(paceMinKm > 0)) return "moderate";
  if (paceMinKm < ref * 0.95) return "hard";
  if (paceMinKm > ref * 1.05) return "easy";
  return "moderate";
}

function effortFromHr(avgHr, maxHr) {
  const z = zoneOf(avgHr, maxHr);
  if (z == null) return null;
  if (z <= 2) return "easy";
  if (z === 3) return "moderate";
  return "hard";
}

/** Duration-weighted easy/moderate/hard split over the trailing 28 days. */
export function intensityDistribution(workouts, now = Date.now()) {
  const win = workouts.filter((w) => (now - w.date) / DAY <= 28);
  const ref = easyPace(win);
  const maxHr = maxHrObserved(workouts);
  const min = { easy: 0, moderate: 0, hard: 0 };
  for (const w of win) {
    const dur = w.durationMin || 0;
    if (dur <= 0) continue;
    let eff = w.avgHr != null ? effortFromHr(w.avgHr, maxHr) : null;
    if (!eff) eff = classifyEffort(w.paceMinKm, ref);
    min[eff] += dur;
  }
  const total = min.easy + min.moderate + min.hard;
  if (total === 0) {
    return { easyPct: 0, moderatePct: 0, hardPct: 0, easyMin: 0, moderateMin: 0, hardMin: 0, ref, drift: "none" };
  }
  const easyPct = Math.round((min.easy / total) * 100);
  const moderatePct = Math.round((min.moderate / total) * 100);
  const hardPct = Math.round((min.hard / total) * 100);
  const drift = hardPct > 25 ? "tooHard" : moderatePct >= 35 ? "grey" : easyPct >= 75 ? "ok" : "grey";
  return {
    easyPct, moderatePct, hardPct,
    easyMin: Math.round(min.easy), moderateMin: Math.round(min.moderate), hardMin: Math.round(min.hard),
    ref, drift,
  };
}
