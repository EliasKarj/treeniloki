// Vihamielinen ja vioittunut syöte.
//
// GPX-tiedosto voi tulla tuntemattomalta, rikkinäiseltä laitteelta tai olla
// katkennut kesken. Uhkamalli on rajattu — sovellus on paikallinen, palvelinta
// ei ole eikä muiden dataa ole olemassa — joten pahin mitä tiedosto voi tehdä on
// rikkoa *oman* näkymäsi. Se riittää syyksi: yksi NaN-koordinaatti levittyy
// matkasta tahtiin, summiin ja jokaiseen kaavioon.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGpx } from "../src/parse/gpx.mjs";
import { summarizeWorkout } from "../src/analysis/workout.mjs";
import { aggregate } from "../src/analysis/aggregate.mjs";
import { hrSummary } from "../src/analysis/hrZones.mjs";

const wrap = (points, name = "t") =>
  `<gpx><trk><name>${name}</name><trkseg>${points.join("")}</trkseg></trk></gpx>`;
const pt = (lat, lon, iso, extra = "") =>
  `<trkpt lat="${lat}" lon="${lon}">${extra}<time>${iso}</time></trkpt>`;

const allFinite = (obj) =>
  Object.entries(obj).every(([, v]) => typeof v !== "number" || Number.isFinite(v));

// ------------------------------------------------------------------- XSS

test("a script tag in the workout name never survives parsing", () => {
  // The name pattern excludes "<", so a payload containing it cannot be captured
  // at all — the match falls through to the default name.
  for (const payload of [
    "<script>alert(1)</script>",
    '"><img src=x onerror=alert(1)>',
    "</td><td onclick=alert(1)>",
  ]) {
    const parsed = parseGpx(wrap(
      [pt(60, 24.9, "2025-01-01T10:00:00Z"), pt(60.01, 24.9, "2025-01-01T10:06:00Z")],
      payload,
    ));
    assert.equal(parsed.name, "Treeni", `payload leaked: ${payload}`);
    assert.doesNotMatch(parsed.name, /[<>]/);
  }
});

