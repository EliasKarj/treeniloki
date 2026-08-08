/** Plain-language top-line status derived from the view model. */
export function verdict(model) {
  const ws = model.workouts || [];
  if (ws.length < 3) {
    return {
      trend: "flat", trendText: "Kerää lisää dataa",
      risk: "low", riskText: "loukkaantumisriski matala",
      text: "Kerää lisää dataa · loukkaantumisriski matala",
    };
  }
  const slope = model.trends?.pace ?? 0;
  const trend = slope < -0.005 ? "up" : slope > 0.005 ? "down" : "flat";
  const trendText = trend === "up" ? "Kunto nousussa" : trend === "down" ? "Kunto laskussa" : "Kunto vakaa";

  const spikes = model.spikes || [];
  let band = "none";
  for (let i = spikes.length - 1; i >= 0; i--) {
    if (!spikes[i].suppressed && spikes[i].band !== "none") { band = spikes[i].band; break; }
  }
  const ratio = model.load?.ratio ?? 0;
  const risk = (band === "high" || ratio > 1.5) ? "high"
    : (band === "moderate" || ratio > 1.3) ? "moderate" : "low";
  const riskText = risk === "high" ? "loukkaantumisriski korkea"
    : risk === "moderate" ? "loukkaantumisriski kohonnut" : "loukkaantumisriski matala";

  return { trend, trendText, risk, riskText, text: `${trendText} · ${riskText}` };
}
