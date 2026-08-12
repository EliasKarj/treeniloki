// Treeniloki — Sports Tracker -vienti kirjanmerkkipainikkeena.
//
// Ajetaan sports-tracker.comin sivukontekstissa, joten sessiotunniste luetaan
// paikan päällä eikä sitä kopioida minnekään. Piirtää oman paneelin sivulle;
// konsolia ei tarvita lainkaan.
//
// Tallennustapa parhaimmasta alkaen:
//   1. File System Access API  → jokainen GPX kirjoitetaan heti valittuun
//      kansioon. Vakio muistinkulutus ja automaattinen jatkaminen.
//   2. JSZip                   → kaikki muistiin ja yksi zip (vanha tapa).
//   3. Yksittäiset lataukset   → jos JSZipin lataus estyy (esim. CSP).
//
// Riippuu tools/core.js:stä (globaali TreenilokiCore). export.html liittää
// nämä kaksi yhteen kirjanmerkiksi.
(function () {
  "use strict";

  var core = window.TreenilokiCore;
  if (!core) { alert("Treeniloki: ydin puuttuu — käytä export.html-sivun painiketta."); return; }

  var HOST_ID = "treeniloki-export-overlay";
  if (document.getElementById(HOST_ID)) return; // jo auki

  var JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  var cancelled = false;

  // ------------------------------------------------------------------ UI

  var host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647";
  var shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = [
    "<style>",
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}",
    ".p{width:330px;background:#0e151d;color:#dbe6ef;border:1px solid #1c2732;border-radius:10px;",
    "box-shadow:0 8px 32px rgba(0,0,0,.5);padding:14px;font-size:13px;line-height:1.5}",
    ".h{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}",
    ".t{font-weight:700;letter-spacing:.02em}.t b{color:#35d0e0}",
    ".x{background:none;border:none;color:#5f7183;font-size:18px;cursor:pointer;padding:0 4px;line-height:1}",
    ".x:hover{color:#dbe6ef}",
    ".s{color:#5f7183;margin-bottom:10px;min-height:2.6em}",
    ".s.err{color:#e05a5a}.s.ok{color:#35d0e0}",
    ".bar{height:6px;background:#1c2732;border-radius:3px;overflow:hidden;margin-bottom:8px;display:none}",
    ".bar.on{display:block}",
    ".fill{height:100%;width:0;background:#35d0e0;transition:width .15s}",
    ".n{display:flex;gap:12px;flex-wrap:wrap;color:#5f7183;font-size:11px;margin-bottom:12px;min-height:1.4em}",
    ".n b{color:#dbe6ef;font-weight:600}",
    "button.a{width:100%;background:#35d0e0;color:#06121a;border:none;border-radius:7px;padding:9px;",
    "font-size:13px;font-weight:700;cursor:pointer}",
    "button.a:hover{background:#5ee0ee}button.a:disabled{background:#1c2732;color:#5f7183;cursor:default}",
    "button.g{background:none;border:1px solid #1c2732;color:#5f7183}",
    "button.g:hover{background:#131c26;color:#dbe6ef}",
    ".f{margin-top:8px;color:#5f7183;font-size:11px}",
    ".fmt{display:flex;gap:6px;margin-bottom:10px}",
    ".fmt button{flex:1;background:none;border:1px solid #1c2732;color:#5f7183;border-radius:7px;",
    "padding:7px 6px;font:inherit;font-size:11px;cursor:pointer;line-height:1.3}",
    ".fmt button.on{border-color:#35d0e0;color:#35d0e0;background:#0d1a1f}",
    ".fmt button b{display:block;font-size:12px;color:inherit}",
    "</style>",
    '<div class="p">',
    '<div class="h"><span class="t">TREENI<b>LOKI</b> · vienti</span><button class="x" id="x">×</button></div>',
    '<div class="fmt" id="fmt">',
    '<button data-fmt="compact"><b>Kevyt</b>yksi pieni tiedosto</button>',
    '<button data-fmt="gpx"><b>GPX</b>alkuperäiset tiedostot</button>',
    '</div>',
    '<div class="s" id="s">Valmiina.</div>',
    '<div class="bar" id="bar"><div class="fill" id="fill"></div></div>',
    '<div class="n" id="n"></div>',
    '<button class="a" id="go">Valitse kansio ja aloita</button>',
    '<div class="f" id="f"></div>',
    "</div>",
  ].join("");
  document.body.appendChild(host);

  var $ = function (id) { return shadow.getElementById(id); };
  var elStatus = $("s"), elBar = $("bar"), elFill = $("fill"), elCounts = $("n"),
      elGo = $("go"), elFoot = $("f");

  function status(text, cls) {
    elStatus.textContent = text;
    elStatus.className = "s" + (cls ? " " + cls : "");
  }
  function counts(c) {
    elCounts.innerHTML = [
      "<span>Tallennettu <b>" + c.downloaded + "</b></span>",
      c.skippedExisting ? "<span>Jo kansiossa <b>" + c.skippedExisting + "</b></span>" : "",
      c.skipped ? "<span>Ei reittiä <b>" + c.skipped + "</b></span>" : "",
      c.http ? "<span>HTTP-virhe <b>" + c.http + "</b></span>" : "",
      c.failed ? "<span>Virheitä <b>" + c.failed + "</b></span>" : "",
    ].join("");
  }
  function progress(done, total) {
    elBar.className = "bar on";
    elFill.style.width = (total ? (done / total) * 100 : 0) + "%";
  }
  function close() { host.remove(); }
  $("x").addEventListener("click", function () { cancelled = true; close(); });

  // --------------------------------------------------------- tallennustavat

  var hasFsAccess = typeof window.showDirectoryPicker === "function";

  /** Kirjoittaa suoraan valittuun kansioon. Palauttaa {onFile, shouldSkip, label}. */
  async function directorySink() {
    var dir = await window.showDirectoryPicker({ mode: "readwrite" });

    async function writeTo(name, contents) {
      // createWritable kirjoittaa vaihtotiedostoon ja julkaisee vasta close():ssa,
      // joten kesken jäänyt kirjoitus ei näy valmiina tiedostona.
      var fh = await dir.getFileHandle(name, { create: true });
      var w = await fh.createWritable();
      await w.write(contents);
      await w.close();
    }

    var existing = new Set();
    for await (var entry of dir.keys()) if (entry.slice(-4) === ".gpx") existing.add(entry);

    // Reidittömistä treeneistä ei jää tiedostoa, joten kansio ei muista niitä
    // ilman erillistä listaa. Sama tiedosto kuin Node-komentorivillä.
    var noTrack = new Set();
    try {
      var nh = await dir.getFileHandle(core.NO_TRACK_FILE);
      noTrack = core.parseNoTrack(await (await nh.getFile()).text());
    } catch (e) { /* ensimmäinen ajo tähän kansioon */ }

    return {
      label: "kansioon " + (dir.name || "valittu kansio"),
      existing: existing,
      knownNoTrack: noTrack.size,
      shouldSkip: function (name, w) { return existing.has(name) || noTrack.has(w.workoutKey); },
      onFile: function (name, gpx) { return writeTo(name, gpx); },
      onNoTrack: async function (w) {
        noTrack.add(w.workoutKey);
        await writeTo(core.NO_TRACK_FILE, core.serializeNoTrack(noTrack));
      },
      finish: async function () {},
    };
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = JSZIP_CDN;
      s.onload = function () { resolve(window.JSZip); };
      s.onerror = function () { reject(new Error("JSZip-lataus epäonnistui")); };
      document.head.appendChild(s);
    });
  }

  var PROGRESS_KEY = "treeniloki:vienti-kesken";

  /**
   * Kevyt tapa: muunna jokainen GPX heti kompaktiksi tietueeksi ja unohda
   * alkuperäinen. Muistissa on vain noin 0,5 kt per treeni, joten koko historia
   * mahtuu pariin megatavuun — tämä on se mikä tekee viennistä mahdollisen
   * Firefoxissa ja Safarissa, joista puuttuu kansioon kirjoitus.
   *
   * Jatkaminen ei voi nojata kansioon, joten kesken jäänyt ajo talletetaan
   * selaimen localStorageen ja siivotaan pois kun vienti valmistuu.
   */
  function compactSink() {
    var records = [];
    var done = new Set(); // käsitellyt workoutKeyt, myös reidittömät

    try {
      var saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      if (saved && Array.isArray(saved.workouts)) {
        records = saved.workouts;
        (saved.done || []).forEach(function (k) { done.add(k); });
      }
    } catch (e) { /* vioittunut tila: aloitetaan puhtaalta pöydältä */ }

    var quotaFull = false;
    function persist() {
      if (quotaFull) return;
      try {
        localStorage.setItem(PROGRESS_KEY, JSON.stringify({
          workouts: records, done: Array.from(done),
        }));
      } catch (e) {
        // Kiintiö täynnä: ajo jatkuu muistissa, mutta keskeytys menettäisi sen.
        quotaFull = true;
      }
    }

    var sinceSave = 0;
    function tick() { if (++sinceSave >= 25) { sinceSave = 0; persist(); } }

    return {
      label: "yhdeksi kevyeksi tiedostoksi",
      existing: new Set(),
      resumed: records.length,
      quotaFull: function () { return quotaFull; },
      persist: persist,
      shouldSkip: function (name, w) { return done.has(w.workoutKey); },
      onFile: function (name, gpx, w) {
        var parsed = parseGpx(gpx);
        if (parsed) {
          var summary = summarizeWorkout(parsed.points);
          var merged = {};
          for (var k in parsed) merged[k] = parsed[k];
          for (var k2 in summary) merged[k2] = summary[k2];
          records.push(toCompactRecord(merged, w.workoutKey));
        }
        done.add(w.workoutKey);
        tick();
      },
      onNoTrack: function (w) { done.add(w.workoutKey); tick(); },
      finish: async function () {
        records.sort(function (a, b) { return a.d - b.d; });
        var json = JSON.stringify(buildCompactFile(records));
        triggerDownload(new Blob([json], { type: "application/json" }),
          "treeniloki-" + core.formatDate(Date.now()) + ".json");
        try { localStorage.removeItem(PROGRESS_KEY); } catch (e) { /* ei väliä */ }
      },
    };
  }

  /** Vanha tapa: kerää muistiin, pakkaa lopuksi. Käytössä ilman File System Accessia. */
  function memorySink() {
    return {
      label: "zip-tiedostoksi",
      existing: new Set(),
      knownNoTrack: 0,
      shouldSkip: null,
      onFile: null, // core kerää files-taulukkoon
      onNoTrack: null, // ilman kansiota ei ole mihin muistiinpanoa tallentaa
      finish: async function (result) {
        var tag = core.formatDate(Date.now());
        try {
          var JSZip = await loadJSZip();
          var zip = new JSZip();
          result.files.forEach(function (f) { zip.file(f.name, f.gpx); });
          triggerDownload(await zip.generateAsync({ type: "blob" }), "sports-tracker-export-" + tag + ".zip");
        } catch (e) {
          status("Zip-pakkaus ei onnistunut — ladataan tiedostot yksitellen.", "err");
          for (var i = 0; i < result.files.length; i++) {
            triggerDownload(new Blob([result.files[i].gpx], { type: "application/gpx+xml" }), result.files[i].name);
            await core.sleep(120);
          }
        }
      },
    };
  }

  // ------------------------------------------------------------------ ajo

  async function run() {
    var headers;
    try {
      headers = core.authHeaders();
    } catch (e) {
      status(e.message, "err");
      return;
    }

    var sink;
    try {
      // Kansiovalinta on tehtävä suoraan klikkauksesta, muuten selain estää sen.
      sink = format === "compact" ? compactSink()
        : hasFsAccess ? await directorySink() : memorySink();
    } catch (e) {
      status("Kansiota ei valittu.", "err");
      elGo.disabled = false;
      elGo.textContent = "Valitse kansio ja aloita";
      return;
    }

    elGo.disabled = true;
    elGo.textContent = "Haetaan treenilistaa…";
    status("Haetaan treenilistaa Sports Trackerista…");

    var workouts;
    try {
      workouts = await core.listAllWorkouts(fetch, headers);
    } catch (e) {
      status(e.message, "err");
      elGo.disabled = false;
      elGo.textContent = "Yritä uudelleen";
      return;
    }

    // Kaksi eri syytä ohittaa: tiedosto on jo kansiossa, tai treeni tiedetään
    // reidittömäksi. Erotellaan ne, koska ne tarkoittavat käyttäjälle eri asiaa.
    var already = 0, knownNoTrack = 0;
    if (sink.shouldSkip) {
      workouts.forEach(function (w) {
        var name = core.buildFilename(w);
        if (sink.existing.has(name)) already++;
        else if (sink.shouldSkip(name, w)) knownNoTrack++;
      });
    }
    status("Löytyi " + workouts.length + " treeniä" +
      (already ? ", joista " + already + " on jo kansiossa" : "") +
      (knownNoTrack ? " ja " + knownNoTrack + " tiedetään reidittömiksi" : "") +
      ". Tallennetaan " + sink.label + "…");

    elGo.disabled = false;
    elGo.className = "a g";
    elGo.textContent = "Keskeytä";
    elGo.onclick = function () {
      cancelled = true;
      elGo.disabled = true;
      elGo.textContent = "Keskeytetään…";
    };

    var live = { downloaded: 0, skipped: 0, skippedExisting: 0, http: 0, failed: 0 };
    var quiet = { log: function () {}, warn: function () {} };

    var result = await core.downloadAll(workouts, fetch, headers, {
      log: quiet,
      onFile: sink.onFile,
      shouldSkip: sink.shouldSkip,
      onNoTrack: sink.onNoTrack,
      isCancelled: function () { return cancelled; },
      onProgress: function (p) {
        if (p.state === "saved") live.downloaded++;
        else if (p.state === "notrack") live.skipped++;
        else if (p.state === "existing") live.skippedExisting++;
        else if (p.state === "http") live.http++;
        else if (p.state === "failed") live.failed++;
        progress(p.index + 1, p.total);
        counts(live);
      },
    });

    if (result.cancelled) {
      if (sink.persist) sink.persist();
      status("Keskeytetty. " + (format === "compact"
        ? (sink.quotaFull()
            ? "Selaimen muisti ei riittänyt välitallennukseen — seuraava ajo alkaa alusta."
            : "Edistyminen on tallessa — klikkaa kirjanmerkkiä uudelleen jatkaaksesi.")
        : hasFsAccess
        ? "Tallennetut tiedostot ovat kansiossa — klikkaa kirjanmerkkiä uudelleen jatkaaksesi siitä mihin jäit."
        : "Aloita alusta klikkaamalla kirjanmerkkiä uudelleen."), "err");
    } else {
      status("Pakataan ja tallennetaan…");
      try {
        await sink.finish(result);
      } catch (e) {
        status("Tallennus epäonnistui: " + e.message, "err");
        return;
      }
      var msg = "Valmis! " + result.downloaded + " treeniä tallennettu.";
      if (result.httpSkipped) {
        // 401/403 koko rintamalla tarkoittaa käytännössä vanhentunutta sessiota.
        var authFail = result.httpStatuses[401] || result.httpStatuses[403];
        status(msg + " " + result.httpSkipped + " palautti HTTP-virheen." +
          (authFail ? " Kirjaudu Sports Trackeriin uudelleen ja klikkaa kirjanmerkkiä."
                    : " Klikkaa kirjanmerkkiä uudelleen, niin ne yritetään uudelleen."), "err");
      } else if (result.failedKeys.length) {
        msg += " " + result.failedKeys.length + " epäonnistui — klikkaa kirjanmerkkiä uudelleen, " +
          "niin vain puuttuvat haetaan.";
        status(msg, "err");
      } else {
        status(msg + " Raahaa tiedostot Treenilokiin.", "ok");
      }
    }

    elGo.className = "a";
    elGo.disabled = false;
    elGo.textContent = "Sulje";
    elGo.onclick = close;
  }

  // Oletus selaimen mukaan: kansioon kirjoittava selain saa alkuperäiset GPX:t,
  // muut kevyen muodon — se on niissä ainoa tapa välttää gigatavun muistipallo.
  var format = hasFsAccess ? "gpx" : "compact";

  function setFormat(next) {
    format = next;
    Array.prototype.forEach.call(shadow.querySelectorAll("#fmt button"), function (b) {
      b.className = b.getAttribute("data-fmt") === next ? "on" : "";
    });
    elGo.textContent = next === "compact" ? "Aloita vienti" : "Valitse kansio ja aloita";
    if (next === "compact") {
      status("Kevyt: koko historia yhtenä pienenä tiedostona, noin 0,5 kt treeniltä. " +
        "Toimii kaikissa selaimissa ja latautuu puhelimeenkin.");
      elFoot.textContent = "Reittiviiva ei säily — analyysi ei sitä käytä, mutta karttaa ei voi jälkikäteen piirtää.";
    } else {
      status("GPX: alkuperäiset tiedostot sellaisenaan." +
        (hasFsAccess ? " Valitset kansion, ja jatkaminen toimii sen perusteella."
                     : " Selaimesi ei tue kansioon kirjoitusta, joten tulee zip-paketti — tuhansilla treeneillä raskas."));
      elFoot.textContent = hasFsAccess
        ? "Tiedostot kirjoitetaan suoraan valitsemaasi kansioon."
        : "Kevyt muoto on tässä selaimessa selvästi kevyempi vaihtoehto.";
    }
  }

  Array.prototype.forEach.call(shadow.querySelectorAll("#fmt button"), function (b) {
    b.addEventListener("click", function () { setFormat(b.getAttribute("data-fmt")); });
  });
  setFormat(format);

  elGo.onclick = function () { run(); };
})();
