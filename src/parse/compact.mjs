// Treenilokin kompakti vientimuoto.
//
// Yksi 10 km:n lenkki sekunnin näytteistyksellä on GPX:nä noin 676 kt. Kaikki
// mitä analyysi siitä tarvitsee mahtuu 0,5 kilotavuun — ero on yli tuhatkertainen,
// ja koko 3436 treenin historia painaa 2,3 gigatavun sijaan noin 1,6 MB.
//
// Se tekee viennistä mahdollisen selaimissa joista puuttuu File System Access
// (Firefox, Safari) ja lataamisesta mahdollisen puhelimeen, koska mitään ei
// tarvitse pitää muistissa pakkaamista varten.
//
// Mitä säilyy: kaikki mitä sovellus näyttää. Matka, kesto, nousu ja tahti ovat
// valmiiksi laskettuja, ja syke tallennetaan **histogrammina** (minuutteja per
// lyöntitaajuus) eikä valmiina alueina — niin sykealueet voidaan laskea uudelleen
// mistä tahansa globaalista maksimista täsmälleen kuten pisteistä.
//
// Mitä ei säily: reittiviiva. Sovellus ei piirrä karttaa, joten mitään näkyvää
// ei katoa, mutta karttaa ei voi jälkikäteen rakentaa tästä datasta. Lisäksi
// johdetut arvot jäätyvät vientihetkeen: jos nousumetrien kynnys joskus muuttuu,
// vanhoja tiedostoja ei voi laskea uudelleen. Siksi tämä on vaihtoehto GPX:lle,
// ei sen korvaaja.

export const COMPACT_VERSION = 1;
const MAGIC = "treeniloki";

/** Minuutteja per kokonaisluku-bpm, laskettuna peräkkäisten pisteiden väleistä. */
export function hrHistogram(points) {
  const hist = {};
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    if (a.hr == null) continue;
    const minutes = (points[i].t - a.t) / 60000;
    if (minutes > 0) hist[a.hr] = (hist[a.hr] || 0) + minutes;
  }
  // Kahden desimaalin tarkkuus riittää: sekunnin näyte on 0,017 min.
  for (const bpm of Object.keys(hist)) hist[bpm] = Math.round(hist[bpm] * 100) / 100;
  return hist;
}

/** Summarisoitu treeni → kompakti tietue. `key` on Sports Trackerin workoutKey, jos tiedossa. */
export function toCompactRecord(workout, key) {
  const rec = {
    d: workout.date,
    n: workout.name,
    km: round(workout.distanceKm, 3),
    min: round(workout.durationMin, 2),
    el: round(workout.elevGain, 1),
  };
  if (key) rec.k = key;
  // Valmis histogrammi ensin: kompaktista luetulla treenillä `points` on tyhjä
  // taulukko, joka on totuusarvoltaan tosi — siitä laskettu histogrammi olisi
  // tyhjä ja syke katoaisi uudelleentallennuksessa.
  const hist = workout.hrHistogram || (workout.points ? hrHistogram(workout.points) : null);
  if (hist && Object.keys(hist).length) rec.hr = hist;
  return rec;
}

/**
 * Poimi Sports Trackerin workoutKey vientinimestä, esim.
 * "2024-01-01_running_abc123.gpx" → "abc123". Palauttaa null muille nimille.
 *
 * Näin GPX:stä ladatut treenit säilyttävät saman tunnisteen kuin kevyestä
 * muodosta luetut, ja kaksoiskappaleiden tunnistus toimii muotojen välillä.
 */
export function keyFromFilename(name) {
  const m = /^\d{4}-\d{2}-\d{2}_[^_]+_(.+)\.gpx$/.exec(String(name || ""));
  return m ? m[1] : null;
}

/**
 * Ladatut treenit → kevyt tiedosto.
 *
 * Toimii riippumatta siitä onko treeni luettu GPX:stä (reittipisteet) vai
 * kevyestä tiedostosta (histogrammi), joten jo kevyen tiedoston voi tallentaa
 * uudelleen ilman että mitään rappeutuu.
 */
