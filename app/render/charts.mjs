function canvas(w, h) {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  return { c, ctx, w, h };
}

function distanceChart(model) {
  const { c, ctx, w, h } = canvas(560, 140);
  const ws = model.workouts;
  const max = Math.max(1, ...ws.map((x) => x.distanceKm));
  const bw = w / Math.max(ws.length, 1);
  ws.forEach((x, i) => {
    const bh = (x.distanceKm / max) * (h - 10);
    const flagged = model.spikes[i].band !== "none" && !model.spikes[i].suppressed;
    ctx.fillStyle = flagged ? "#e8a24a" : "#1d6f7a";
    ctx.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
  });
  if (ws.length >= 2) {
    const t0 = ws[0].date, span = (ws[ws.length - 1].date - t0) / 86400000 || 1;
    const meanX = ws.reduce((s, x) => s + (x.date - t0) / 86400000, 0) / ws.length;
    const meanY = ws.reduce((s, x) => s + x.distanceKm, 0) / ws.length;
    const b = model.trends.distance;
    const y0 = meanY + b * (0 - meanX), y1 = meanY + b * (span - meanX);
    ctx.strokeStyle = "#e8a24a"; ctx.setLineDash([4, 3]); ctx.beginPath();
    ctx.moveTo(0, h - (y0 / max) * (h - 10)); ctx.lineTo(w, h - (y1 / max) * (h - 10)); ctx.stroke(); ctx.setLineDash([]);
  }
  return c;
}

function lineChart(points, color) {
  const { c, ctx, w, h } = canvas(560, 120);
  if (points.length < 2) return c;
  const t0 = points[0].date, span = (points[points.length - 1].date - t0) || 1;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
  points.forEach((p, i) => {
    const x = ((p.date - t0) / span) * w;
    const y = h - 6 - ((p.value - lo) / (hi - lo || 1)) * (h - 12);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  return c;
}

export function renderProgress(el, model) {
  el.innerHTML = "";
  const ws = model.workouts;

  const d = document.createElement("div"); d.className = "panel";
  const trendCls = model.trends.distance >= 0 ? "good" : "warn";
  d.innerHTML = `<div class="lbl" style="margin-bottom:8px">Matka / aika · kehityssuunta <span class="${trendCls}">${model.trends.distance >= 0 ? "↑" : "↓"} ${(model.trends.distance * 30).toFixed(1)} km/kk</span></div>`;
  d.appendChild(distanceChart(model));

  const p = document.createElement("div"); p.className = "panel";
  p.innerHTML = `<div class="lbl" style="margin-bottom:8px">Tahti <span class="tech">min/km · ylös = hitaampi</span></div>`;
  p.appendChild(lineChart(ws.map((x) => ({ date: x.date, value: x.paceMinKm })), "#35d0e0"));

  const v = document.createElement("div"); v.className = "panel";
  v.innerHTML = `<div class="lbl" style="margin-bottom:8px">Kestävyyskunto <span class="tech">VO₂max-arvio</span></div>`;
  if (model.vdot?.points?.length >= 2) v.appendChild(lineChart(model.vdot.points, "#7fd97f"));
  else v.insertAdjacentHTML("beforeend", `<div class="sub">Tarvitaan ≥ 3 km suorituksia arvioon.</div>`);

  el.append(d, p, v);
}
