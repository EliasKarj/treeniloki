const DAY = 86400000;

/** Split date-sorted workouts into blocks wherever the gap between consecutive workouts >= gapDays. */
export function splitBlocks(workouts, gapDays = 14) {
  const blocks = [];
  let cur = [];
  for (let i = 0; i < workouts.length; i++) {
    if (i > 0 && (workouts[i].date - workouts[i - 1].date) / DAY >= gapDays) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(workouts[i]);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

/** Least-squares slope of keyFn(workout) vs. days since the first workout. 0 if <2 points. */
export function slopePerDay(workouts, keyFn) {
  if (workouts.length < 2) return 0;
  const t0 = workouts[0].date;
  const xs = workouts.map((w) => (w.date - t0) / DAY);
  const ys = workouts.map(keyFn);
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : num / den;
}

/** For each break (gap >= gapDays), analyse the return: pre-break-average pace vs. comeback. */
export function comeback(workouts, gapDays = 14) {
  const out = [];
  for (let i = 1; i < workouts.length; i++) {
    const gap = (workouts[i].date - workouts[i - 1].date) / DAY;
    if (gap < gapDays) continue;
    const pre = workouts.slice(Math.max(0, i - 3), i);
    const preAvgPace = pre.reduce((s, w) => s + w.paceMinKm, 0) / pre.length;
    const firstBackPace = workouts[i].paceMinKm;
    let workoutsToReturn = null;
    for (let j = i; j < workouts.length; j++) {
      if (workouts[j].paceMinKm <= preAvgPace + 1e-9) { workoutsToReturn = j - i + 1; break; }
    }
    out.push({ gapDays: Math.round(gap), preAvgPace, firstBackPace, workoutsToReturn });
  }
  return out;
}

/** Workouts per week counting only active-span days within each block (break days excluded). */
export function activeFrequencyPerWeek(blocks) {
  let workouts = 0, activeDays = 0;
  for (const b of blocks) {
    workouts += b.length;
    const span = b.length ? (b[b.length - 1].date - b[0].date) / DAY + 1 : 0;
    activeDays += span;
  }
  return activeDays > 0 ? workouts / (activeDays / 7) : 0;
}
