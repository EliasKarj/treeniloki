import { GOALS, goalMetric } from "../../src/analysis/goals.mjs";

function sparkline(points) {
  const w = 220, h = 40, pad = 3;
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.width = w + "px"; c.style.height = h + "px";
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  ctx.strokeStyle = "#35d0e0"; ctx.lineWidth = 1.5; ctx.beginPath();
  points.forEach((p, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (w - 2 * pad);
    const y = h - pad - ((p.value - lo) / (hi - lo || 1)) * (h - 2 * pad);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  return c;
}

function bar8020(it) {
  const seg = (cls, pct, label) =>
    pct > 0 ? `<span class="seg ${cls}" style="width:${pct}%">${pct >= 12 ? label : ""}</span>` : "";
  return `<div class="bar8020">${seg("e", it.easyPct, "helppo")}${seg("m", it.moderatePct, "keski")}${seg("h", it.hardPct, "kova")}</div>`;
}

const DRIFT = {
  ok: ["good", "Jakauma kunnossa (~80/20)."],
  grey: ["warn", "Liikaa keskitehoa — polarisoi helppo/kova."],
  tooHard: ["warn", "Kovaa on paljon — lisää helppoja lenkkejä."],
  none: ["", "Ei riittävästi dataa 28 pv:ltä."],
};

export function renderDetails(container, model, goal, onGoalChange) {
  container.innerHTML = "";

  // goal selector
  const goalsEl = document.createElement("div");
  goalsEl.className = "goals";
  for (const [key, g] of Object.entries(GOALS)) {
    const b = document.createElement("button");
    b.textContent = g.label;
    if (key === goal) b.className = "on";
    b.addEventListener("click", () => onGoalChange(key));
    goalsEl.appendChild(b);
  }
  container.appendChild(goalsEl);

  // headline goal metric
  const gm = goalMetric(goal, model);
  const metric = document.createElement("div");
  metric.className = "gmetric";
  metric.innerHTML = `<span class="lbl">${gm.label}</span> <span class="num">${gm.value ?? "–"}</span> <span class="u">${gm.unit}</span>`;
  container.appendChild(metric);

  // coaching tips
  const tips = document.createElement("div");
  tips.className = "tips";
  tips.innerHTML = (model.coaching || []).map((t) => `<div class="tip ${t.severity}">${t.text}</div>`).join("")
    || `<div class="tip info">Lisää treenejä saadaksesi valmennusvinkkejä.</div>`;
  container.appendChild(tips);

  // 80/20
  const it = model.intensity;
  const iv = document.createElement("div"); iv.className = "block";
  const [dcls, dtext] = DRIFT[(it && it.drift) || "none"];
  iv.innerHTML = `<div class="lbl">Intensiteetti · 80/20</div>${it && it.drift !== "none" ? bar8020(it) : ""}<div class="sub ${dcls}">${dtext}</div>`;
  container.appendChild(iv);

  // VO2max
  const vv = document.createElement("div"); vv.className = "block";
  vv.innerHTML = `<div class="lbl">VO₂max-estimaatti</div>`;
  if (model.vdot?.current != null) {
    const num = document.createElement("div"); num.className = "num big"; num.textContent = model.vdot.current;
    vv.appendChild(num);
    if (model.vdot.points.length >= 2) vv.appendChild(sparkline(model.vdot.points));
  } else {
    vv.insertAdjacentHTML("beforeend", `<div class="sub">Tarvitaan ≥ 3 km suoritus arvioon.</div>`);
  }
  container.appendChild(vv);

  // HR (conditional)
  const hv = document.createElement("div"); hv.className = "block";
  if (model.hr) {
    const z = model.hr.zoneMinutes.map((m) => Math.round(m));
    const total = z.reduce((s, x) => s + x, 0) || 1;
    const zbar = z.map((m, i) => (m > 0 ? `<span class="zseg z${i + 1}" style="width:${(m / total) * 100}%"></span>` : "")).join("");
    hv.innerHTML = `<div class="lbl">Sykealueet · max ${model.hr.maxHr}</div><div class="zbar">${zbar}</div><div class="sub">Helppo ${model.hr.easyPct}% · keski ${model.hr.moderatePct}% · kova ${model.hr.hardPct}%</div>`;
  } else {
    hv.innerHTML = `<div class="lbl">Syke</div><div class="sub">Ei sykedataa GPX-tiedostoissa.</div>`;
  }
  container.appendChild(hv);
}
