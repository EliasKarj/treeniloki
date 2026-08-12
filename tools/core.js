// Sports Tracker -viennin jaettu ydin.
//
// Tämä tiedosto ei tee mitään itsestään eikä koske DOMiin. Sen päälle on kolme
// ohutta käynnistyskohtaa, jotka kaikki käyttävät samaa haku- ja
// uudelleenyrityslogiikkaa:
//
//   tools/export-overlay.js  selaimen kirjanmerkkipainike (käyttöliittymä)
//   tools/export-cli.mjs     Node-komentorivi
//   export.html              rakentaa kirjanmerkin näistä kahdesta tiedostosta
//
// Node saa tämän `require`-kutsulla, selain globaalina `TreenilokiCore`.
(function (root) {
  "use strict";

  var API = "https://api.sports-tracker.com/apiserver/v1";
  var PAGE_LIMIT = 50;
  var THROTTLE_MS = 150;
  var MAX_RETRIES = 3;
  var RETRY_BASE_MS = 300;

  // Sports Trackerin activityId → lajin nimi. Vain 1 on varmistettu; täydennä
  // omilla id:illäsi (ajon yhteenveto tulostaa löydetyt). Tuntematon → "act<id>",
  // joten laji ei katoa vaikka nimeä ei olisi.
  var ACTIVITY_NAMES = { 1: "running" };

  var sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  function activityName(activityId) {
    return ACTIVITY_NAMES[activityId] || "act" + activityId;
  }

  function formatDate(msEpoch) {
    var d = new Date(msEpoch);
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function buildFilename(workout) {
    return formatDate(workout.startTime) + "_" + activityName(workout.activityId) + "_" + workout.workoutKey + ".gpx";
  }

  function authHeaders(store) {
    if (store === undefined) store = typeof localStorage !== "undefined" ? localStorage : null;
    var key = store && store.getItem("sessionkey");
    if (!key) throw new Error("Ei sessionkeytä — kirjaudu sisään sports-tracker.comiin ja aja uudelleen.");
    return { STTAuthorization: key };
  }

  async function listAllWorkouts(fetchImpl, headers) {
    var all = [];
    for (var offset = 0; ; offset += PAGE_LIMIT) {
      var res = await fetchImpl(API + "/workouts?sortonst=true&limit=" + PAGE_LIMIT + "&offset=" + offset, {
        headers: headers, credentials: "include",
      });
      if (!res.ok) throw new Error("Workout-listaus epäonnistui (HTTP " + res.status + ").");
      var json = await res.json();
      var page = (json && json.payload) || [];
      all.push.apply(all, page);
      if (page.length < PAGE_LIMIT) break;
    }
    return all;
  }

  /**
   * Hae yhden treenin GPX. Palauttaa aina objektin:
   *
   *   { gpx: "<gpx…>", reason: "ok" }              reitti löytyi
   *   { gpx: null, reason: "notrack" }             200, mutta ei trackpointeja
   *   { gpx: null, reason: "http", status: 403 }   palvelin kielsi tai ei löytänyt
   *
   * Nämä kaksi viimeistä on pidettävä erillään. "notrack" on pysyvä tosiasia
   * treenistä (sisäjuoksu, käsin lisätty) ja sen saa muistaa. HTTP-virhe ei ole:
   * vanhentunut sessio palauttaa 401/403 jokaiselle treenille, ja jos ne
   * kirjattaisiin pysyvästi ohitettaviksi, koko loppuhistoria katoaisi hiljaa.
   *
   * Uudelleenyritys koskee vain heitettyä verkkovirhettä (katkennut yhteys,
   * lepotila). Siisti ei-ok-vastaus on palvelimen todellinen vastaus, joten sen
   * toistaminen tuottaisi saman tuloksen.
   */
  async function fetchGpx(workoutKey, fetchImpl, headers, sleepImpl) {
    if (!sleepImpl) sleepImpl = sleep;
    for (var attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      var res;
      try {
        res = await fetchImpl(API + "/workout/exportGpx/" + workoutKey, { headers: headers, credentials: "include" });
      } catch (e) {
        if (attempt === MAX_RETRIES) {
          throw new Error("GPX-haku epäonnistui treenille " + workoutKey + " " + MAX_RETRIES + " yrityksen jälkeen: " + e.message);
        }
        await sleepImpl(RETRY_BASE_MS * Math.pow(2, attempt - 1));
        continue;
      }
      if (!res.ok) return { gpx: null, reason: "http", status: res.status };
      var text = await res.text();
      return text.indexOf("<trkpt") !== -1
        ? { gpx: text, reason: "ok" }
        : { gpx: null, reason: "notrack" };
    }
  }

  /**
   * Hae GPX jokaiselle treenille kohdasta `startFrom` eteenpäin.
   *
   * Yksi epäonnistunut treeni ei koskaan lopeta ajoa — se päätyy `failedKeys`iin
   * ja silmukka jatkaa. Tämä on se kohta joka aiemmin kaatoi koko viennin
   * yhdestä katkenneesta yhteydestä.
   *
   * `onFile`-takaisinkutsu kirjoittaa tuloksen heti (levylle tai kansiokahvaan),
   * jolloin muistinkulutus ei riipu treenien määrästä. Ilman sitä tiedostot
   * kerätään muistiin zip-pakkausta varten — vanha tapa, joka on yhä käytössä
   * selaimissa joista puuttuu File System Access API.
   */
  async function downloadAll(workouts, fetchImpl, headers, opts) {
    opts = opts || {};
    var startFrom = opts.startFrom || 0;
    var sleepImpl = opts.sleepImpl || sleep;
    var throttleMs = opts.throttleMs === undefined ? THROTTLE_MS : opts.throttleMs;
    var log = opts.log || console;
    var onFile = opts.onFile || null;
    var shouldSkip = opts.shouldSkip || null;
    var onProgress = opts.onProgress || null;
    var isCancelled = opts.isCancelled || null;
    var onNoTrack = opts.onNoTrack || null;

    var files = [];
    var byActivity = {};
    var failedKeys = [];
    var skipped = 0;
    var skippedExisting = 0;
    var downloaded = 0;
    var httpSkipped = 0;
    var httpStatuses = {};
    var cancelled = false;

    for (var i = startFrom; i < workouts.length; i++) {
      if (isCancelled && isCancelled()) { cancelled = true; break; }

      var w = workouts[i];
      var name = buildFilename(w);
      byActivity[w.activityId] = (byActivity[w.activityId] || 0) + 1;

      if (shouldSkip && shouldSkip(name, w)) {
        skippedExisting++;
        if (onProgress) onProgress({ index: i, total: workouts.length, name: name, state: "existing" });
        continue; // ei verkkopyyntöä → ei myöskään tahdistusta
      }

      var state;
      try {
        var res = await fetchGpx(w.workoutKey, fetchImpl, headers, sleepImpl);
        if (res.reason === "ok") {
          if (onFile) await onFile(name, res.gpx, w);
          else files.push({ name: name, gpx: res.gpx });
          downloaded++;
          state = "saved";
          log.log(i + 1 + " / " + workouts.length + "  " + name);
        } else if (res.reason === "notrack") {
          skipped++;
          state = "notrack";
          // Pysyvä tosiasia treenistä: siitä ei synny tiedostoa, joten ilman
          // muistiinpanoa jatkoajo hakisi sen aina uudelleen. Kutsuja kirjaa
          // avaimen kohdekansioon, jolloin tieto karttuu ajojen välillä.
          if (onNoTrack) await onNoTrack(w, name);
          log.log(i + 1 + " / " + workouts.length + "  (ohitettu — ei reittiä)");
        } else {
          // HTTP-virhettä ei muisteta: se voi johtua vanhentuneesta sessiosta,
          // ja seuraavan ajon kuuluu yrittää uudelleen.
          httpSkipped++;
          httpStatuses[res.status] = (httpStatuses[res.status] || 0) + 1;
          state = "http";
          log.warn(i + 1 + " / " + workouts.length + "  (ohitettu — HTTP " + res.status + ")");
        }
      } catch (e) {
        failedKeys.push(w.workoutKey);
        state = "failed";
        log.warn(i + 1 + " / " + workouts.length + "  (VIRHE — ohitettu: " + e.message + ")");
      }
      if (onProgress) onProgress({ index: i, total: workouts.length, name: name, state: state });
      await sleepImpl(throttleMs);
    }

    return {
      files: files, byActivity: byActivity, failedKeys: failedKeys,
      skipped: skipped, skippedExisting: skippedExisting, downloaded: downloaded,
      httpSkipped: httpSkipped, httpStatuses: httpStatuses,
      cancelled: cancelled,
    };
  }

  /** Mistä jatketaan, luettuna window-lipusta. Ei koskaan negatiivinen. */
  function resumeOffset(win) {
    return Math.max(0, Math.trunc(Number(win && win.TREENI_RESUME_FROM)) || 0);
  }

  // ---- Muistilista reidittömistä treeneistä ----
  //
  // Reidittömästä treenistä (sisäjuoksu, käsin lisätty) ei synny GPX-tiedostoa,
  // joten kansion sisältö ei kerro että se on jo tarkistettu. Ilman tätä listaa
  // jokainen jatkoajo hakisi ne uudelleen. Määrä on käyttäjäkohtainen, joten
  // lista karttuu ajon aikana kohdekansioon — sitä ei voi tietää etukäteen.
  //
  // Muoto määritellään tässä, jotta selain ja komentorivi lukevat samaa
  // tiedostoa; itse tallennus kuuluu kutsujalle.

  var NO_TRACK_FILE = ".treeniloki-ei-reittia.txt";

  var NO_TRACK_HEADER = [
    "# Treeniloki: treenit joilla ei ole GPS-reittiä (sisäjuoksut, käsin lisätyt).",
    "# Nämä ohitetaan seuraavilla ajoilla, jottei niitä haettaisi turhaan uudelleen.",
    "# Voit poistaa tämän tiedoston jos haluat tarkistaa ne uudelleen.",
  ];

  /** Rivipohjainen jäsennys: kommentit ja tyhjät rivit ohitetaan. */
  function parseNoTrack(text) {
    var out = new Set();
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var k = line.trim();
      if (k && k.charAt(0) !== "#") out.add(k);
    });
    return out;
  }

  /** Sarjoita joukko tiedostoksi. Järjestetty, jotta diffit pysyvät luettavina. */
  function serializeNoTrack(keys) {
    return NO_TRACK_HEADER.concat([...keys].sort(), [""]).join("\n");
  }

  var core = {
    API: API,
    PAGE_LIMIT: PAGE_LIMIT,
    THROTTLE_MS: THROTTLE_MS,
    MAX_RETRIES: MAX_RETRIES,
    ACTIVITY_NAMES: ACTIVITY_NAMES,
    sleep: sleep,
    activityName: activityName,
    formatDate: formatDate,
    buildFilename: buildFilename,
    authHeaders: authHeaders,
    listAllWorkouts: listAllWorkouts,
    fetchGpx: fetchGpx,
    downloadAll: downloadAll,
    resumeOffset: resumeOffset,
    NO_TRACK_FILE: NO_TRACK_FILE,
    parseNoTrack: parseNoTrack,
    serializeNoTrack: serializeNoTrack,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = core;
  else root.TreenilokiCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this);
