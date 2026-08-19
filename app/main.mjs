import { parseGpx } from "../src/parse/gpx.mjs";
import { parseCompact, workoutsToCompactFile, sportFromFilename } from "../src/parse/compact.mjs";
import { summarizeWorkout } from "../src/analysis/workout.mjs";
import { aggregate } from "../src/analysis/aggregate.mjs";
import { splitBlocks, slopePerDay, comeback, activeFrequencyPerWeek } from "../src/analysis/breaks.mjs";
import { spikeRisk } from "../src/analysis/spikeRisk.mjs";
import { acwr } from "../src/analysis/trainingLoad.mjs";
import { detrainingNote } from "../src/analysis/detraining.mjs";
import { intensityDistribution } from "../src/analysis/intensity.mjs";
import { vdotTrend } from "../src/analysis/vo2max.mjs";
import { hrSummary } from "../src/analysis/hrZones.mjs";
import { byYear, byMonth } from "../src/analysis/periods.mjs";
import { records } from "../src/analysis/records.mjs";
import { bySport, sportOptions, filterBySport } from "../src/analysis/sports.mjs";
import { coachingTips } from "../src/analysis/coaching.mjs";
import { renderVerdict } from "./render/verdict.mjs";
import { renderOverview } from "./render/overview.mjs";
import { renderProgress } from "./render/charts.mjs";
import { renderHealth } from "./render/health.mjs";
import { renderTable } from "./render/table.mjs";
import { renderPeriods } from "./render/periods.mjs";

let workouts = [];
let goal = "endurance";
let tab = "overview";
let sport = null; // null = kaikki lajit
let currentModel = null;
let saveButton = null;

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
    breaks: cbs,
    detraining: lastGap ? detrainingNote(lastGap.gapDays) : null,
    intensity: intensityDistribution(ws),
    vdot: vdotTrend(ws),
    hr: hrSummary(ws),
    periods: { years: byYear(ws), months: byMonth(ws) },
    records: records(ws),
  };
}

/** Stable identity for de-duplication: the Sports Tracker key when known, else the start time. */
const identity = (w) => w.key || `d${w.date}`;

async function addFiles(fileList) {
  const rejected = [];
  const seen = new Set(workouts.map(identity));

  const take = (workout) => {
    const id = identity(workout);
    if (seen.has(id)) return false; // same workout from a second file
    seen.add(id);
    workouts.push(workout);
    return true;
  };

  for (const file of fileList) {
    // Per-file guard: dropping hundreds of files should not lose everything
    // because one of them is truncated, unreadable or not a track at all.
    try {
      const text = await file.text();

      // A compact export carries a whole history in one small file; GPX carries
      // one workout. Both end up as the same workout objects.
      const compact = parseCompact(text);
      if (compact) {
        const added = compact.filter(take).length;
        if (!added) rejected.push(file.name);
        continue;
      }

      const parsed = parseGpx(text);
      if (!parsed) { rejected.push(file.name); continue; } // non-GPX / track-less
      const sport = sportFromFilename(file.name);
      if (!take({ id: file.name, ...(sport ? { sport } : {}), ...parsed, ...summarizeWorkout(parsed.points) })) {
        rejected.push(file.name);
      }
    } catch (e) {
      rejected.push(file.name);
      console.warn(`Treeniloki: ${file.name} ohitettiin — ${e.message}`);
    }
  }
  workouts.sort((a, b) => a.date - b.date);
  update();
  reportRejected(rejected);
  saveButton.hidden = workouts.length === 0;
  collapseLoader();
}

/**
 * Kirjoita ladatut treenit kevyeksi tiedostoksi.
 *
 * Tämä sulkee kierron: GPX-vienti säilyttää reittiviivan arkistona, ja tästä
 * saa siitä huolimatta pienen tiedoston puhelinta varten ilman että koko
 * vientiä tarvitsee ajaa uudelleen Sports Trackeria vasten.
 */
