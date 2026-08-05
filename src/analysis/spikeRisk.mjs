import { splitBlocks } from "./breaks.mjs";

const DAY = 86400000;

/**
 * Per-workout single-session distance spike vs. the trailing-30-day longest run.
 * Returns [{ ratio, band: "none"|"moderate"|"high", suppressed }] parallel to `workouts`.
 * The first `postBreakSuppress` workouts of any post-break block are suppressed (a comeback
 * run is definitionally "spiky" vs. a stale window; the break card explains that instead).
 */
export function spikeRisk(workouts, { windowDays = 30, postBreakSuppress = 2, gapDays = 14 } = {}) {
  const suppressedSet = new Set();
  const blocks = splitBlocks(workouts, gapDays);
  for (let b = 1; b < blocks.length; b++) {
    for (let k = 0; k < Math.min(postBreakSuppress, blocks[b].length); k++) suppressedSet.add(blocks[b][k]);
  }

  return workouts.map((wk, i) => {
    let maxPrev = 0;
    for (let j = i - 1; j >= 0; j--) {
      if ((wk.date - workouts[j].date) / DAY > windowDays) break;
      if (workouts[j].distanceKm > maxPrev) maxPrev = workouts[j].distanceKm;
    }
    const suppressed = suppressedSet.has(wk);
    if (maxPrev === 0 || suppressed) return { ratio: maxPrev === 0 ? 1 : wk.distanceKm / maxPrev, band: "none", suppressed };
    const ratio = wk.distanceKm / maxPrev;
    const band = ratio > 1.30 ? "high" : ratio > 1.10 ? "moderate" : "none";
    return { ratio, band, suppressed };
  });
}
