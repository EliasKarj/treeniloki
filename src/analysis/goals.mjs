export const GOALS = {
  speed:     { label: "Nopeus",             metricKey: "vdot",    unit: "VO₂max",    areas: ["vdot", "intensity", "trend"] },
  endurance: { label: "Kestävyys",          metricKey: "easyPct", unit: "% helppoa", areas: ["intensity", "load", "trend"] },
  fatloss:   { label: "Rasvanpoltto",       metricKey: "easyMin", unit: "min/28pv",  areas: ["intensity", "break", "load"] },
  injury:    { label: "Loukkaantumissuoja", metricKey: "spike",   unit: "×",         areas: ["spike", "load", "break"] },
};

/** Headline {label, value, unit} for the selected goal. value may be null. */
export function goalMetric(goal, model) {
  const g = GOALS[goal] || GOALS.endurance;
  let value = null;
  switch (g.metricKey) {
    case "vdot": value = model.vdot?.current ?? null; break;
    case "easyPct": value = model.intensity?.easyPct ?? null; break;
    case "easyMin": value = model.intensity?.easyMin ?? null; break;
    case "spike": {
      const s = model.spikes?.[model.spikes.length - 1];
      value = s ? Math.round(s.ratio * 100) / 100 : null;
      break;
    }
  }
  return { label: g.label, value, unit: g.unit };
}

/** Sort weight for a coaching area under a goal (higher = more relevant). */
export function goalWeight(goal, area) {
  const g = GOALS[goal] || GOALS.endurance;
  const idx = g.areas.indexOf(area);
  return idx === -1 ? 0 : g.areas.length - idx;
}
