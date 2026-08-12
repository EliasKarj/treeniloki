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

import { mkdir, readdir, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Selainskripti on IIFE joka käynnistyy itse vain kun `window` on olemassa,
// joten sen requiroiminen Nodessa on turvallista ja antaa samat, jo testatut
// haku- ja uudelleenyritysfunktiot.
const { listAllWorkouts, fetchGpx, buildFilename } = require("./sports-tracker-export.js");

const DEFAULT_OUT = "./gpx-export";
const DEFAULT_THROTTLE_MS = 150;

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

  const onDisk = new Set((await readdir(outDir)).filter((f) => f.endsWith(".gpx")));
  const planned = workouts.map((w) => ({ workout: w, name: buildFilename(w) }));
  const todo = force ? planned : planned.filter((p) => !onDisk.has(p.name));

  log.log(`Löytyi ${workouts.length} treeniä. Levyllä jo ${workouts.length - todo.length}, haetaan ${todo.length}.`);

  const summary = {
    total: workouts.length,
    alreadyOnDisk: workouts.length - todo.length,
    downloaded: 0,
    skippedNoTrack: 0,
    failed: [],
    byActivity: {},
  };

  for (let i = 0; i < todo.length; i++) {
    const { workout, name } = todo[i];
    summary.byActivity[workout.activityId] = (summary.byActivity[workout.activityId] || 0) + 1;
    const progress = `${i + 1} / ${todo.length}`;
    try {
      const gpx = await fetchGpx(workout.workoutKey, fetchImpl, headers, sleepImpl);
      if (gpx) {
        await writeAtomic(outDir, name, gpx);
        summary.downloaded++;
        log.log(`${progress}  ${name}`);
      } else {
        summary.skippedNoTrack++;
        log.log(`${progress}  (ohitettu — ei reittiä)`);
      }
    } catch (e) {
      summary.failed.push(workout.workoutKey);
      log.warn(`${progress}  (VIRHE — ohitettu: ${e.message})`);
    }
    await sleepImpl(throttleMs);
  }

  return summary;
}

/** Tulosta loppuyhteenveto ja palauta prosessin paluuarvo. */
export function reportSummary(summary, outDir, log = console) {
  log.log("");
  log.log(`Valmis. ${summary.downloaded} ladattu, ${summary.alreadyOnDisk} oli jo levyllä, ` +
    `${summary.skippedNoTrack} ilman reittiä, ${summary.failed.length} epäonnistui.`);
  log.log(`Kansio: ${outDir}`);
  log.log("Treenit lajeittain (activityId → määrä):", summary.byActivity);

  if (summary.failed.length) {
    log.warn("");
    log.warn(`${summary.failed.length} treeniä epäonnistui toistuvien verkkovirheiden takia.`);
    log.warn("Aja sama komento uudelleen — jo ladatut ohitetaan ja vain nämä yritetään uudelleen.");
    return 1;
  }
  return 0;
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
