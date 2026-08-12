const DAY = 86400000;
// Tuhaterotin: "3249 min" on luku jonka joutuu lukemaan kahdesti, "3 249 min" ei.
const fi = (n) => Math.round(n).toLocaleString("fi-FI");

function spikeCard(model) {
  const spikes = model.spikes || [];
  let s = null;
  for (let i = spikes.length - 1; i >= 0; i--) { if (spikes[i].band !== "none" && !spikes[i].suppressed) { s = spikes[i]; break; } }
  if (!s) s = spikes[spikes.length - 1];
  const pct = s ? Math.round((s.ratio - 1) * 100) : 0;
  const pill = s && s.band === "high" ? `<span class="pill risk-high">KORKEA</span>`
    : s && s.band === "moderate" ? `<span class="pill risk-mod">KOHONNUT</span>`
    : `<span class="pill risk-low">OK</span>`;
  const body = s && s.band !== "none"
    ? `Viime lenkki <b class="num warn">+${pct}%</b> pidempi kuin 30 pv:n pisin. Iso yksittäinen hyppäys nostaa rasitusvammariskiä.`
    : `Ei ison yksittäisen lenkin hyppäystä viime 30 pv:n aikana — hyvä.`;
  return `<div class="ins"><div class="h">Iso matkahyppäys</div>${pill}<div class="sub">${body}</div></div>`;
}

function loadCard(model) {
  const load = model.load || {};
  const r = load.ratio;
  const cls = !r ? "" : r > 1.5 ? "warn" : r < 0.8 ? "good" : "";
  const meaning = !r ? "Ei riittävästi dataa."
    : r > 1.5 ? "Kuorma noussut nopeasti — harkitse kevennystä."
    : r < 0.8 ? "Kuorma matala — tilaa lisätä maltilla." : "Kuorma tasapainossa.";
  // Pelkkä suhdeluku ei kerro mistä se syntyy; taustaluvut tekevät siitä
  // tarkistettavan sen sijaan että se pitäisi uskoa.
  const detail = r
    ? `<div class="mini"><span>Viime 7 pv <b class="num">${fi(load.acute)}</b></span>` +
      `<span>Tavallinen viikko <b class="num">${fi(load.chronic)}</b></span>` +
      // Ikkuna alkaa viimeisimmästä lenkistä, ei tästä päivästä. Ero näkyy heti
      // kun historia on tuotu jälkikäteen, joten se on parempi sanoa kuin jättää
      // lukijan pääteltäväksi.
      `<span class="tech">viim. lenkistä</span></div>`
    : "";
  return `<div class="ins"><div class="h">Kuormasuhde <span class="tech">ACWR</span></div>` +
    `<div class="big ${cls}">${r ? r.toFixed(2) : "–"}</div>${detail}` +
    `<div class="sub">Viime viikko vs. tavallinen. ${meaning}</div></div>`;
}

function breakCard(model) {
  const cb = model.lastComeback;
  const all = model.breaks || [];
  // Aiemmin vain viimeisin tauko näytettiin, vaikka kaikki laskettiin. Historian
  // tauot ovat juuri sitä mitä pitkää lokia selatessa haluaa nähdä.
  const history = all.length > 1
    ? `<div class="mini"><span>Taukoja yhteensä <b class="num">${all.length}</b></span>` +
      `<span>Pisin <b class="num">${Math.max(...all.map((b) => b.gapDays))}</b> pv</span></div>`
    : "";
  return `<div class="ins"><div class="h">Tauon vaikutus</div>` +
    (cb ? `<div class="big warn">${cb.gapDays} pv</div>${history}` +
          `<div class="sub">Paluu vei <b class="num">${cb.workoutsToReturn ?? "–"}</b> lenkkiä entiseen tahtiin.${model.detraining ? " " + model.detraining : ""}</div>`
        : `<div class="big good">–</div><div class="sub">Ei ≥ 14 pv taukoja — hyvä jatkuvuus.</div>`) +
    `</div>`;
}

const DRIFT = {
  ok: ["good", "Jakauma kunnossa (~80/20)."],
  grey: ["warn", "Liikaa keskitehoa — polarisoi helppo/kova."],
  tooHard: ["warn", "Kovaa on paljon — lisää helppoja lenkkejä."],
  none: ["", "Ei riittävästi dataa 28 pv:ltä."],
};

function intensityCard(model) {
  const it = model.intensity;
  const [cls, txt] = DRIFT[(it && it.drift) || "none"];
  let bar = "";
  if (it && it.drift !== "none") {
    const seg = (c, pct, label) => pct > 0 ? `<span class="seg ${c}" style="width:${pct}%">${pct >= 12 ? label : ""}</span>` : "";
    bar = `<div class="bar8020">${seg("e", it.easyPct, "helppo")}${seg("m", it.moderatePct, "keski")}${seg("h", it.hardPct, "kova")}</div>`;
  }
  const minutes = it && it.drift !== "none"
    ? `<div class="mini"><span>Helppo <b class="num">${fi(it.easyMin)}</b> min</span>` +
      `<span>Keski <b class="num">${fi(it.moderateMin)}</b> min</span>` +
      `<span>Kova <b class="num">${fi(it.hardMin)}</b> min</span>` +
      `<span class="tech">viim. 28 pv</span></div>`
    : "";

  // "Ei riittävästi dataa" jättää arvailemaan onko vika tiedostoissa. Yleisin syy
  // on että historia on tuotu jälkikäteen eikä 28 pv:n ikkunaan osu mitään —
  // sen näkee vain jos sen sanoo.
  let txt2 = txt;
  const ws = model.workouts || [];
  if ((!it || it.drift === "none") && ws.length) {
    const days = Math.round((Date.now() - ws[ws.length - 1].date) / DAY);
    if (days > 28) txt2 = `Viimeisin lenkki oli ${fi(days)} pv sitten — 28 pv:n ikkunaan ei osu treenejä.`;
  }
  return `<div class="ins wide"><div class="h">Helppo–kova-jakauma <span class="tech">80/20</span></div>${bar}${minutes}<div class="sub ${cls}">${txt2}</div></div>`;
}

function hrCard(model) {
  if (!model.hr) return `<div class="ins wide"><div class="h">Sykealueet</div><div class="sub">Ei sykedataa GPX-tiedostoissa.</div></div>`;
  const z = model.hr.zoneMinutes.map((m) => Math.round(m));
  const total = z.reduce((s, x) => s + x, 0) || 1;
  const zbar = z.map((m, i) => m > 0 ? `<span class="zseg z${i + 1}" style="width:${(m / total) * 100}%"></span>` : "").join("");
  const names = ["Z1", "Z2", "Z3", "Z4", "Z5"];
  const perZone = `<div class="mini">` +
    z.map((m, i) => `<span>${names[i]} <b class="num">${fi(m)}</b> min</span>`).join("") + `</div>`;
  return `<div class="ins wide"><div class="h">Sykealueet <span class="tech">max ${model.hr.maxHr}</span></div>` +
    `<div class="zbar">${zbar}</div>${perZone}` +
    `<div class="sub">Helppo ${model.hr.easyPct}% · keski ${model.hr.moderatePct}% · kova ${model.hr.hardPct}%</div></div>`;
}

export function renderHealth(el, model) {
  el.innerHTML = `<div class="health">${spikeCard(model)}${loadCard(model)}${breakCard(model)}${intensityCard(model)}${hrCard(model)}</div>`;
}
