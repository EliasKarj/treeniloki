import { fmtPace } from "../../src/analysis/workout.mjs";
import { peakKm } from "../../src/analysis/periods.mjs";

/** Tunteja ja minuutteja, esim. "34 h 12 min". Pitkillä kausilla pelkät minuutit ovat lukukelvottomia. */
export function fmtDuration(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h.toLocaleString("fi-FI")} h ${m} min` : `${m} min`;
}

const km = (v) => Math.round(v).toLocaleString("fi-FI");

/**
 * Yksi kausitaulukko. Jokaisella rivillä on suhteellinen palkki, jotta rivistön
 * voi silmäillä lukematta lukuja — hiljaiset ja kovat kaudet erottuvat heti.
 */
function periodTable(title, periods, note) {
  if (!periods.length) return "";
  const peak = peakKm(periods) || 1;
  const rows = periods.map((p) => `
    <tr>
      <td class="pl">${p.label}</td>
      <td class="pbar"><span style="width:${Math.max(2, (p.km / peak) * 100)}%"></span></td>
      <td class="num">${km(p.km)}<span class="u"> km</span></td>
      <td class="num">${p.count}</td>
      <td class="num">${fmtDuration(p.minutes)}</td>
      <td class="num">${km(p.elev)}<span class="u"> m</span></td>
      <td class="num">${fmtPace(p.avgPace)}</td>
    </tr>`).join("");

  // Vieritys puhelinta varten: seitsemän saraketta ei mahdu 390 pikseliin, ja
  // leikkautunut sarake on huonompi kuin vieritettävä. Palkki piilotetaan
  // kapealla näytöllä erikseen — kahden pikselin levyisenä se ei kerro mitään.
  return `<div class="panel">
    <div class="lbl" style="margin-bottom:8px">${title}${note ? ` <span class="tech">${note}</span>` : ""}</div>
    <div class="tscroll"><table class="periods">
      <thead><tr>
        <th>Kausi</th><th class="pbar"></th><th>Matka</th><th>Lenkkejä</th><th>Aika</th><th>Nousu</th><th>Tahti</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

/**
 * Lajierittely koko historiasta — myös silloin kun sivu on rajattu yhteen lajiin.
 * Rajaus kertoo mitä katsot; tämä taulukko kertoo mitä on olemassa.
 */
function sportTable(sports) {
  if (!sports || sports.length < 2) return "";
  const peak = sports[0].km || 1;
  const rows = sports.map((g) => `
    <tr>
      <td class="pl">${g.label}</td>
      <td class="pbar"><span style="width:${Math.max(2, (g.km / peak) * 100)}%"></span></td>
      <td class="num">${km(g.km)}<span class="u"> km</span></td>
      <td class="num">${g.count}</td>
      <td class="num">${fmtDuration(g.minutes)}</td>
      <td class="num">${km(g.elev)}<span class="u"> m</span></td>
      <td class="num">${fmtPace(g.avgPace)}</td>
      <td class="num">${g.share.toFixed(0)}<span class="u"> %</span></td>
    </tr>`).join("");

  return `<div class="panel">
    <div class="lbl" style="margin-bottom:8px">Lajit <span class="tech">koko historia</span></div>
    <div class="tscroll"><table class="periods">
      <thead><tr>
        <th>Laji</th><th class="pbar"></th><th>Matka</th><th>Lenkkejä</th><th>Aika</th><th>Nousu</th><th>Tahti</th><th>Osuus</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

export function renderPeriods(el, model) {
  const years = model.periods?.years || [];
  const months = model.periods?.months || [];

  if (!years.length) {
    el.innerHTML = `<div class="panel"><div class="sub">Lisää treenejä nähdäksesi kausiyhteenvedot.</div></div>`;
    return;
  }

  el.innerHTML =
    sportTable(model.sports) +
    periodTable("Vuodet", years) +
    periodTable("Kuukaudet", months, "uusin ensin");
}
