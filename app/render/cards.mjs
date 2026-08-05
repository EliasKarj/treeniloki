export function renderCards(el, model) {
  const spikes = model.spikes;
  let idx = -1;
  for (let i = spikes.length - 1; i >= 0; i--) { if (spikes[i].band !== "none" && !spikes[i].suppressed) { idx = i; break; } }
  const s = idx >= 0 ? spikes[idx] : spikes[spikes.length - 1];
  const pct = s ? Math.round((s.ratio - 1) * 100) : 0;
  const spikeCard = `<div class="ins"><div class="h">Loukkaantumisriski · spike</div>` +
    (s && s.band === "high" ? `<span class="pill" style="background:#3a2513;color:var(--warn)">KORKEA</span>`
      : s && s.band === "moderate" ? `<span class="pill" style="background:#2c2718;color:var(--warn)">KOHONNUT</span>`
      : `<span class="pill" style="background:#12261f;color:var(--accent)">OK</span>`) +
    `<div class="sub">${s && s.band !== "none"
      ? `Lenkki <b class="num warn">+${pct}%</b> vs. 30 pv pisin. >30% piikki ≈ 2× rasitusvammariski (BJSM 2025).`
      : `Ei yksittäisen lenkin piikkiä 30 pv ikkunassa.`}</div></div>`;

  const load = model.load;
  const loadCard = `<div class="ins"><div class="h">Kuormitus &amp; tuoreus</div>` +
    `<div class="big">${load.ratio ? load.ratio.toFixed(2) : "–"} <span style="font-size:11px;color:var(--muted)">ACWR</span></div>` +
    `<div class="sub">7 pv kuorma vs. 28 pv ka. <span style="color:var(--muted)">(toissijainen / kiistelty signaali)</span>.</div></div>`;

  const cb = model.lastComeback;
  const breakCard = `<div class="ins"><div class="h">Tauko &amp; paluu</div>` +
    (cb ? `<div class="big warn">${cb.gapDays} pv</div><div class="sub">Paluu vei <b class="num">${cb.workoutsToReturn ?? "–"}</b> lenkkiä pre-tauko-tahtiin.${model.detraining ? " " + model.detraining : ""}</div>`
        : `<div class="big good">–</div><div class="sub">Ei ≥14 pv taukoja historiassa.</div>`) +
    `</div>`;

  el.innerHTML = spikeCard + loadCard + breakCard;
}
