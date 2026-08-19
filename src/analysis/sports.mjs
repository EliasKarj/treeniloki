// Lajikohtainen erittely.
//
// Sports Tracker antaa jokaiselle treenille activityId:n, ja vienti kirjoittaa
// sen tiedostonimeen (`2024-01-01_running_abc.gpx`). Vain juoksu on varmistettu
// tunniste — muut tulevat muodossa `act14`, koska nimen arvaaminen väärin olisi
// pahempi kuin numeron näyttäminen.
//
// Erittely on tarpeen muustakin kuin uteliaisuudesta: lähes kaikki tämän sivun
// laskennat ovat juoksun mittoja. Tahti, VO₂max ja 80/20 eivät tarkoita samaa
// pyöräilyssä, joten kaiken laskeminen yhteen antaisi lukuja jotka näyttävät
// oikeilta mutta eivät mittaa mitään.

const RUNNING = "running";

// Vain se mikä tiedetään. Tuntematon activityId näkyy numerona, ja sen voi
// nimetä tools/core.js:n ACTIVITY_NAMES-taulukossa.
const LABELS = { running: "Juoksu" };

/** Ihmisluettava nimi lajitunnisteelle. */
export function sportLabel(sport) {
  if (!sport) return "Tuntematon";
  if (LABELS[sport]) return LABELS[sport];
  const numbered = /^act(\d+)$/.exec(sport);
  if (numbered) return `Laji ${numbered[1]}`;
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

/** Onko tämä laji se, jota sivun laskennat oikeasti mittaavat? */
export function isRunning(sport) {
  return sport === RUNNING;
}

/**
 * Treenit lajeittain, suurin kokonaismatka ensin.
 *
 * Tahti lasketaan kokonaisajasta ja -matkasta samasta syystä kuin kausissa:
 * yksittäisten tahtien keskiarvo antaisi lyhyelle vedolle saman painon kuin
 * pitkälle lenkille.
 */
export function bySport(workouts) {
  const groups = new Map();
  for (const w of workouts) {
    const sport = w.sport || null;
    const key = sport || "";
    const g = groups.get(key) || { sport, label: sportLabel(sport), count: 0, km: 0, minutes: 0, elev: 0 };
    g.count++;
    g.km += w.distanceKm || 0;
    g.minutes += w.durationMin || 0;
    g.elev += w.elevGain || 0;
    groups.set(key, g);
  }

  const totalKm = [...groups.values()].reduce((s, g) => s + g.km, 0);
  return [...groups.values()]
    .map((g) => ({
      ...g,
      avgPace: g.km > 0 ? g.minutes / g.km : 0,
      share: totalKm > 0 ? (g.km / totalKm) * 100 : 0,
    }))
    .sort((a, b) => b.km - a.km || b.count - a.count);
}

/**
 * Lajit valikkoa varten. Palauttaa tyhjän taulukon kun lajeja on vain yksi:
 * valikko yhdellä vaihtoehdolla on pelkkää melua.
 */
export function sportOptions(workouts) {
  const groups = bySport(workouts);
  if (groups.length < 2) return [];
  return groups.map((g) => ({ sport: g.sport, label: g.label, count: g.count }));
}

/** Vain valitun lajin treenit. `null` tarkoittaa kaikkia. */
export function filterBySport(workouts, sport) {
  if (!sport) return workouts;
  return workouts.filter((w) => (w.sport || null) === sport);
}