export function workoutsToCompactFile(workouts) {
  const records = workouts
    .slice()
    .sort((a, b) => a.date - b.date)
    .map((w) => toCompactRecord(w, w.key || keyFromFilename(w.id)));
  return buildCompactFile(records);
}

/** Kokoa tiedosto tietueista. */
export function buildCompactFile(records) {
  return {
    [MAGIC]: COMPACT_VERSION,
    exported: new Date().toISOString(),
    workouts: records,
  };
}

/** Onko tämä teksti tai olio kompakti tiedosto? Ei heitä koskaan. */
export function isCompact(input) {
  const obj = asObject(input);
  return !!obj && Number.isInteger(obj[MAGIC]) && Array.isArray(obj.workouts);
}

/**
 * Kompakti tiedosto → treeniolioita, samassa muodossa kuin GPX:stä luetut.
 * Palauttaa null jos syöte ei ole kompakti tiedosto tai versio on tulevaisuudesta.
 *
 * Kelvottomat tietueet pudotetaan yksitellen samasta syystä kuin GPX-jäsennin
 * pudottaa kelvottomat pisteet: yksi NaN leviäisi koko koontinäyttöön.
 */
export function parseCompact(input) {
  const obj = asObject(input);
  if (!isCompact(obj)) return null;
  if (obj[MAGIC] > COMPACT_VERSION) return null; // uudempi kuin osaamme lukea

  const out = [];
  for (const rec of obj.workouts) {
    if (!rec || typeof rec !== "object") continue;
    const date = Number(rec.d);
    const distanceKm = Number(rec.km);
    const durationMin = Number(rec.min);
    if (!Number.isFinite(date) || !Number.isFinite(distanceKm) || !Number.isFinite(durationMin)) continue;
    if (distanceKm < 0 || durationMin < 0) continue;

    const elevGain = Number.isFinite(Number(rec.el)) ? Number(rec.el) : 0;
    const hist = sanitizeHistogram(rec.hr);

    const workout = {
      id: rec.k || `${date}`,
      key: rec.k,
      name: typeof rec.n === "string" && rec.n ? rec.n : "Treeni",
      date,
      distanceKm,
      durationMin,
      elevGain,
      paceMinKm: distanceKm > 0 ? durationMin / distanceKm : 0,
      // Reittipisteitä ei ole. Tyhjä taulukko pitää pistelaskennan turvallisena;
      // sykealueet lukevat histogrammia.
      points: [],
    };
    if (hist) {
      workout.hrHistogram = hist;
      const stats = histogramStats(hist);
      workout.avgHr = stats.avg;
      workout.maxHr = stats.max;
    }
    out.push(workout);
  }
  out.sort((a, b) => a.date - b.date);
  return out;
}

/** Keskiarvo ja maksimi histogrammista. Keskiarvo on ajalla painotettu. */
export function histogramStats(hist) {
  let weighted = 0, minutes = 0, max = null;
  for (const [bpmRaw, minRaw] of Object.entries(hist)) {
    const bpm = Number(bpmRaw), m = Number(minRaw);
    weighted += bpm * m;
    minutes += m;
    if (max === null || bpm > max) max = bpm;
  }
  return { avg: minutes > 0 ? Math.round(weighted / minutes) : null, max, minutes };
}

function sanitizeHistogram(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  let any = false;
  for (const [bpmRaw, minRaw] of Object.entries(raw)) {
    const bpm = Number(bpmRaw), minutes = Number(minRaw);
    // Samat rajat kuin GPX-jäsentimessä: yksi absurdi lukema siirtäisi kaikki
    // sykealueet, koska ne johdetaan historian korkeimmasta havainnosta.
    if (!Number.isInteger(bpm) || bpm < 25 || bpm > 240) continue;
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    out[bpm] = minutes;
    any = true;
  }
  return any ? out : null;
}

function asObject(input) {
  if (input && typeof input === "object") return input;
  if (typeof input !== "string") return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

const round = (value, decimals) => {
  const f = 10 ** decimals;
  return Number.isFinite(value) ? Math.round(value * f) / f : 0;
};
