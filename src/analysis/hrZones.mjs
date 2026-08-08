const Z = [0.60, 0.70, 0.80, 0.90];

/** Highest point HR across all workouts, or null when no point has HR. */
export function maxHrObserved(workouts) {
  let max = null;
  for (const w of workouts) for (const p of (w.points || [])) {
    if (p.hr != null && (max === null || p.hr > max)) max = p.hr;
  }
  return max;
}

/** HR zone 1..5 by fraction of maxHr, or null if inputs missing. */
export function zoneOf(hr, maxHr) {
  if (!maxHr || hr == null) return null;
  const f = hr / maxHr;
  if (f < Z[0]) return 1;
  if (f < Z[1]) return 2;
  if (f < Z[2]) return 3;
  if (f < Z[3]) return 4;
  return 5;
}

/** Time-in-zone summary, or null when no workout has HR. */
export function hrSummary(workouts) {
  const maxHr = maxHrObserved(workouts);
  if (maxHr == null) return null;
  const zoneMinutes = [0, 0, 0, 0, 0];
  for (const w of workouts) {
    const pts = w.points || [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      if (a.hr == null) continue;
      const z = zoneOf(a.hr, maxHr);
      const min = (pts[i].t - a.t) / 60000;
      if (min > 0 && z) zoneMinutes[z - 1] += min;
    }
  }
  const total = zoneMinutes.reduce((s, x) => s + x, 0) || 1;
  const easy = zoneMinutes[0] + zoneMinutes[1];
  const moderate = zoneMinutes[2];
  const hard = zoneMinutes[3] + zoneMinutes[4];
  return {
    maxHr,
    zoneMinutes,
    easyPct: Math.round((easy / total) * 100),
    moderatePct: Math.round((moderate / total) * 100),
    hardPct: Math.round((hard / total) * 100),
  };
}
