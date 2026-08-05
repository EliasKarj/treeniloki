import { parseGpx } from "../src/parse/gpx.mjs";
import { summarizeWorkout } from "../src/analysis/workout.mjs";
import { aggregate } from "../src/analysis/aggregate.mjs";
import { splitBlocks, slopePerDay, comeback, activeFrequencyPerWeek } from "../src/analysis/breaks.mjs";
import { spikeRisk } from "../src/analysis/spikeRisk.mjs";
import { acwr } from "../src/analysis/trainingLoad.mjs";
import { detrainingNote } from "../src/analysis/detraining.mjs";

let workouts = [];

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
  // Replaced by real renderers in Tasks 9–10.
  console.log("model", model);
  document.getElementById("hd-meta").textContent = `${model.agg.count} treeniä`;
}

const drop = document.getElementById("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
document.getElementById("file").addEventListener("change", (e) => addFiles(e.target.files));

export { buildModel };
