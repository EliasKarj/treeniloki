const DAY = 86400000;

export function sessionLoad(workout) {
  return workout.distanceKm * (1 + workout.elevGain / 500);
}

/** Acute:chronic workload ratio as of the most recent workout. Contested signal — label it. */
export function acwr(workouts) {
  if (workouts.length === 0) return { acute: 0, chronic: 0, ratio: 0 };
  const now = workouts[workouts.length - 1].date;
  let acute = 0, chronic = 0;
  for (const w of workouts) {
    const ageDays = (now - w.date) / DAY;
    const load = sessionLoad(w);
    if (ageDays <= 7) acute += load;
    if (ageDays <= 28) chronic += load;
  }
  const chronicWeekly = chronic / 4;
  return { acute, chronic: chronicWeekly, ratio: chronicWeekly > 0 ? acute / chronicWeekly : 0 };
}
