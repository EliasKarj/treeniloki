const DAY = 86400000;

/** Daniels O2 cost of running at velocity v (m/min), ml/kg/min. */
export function vo2Cost(v) {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

/** Fraction of VO2max sustainable for t minutes (Daniels). */
export function pctMax(t) {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

/** VO2max estimate from a single sustained effort, rounded to 0.1. Null if invalid. */
export function vo2maxOf(distanceKm, durationMin) {
  if (!(distanceKm > 0) || !(durationMin > 0)) return null;
  const v = (distanceKm * 1000) / durationMin; // m/min
  return Math.round((vo2Cost(v) / pctMax(durationMin)) * 10) / 10;
}

/** One estimate per 7-day bucket (best/fastest qualifying effort), plus latest as `current`. */
export function vdotTrend(workouts, minKm = 3) {
  const weeks = new Map();
  for (const w of workouts) {
    if (!(w.distanceKm >= minKm) || !(w.durationMin > 0)) continue;
    const wk = Math.floor(w.date / (7 * DAY));
    const prev = weeks.get(wk);
    if (!prev || w.paceMinKm < prev.paceMinKm) weeks.set(wk, w);
  }
  const points = [...weeks.values()]
    .sort((a, b) => a.date - b.date)
    .map((w) => ({ date: w.date, value: vo2maxOf(w.distanceKm, w.durationMin) }));
  return { current: points.length ? points[points.length - 1].value : null, points };
}