test("an entity-encoded payload stays inert text, never markup", () => {
  // innerHTML decodes entities into text nodes, so "&lt;script&gt;" renders as
  // visible characters and is not executed. Verified in Chromium as well.
  const parsed = parseGpx(wrap(
    [pt(60, 24.9, "2025-01-01T10:00:00Z"), pt(60.01, 24.9, "2025-01-01T10:06:00Z")],
    "&lt;script&gt;alert(1)&lt;/script&gt;",
  ));
  assert.equal(parsed.name, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.doesNotMatch(parsed.name, /<script/, "no raw tag may appear");
});

// -------------------------------------------------------------------- XXE

test("an external entity is never expanded — there is no XXE surface", () => {
  const xxe = `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
    ${wrap([pt(60, 24.9, "2025-01-01T10:00:00Z"), pt(60.01, 24.9, "2025-01-01T10:06:00Z")], "&xxe;")}`;
  const parsed = parseGpx(xxe);
  assert.equal(parsed.name, "&xxe;", "the entity must stay a literal string");
});

// --------------------------------------------------- numeeriset koordinaatit

test("coordinates that parse to NaN are dropped, not carried into the maths", () => {
  // Regressio: "..." ja "-" täyttävät merkkiluokan mutta tuottavat NaN:n, joka
  // ennen levisi matkaan ja sitä kautta koko yhteenvetoon.
  const parsed = parseGpx(wrap([
    pt("...", 24.9, "2025-01-01T10:00:00Z"),
    pt("-", 24.9, "2025-01-01T10:01:00Z"),
    pt(60.0, 24.9, "2025-01-01T10:02:00Z"),
    pt(60.05, 24.9, "2025-01-01T10:30:00Z"),
  ]));
  assert.equal(parsed.points.length, 2, "only the two valid points remain");
  const s = summarizeWorkout(parsed.points);
  assert.ok(allFinite(s), `summary went non-finite: ${JSON.stringify(s)}`);
  assert.ok(s.distanceKm > 0);
});

test("coordinates outside the WGS84 range are dropped", () => {
  const parsed = parseGpx(wrap([
    pt(99999999999, 24.9, "2025-01-01T10:00:00Z"),
    pt(60, 999, "2025-01-01T10:01:00Z"),
    pt(60.0, 24.9, "2025-01-01T10:02:00Z"),
    pt(60.05, 24.9, "2025-01-01T10:30:00Z"),
  ]));
  assert.equal(parsed.points.length, 2);
  assert.ok(parsed.points.every((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180));
});

test("one hostile file cannot make the whole aggregate non-finite", () => {
  const good = parseGpx(wrap([
    pt(60.0, 24.9, "2025-01-02T10:00:00Z"),
    pt(60.05, 24.9, "2025-01-02T10:30:00Z"),
  ]));
  const hostile = parseGpx(wrap([
    pt("...", 24.9, "2025-01-01T10:00:00Z"),
    pt(60.0, 24.9, "2025-01-01T10:02:00Z"),
    pt(60.02, 24.9, "2025-01-01T10:20:00Z"),
  ]));
  const workouts = [good, hostile].map((p) => ({ ...p, ...summarizeWorkout(p.points) }));
  const agg = aggregate(workouts);
  assert.ok(allFinite(agg), `aggregate poisoned: ${JSON.stringify(agg)}`);
});

test("an unparseable elevation falls back to zero rather than NaN", () => {
  const parsed = parseGpx(wrap([
    pt(60.0, 24.9, "2025-01-01T10:00:00Z", "<ele>.....</ele>"),
    pt(60.05, 24.9, "2025-01-01T10:30:00Z", "<ele>12.5</ele>"),
  ]));
  assert.ok(parsed.points.every((p) => Number.isFinite(p.ele)));
  assert.ok(Number.isFinite(summarizeWorkout(parsed.points).elevGain));
});

// ----------------------------------------------------------- aikaleimat

test("points arriving out of order are sorted, never yielding a negative duration", () => {
  // Regressio: käänteinen pari tuotti keston −2630880 min ja negatiivisen tahdin.
  const parsed = parseGpx(wrap([
    pt(60.0, 24.9, "2025-01-01T10:30:00Z"),
    pt(60.05, 24.9, "2025-01-01T10:00:00Z"),
  ]));
  const s = summarizeWorkout(parsed.points);
  assert.ok(s.durationMin > 0, `duration was ${s.durationMin}`);
  assert.ok(s.paceMinKm > 0, `pace was ${s.paceMinKm}`);
  assert.equal(parsed.date, parsed.points[0].t, "date must be the earliest point");
});

test("identical timestamps yield zero duration instead of dividing by zero", () => {
  const parsed = parseGpx(wrap([
    pt(60.0, 24.9, "2025-01-01T10:00:00Z"),
    pt(60.05, 24.9, "2025-01-01T10:00:00Z"),
  ]));
  const s = summarizeWorkout(parsed.points);
  assert.equal(s.durationMin, 0);
  assert.ok(allFinite(s));
});

// -------------------------------------------------------------- syke

test("an implausible heart rate is treated as missing, not as the zone ceiling", () => {
  // Yksi 999-lukema siirtäisi kaikki sykealueet ja saisi koko harjoittelun
  // näyttämään helpolta, koska alueet lasketaan havaitusta maksimista.
  const parsed = parseGpx(wrap([
    pt(60.0, 24.9, "2025-01-01T10:00:00Z", "<extensions><gpxtpx:hr>999</gpxtpx:hr></extensions>"),
    pt(60.02, 24.9, "2025-01-01T10:10:00Z", "<extensions><gpxtpx:hr>150</gpxtpx:hr></extensions>"),
    pt(60.05, 24.9, "2025-01-01T10:30:00Z", "<extensions><gpxtpx:hr>160</gpxtpx:hr></extensions>"),
  ]));
  assert.equal(parsed.maxHr, 160, "the bogus reading must not become the max");
  assert.equal(parsed.points[0].hr, null);
  assert.ok(hrSummary([parsed]).maxHr <= 240);
});

test("a zero or absurd heart rate does not become the observed maximum", () => {
  const parsed = parseGpx(wrap([
    pt(60.0, 24.9, "2025-01-01T10:00:00Z", "<extensions><gpxtpx:hr>0</gpxtpx:hr></extensions>"),
    pt(60.05, 24.9, "2025-01-01T10:30:00Z", "<extensions><gpxtpx:hr>140</gpxtpx:hr></extensions>"),
  ]));
  assert.equal(parsed.maxHr, 140);
  assert.equal(parsed.avgHr, 140, "the discarded reading must not skew the mean either");
});

// ------------------------------------------------- koko, kesto, kaatumiset

test("a very long track does not blow the call stack", () => {
  // Regressio: Math.max(...hrs) heitti RangeErrorin noin 125 000 lukeman
  // jälkeen. 40 tunnin ultra sekunnin näytteistyksellä ylittää sen itsestään,
  // eli tämä ei vaatinut pahantahtoista tiedostoa.
  const n = 150000;
  const points = new Array(n);
  const base = Date.UTC(2025, 0, 1);
  for (let i = 0; i < n; i++) {
    points[i] = `<trkpt lat="60.${String(i % 10000).padStart(5, "0")}" lon="24.9">` +
      `<extensions><gpxtpx:hr>140</gpxtpx:hr></extensions>` +
      `<time>${new Date(base + i * 1000).toISOString()}</time></trkpt>`;
  }
  const parsed = parseGpx(wrap(points));
  assert.equal(parsed.points.length, n);
  assert.equal(parsed.maxHr, 140);
});

test("a truncated or malformed document is rejected instead of throwing", () => {
  for (const bad of [
    "",
    "not xml at all",
    "<gpx>",
    "<gpx><trk><name>t</name><trkseg><trkpt lat=\"60\" lon=\"24\">",
    `<gpx><trkpt lat="60" lon="24"><time>ei-aika</time></trkpt></gpx>`,
    `<gpx><trkpt lat="60" lon="24"></trkpt></gpx>`,
    JSON.stringify({ definitely: "not gpx" }),
  ]) {
    assert.doesNotThrow(() => parseGpx(bad), `threw on: ${bad.slice(0, 30)}`);
    assert.equal(parseGpx(bad), null, `should reject: ${bad.slice(0, 30)}`);
  }
});

test("an unterminated trkpt does not send the parser quadratic", () => {
  // Laziness bounded by ">" keeps this linear; the assertion is a guard against
  // a future regex change turning it into a hang.
  const evil = `<gpx><trk><name>t</name><trkseg><trkpt ` + "a".repeat(200000);
  const started = Date.now();
  assert.equal(parseGpx(evil), null);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1000, `parsing took ${elapsed} ms — possible ReDoS`);
});

test("parseGpx does not pollute Object.prototype", () => {
  parseGpx(wrap(
    [pt(60, 24.9, "2025-01-01T10:00:00Z"), pt(60.01, 24.9, "2025-01-01T10:06:00Z")],
    "__proto__",
  ));
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});
