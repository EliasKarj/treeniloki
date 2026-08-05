import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGpx } from "../src/parse/gpx.mjs";

const SAMPLE = `<?xml version="1.0"?>
<gpx><trk><name>Aamulenkki</name><trkseg>
<trkpt lat="60.1000" lon="25.0000"><ele>10.0</ele><time>2024-06-01T06:00:00Z</time></trkpt>
<trkpt lat="60.1010" lon="25.0000"><ele>12.0</ele><time>2024-06-01T06:10:00Z</time></trkpt>
</trkseg></trk></gpx>`;

test("parseGpx extracts name, date and points", () => {
  const w = parseGpx(SAMPLE);
  assert.equal(w.name, "Aamulenkki");
  assert.equal(w.points.length, 2);
  assert.equal(w.points[0].lat, 60.1);
  assert.equal(w.points[0].lon, 25);
  assert.equal(w.points[0].ele, 10);
  assert.equal(w.points[1].ele, 12);
  assert.equal(w.date, Date.parse("2024-06-01T06:00:00Z"));
  assert.equal(w.points[1].t, Date.parse("2024-06-01T06:10:00Z"));
});

test("parseGpx returns null when there are no timestamped trackpoints", () => {
  assert.equal(parseGpx("<gpx></gpx>"), null);
  assert.equal(parseGpx(`<gpx><trkpt lat="1" lon="2"><ele>3</ele></trkpt></gpx>`), null);
});

const HR_SAMPLE = `<?xml version="1.0"?>
<gpx><trk><name>Sykelenkki</name><trkseg>
<trkpt lat="60.1" lon="25.0"><ele>10</ele><time>2024-06-01T06:00:00Z</time>
<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
<trkpt lat="60.101" lon="25.0"><ele>12</ele><time>2024-06-01T06:10:00Z</time>
<extensions><hr>160</hr></extensions></trkpt>
</trkseg></trk></gpx>`;

test("parseGpx reads heart rate from gpxtpx:hr and plain <hr>", () => {
  const w = parseGpx(HR_SAMPLE);
  assert.equal(w.points[0].hr, 140);
  assert.equal(w.points[1].hr, 160);
  assert.equal(w.avgHr, 150);
  assert.equal(w.maxHr, 160);
});

test("parseGpx leaves hr null and omits avgHr when no HR present", () => {
  const w = parseGpx(SAMPLE);
  assert.equal(w.points[0].hr, null);
  assert.equal(w.avgHr, undefined);
});
