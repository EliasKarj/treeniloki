import { fmtPace } from "../../src/analysis/workout.mjs";

// Treenitaulukko sivutetaan.
//
// Koko historia kerralla on 3436 riviä eli noin 27 500 DOM-solmua — yli 90 %
// koko sivun solmuista, ja puhelimessa selvästi raskain yksittäinen asia mitä
// sivu tekee. Kukaan ei selaa kolmea ja puolta tuhatta riviä kerralla, joten
// loput ladataan painikkeella.

const PAGE = 200;

const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10);

function rowHtml(model, i) {
  const w = model.workouts[i];
  const s = model.spikes[i];
  const note = s.suppressed ? `<span style="color:var(--muted)">tauon jälkeen</span>`
    : s.band === "high" ? `<span class="warn">⚠ hyppäys +${Math.round((s.ratio - 1) * 100)}%</span>`
    : s.band === "moderate" ? `<span class="warn">▲ +${Math.round((s.ratio - 1) * 100)}%</span>`
    : `<span class="good">✓</span>`;
  return `<tr><td class="num">${fmtDate(w.date)}</td><td>${w.name}</td>` +
    `<td class="num">${w.distanceKm.toFixed(1)} km</td><td class="num">${fmtPace(w.paceMinKm)}</td>` +
    `<td class="num">${Math.round(w.elevGain)} m</td><td>${note}</td></tr>`;
}

export function renderTable(el, model) {
  el.innerHTML = "";
  const total = model.workouts.length;

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.insertAdjacentHTML("beforeend",
    `<div class="lbl" style="margin-bottom:6px">Kaikki treenit <span class="tech">${total} kpl</span></div>`);

  const table = document.createElement("table");
  table.insertAdjacentHTML("beforeend",
    `<thead><tr><th>Päivä</th><th>Nimi</th><th>Matka</th><th>Tahti</th><th>Nousumetrit</th><th>Huom.</th></tr></thead>`);
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  // Vieritys puhelinta varten: ilman sitä "2025-09-02" ja "12.0 km" katkeavat
  // kahdelle riville ja taulukosta tulee lukukelvoton.
  const scroll = document.createElement("div");
  scroll.className = "tscroll";
  scroll.appendChild(table);
  panel.appendChild(scroll);

  const more = document.createElement("button");
  more.className = "minibtn more";

  // Uusin ensin, joten riveille mennään lopusta alkuun.
  let shown = 0;
  const addPage = () => {
    const next = Math.min(total, shown + PAGE);
    let html = "";
    for (let n = shown; n < next; n++) html += rowHtml(model, total - 1 - n);
    tbody.insertAdjacentHTML("beforeend", html);
    shown = next;
    const left = total - shown;
    more.hidden = left === 0;
    more.textContent = left ? `Näytä lisää — ${left} jäljellä` : "";
  };

  addPage();
  more.addEventListener("click", addPage);
  panel.appendChild(more);
  el.appendChild(panel);
}
