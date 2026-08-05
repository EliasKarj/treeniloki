import { GOALS } from "../../src/analysis/goals.mjs";
import { fmtPace } from "../../src/analysis/workout.mjs";

function keyNumbers(model) {
  const a = model.agg;
  const vdot = model.vdot?.current;
  const n = (k, tech, v, u) =>
    `<div class="key"><div class="kk">${k}${tech ? ` <span class="tech">${tech}</span>` : ""}</div>` +
    `<div class="kv num">${v}${u ? `<span class="u"> ${u}</span>` : ""}</div></div>`;
  return `<div class="keys">` +
    n("Kestävyyskunto", "VO₂max", vdot != null ? vdot : "–", "") +
    n("Kokonaismatka", "", Math.round(a.totalKm).toLocaleString("fi-FI"), "km") +
    n("Ka. tahti", "min/km", fmtPace(a.avgPace), "") +
    n("Lenkkejä / vk", "", model.frequency.toFixed(1), "") +
    `</div>`;
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
}
