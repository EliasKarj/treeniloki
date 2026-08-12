#!/usr/bin/env node
// Sports Tracker → GPX export, Node-versio.
//
// Miksi tämä on olemassa selainskriptin rinnalla: konsoliversio kerää kaikki
// GPX:t muistiin ennen kuin pakkaa ne zipiksi, joten muistinkulutus kasvaa
// koko ajon ajan — tuhannella treenillä satoja megatavuja. Lisäksi selain
// kuristaa taustavälilehden ajastimet ja voi jäädyttää välilehden kokonaan.
//
// Tämä versio kirjoittaa jokaisen tiedoston levylle heti, joten muistinkulutus
// pysyy yhden tiedoston kokoisena riippumatta historian pituudesta, eikä
// mikään kuristus koske sitä. Keskeytynyt ajo jatkuu ajamalla sama komento
// uudelleen: levyllä jo olevat treenit ohitetaan.
//
// Käyttö:
//   ST_SESSION_KEY=<avain> node tools/export-cli.mjs
//   node tools/export-cli.mjs --key <avain> --out ./gpx
//
// Avaimen saa selaimesta: kirjaudu sports-tracker.comiin, avaa konsoli ja aja
//   localStorage.getItem("sessionkey")

import { mkdir, readdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Jaettu ydin: samat haku- ja uudelleenyritysfunktiot joita selaimen
// kirjanmerkkipainike käyttää. Ydin ei käynnistä mitään itsestään.
const {
  listAllWorkouts, downloadAll, buildFilename, NO_TRACK_FILE, parseNoTrack, serializeNoTrack,
} = require("./core.js");

const DEFAULT_OUT = "./gpx-export";
const DEFAULT_THROTTLE_MS = 150;

/**
 * Muistilista reidittömistä treeneistä. Muoto tulee ytimestä, jotta selaimen
 * kirjanmerkki ja tämä komentorivi lukevat samaa tiedostoa samasta kansiosta.
 */
export { NO_TRACK_FILE };

/** Lue tunnetut reidittömät avaimet. Puuttuva tai rikkinäinen tiedosto = tyhjä joukko. */
export async function readNoTrack(dir) {
  try {
    return parseNoTrack(await readFile(join(dir, NO_TRACK_FILE), "utf8"));
  } catch {
    return new Set();
  }
}

/** Kirjoita joukko levylle. Kutsutaan jokaisen löydön jälkeen, jotta keskeytys ei hukkaa tietoa. */
export async function writeNoTrack(dir, keys) {
  await writeFile(join(dir, NO_TRACK_FILE), serializeNoTrack(keys), "utf8");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const USAGE = `Sports Tracker → GPX export

  ST_SESSION_KEY=<avain> node tools/export-cli.mjs [valitsimet]

Valitsimet:
  --key <avain>     Sessiotunniste (tai ympäristömuuttuja ST_SESSION_KEY)
  --out <kansio>    Kohdekansio (oletus ${DEFAULT_OUT})
  --throttle <ms>   Odotus hakujen välissä (oletus ${DEFAULT_THROTTLE_MS})
  --limit <n>       Hae enintään n treeniä (kokeiluun)
  --force           Lataa uudelleen myös jo levyllä olevat
  --help            Näytä tämä ohje

Avaimen saa selaimen konsolista sports-tracker.comissa:
  localStorage.getItem("sessionkey")

Keskeytynyt ajo jatkuu ajamalla sama komento uudelleen.`;

/** Parse argv (ilman node- ja skriptipolkua) valitsimiksi. Heittää virheen tuntemattomasta. */
export function parseArgs(argv, env = {}) {
  const opts = {
    key: env.ST_SESSION_KEY || "",
    outDir: DEFAULT_OUT,
    throttleMs: DEFAULT_THROTTLE_MS,
    limit: 0,
    force: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Valitsin ${arg} vaatii arvon.`);
      return v;
    };
    switch (arg) {
      case "--key": opts.key = value(); break;
      case "--out": opts.outDir = value(); break;
      case "--throttle": opts.throttleMs = numeric(value(), "--throttle"); break;
      case "--limit": opts.limit = numeric(value(), "--limit"); break;
      case "--force": opts.force = true; break;
      case "--help": case "-h": opts.help = true; break;
      default: throw new Error(`Tuntematon valitsin: ${arg}`);
    }
  }
  return opts;
}

function numeric(raw, name) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} vaatii ei-negatiivisen luvun, sai "${raw}".`);
  return Math.trunc(n);
}

/**
 * Kirjoita tiedosto atomisesti: ensin .part-tiedostoon, sitten nimeä uudelleen.
 *
 * Tämä on olennaista juuri epävakaalla koneella. Jos prosessi kuolee kesken
 * kirjoituksen, kohdenimeä ei ole vielä olemassa, joten seuraava ajo hakee
 * treenin uudelleen sen sijaan että ohittaisi katkenneen tiedoston valmiina.
 */
async function writeAtomic(dir, name, contents) {
  const tmp = join(dir, `${name}.part`);
  try {
    await writeFile(tmp, contents, "utf8");
    await rename(tmp, join(dir, name));
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}

/**
 * Hae koko historia levylle. Palauttaa yhteenvedon; ei kerää GPX-sisältöä
 * muistiin, joten muistinkulutus ei riipu treenien määrästä.
 */
export async function exportAll({
  key,
  outDir = DEFAULT_OUT,
  throttleMs = DEFAULT_THROTTLE_MS,
  limit = 0,
  force = false,
  fetchImpl = fetch,
  sleepImpl = sleep,
  log = console,
} = {}) {
  if (!key) throw new Error("Sessiotunniste puuttuu — anna --key tai aseta ST_SESSION_KEY.");
  const headers = { STTAuthorization: key };

  await mkdir(outDir, { recursive: true });

  log.log("Haetaan treenilista…");
  let workouts = await listAllWorkouts(fetchImpl, headers);
  if (limit > 0) workouts = workouts.slice(0, limit);

  // Jatkaminen on pelkkä hakemistolistaus: valmis tiedosto tarkoittaa valmista
  // treeniä. `.part`-tiedostot jäävät ulkopuolelle, joten kesken katkennut
  // kirjoitus haetaan uudelleen.
  const onDisk = new Set((await readdir(outDir)).filter((f) => f.endsWith(".gpx")));
  const noTrack = force ? new Set() : await readNoTrack(outDir);

  const alreadyOnDisk = force ? 0 : workouts.filter((w) => onDisk.has(buildFilename(w))).length;
  const alreadyNoTrack = force ? 0 : workouts.filter((w) => noTrack.has(w.workoutKey)).length;
  const skipping = alreadyOnDisk + alreadyNoTrack;

  log.log(`Löytyi ${workouts.length} treeniä. Levyllä jo ${alreadyOnDisk}` +
    (alreadyNoTrack ? `, ${alreadyNoTrack} tiedetään reidittömiksi` : "") +
    `, haetaan ${workouts.length - skipping}.`);

  const result = await downloadAll(workouts, fetchImpl, headers, {
    throttleMs,
    sleepImpl,
    log,
    shouldSkip: force ? null : (name, w) => onDisk.has(name) || noTrack.has(w.workoutKey),
    onFile: (name, gpx) => writeAtomic(outDir, name, gpx),
    onNoTrack: async (w) => {
      noTrack.add(w.workoutKey);
      await writeNoTrack(outDir, noTrack);
    },
  });

  return {
    total: workouts.length,
    alreadyOnDisk,
    alreadyNoTrack,
    downloaded: result.downloaded,
    skippedNoTrack: result.skipped,
    httpSkipped: result.httpSkipped,
    httpStatuses: result.httpStatuses,
    failed: result.failedKeys,
    byActivity: result.byActivity,
  };
}

/** Tulosta loppuyhteenveto ja palauta prosessin paluuarvo. */
export function reportSummary(summary, outDir, log = console) {
  log.log("");
  log.log(`Valmis. ${summary.downloaded} ladattu, ${summary.alreadyOnDisk} oli jo levyllä, ` +
    `${summary.skippedNoTrack} ilman reittiä` +
    (summary.alreadyNoTrack ? ` (+${summary.alreadyNoTrack} tiedettiin jo)` : "") +
    `, ${summary.failed.length} epäonnistui.`);
  log.log(`Kansio: ${outDir}`);
  log.log("Treenit lajeittain (activityId → määrä):", summary.byActivity);

  const http = summary.httpSkipped || 0;
  if (http) {
    const statuses = Object.entries(summary.httpStatuses || {})
      .map(([code, n]) => `${code} × ${n}`).join(", ");
    log.warn("");
    log.warn(`${http} treeniä palautti HTTP-virheen (${statuses}). Näitä ei merkitty pysyvästi`);
    log.warn("ohitettaviksi, joten uusi ajo yrittää ne uudelleen.");
    // Iso määrä 401/403 tarkoittaa käytännössä aina vanhentunutta sessiota.
    if (summary.httpStatuses?.[401] || summary.httpStatuses?.[403]) {
      log.warn("HTTP 401/403 viittaa vanhentuneeseen sessiotunnisteeseen — hae uusi ja aja uudelleen.");
    }
  }

  if (summary.failed.length) {
    log.warn("");
    log.warn(`${summary.failed.length} treeniä epäonnistui toistuvien verkkovirheiden takia.`);
    log.warn("Aja sama komento uudelleen — jo ladatut ohitetaan ja vain nämä yritetään uudelleen.");
    return 1;
  }
  return http ? 1 : 0;
}

/** Suoraan ajettaessa: lue argumentit, aja, tulosta yhteenveto. */
async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2), process.env);
  } catch (e) {
    console.error(e.message);
    console.error("\n" + USAGE);
    process.exitCode = 2;
    return;
  }

  if (opts.help) {
    console.log(USAGE);
    return;
  }

  try {
    const summary = await exportAll(opts);
    process.exitCode = reportSummary(summary, opts.outDir);
  } catch (e) {
    console.error(`\nAjo keskeytyi: ${e.message}`);
    console.error("Jo ladatut tiedostot ovat tallessa — sama komento uudelleen jatkaa siitä mihin jäi.");
    process.exitCode = 1;
  }
}

// Aja vain kun tiedosto käynnistetään suoraan, ei kun testit importtaavat sen.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
