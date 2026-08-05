import { detrainingNote } from "./detraining.mjs";
import { goalWeight } from "./goals.mjs";

const DAY = 86400000;
const RANK = { alert: 3, warn: 2, info: 1 };

function trailing30MaxKm(workouts, refDate) {
  let max = 0;
  for (const w of workouts) {
    const age = (refDate - w.date) / DAY;
    if (age > 0 && age <= 30 && w.distanceKm > max) max = w.distanceKm;
  }
  return max;
}

/** Ranked, goal-aware coaching tips derived from the view model. */
export function coachingTips(model, goal = "endurance", now = Date.now()) {
  const ws = model.workouts || [];
  const lastW = ws[ws.length - 1];
  const tips = [];

  // spike
  const lastSpike = model.spikes?.[model.spikes.length - 1];
  if (lastSpike && lastW && !lastSpike.suppressed && lastSpike.band !== "none") {
    const cap = Math.round(trailing30MaxKm(ws.slice(0, -1), lastW.date) * 1.1) || Math.round(lastW.distanceKm);
    if (lastSpike.band === "high") {
      tips.push({ area: "spike", severity: "alert", text: `Viime lenkki oli iso hyppäys. Pidä seuraava pitkä ≤ ${cap} km.` });
    } else {
      tips.push({ area: "spike", severity: "warn", text: `Matka nousi reippaasti. Vältä seuraavaa isoa hyppäystä (≤ ${cap} km).` });
    }
  }

  // load (ACWR)
  const ratio = model.load?.ratio ?? 0;
  if (ratio > 1.5) {
    tips.push({ area: "load", severity: "warn", text: `Kuorma noussut nopeasti (ACWR ${ratio.toFixed(2)}). Harkitse kevennysviikkoa.` });
  } else if (ratio > 0 && ratio < 0.8 && ws.length > 3) {
    tips.push({ area: "load", severity: "info", text: `Kuorma matala (ACWR ${ratio.toFixed(2)}) — tilaa lisätä maltilla.` });
  }

  // break / comeback (only when the last workout is recent)
  if (model.lastComeback && lastW && (now - lastW.date) / DAY <= 21) {
    const note = detrainingNote(model.lastComeback.gapDays);
    if (note) tips.push({ area: "break", severity: "info", text: `${note} Aloita ~60 % entisestä volyymista, +10 %/vk.` });
  }

  // intensity 80/20
  const it = model.intensity;
  if (it && it.drift && it.drift !== "none") {
    if (it.drift === "grey") {
      tips.push({ area: "intensity", severity: "warn", text: `Liikaa keskitehoa (${it.moderatePct} %). Helpot helpommaksi, kovat kovemmaksi (80/20).` });
    } else if (it.drift === "tooHard") {
      tips.push({ area: "intensity", severity: "warn", text: `Kovaa on paljon (${it.hardPct} %). Lisää helppoja lenkkejä palautumiseen.` });
    } else {
      tips.push({ area: "intensity", severity: "info", text: `Intensiteettijakauma hyvä (${it.easyPct} % helppoa).` });
    }
  }

  // pace trend
  if (ws.length >= 3 && model.trends) {
    if (model.trends.pace < 0) {
      tips.push({ area: "trend", severity: "info", text: `Tahti paranee tasaisesti — jatka samaan malliin.` });
    } else if (model.trends.pace > 0) {
      tips.push({ area: "trend", severity: "info", text: `Tahti on hieman hidastunut. Tarkista lepo ja 80/20-jakauma.` });
    }
  }

  // vdot direction
  if (model.vdot?.current != null && model.vdot.points?.length >= 2) {
    const first = model.vdot.points[0].value, cur = model.vdot.current;
    const dir = cur > first ? "noussut" : cur < first ? "laskenut" : "vakaa";
    tips.push({ area: "vdot", severity: "info", text: `VO₂max-estimaatti ${cur} (${dir}). Paras tuore suoritus ratkaisee.` });
  }

  return tips.sort((a, b) =>
    (goalWeight(goal, b.area) - goalWeight(goal, a.area)) || (RANK[b.severity] - RANK[a.severity]));
}
