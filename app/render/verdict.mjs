import { verdict } from "../../src/analysis/verdict.mjs";

export function renderVerdict(el, model) {
  const v = verdict(model);
  const riskCls = v.risk === "high" ? "risk-high" : v.risk === "moderate" ? "risk-mod" : "risk-low";
  const arrow = v.trend === "up" ? "↑" : v.trend === "down" ? "↓" : "→";
  el.className = `verdict ${riskCls}`;
  el.innerHTML = `<span class="vt">${arrow} ${v.trendText}</span><span class="vr">${v.riskText}</span>`;
}