function saveCompact() {
  if (!workouts.length) return;
  const json = JSON.stringify(workoutsToCompactFile(workouts));
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `treeniloki-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari lukee blobin vasta kun klikki on käsitelty, joten heti vapautettu
  // osoite tuottaa siellä tyhjän tiedoston. Selain siivoaa osoitteen joka
  // tapauksessa sivun sulkeutuessa.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Kutista tiedostojen lisäys kun treenejä on ladattu.
 *
 * Tyhjällä sivulla pudotusalue on tärkein asia näkyvissä; datan jälkeen se on
 * vain tilaa, joka työntää tulokset alaspäin. Raahaus toimii silti kutistettuun
 * riviin, joten toiminto ei katoa vaikka se pienenee.
 */
function collapseLoader() {
  const loader = document.getElementById("loader");
  if (!loader) return;
  const hasData = workouts.length > 0;
  loader.classList.toggle("has-data", hasData);
  if (hasData) loader.open = false;
}

/** Name the skipped files, so silence never looks like success. */
function reportRejected(rejected) {
  const el = document.getElementById("drop-note");
  if (!el) return;
  el.textContent = rejected.length
    ? `${rejected.length} tiedostoa ohitettiin (ei GPS-reittiä tai vioittunut): ` +
      `${rejected.slice(0, 3).join(", ")}${rejected.length > 3 ? " …" : ""}`
    : "";
}

/**
 * Kokoa ja piirrä näkymä valitulla lajirajauksella.
 *
 * Lajivalinta rajaa koko sivun, ei yhtä paneelia: tahti, VO₂max ja 80/20 ovat
 * juoksun mittoja, eivätkä ne tarkoita samaa jos pyöräily lasketaan mukaan.
 */
function update() {
  const shown = filterBySport(workouts, sport);
  const model = buildModel(shown);
  model.sports = bySport(workouts); // erittely aina koko historiasta
  model.sport = sport;
  renderSportPicker();
  render(model);
}

function renderSportPicker() {
  const el = document.getElementById("sports");
  if (!el) return;
  const options = sportOptions(workouts);
  el.hidden = options.length === 0;
  if (el.hidden) { el.innerHTML = ""; return; }

  el.innerHTML = `<span class="sl">Laji</span>`;
  const button = (value, label, count) => {
    const b = document.createElement("button");
    b.innerHTML = `${label}${count != null ? ` <span class="c">${count}</span>` : ""}`;
    if (value === sport) b.className = "on";
    b.addEventListener("click", () => { sport = value; update(); });
    el.appendChild(b);
  };
  button(null, "Kaikki", workouts.length);
  for (const o of options) button(o.sport, o.label, o.count);
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
  renderPeriods(document.getElementById("tab-periods"), model);
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

/**
 * Kytke sovellus sivuun. index.html kutsuu tätä; ilman kutsua moduulin
 * lataaminen ei koske DOMiin lainkaan.
 *
 * Aiemmin kytkentä tapahtui moduulin latautuessa. Se toimi selaimessa mutta
 * pakotti testit lataamaan moduulin uudelleen jokaista tuoretta DOMia varten
 * (`main.mjs?jotain`), ja kattavuusraportti laskee jokaisen kyselymerkkijonon
 * omaksi skriptikseen — main.mjs näytti puoliksi testaamattomalta vaikka ei
 * ollut. Nyt tuonti on kertaluontoinen ja tila nollataan tästä.
 */
export function bootstrap() {
  workouts = [];
  goal = "endurance";
  tab = "overview";
  sport = null;
  currentModel = null;

  saveButton = document.getElementById("save-compact");
  saveButton.addEventListener("click", saveCompact);

  // Raahaus otetaan vastaan sekä pudotusalueella että sen ympäröivällä rivillä,
  // jotta se toimii myös silloin kun lisäys on kutistettu yhdeksi riviksi.
  for (const id of ["drop", "loader"]) {
    const zone = document.getElementById(id);
    if (!zone) continue;
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("over");
      addFiles(e.dataTransfer.files);
    });
  }
  document.getElementById("file").addEventListener("change", (e) => addFiles(e.target.files));

  for (const b of document.querySelectorAll("#tabs .tab")) {
    b.addEventListener("click", () => setTab(b.dataset.tab));
  }
}

export { buildModel };
