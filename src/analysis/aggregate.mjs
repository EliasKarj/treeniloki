export function aggregate(workouts) {
  const count = workouts.length;
  const totalKm = workouts.reduce((s, w) => s + w.distanceKm, 0);
  const totalMin = workouts.reduce((s, w) => s + w.durationMin, 0);
  const totalElev = workouts.reduce((s, w) => s + w.elevGain, 0);
  const longestKm = workouts.reduce((m, w) => Math.max(m, w.distanceKm), 0);

  // Tahti lasketaan vain matkallisista treeneistä. Salitreeni on 45 minuuttia
  // ilman kilometrejä; jos sen minuutit jaettaisiin juoksun kilometreillä,
  // keskitahti hidastuisi ilman että yksikään lenkki muuttui.
  let paceKm = 0, paceMin = 0;
  for (const w of workouts) {
    if (w.distanceKm > 0) { paceKm += w.distanceKm; paceMin += w.durationMin; }
  }
  const avgPace = paceKm > 0 ? paceMin / paceKm : 0;

  return { count, totalKm, totalMin, totalElev, longestKm, avgPace };
}
