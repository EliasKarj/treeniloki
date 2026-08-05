// Regex-based GPX trackpoint parser (no DOMParser → works in Node + browser).
// Returns { name, date(ms), points:[{lat,lon,ele,t}] } or null if there is no usable track.
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
    const eleM = inner.match(/<ele>([-\d.]+)<\/ele>/);
    const hrM = inner.match(/<(?:[a-zA-Z0-9]+:)?hr>(\d+)<\/(?:[a-zA-Z0-9]+:)?hr>/);
    points.push({
      lat: parseFloat(m[1]),
      lon: parseFloat(m[2]),
      ele: eleM ? parseFloat(eleM[1]) : 0,
      hr: hrM ? parseInt(hrM[1], 10) : null,
      t,
    });
  }
  if (points.length < 2) return null;
  const hrs = points.map((p) => p.hr).filter((h) => h != null);
  const out = { name, date: points[0].t, points };
  if (hrs.length) {
    out.avgHr = Math.round(hrs.reduce((s, h) => s + h, 0) / hrs.length);
    out.maxHr = Math.max(...hrs);
  }
  return out;
}
