// Lajikohtainen erittely.
//
// Sports Tracker antaa jokaiselle treenille activityId-numeron, ja vienti
// kirjoittaa sen tiedostonimeen (`2024-01-01_running_abc.gpx`). Nimet alla ovat
// yhteisön purkamasta listasta, ei virallisesta dokumentaatiosta — mutta kaksi
// riippumatonta toteutusta antavat saman järjestyksen (0 kävely, 1 juoksu,
// 2 pyöräily, 11 vaellus, 13 laskettelu), ja indeksi 1 = juoksu täsmää siihen
// mikä tästä projektista oli jo varmistettu. Väärä nimi näkyisi omalla sivulla
// heti: "Salitreeni, 600 km" ei mene ohi.
//
// Numero näytetään nimen rinnalla juuri siksi, että virheen voi huomata.
//
// Tunnisteet eivät ole numeroita vaan vientinimen kenttiä: juoksu on "running"
// ja kaikki muut "act<numero>". Tämä on tahallista — tools/core.js pitää
// tiedostonimet ennallaan, koska jatkoajo tunnistaa jo haetut treenit juuri
// nimestä. Nimien lisääminen sinne uudelleennimeäisi koko arkiston ja pakottaisi
// lataamaan kaiken uudestaan.
//
// Erittely on tarpeen muustakin kuin uteliaisuudesta: lähes kaikki tämän sivun
// laskennat ovat juoksun mittoja. Tahti, VO₂max ja 80/20 eivät tarkoita samaa
// pyöräilyssä, joten kaiken laskeminen yhteen antaisi lukuja jotka näyttävät
// oikeilta mutta eivät mittaa mitään.

const RUNNING = "running";

/** activityId → suomenkielinen nimi. Puuttuva numero näkyy muodossa "Laji N". */
export const ACTIVITY_FI = {
  0: "Kävely", 1: "Juoksu", 2: "Pyöräily", 3: "Hiihto",
  10: "Maastopyöräily", 11: "Vaellus", 12: "Rullaluistelu", 13: "Laskettelu",
  14: "Melonta", 15: "Soutu", 16: "Golf", 17: "Sisäharjoittelu", 18: "Parkour",
  19: "Pallopelit", 20: "Ulkokuntoilu", 21: "Uinti (allas)", 22: "Polkujuoksu",
  23: "Salitreeni", 24: "Sauvakävely", 25: "Ratsastus", 26: "Moottoriurheilu",
  27: "Rullalautailu", 28: "Vesiurheilu", 29: "Kiipeily", 30: "Lumilautailu",
  31: "Retkihiihto", 32: "Ryhmäliikunta", 33: "Jalkapallo", 34: "Tennis",
  35: "Koripallo", 36: "Sulkapallo", 37: "Baseball", 38: "Lentopallo",
  39: "Amerikkalainen jalkapallo", 40: "Pöytätennis", 41: "Racquetball",
  42: "Squash", 43: "Salibandy", 44: "Käsipallo", 45: "Softball", 46: "Keilailu",
  47: "Kriketti", 48: "Rugby", 49: "Luistelu", 50: "Jääkiekko", 51: "Jooga",
  52: "Sisäpyöräily", 53: "Juoksumatto", 54: "Crossfit", 55: "Crosstrainer",
  56: "Rullahiihto", 57: "Soutulaite", 58: "Venyttely", 59: "Yleisurheilu",
  60: "Suunnistus", 61: "SUP-lautailu", 62: "Kamppailulajit", 63: "Kahvakuula",
  64: "Tanssi", 65: "Lumikenkäily", 66: "Frisbee", 67: "Futsal", 68: "Monilaji",
  69: "Aerobic", 70: "Retkeily", 71: "Purjehdus", 72: "Kajakkimelonta",
  73: "Kiertoharjoittelu", 74: "Triathlon", 75: "Padel", 76: "Cheerleading",
  77: "Nyrkkeily", 78: "Laitesukellus", 79: "Vapaasukellus",
  80: "Seikkailu-urheilu", 81: "Voimistelu", 82: "Kanoottimelonta",
  83: "Vuorikiipeily", 84: "Telemark", 85: "Avovesiuinti", 86: "Purjelautailu",
  87: "Leijalautailu", 88: "Varjoliito", 90: "Snorklaus", 91: "Surffaus",
  92: "Swimrun", 93: "Duathlon", 94: "Aquathlon", 95: "Estejuoksu",
  96: "Kalastus", 97: "Metsästys", 99: "Gravel-pyöräily",
};

/** Vientinimen lajikenttä → activityId, tai null. */
export function activityId(sport) {
  if (sport === RUNNING) return 1;
  const m = /^act(\d+)$/.exec(String(sport || ""));
  return m ? Number(m[1]) : null;
}

/** Ihmisluettava nimi lajitunnisteelle. */
export function sportLabel(sport) {
  if (!sport) return "Tuntematon";
  const id = activityId(sport);
  if (id !== null) return ACTIVITY_FI[id] || `Laji ${id}`;
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
    const g = groups.get(key) || {
      sport, label: sportLabel(sport), id: activityId(sport),
      count: 0, km: 0, minutes: 0, elev: 0,
    };
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
