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
  const r = model.load?.ratio;
  const cls = !r ? "" : r > 1.5 ? "warn" : r < 0.8 ? "good" : "";
  const meaning = !r ? "Ei riittävästi dataa."
    : r > 1.5 ? "Kuorma noussut nopeasti — harkitse kevennystä."
    : r < 0.8 ? "Kuorma matala — tilaa lisätä maltilla." : "Kuorma tasapainossa.";
  return `<div class="ins"><div class="h">Kuormasuhde <span class="tech">ACWR</span></div>` +
    `<div class="big ${cls}">${r ? r.toFixed(2) : "–"}</div>` +
    `<div class="sub">Viime viikko vs. tavallinen. ${meaning}</div></div>`;
}

function breakCard(model) {
  const cb = model.lastComeback;
  return `<div class="ins"><div class="h">Tauon vaikutus</div>` +
    (cb ? `<div class="big warn">${cb.gapDays} pv</div><div class="sub">Paluu vei <b class="num">${cb.workoutsToReturn ?? "–"}</b> lenkkiä entiseen tahtiin.${model.detraining ? " " + model.detraining : ""}</div>`
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
  return `<div class="ins wide"><div class="h">Helppo–kova-jakauma <span class="tech">80/20</span></div>${bar}<div class="sub ${cls}">${txt}</div></div>`;
}

function hrCard(model) {
  if (!model.hr) return `<div class="ins wide"><div class="h">Sykealueet</div><div class="sub">Ei sykedataa GPX-tiedostoissa.</div></div>`;
  const z = model.hr.zoneMinutes.map((m) => Math.round(m));
  const total = z.reduce((s, x) => s + x, 0) || 1;
  const zbar = z.map((m, i) => m > 0 ? `<span class="zseg z${i + 1}" style="width:${(m / total) * 100}%"></span>` : "").join("");
  return `<div class="ins wide"><div class="h">Sykealueet <span class="tech">max ${model.hr.maxHr}</span></div><div class="zbar">${zbar}</div><div class="sub">Helppo ${model.hr.easyPct}% · keski ${model.hr.moderatePct}% · kova ${model.hr.hardPct}%</div></div>`;
}

export function renderHealth(el, model) {
  el.innerHTML = `<div class="health">${spikeCard(model)}${loadCard(model)}${breakCard(model)}${intensityCard(model)}${hrCard(model)}</div>`;
}
