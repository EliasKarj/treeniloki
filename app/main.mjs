import { parseGpx } from "../src/parse/gpx.mjs";
import { summarizeWorkout } from "../src/analysis/workout.mjs";
import { aggregate } from "../src/analysis/aggregate.mjs";
import { splitBlocks, slopePerDay, comeback, activeFrequencyPerWeek } from "../src/analysis/breaks.mjs";
import { spikeRisk } from "../src/analysis/spikeRisk.mjs";
import { acwr } from "../src/analysis/trainingLoad.mjs";
import { detrainingNote } from "../src/analysis/detraining.mjs";
import { intensityDistribution } from "../src/analysis/intensity.mjs";
import { vdotTrend } from "../src/analysis/vo2max.mjs";
import { hrSummary } from "../src/analysis/hrZones.mjs";
import { coachingTips } from "../src/analysis/coaching.mjs";
import { renderVerdict } from "./render/verdict.mjs";
import { renderOverview } from "./render/overview.mjs";
import { renderProgress } from "./render/charts.mjs";
import { renderHealth } from "./render/health.mjs";
import { renderTable } from "./render/table.mjs";

let workouts = [];
let goal = "endurance";
let tab = "overview";
let currentModel = null;

function buildModel(ws) {
  const blocks = splitBlocks(ws);
  const cbs = comeback(ws);
  const lastGap = cbs.length ? cbs[cbs.length - 1] : null;
  return {
    workouts: ws,
    agg: aggregate(ws),
    frequency: activeFrequencyPerWeek(blocks),
    trends: {
      pace: slopePerDay(ws, (w) => w.paceMinKm),
      distance: slopePerDay(ws, (w) => w.distanceKm),
      elev: slopePerDay(ws, (w) => w.elevGain),
    },
    spikes: spikeRisk(ws),
    load: acwr(ws),
    lastComeback: lastGap,
    detraining: lastGap ? detrainingNote(lastGap.gapDays) : null,
    intensity: intensityDistribution(ws),
    vdot: vdotTrend(ws),
    hr: hrSummary(ws),
  };
}

async function addFiles(fileList) {
  for (const file of fileList) {
    const text = await file.text();
    const parsed = parseGpx(text);
    if (!parsed) continue; // skip non-GPX / track-less
    workouts.push({ id: file.name, ...parsed, ...summarizeWorkout(parsed.points) });
  }
  workouts.sort((a, b) => a.date - b.date);
  render(buildModel(workouts));
}

function render(model) {
  currentModel = model;
  model.coaching = coachingTips(model, goal);
  document.getElementById("hd-meta").textContent = `${model.agg.count} treeniä`;
  renderVerdict(document.getElementById("verdict"), model);
  renderOverview(document.getElementById("tab-overview"), model, goal, setGoal);
  renderProgress(document.getElementById("tab-progress"), model);
  renderHealth(document.getElementById("tab-health"), model);
  renderTable(document.getElementById("tab-workouts"), model);
}

function setGoal(g) {
  goal = g;
  currentModel.coaching = coachingTips(currentModel, goal);
  renderOverview(document.getElementById("tab-overview"), currentModel, goal, setGoal);
}

function setTab(id) {
  tab = id;
  for (const b of document.querySelectorAll("#tabs .tab")) b.classList.toggle("on", b.dataset.tab === id);
  for (const p of document.querySelectorAll(".tabpanel")) p.hidden = p.id !== `tab-${id}`;
}

const drop = document.getElementById("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
document.getElementById("file").addEventListener("change", (e) => addFiles(e.target.files));

for (const b of document.querySelectorAll("#tabs .tab")) b.addEventListener("click", () => setTab(b.dataset.tab));

export { buildModel };
