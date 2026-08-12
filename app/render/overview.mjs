import { GOALS } from "../../src/analysis/goals.mjs";
import { fmtPace } from "../../src/analysis/workout.mjs";
import { fmtDuration } from "./periods.mjs";

const fi = (v) => Math.round(v).toLocaleString("fi-FI");
const day = (ms) => new Date(ms).toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric" });

function keyNumbers(model) {
  const a = model.agg;
  const vdot = model.vdot?.current;
  const n = (k, tech, v, u) =>
    `<div class="key"><div class="kk">${k}${tech ? ` <span class="tech">${tech}</span>` : ""}</div>` +
    `<div class="kv num">${v}${u ? `<span class="u"> ${u}</span>` : ""}</div></div>`;

  // Kokonaisaika, nousumetrit ja pisin lenkki laskettiin ennenkin mutta jäivät
  // näyttämättä — historian mittakaava ei näy pelkistä kilometreistä.
  return `<div class="keys">` +
    n("Kestävyyskunto", "VO₂max", vdot != null ? vdot : "–", "") +
    n("Kokonaismatka", "", fi(a.totalKm), "km") +
    n("Kokonaisaika", "", fmtDuration(a.totalMin), "") +
    n("Nousumetrit", "", fi(a.totalElev), "m") +
    n("Ka. tahti", "min/km", fmtPace(a.avgPace), "") +
    n("Lenkkejä", "", fi(a.count), "") +
    n("Lenkkejä / vk", "aktiivijaksot", model.frequency.toFixed(1), "") +
    n("Pisin lenkki", "", a.longestKm.toFixed(1), "km") +
    `</div>`;
}

/**
 * Ennätysrivit. Rivi jätetään kokonaan pois kun ennätystä ei ole: nolla
 * ennätyksenä olisi vale, ja puuttuva rivi kertoo sen rehellisemmin kuin
 * tyhjä paikka.
 */
function recordRows(r) {
  if (!r) return [];
  const rows = [];
  const add = (label, value, detail) =>
    rows.push(`<div class="rec"><div class="kk">${label}</div>` +
      `<div class="rv num">${value}</div><div class="rd">${detail}</div></div>`);

  if (r.longest) add("Pisin lenkki", `${r.longest.km.toFixed(1)} km`, `${day(r.longest.date)} · ${r.longest.name}`);
  if (r.fastest) add("Nopein tahti", fmtPace(r.fastest.paceMinKm), `${r.fastest.km.toFixed(1)} km · ${day(r.fastest.date)}`);
  if (r.highestClimb) add("Eniten nousua", `${fi(r.highestClimb.elev)} m`, `${day(r.highestClimb.date)} · ${r.highestClimb.name}`);
  if (r.biggestWeek) add("Suurin viikko", `${fi(r.biggestWeek.km)} km`, `alkaen ${day(r.biggestWeek.start)}`);
  if (r.mostRunsWeek) add("Eniten lenkkejä / vk", String(r.mostRunsWeek.count), `alkaen ${day(r.mostRunsWeek.start)}`);
  if (r.streak && r.streak.weeks > 1) add("Pisin putki", `${r.streak.weeks} vk`, `${day(r.streak.from)} – ${day(r.streak.to)}`);
  return rows;
}

function recordsPanel(model) {
  const rows = recordRows(model.records);
  if (!rows.length) return "";
  return `<div class="panel">
    <div class="lbl" style="margin-bottom:10px">Ennätykset</div>
    <div class="recs">${rows.join("")}</div>
  </div>`;
}

export function renderOverview(el, model, goal, onGoalChange) {
  el.innerHTML = "";

  const goalsEl = document.createElement("div");
  goalsEl.className = "goals";
  for (const [key, g] of Object.entries(GOALS)) {
    const b = document.createElement("button");
    b.textContent = g.label;
    if (key === goal) b.className = "on";
    b.addEventListener("click", () => onGoalChange(key));
    goalsEl.appendChild(b);
  }
  el.appendChild(goalsEl);

  const tips = document.createElement("div");
  tips.className = "tips";
  tips.innerHTML = (model.coaching || []).map((t) => `<div class="tip ${t.severity}">${t.text}</div>`).join("")
    || `<div class="tip info">Lisää treenejä saadaksesi valmennusvinkkejä.</div>`;
  el.appendChild(tips);

  el.insertAdjacentHTML("beforeend", keyNumbers(model));
  el.insertAdjacentHTML("beforeend", recordsPanel(model));
}
