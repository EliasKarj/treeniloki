// Builders for realistic test input: GPX documents with known distance,
// duration, elevation gain and heart rate, plus the summarized-workout shape
// the analysis modules consume.

import { parseGpx } from "../../src/parse/gpx.mjs";
import { summarizeWorkout } from "../../src/analysis/workout.mjs";

export const DAY = 86400000;

/**
 * Kilometres per degree of latitude on the same sphere workout.mjs uses
 * (R = 6371 km). Moving along a single meridian makes the haversine distance
 * exactly proportional to the latitude delta, so fixtures can hit an intended
 * distance precisely instead of approximately.
 */
const KM_PER_DEG_LAT = (Math.PI * 6371) / 180;

export const daysAgo = (n, now) => now - n * DAY;

/**
 * A GPX document for one run, travelling due north from `lat0`.
 *
 * `elevGainM` is spread across the segments; each step must clear the 0.3 m
 * noise threshold in elevGain() to be counted, which holds for any realistic
 * gain at the default point count.
 */
export function gpxRun({
  name = "Testilenkki",
  start,
  km,
  minutes,
  hr = null,
  elevGainM = 0,
  pointCount = 11,
} = {}) {
  const segments = pointCount - 1;
  const lat0 = 60.0;
  const lon = 24.9;
  const dLat = km / KM_PER_DEG_LAT / segments;
  const dEle = elevGainM / segments;
  const dTime = (minutes * 60000) / segments;

  const points = Array.from({ length: pointCount }, (_, i) => {
    const lat = (lat0 + i * dLat).toFixed(8);
    const ele = (i * dEle).toFixed(2);
    const time = new Date(start + i * dTime).toISOString();
    const hrTag = hr == null ? "" : `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`;
    return `      <trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele><time>${time}</time>${hrTag}</trkpt>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="treeniloki-test">
  <trk>
    <name>${name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
}

/**
 * Turn GPX documents into the workout objects app/main.mjs builds, using the
 * same parse → summarize → sort pipeline so tests exercise the real path.
 */
export function runsToWorkouts(gpxTexts) {
  return gpxTexts
    .map((text, i) => {
      const parsed = parseGpx(text);
      return parsed ? { id: `run${i}.gpx`, ...parsed, ...summarizeWorkout(parsed.points) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

/**
 * A summarized workout without the GPX round-trip, for analysis tests that
 * care about the numbers rather than about parsing.
 */
export function workout({
  date,
  distanceKm = 10,
  durationMin = 60,
  elevGain = 0,
  avgHr,
  name = "Treeni",
} = {}) {
  const w = { name, date, distanceKm, durationMin, elevGain, paceMinKm: durationMin / distanceKm, points: [] };
  if (avgHr != null) w.avgHr = avgHr;
  return w;
}

/**
 * A steady history: `count` workouts, one every `everyDays` days, ending
 * `endDaysAgo` days before `now`. Handy as a neutral baseline that trips no
 * spike, load or break rule on its own.
 */
export function steadyHistory({
  now,
  count = 8,
  everyDays = 3,
  endDaysAgo = 1,
  distanceKm = 10,
  durationMin = 60,
  avgHr,
} = {}) {
  return Array.from({ length: count }, (_, i) =>
    workout({
      date: daysAgo(endDaysAgo + (count - 1 - i) * everyDays, now),
      distanceKm,
      durationMin,
      avgHr,
    }),
  );
}
