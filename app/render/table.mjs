import { fmtPace } from "../../src/analysis/workout.mjs";

const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10);

export function renderTable(el, model) {
  const rows = model.workouts.map((w, i) => {
    const s = model.spikes[i];
    const note = s.suppressed ? `<span style="color:var(--muted)">tauon jälkeen</span>`
      : s.band === "high" ? `<span class="warn">⚠ hyppäys +${Math.round((s.ratio - 1) * 100)}%</span>`
      : s.band === "moderate" ? `<span class="warn">▲ +${Math.round((s.ratio - 1) * 100)}%</span>`
      : `<span class="good">✓</span>`;
    return `<tr><td class="num">${fmtDate(w.date)}</td><td>${w.name}</td><td class="num">${w.distanceKm.toFixed(1)} km</td><td class="num">${fmtPace(w.paceMinKm)}</td><td class="num">${Math.round(w.elevGain)} m</td><td>${note}</td></tr>`;
  }).reverse().join("");
  el.innerHTML = `<div class="panel"><div class="lbl" style="margin-bottom:6px">Kaikki treenit</div><table><thead><tr><th>Päivä</th><th>Nimi</th><th>Matka</th><th>Tahti</th><th>Nousumetrit</th><th>Huom.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
