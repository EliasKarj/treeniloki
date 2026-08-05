function canvas(w, h) {
  const c = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
  const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
  return { c, ctx, w, h };
}

function distanceChart(model) {
  const { c, ctx, w, h } = canvas(560, 150);
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

function elevationChart(model) {
  const { c, ctx, w, h } = canvas(420, 150);
  const last = model.workouts[model.workouts.length - 1];
  const pts = (last && last.points) || [];
  const eles = pts.map((p) => p.ele);
  const lo = Math.min(...eles, 0), hi = Math.max(...eles, 1);
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = (i / Math.max(pts.length - 1, 1)) * w;
    const y = h - ((p.ele - lo) / (hi - lo || 1)) * (h - 8);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#35d0e0"; ctx.lineWidth = 1; ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = "rgba(53,208,224,.15)"; ctx.fill();
  return c;
}

export function renderCharts(el, model) {
  el.innerHTML = "";
  const left = document.createElement("div"); left.className = "panel";
  const trend = model.trends.distance >= 0 ? "good" : "warn";
  left.innerHTML = `<div class="lbl" style="margin-bottom:8px">Matka / aika + trendi <span class="${trend}">${model.trends.distance >= 0 ? "↑" : "↓"} ${(model.trends.distance * 30).toFixed(1)} km/kk</span></div>`;
  left.appendChild(distanceChart(model));
  const right = document.createElement("div"); right.className = "panel";
  right.innerHTML = `<div class="lbl" style="margin-bottom:6px">Korkeusprofiili · viimeisin lenkki</div>`;
  right.appendChild(elevationChart(model));
  el.append(left, right);
}
