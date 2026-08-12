import { fmtPace } from "../../src/analysis/workout.mjs";

// Kaaviot piirretään käsin canvakselle, ilman kirjastoja.
//
// Aiemmin niissä ei ollut yhtään tekstiä: viiva nousi ja laski, mutta lukijalle
// ei kerrottu mitä arvoja se kulkee eikä miltä ajalta. Nyt jokaisessa on
// asteikon ääriarvot ja aikaväli, ja lisäksi lukema kohdasta jota osoittaa —
// numeroiden pitää olla luettavissa, ei pääteltävissä muodosta.

const PAD_LEFT = 44;   // tilaa y-akselin luvuille
const PAD_BOTTOM = 16; // tilaa päivämäärille
const PAD_TOP = 8;

const AXIS = "#4a5a6b";
const GRID = "#172029";

function canvas(w, h) {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  return { c, ctx, w, h };
}

// "2.24" luettiin päivämääräksi vaikka se tarkoitti helmikuuta 2024.
// Kauttaviiva erottaa kuukauden ja vuoden yksiselitteisesti.
const shortDate = (ms) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getFullYear()}`;
};
const fullDate = (ms) => new Date(ms).toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric" });

/** Asteikko, ruudukko ja aikaväli. Palauttaa piirtoalueen rajat. */
function frame(ctx, w, h, { lo, hi, from, to, format }) {
  const plot = { x0: PAD_LEFT, x1: w, y0: PAD_TOP, y1: h - PAD_BOTTOM };
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = AXIS;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;

  // Kolme viivaa: ylä, keski, ala. Enempi vie tilaa enemmän kuin antaa tietoa.
  for (const t of [0, 0.5, 1]) {
    const y = plot.y1 - t * (plot.y1 - plot.y0);
    const value = lo + t * (hi - lo);
    ctx.beginPath();
    ctx.moveTo(plot.x0, Math.round(y) + 0.5);
    ctx.lineTo(plot.x1, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(format(value), PAD_LEFT - 6, y);
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(shortDate(from), plot.x0, h - 4);
  ctx.textAlign = "right";
  ctx.fillText(shortDate(to), plot.x1, h - 4);
  return plot;
}

/**
 * Lukema osoitetusta kohdasta. Sama käsittely hiirelle ja kosketukselle, koska
 * historiaa selataan yhtä usein puhelimella kuin koneella.
 */
function attachReadout(c, panel, series, describe) {
  const out = document.createElement("div");
  out.className = "readout";
  out.textContent = "";
  panel.appendChild(out);

  const show = (clientX) => {
    if (!series.length) return;
    const rect = c.getBoundingClientRect ? c.getBoundingClientRect() : { left: 0, width: 1 };
    const frac = rect.width ? (clientX - rect.left) / rect.width : 0;
    const plotFrac = (frac - PAD_LEFT / 560) / (1 - PAD_LEFT / 560);
    const i = Math.max(0, Math.min(series.length - 1, Math.round(plotFrac * (series.length - 1))));
    out.textContent = describe(series[i]);
  };

  c.addEventListener("mousemove", (e) => show(e.clientX));
  c.addEventListener("mouseleave", () => { out.textContent = ""; });
  c.addEventListener("touchstart", (e) => { if (e.touches?.[0]) show(e.touches[0].clientX); });
  c.addEventListener("touchmove", (e) => { if (e.touches?.[0]) show(e.touches[0].clientX); });
}

function distanceChart(model, panel) {
  const { c, ctx, w, h } = canvas(560, 170);
  const ws = model.workouts;
  if (!ws.length) return c;

  const max = Math.max(1, ...ws.map((x) => x.distanceKm));
  const plot = frame(ctx, w, h, {
    lo: 0, hi: max,
    from: ws[0].date, to: ws[ws.length - 1].date,
    format: (v) => `${v.toFixed(0)} km`,
  });

  const inner = plot.x1 - plot.x0;
  const bw = inner / ws.length;
  ws.forEach((x, i) => {
    const bh = (x.distanceKm / max) * (plot.y1 - plot.y0);
    const flagged = model.spikes[i].band !== "none" && !model.spikes[i].suppressed;
    ctx.fillStyle = flagged ? "#e8a24a" : "#1d6f7a";
    ctx.fillRect(plot.x0 + i * bw + 0.5, plot.y1 - bh, Math.max(1, bw - 1), bh);
  });

  if (ws.length >= 2) {
    const t0 = ws[0].date, span = (ws[ws.length - 1].date - t0) / 86400000 || 1;
    const meanX = ws.reduce((s, x) => s + (x.date - t0) / 86400000, 0) / ws.length;
    const meanY = ws.reduce((s, x) => s + x.distanceKm, 0) / ws.length;
    const b = model.trends.distance;
    const y = (val) => plot.y1 - (val / max) * (plot.y1 - plot.y0);
    ctx.strokeStyle = "#e8a24a"; ctx.setLineDash([4, 3]); ctx.beginPath();
    ctx.moveTo(plot.x0, y(meanY + b * (0 - meanX)));
    ctx.lineTo(plot.x1, y(meanY + b * (span - meanX)));
    ctx.stroke(); ctx.setLineDash([]);
  }

  attachReadout(c, panel, ws, (x) =>
    `${fullDate(x.date)} · ${x.distanceKm.toFixed(1)} km · ${fmtPace(x.paceMinKm)} min/km`);
  return c;
}

function lineChart(points, color, panel, format, describe) {
  const { c, ctx, w, h } = canvas(560, 150);
  if (points.length < 2) return c;

  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  // Tasainen sarja litistyisi viivaksi asteikon pohjalle; pieni marginaali
  // pitää sen keskellä ja kertoo rehellisesti että vaihtelua ei ole.
  const pad = (hi - lo) * 0.1 || Math.max(0.5, hi * 0.05);
  const plot = frame(ctx, w, h, {
    lo: lo - pad, hi: hi + pad,
    from: points[0].date, to: points[points.length - 1].date,
    format,
  });

  const t0 = points[0].date, span = (points[points.length - 1].date - t0) || 1;
  const range = (hi + pad) - (lo - pad);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
  points.forEach((p, i) => {
    const x = plot.x0 + ((p.date - t0) / span) * (plot.x1 - plot.x0);
    const y = plot.y1 - ((p.value - (lo - pad)) / range) * (plot.y1 - plot.y0);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  attachReadout(c, panel, points, describe);
  return c;
}

export function renderProgress(el, model) {
  el.innerHTML = "";
  const ws = model.workouts;

  const d = document.createElement("div"); d.className = "panel";
  const trendCls = model.trends.distance >= 0 ? "good" : "warn";
  d.innerHTML = `<div class="lbl" style="margin-bottom:8px">Matka / aika · kehityssuunta ` +
    `<span class="${trendCls}">${model.trends.distance >= 0 ? "↑" : "↓"} ${(model.trends.distance * 30).toFixed(1)} km/kk</span></div>`;
  d.appendChild(distanceChart(model, d));

  const p = document.createElement("div"); p.className = "panel";
  p.innerHTML = `<div class="lbl" style="margin-bottom:8px">Tahti <span class="tech">min/km · ylös = hitaampi</span></div>`;
  p.appendChild(lineChart(
    ws.map((x) => ({ date: x.date, value: x.paceMinKm })), "#35d0e0", p,
    (v) => fmtPace(v),
    (pt) => `${fullDate(pt.date)} · ${fmtPace(pt.value)} min/km`,
  ));

  const v = document.createElement("div"); v.className = "panel";
  v.innerHTML = `<div class="lbl" style="margin-bottom:8px">Kestävyyskunto <span class="tech">VO₂max-arvio</span></div>`;
  if (model.vdot?.points?.length >= 2) {
    v.appendChild(lineChart(
      model.vdot.points, "#7fd97f", v,
      (val) => val.toFixed(1),
      (pt) => `${fullDate(pt.date)} · VO₂max ${pt.value}`,
    ));
  } else {
    v.insertAdjacentHTML("beforeend", `<div class="sub">Tarvitaan ≥ 3 km suorituksia arvioon.</div>`);
  }

  el.append(d, p, v);
}
