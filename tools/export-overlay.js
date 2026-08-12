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
    "</style>",
    '<div class="p">',
    '<div class="h"><span class="t">TREENI<b>LOKI</b> · vienti</span><button class="x" id="x">×</button></div>',
    '<div class="s" id="s">Valmiina. Vienti tallentaa koko treenihistoriasi GPX-tiedostoina.</div>',
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
    var existing = new Set();
    for await (var entry of dir.keys()) if (entry.slice(-4) === ".gpx") existing.add(entry);
    return {
      label: "kansioon " + (dir.name || "valittu kansio"),
      existing: existing,
      shouldSkip: function (name) { return existing.has(name); },
      onFile: async function (name, gpx) {
        // createWritable kirjoittaa vaihtotiedostoon ja julkaisee vasta close():ssa,
        // joten kesken jäänyt kirjoitus ei näy valmiina tiedostona.
        var fh = await dir.getFileHandle(name, { create: true });
        var w = await fh.createWritable();
        await w.write(gpx);
        await w.close();
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

  /** Vanha tapa: kerää muistiin, pakkaa lopuksi. Käytössä ilman File System Accessia. */
  function memorySink() {
    return {
      label: "zip-tiedostoksi",
      existing: new Set(),
      shouldSkip: null,
      onFile: null, // core kerää files-taulukkoon
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
      sink = hasFsAccess ? await directorySink() : memorySink();
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

    var already = 0;
    if (sink.shouldSkip) {
      workouts.forEach(function (w) { if (sink.shouldSkip(core.buildFilename(w))) already++; });
    }
    status("Löytyi " + workouts.length + " treeniä" +
      (already ? ", joista " + already + " on jo kansiossa" : "") + ". Tallennetaan " + sink.label + "…");

    elGo.disabled = false;
    elGo.className = "a g";
    elGo.textContent = "Keskeytä";
    elGo.onclick = function () {
      cancelled = true;
      elGo.disabled = true;
      elGo.textContent = "Keskeytetään…";
    };

    var live = { downloaded: 0, skipped: 0, skippedExisting: 0, failed: 0 };
    var quiet = { log: function () {}, warn: function () {} };

    var result = await core.downloadAll(workouts, fetch, headers, {
      log: quiet,
      onFile: sink.onFile,
      shouldSkip: sink.shouldSkip,
      isCancelled: function () { return cancelled; },
      onProgress: function (p) {
        if (p.state === "saved") live.downloaded++;
        else if (p.state === "notrack") live.skipped++;
        else if (p.state === "existing") live.skippedExisting++;
        else if (p.state === "failed") live.failed++;
        progress(p.index + 1, p.total);
        counts(live);
      },
    });

    if (result.cancelled) {
      status("Keskeytetty. " + (hasFsAccess
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
      if (result.failedKeys.length) {
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

  elFoot.textContent = hasFsAccess
    ? "Tiedostot kirjoitetaan suoraan valitsemaasi kansioon."
    : "Selaimestasi puuttuu kansioon kirjoitus — käytetään zip-pakettia. Chromella tai Edgellä vienti on kevyempi.";

  elGo.onclick = function () { run(); };
})();
