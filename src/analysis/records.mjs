// Ennätykset ja huiput.
//
// Nämä ovat historian luettavin osa: yksittäisiä lukuja joilla on tarina.
// Kaikki johdetaan jo lasketuista treenikohtaisista arvoista, joten mitään
// uutta ei tarvitse jäsentää.

const DAY = 86400000;

/** Maanantaihin ankkuroitu viikkoavain, esim. "2025-W07". */
export function weekKey(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0 = sunnuntai. Siirretään maanantaipohjaiseksi.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function bestBy(workouts, better) {
  let best = null;
  for (const w of workouts) {
    if (best === null || better(w, best)) best = w;
  }
  return best;
}

/** Summat viikoittain, maanantaista. */
function weeklyTotals(workouts) {
  const weeks = new Map();
  for (const w of workouts) {
    const start = weekKey(w.date).getTime();
    const cur = weeks.get(start) || { start, km: 0, count: 0 };
    cur.km += w.distanceKm;
    cur.count++;
    weeks.set(start, cur);
  }
  return [...weeks.values()].sort((a, b) => a.start - b.start);
}

/**
 * Pisin putki peräkkäisiä viikkoja, joilla on vähintään yksi treeni.
 *
 * Viikko eikä päivä: päiväputki rankaisisi lepopäivistä, jotka kuuluvat
 * ohjelmaan. Viikkoputki mittaa sitä mitä oikeasti halutaan — jatkuvuutta.
 */
export function longestWeeklyStreak(workouts) {
  const weeks = weeklyTotals(workouts);
  if (!weeks.length) return null;

  let best = { weeks: 0, from: null, to: null };
  let runStart = weeks[0].start;
  let runLength = 1;

  const remember = (from, to, length) => {
    if (length > best.weeks) best = { weeks: length, from, to };
  };

  for (let i = 1; i < weeks.length; i++) {
    const gap = Math.round((weeks[i].start - weeks[i - 1].start) / (7 * DAY));
    if (gap === 1) {
      runLength++;
    } else {
      remember(runStart, weeks[i - 1].start, runLength);
      runStart = weeks[i].start;
      runLength = 1;
    }
  }
  remember(runStart, weeks[weeks.length - 1].start, runLength);
  return best;
}

/**
 * Kaikki ennätykset kerralla. Kentät ovat null kun historia ei riitä, jotta
 * piirtokerros voi jättää rivin pois eikä joudu näyttämään nollaa totuutena.
 */
export function records(workouts, { minPaceKm = 3 } = {}) {
  if (!workouts.length) {
    return { longest: null, fastest: null, biggestWeek: null, mostRunsWeek: null, streak: null, highestClimb: null };
  }

  const longest = bestBy(workouts, (w, best) => w.distanceKm > best.distanceKm);
  // Tahtiennätys vain riittävän pitkiltä lenkeiltä: 800 metrin kiihdytys
  // voittaisi muuten aina, eikä se kerro juoksukunnosta samaa asiaa.
  const eligible = workouts.filter((w) => w.distanceKm >= minPaceKm && w.paceMinKm > 0);
  const fastest = eligible.length ? bestBy(eligible, (w, best) => w.paceMinKm < best.paceMinKm) : null;
  const highestClimb = bestBy(workouts, (w, best) => w.elevGain > best.elevGain);

  const weeks = weeklyTotals(workouts);
  const biggestWeek = weeks.reduce((max, w) => (!max || w.km > max.km ? w : max), null);
  const mostRunsWeek = weeks.reduce((max, w) => (!max || w.count > max.count ? w : max), null);

  return {
    longest: longest ? { km: longest.distanceKm, date: longest.date, name: longest.name } : null,
    fastest: fastest ? { paceMinKm: fastest.paceMinKm, km: fastest.distanceKm, date: fastest.date, name: fastest.name } : null,
    highestClimb: highestClimb && highestClimb.elevGain > 0
      ? { elev: highestClimb.elevGain, date: highestClimb.date, name: highestClimb.name }
      : null,
    biggestWeek: biggestWeek && biggestWeek.km > 0 ? biggestWeek : null,
    mostRunsWeek,
    streak: longestWeeklyStreak(workouts),
  };
}
