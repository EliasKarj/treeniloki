// Tests for tools/zip.js — the store-only zip writer that replaced the CDN copy
// of JSZip in the bookmarklet.
//
// The archive has to be readable by whatever unpacks it on the other side, and
// "it downloaded something" is not evidence of that: the old path produced an
// empty file and still looked like a success. So these tests parse the bytes
// back the way an unzip tool does — central directory, local headers, CRC — and
// fail on anything a real reader would reject.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { zipWriter, crc32, MAX_FILES } = require("../tools/zip.js");

const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());
const u16 = (b, at) => b[at] | (b[at + 1] << 8);
const u32 = (b, at) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** Read an archive the way an unzip tool does: end record → central directory → local headers. */
function readZip(bytes) {
  const eocd = bytes.length - 22;
  assert.equal(u32(bytes, eocd), 0x06054b50, "missing end-of-central-directory signature");
  const count = u16(bytes, eocd + 10);
  let at = u32(bytes, eocd + 16);

  const files = [];
  for (let i = 0; i < count; i++) {
    assert.equal(u32(bytes, at), 0x02014b50, `central header ${i} has a bad signature`);
    const crc = u32(bytes, at + 16);
    const size = u32(bytes, at + 24);
    const nameLen = u16(bytes, at + 28);
    const offset = u32(bytes, at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));

    // Follow the recorded offset into the local header — a wrong offset is the
    // classic way a hand-written zip opens in one tool and fails in another.
    assert.equal(u32(bytes, offset), 0x04034b50, `local header for ${name} has a bad signature`);
    assert.equal(u16(bytes, offset + 8), 0, `${name} must be stored, not compressed`);
    const localNameLen = u16(bytes, offset + 26);
    const extraLen = u16(bytes, offset + 28);
    const start = offset + 30 + localNameLen + extraLen;
    const data = bytes.subarray(start, start + size);

    assert.equal(crc32(data), crc, `${name} fails its own CRC`);
    files.push({ name, text: new TextDecoder().decode(data), size });
    at += 46 + nameLen + u16(bytes, at + 30) + u16(bytes, at + 32);
  }
  return files;
}

test("an archive round-trips through a reader that follows the central directory", async () => {
  const z = zipWriter();
  z.add("2024-01-01_running_abc.gpx", "<gpx><trk><name>Aamulenkki</name></trk></gpx>");
  z.add("2024-01-02_running_def.gpx", "<gpx><trk><name>Iltalenkki</name></trk></gpx>");
  const files = readZip(await bytesOf(z.finish()));

  assert.equal(files.length, 2);
  assert.deepEqual(files.map((f) => f.name), ["2024-01-01_running_abc.gpx", "2024-01-02_running_def.gpx"]);
  assert.match(files[0].text, /Aamulenkki/);
  assert.match(files[1].text, /Iltalenkki/);
});

test("Scandinavian names and content survive as UTF-8", async () => {
  // The UTF-8 flag in the header is what makes this work; without it the name
  // is read as CP437 and "Mäkilenkki" arrives mangled.
  const z = zipWriter();
  z.add("2024-03-01_running_ääkkönen.gpx", "<gpx><name>Mäkilenkki Töölössä</name></gpx>");
  const [file] = readZip(await bytesOf(z.finish()));
  assert.equal(file.name, "2024-03-01_running_ääkkönen.gpx");
  assert.match(file.text, /Mäkilenkki Töölössä/);
});

test("the stored size is the byte length, not the character count", async () => {
  const z = zipWriter();
  const text = "ääää"; // 4 merkkiä, 8 tavua
  z.add("a.gpx", text);
  const [file] = readZip(await bytesOf(z.finish()));
  assert.equal(file.size, 8);
  assert.equal(file.text, text);
});

test("a large entry keeps its offsets straight", async () => {
  const z = zipWriter();
  const big = "<trkpt lat=\"60.17\" lon=\"24.94\"></trkpt>".repeat(20000);
  z.add("small.gpx", "x");
  z.add("big.gpx", big);
  z.add("after.gpx", "y");
  const files = readZip(await bytesOf(z.finish()));
  assert.equal(files[1].text.length, big.length);
  assert.equal(files[2].text, "y", "the entry after a large one must still be findable");
});

test("count and bytes track what has been added", () => {
  const z = zipWriter();
  assert.equal(z.count(), 0);
  assert.equal(z.bytes(), 0);
  z.add("a.gpx", "hello");
  assert.equal(z.count(), 1);
  // Paikallinen otsikko (30) + nimi (5) + sisältö (5).
  assert.equal(z.bytes(), 40);
});

test("an empty archive is still a valid one", async () => {
  const bytes = await bytesOf(zipWriter().finish());
  assert.equal(bytes.length, 22, "just the end record");
  assert.deepEqual(readZip(bytes), []);
});

test("more entries than zip32 can index is refused, not truncated", () => {
  const z = zipWriter();
  // Ohitetaan varsinainen lisääminen: 65 535 tiedostoa veisi testissä minuutteja.
  // Raja luetaan samasta vakiosta jota toteutus käyttää.
  assert.equal(MAX_FILES, 0xffff);
  z.add("a.gpx", "x");
  assert.equal(z.count(), 1);
  assert.throws(() => {
    for (let i = 0; i < MAX_FILES + 1; i++) z.add(`f${i}.gpx`, "");
  }, /65 535/);
});

test("crc32 matches the known value for the standard check string", () => {
  // "123456789" → 0xCBF43926 on the reference value every CRC-32 implementation
  // is checked against, so a subtly wrong table fails here rather than in a
  // zip that some tools open and others reject.
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});
