const Z = [0.60, 0.70, 0.80, 0.90];

/**
 * Sykeaika treenistä muodossa [[bpm, minuuttia], …].
 *
 * Treeni voi kantaa sykkeen kahdessa muodossa: GPX:stä luettuna reittipisteinä,
 * tai kompaktista tiedostosta luettuna valmiina histogrammina. Molemmat kuvataan
 * tähän samaan muotoon, jotta aluelaskenta ei tarvitse tietää kummasta on kyse.
 *
 * Juuri siksi kompakti muoto tallentaa histogrammin eikä valmiita alueita:
 * alueet riippuvat koko historian korkeimmasta sykkeestä, joka ei ole tiedossa
 * yhtä treeniä vietäessä.
 */
function hrSegments(workout) {
  if (workout.hrHistogram) {
    return Object.entries(workout.hrHistogram).map(([bpm, minutes]) => [Number(bpm), Number(minutes)]);
  }
  const points = workout.points || [];
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    if (a.hr == null) continue;
    const minutes = (points[i].t - a.t) / 60000;
    if (minutes > 0) out.push([a.hr, minutes]);
  }
  return out;
}

/** Highest HR observed across all workouts, or null when none carries HR. */
export function maxHrObserved(workouts) {
  let max = null;
  for (const w of workouts) {
    if (w.hrHistogram) {
      for (const bpm of Object.keys(w.hrHistogram)) {
        const hr = Number(bpm);
        if (max === null || hr > max) max = hr;
      }
      continue;
    }
    for (const p of w.points || []) {
      if (p.hr != null && (max === null || p.hr > max)) max = p.hr;
    }
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
    for (const [hr, minutes] of hrSegments(w)) {
      const z = zoneOf(hr, maxHr);
      if (z) zoneMinutes[z - 1] += minutes;
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
