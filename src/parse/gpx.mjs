// Regex-based GPX trackpoint parser (no DOMParser → works in Node + browser).
// Returns { name, date(ms), points:[{lat,lon,ele,hr,t}] } or null if there is no
// usable track.
//
// Everything here treats the input as untrusted. A GPX file can come from a
// stranger, from a buggy device, or simply be truncated — and one bad point must
// not be able to poison the whole dashboard, because a single NaN coordinate
// propagates through distance, pace, every aggregate and every chart. So each
// field is validated where it is parsed, and a point that fails is dropped.
export function parseGpx(xml) {
  const nameMatch = xml.match(/<name>([^<]*)<\/name>/);
  const name = nameMatch ? nameMatch[1].trim() : "Treeni";

  const points = [];
  const re = /<trkpt\s+[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?>([\s\S]*?)<\/trkpt>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const inner = m[3];
    const timeM = inner.match(/<time>([^<]+)<\/time>/);
    if (!timeM) continue; // need a timestamp to be useful
    const t = Date.parse(timeM[1]);
    if (Number.isNaN(t)) continue;

    // "..." and "-" both satisfy the character class but parse to NaN, and a
    // coordinate outside the WGS84 range is a sensor or encoding error.
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (!inRange(lat, 90) || !inRange(lon, 180)) continue;

    const eleM = inner.match(/<ele>([-\d.]+)<\/ele>/);
    const ele = eleM ? parseFloat(eleM[1]) : 0;
    const hrM = inner.match(/<(?:[a-zA-Z0-9]+:)?hr>(\d+)<\/(?:[a-zA-Z0-9]+:)?hr>/);
    const hr = hrM ? parseInt(hrM[1], 10) : null;

    points.push({
      lat,
      lon,
      ele: Number.isFinite(ele) ? ele : 0,
      // Zones are derived from the highest HR seen across the whole history, so
      // one spurious 999 would shift every zone boundary and make all training
      // read as easy. Implausible readings are treated as missing.
      hr: hr !== null && hr >= 25 && hr <= 240 ? hr : null,
      t,
    });
  }
  if (points.length < 2) return null;

  // Devices occasionally emit points out of order; a reversed pair would
  // otherwise produce a negative duration and a negative pace.
  points.sort((a, b) => a.t - b.t);

  const out = { name, date: points[0].t, points };

  // A loop rather than Math.max(...hrs): the spread form throws RangeError once
  // the array passes roughly 125k entries, which a long run at one-second
  // sampling reaches on its own — it does not take a malicious file.
  let sum = 0, count = 0, max = null;
  for (const p of points) {
    if (p.hr == null) continue;
    sum += p.hr;
    count++;
    if (max === null || p.hr > max) max = p.hr;
  }
  if (count) {
    out.avgHr = Math.round(sum / count);
    out.maxHr = max;
  }
  return out;
}

const inRange = (value, limit) => Number.isFinite(value) && Math.abs(value) <= limit;
