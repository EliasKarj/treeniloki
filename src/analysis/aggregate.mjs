export function aggregate(workouts) {
  const count = workouts.length;
  const totalKm = workouts.reduce((s, w) => s + w.distanceKm, 0);
  const totalMin = workouts.reduce((s, w) => s + w.durationMin, 0);
  const totalElev = workouts.reduce((s, w) => s + w.elevGain, 0);
  const longestKm = workouts.reduce((m, w) => Math.max(m, w.distanceKm), 0);
  const avgPace = totalKm > 0 ? totalMin / totalKm : 0;
  return { count, totalKm, totalMin, totalElev, longestKm, avgPace };
}
