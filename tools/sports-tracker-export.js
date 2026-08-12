// Sports Tracker → GPX export.
// Paste this whole file into the DevTools Console at https://www.sports-tracker.com
// while logged in. It downloads your entire workout history as GPX files in one .zip.
(function () {
  const API = "https://api.sports-tracker.com/apiserver/v1";
  const PAGE_LIMIT = 50;
  const THROTTLE_MS = 150;
  const MAX_RETRIES = 3;
  const RETRY_BASE_MS = 300;
  const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  // Sports Tracker activityId → sport name. Only id 1 is verified; extend as you learn
  // your own ids (the run summary prints which activityIds were found). Unknown → "act<id>",
  // so the sport is never lost even without a friendly name.
  const ACTIVITY_NAMES = { 1: "running" };

  function activityName(activityId) {
    return ACTIVITY_NAMES[activityId] || `act${activityId}`;
  }

  function formatDate(msEpoch) {
    const d = new Date(msEpoch);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function buildFilename(workout) {
    return `${formatDate(workout.startTime)}_${activityName(workout.activityId)}_${workout.workoutKey}.gpx`;
  }

  async function listAllWorkouts(fetchImpl, headers) {
    const all = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const res = await fetchImpl(`${API}/workouts?sortonst=true&limit=${PAGE_LIMIT}&offset=${offset}`, { headers, credentials: "include" });
      if (!res.ok) throw new Error(`Workout-listaus epäonnistui (HTTP ${res.status}).`);
      const json = await res.json();
      const page = (json && json.payload) || [];
      all.push(...page);
      if (page.length < PAGE_LIMIT) break;
    }
    return all;
  }

  // Retries only on thrown network errors (dropped connection, sleep/wake, etc.) —
  // a clean non-ok response (404/403/…) is a real answer, not a transient failure,
  // so it still returns null immediately without retrying.
  async function fetchGpx(workoutKey, fetchImpl, headers, sleepImpl = sleep) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let res;
      try {
        res = await fetchImpl(`${API}/workout/exportGpx/${workoutKey}`, { headers, credentials: "include" });
      } catch (e) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`GPX-haku epäonnistui treenille ${workoutKey} ${MAX_RETRIES} yrityksen jälkeen: ${e.message}`);
        }
        await sleepImpl(RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }
      if (!res.ok) return null;
      const text = await res.text();
      return text.includes("<trkpt") ? text : null;
    }
  }

  function authHeaders(store = typeof localStorage !== "undefined" ? localStorage : null) {
    const key = store && store.getItem("sessionkey");
    if (!key) throw new Error("Ei sessionkeytä — kirjaudu sisään sports-tracker.comiin ja aja uudelleen.");
    return { STTAuthorization: key };
  }

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = JSZIP_CDN;
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => reject(new Error("JSZip-lataus epäonnistui"));
      document.head.appendChild(s);
    });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Fetch GPX for every workout from `startFrom` onwards.
   *
   * Extracted from run() so the loop that survives a partial failure can be
   * unit-tested without a browser: this is the part that used to abort the
   * whole export on a single dropped connection. One workout failing must
   * never end the run — it lands in `failedKeys` and the loop continues.
   */
  async function downloadAll(workouts, fetchImpl, headers, opts = {}) {
    const { startFrom = 0, sleepImpl = sleep, throttleMs = THROTTLE_MS, log = console } = opts;
    const files = [];
    const byActivity = {};
    const failedKeys = [];
    let skipped = 0;
    for (let i = startFrom; i < workouts.length; i++) {
      const w = workouts[i];
      byActivity[w.activityId] = (byActivity[w.activityId] || 0) + 1;
      try {
        const gpx = await fetchGpx(w.workoutKey, fetchImpl, headers, sleepImpl);
        if (gpx) files.push({ name: buildFilename(w), gpx });
        else skipped++;
        log.log(`${i + 1} / ${workouts.length}${gpx ? "" : "  (ohitettu — ei reittiä)"}`);
      } catch (e) {
        failedKeys.push(w.workoutKey);
        log.warn(`${i + 1} / ${workouts.length}  (VIRHE — ohitettu: ${e.message})`);
      }
      await sleepImpl(throttleMs);
    }
    return { files, byActivity, failedKeys, skipped };
  }

  /** Where to resume from, read from the window flag. Never negative. */
  function resumeOffset(win) {
    return Math.max(0, Math.trunc(Number(win && win.TREENI_RESUME_FROM)) || 0);
  }

  async function run() {
    const headers = authHeaders();
    console.log("Haetaan treenilista…");
    const workouts = await listAllWorkouts(fetch, headers);
    console.log(`Löytyi ${workouts.length} treeniä. Ladataan GPX:t…`);

    // Jos edellinen ajo kuoli kesken (tabi taustalle, kone nukkui, verkko poikki),
    // voit jatkaa siitä mihin jäit: aseta konsolissa esim. window.TREENI_RESUME_FROM = 414
    // ennen skriptin liittämistä uudelleen. Huom: zip sisältää silloin vain jäljellä
    // olevat treenit — pura molemmat zipit samaan kansioon (tiedostonimet ovat uniikkeja).
    const startFrom = resumeOffset(window);
    if (startFrom > 0) {
      console.log(`window.TREENI_RESUME_FROM=${startFrom} — jatketaan kohdasta ${startFrom + 1}/${workouts.length}.`);
    }

    const { files, byActivity, failedKeys, skipped } = await downloadAll(workouts, fetch, headers, { startFrom });

    if (failedKeys.length) {
      console.warn(`${failedKeys.length} treeniä epäonnistui toistuvien verkkovirheiden takia:`, failedKeys);
    }

    const dateTag = formatDate(Date.now());
    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f.gpx);
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `sports-tracker-export-${dateTag}.zip`);
      console.log(`✅ Valmis: ${files.length} GPX zipissä, ${skipped} ohitettu, ${failedKeys.length} epäonnistui.`);
    } catch (e) {
      console.warn("JSZip ei latautunut — ladataan tiedostot yksittäin.", e);
      for (const f of files) {
        triggerDownload(new Blob([f.gpx], { type: "application/gpx+xml" }), f.name);
        await sleep(120);
      }
      console.log(`✅ Valmis (yksittäiset tiedostot): ${files.length} GPX, ${skipped} ohitettu, ${failedKeys.length} epäonnistui.`);
    }
    if (failedKeys.length) {
      console.warn(`Voit yrittää epäonnistuneita uudelleen ajamalla skriptin ja asettamalla ensin: window.TREENI_RESUME_FROM = ${startFrom}`);
    }
    console.log("Treenit lajeittain (activityId → määrä):", byActivity);
  }

  if (typeof window !== "undefined") run();

  // ---- Node test hook (ignored in the browser) ----
  try { module.exports = { activityName, formatDate, buildFilename, listAllWorkouts, fetchGpx, downloadAll, resumeOffset, authHeaders }; } catch (e) { /* browser: no module */ }
})();
