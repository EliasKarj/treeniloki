// Kausikohtaiset yhteenvedot: vuosi ja kuukausi.
//
// Tuhannen treenin historiaa ei selata lenkki kerrallaan. Vuosi- ja
// kuukausirivit ovat se näkymä josta näkee kerralla mihin aika on mennyt —
// ja ne rakentuvat samoista luvuista jotka on jo laskettu treeneittäin.

const KUUKAUDET = [
  "tammi", "helmi", "maalis", "huhti", "touko", "kesä",
  "heinä", "elo", "syys", "loka", "marras", "joulu",
];

/**
 * Ryhmittele treenit avaimen mukaan ja summaa.
 *
 * Tahti lasketaan summista (kokonaisaika ÷ kokonaismatka) eikä yksittäisten
 * tahtien keskiarvona: jälkimmäinen antaisi 2 km:n hölkälle saman painon kuin
 * 30 km:n pitkälle ja vääristäisi kauden todellista vauhtia.
 */
export function groupBy(workouts, keyOf, labelOf) {
  const buckets = new Map();
  for (const w of workouts) {
    const key = keyOf(w);
    let b = buckets.get(key);
    if (!b) {
      b = { key, label: labelOf(w), count: 0, km: 0, minutes: 0, elev: 0, longestKm: 0 };
      buckets.set(key, b);
    }
    b.count++;
    b.km += w.distanceKm;
    b.minutes += w.durationMin;
    b.elev += w.elevGain;
    if (w.distanceKm > b.longestKm) b.longestKm = w.distanceKm;
  }
  return [...buckets.values()]
    .map((b) => ({ ...b, avgPace: b.km > 0 ? b.minutes / b.km : 0 }))
    // Uusin ensin: viimeisin kausi kiinnostaa eniten eikä sitä pidä joutua etsimään.
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

export function byYear(workouts) {
  return groupBy(
    workouts,
    (w) => String(new Date(w.date).getFullYear()),
    (w) => String(new Date(w.date).getFullYear()),
  );
}

export function byMonth(workouts) {
  return groupBy(
    workouts,
    (w) => {
      const d = new Date(w.date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    },
    (w) => {
      const d = new Date(w.date);
      return `${KUUKAUDET[d.getMonth()]} ${d.getFullYear()}`;
    },
  );
}

/** Suurin km-summa kaudella, jotta palkit voi suhteuttaa toisiinsa. */
export function peakKm(periods) {
  return periods.reduce((max, p) => Math.max(max, p.km), 0);
}
