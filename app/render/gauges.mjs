import { fmtPace } from "../../src/analysis/workout.mjs";

const g = (v, unit, label, cls = "") =>
  `<div class="g"><div class="v num ${cls}">${v}<span class="u"> ${unit}</span></div><div class="lbl">${label}</div></div>`;

export function renderGauges(el, model) {
  const a = model.agg;
  el.innerHTML =
    `<div class="lbl" style="margin-bottom:6px">Yhteenveto</div><div class="gauges">` +
    g(Math.round(a.totalKm).toLocaleString("fi-FI"), "km", "Matka", "good") +
    g(Math.round(a.totalMin / 60), "h", "Aika") +
    g(Math.round(a.totalElev).toLocaleString("fi-FI"), "m", "Nousu") +
    g(fmtPace(a.avgPace), "/km", "Ka. tahti") +
    g(a.longestKm.toFixed(1), "km", "Pisin") +
    g(model.frequency.toFixed(1), "/vk", "Frekvenssi") +
    `</div>`;
}
