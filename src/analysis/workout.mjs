const R = 6371; // km

export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function distanceKm(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += haversineKm(points[i - 1], points[i]);
  return sum;
}

export function durationMin(points) {
  if (points.length < 2) return 0;
  return (points[points.length - 1].t - points[0].t) / 60000;
}

export function elevGain(points, threshold = 0.3) {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
    if (d > threshold) gain += d;
  }
  return Math.round(gain * 10) / 10;
}

export function paceMinKm(distanceKm, durationMin) {
  return distanceKm > 0 ? durationMin / distanceKm : 0;
}

export function summarizeWorkout(points) {
  const dist = distanceKm(points);
  const dur = durationMin(points);
  return { distanceKm: dist, durationMin: dur, elevGain: elevGain(points), paceMinKm: paceMinKm(dist, dur) };
}

export function fmtPace(minPerKm) {
  if (!minPerKm || minPerKm <= 0) return "–";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}
