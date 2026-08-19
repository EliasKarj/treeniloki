// Zip-kirjoitin ilman kirjastoa.
//
// Aiemmin GPX-vienti ilman kansiovalintaa haki JSZipin CDN:stä. Kirjanmerkki
// ajetaan sports-tracker.comin omassa kontekstissa, jonka CSP voi estää vieraan
// skriptin — ja silloin vienti epäonnistui hiljaa: varapolku latasi tiedostot
// yksitellen, mikä tuhannella treenillä ei ole vaihtoehto. Tämä poistaa koko
// ulkoisen riippuvuuden.
//
// Pakkausta ei ole (menetelmä 0, "store"). GPX on tekstiä ja pakkautuisi hyvin,
// mutta deflate vaatisi joko kirjaston tai oman toteutuksen, ja sen hinta olisi
// juuri se riippuvuus josta halutaan eroon. Levytila on halvempaa kuin hiljaa
// epäonnistuva vienti.
//
// Muisti on syy siihen että jokainen tiedosto suljetaan omaksi Blobikseen heti:
// selain pitää Blobin sisällön oman rekisterinsä puolella ja siirtää sen
// tarvittaessa levylle, joten JS-keossa on vain keskushakemiston rivit
// (~60 tavua per tiedosto). Koko 3436 treenin vienti mahtuu näin muistiin,
// vaikka sisältö olisi gigatavuja.
(function (root) {
  "use strict";

  var CRC_TABLE = null;
  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
  }

  function crc32(data) {
    var t = crcTable();
    var c = 0xffffffff;
    for (var i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function utf8(str) {
    return new TextEncoder().encode(str);
  }

  /** Pikkuendian-kirjoitin: zip on kauttaaltaan little-endian. */
  function writer(size) {
    var buf = new Uint8Array(size);
    var view = new DataView(buf.buffer);
    var at = 0;
    return {
      u16: function (v) { view.setUint16(at, v, true); at += 2; },
      u32: function (v) { view.setUint32(at, v >>> 0, true); at += 4; },
      raw: function (b) { buf.set(b, at); at += b.length; },
      done: function () { return buf; },
    };
  }

  /** Kellonaika MS-DOS-muodossa. Zip ei tunne muuta. */
  function dosStamp(date) {
    var d = date instanceof Date ? date : new Date(date || Date.now());
    var year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  function localHeader(nameBytes, entry) {
    var w = writer(30 + nameBytes.length);
    w.u32(0x04034b50);
    w.u16(20);             // tarvittava versio
    w.u16(0x0800);         // lippu: nimi on UTF-8
    w.u16(0);              // menetelmä: store
    w.u16(entry.time); w.u16(entry.date);
    w.u32(entry.crc); w.u32(entry.size); w.u32(entry.size);
    w.u16(nameBytes.length); w.u16(0);
    w.raw(nameBytes);
    return w.done();
  }

  function centralHeader(entry) {
    var w = writer(46 + entry.name.length);
    w.u32(0x02014b50);
    w.u16(20); w.u16(20);
    w.u16(0x0800);
    w.u16(0);
    w.u16(entry.time); w.u16(entry.date);
    w.u32(entry.crc); w.u32(entry.size); w.u32(entry.size);
    w.u16(entry.name.length);
    w.u16(0); w.u16(0); w.u16(0); w.u16(0);
    w.u32(0);              // ulkoiset attribuutit
    w.u32(entry.offset);
    w.raw(entry.name);
    return w.done();
  }

  function endRecord(count, dirSize, dirOffset) {
    var w = writer(22);
    w.u32(0x06054b50);
    w.u16(0); w.u16(0);
    w.u16(count); w.u16(count);
    w.u32(dirSize); w.u32(dirOffset);
    w.u16(0);
    return w.done();
  }

  // Zip32:n katto. Yli neljä gigatavua tai 65 535 tiedostoa vaatisi ZIP64:n,
  // eikä puolivalmis paketti ole parempi kuin rehellinen virhe.
  var MAX_BYTES = 0xffffffff;
  var MAX_FILES = 0xffff;

  /**
   * Kerää tiedostot zipiksi yksi kerrallaan.
   *
   *   var z = zipWriter();
   *   z.add("a.gpx", "<gpx…>");
   *   var blob = z.finish();
   */
  function zipWriter() {
    var parts = [];
    var entries = [];
    var offset = 0;

    return {
      add: function (name, text, when) {
        var nameBytes = utf8(name);
        var data = utf8(text);
        var stamp = dosStamp(when);
        var entry = {
          name: nameBytes, crc: crc32(data), size: data.length,
          time: stamp.time, date: stamp.date, offset: offset,
        };
        var head = localHeader(nameBytes, entry);
        if (offset + head.length + data.length > MAX_BYTES) {
          throw new Error("Zip ylittää 4 Gt:n rajan — käytä kansioon tallennusta tai komentoriviä.");
        }
        if (entries.length >= MAX_FILES) {
          throw new Error("Zip ei kata yli 65 535 tiedostoa — käytä kansioon tallennusta tai komentoriviä.");
        }
        // Yksi Blob per tiedosto: sisältö siirtyy selaimen blob-rekisteriin,
        // eikä jää JS-kekoon odottamaan finish():iä.
        parts.push(new Blob([head, data]));
        entries.push(entry);
        offset += head.length + data.length;
        return entry;
      },

      count: function () { return entries.length; },
      bytes: function () { return offset; },

      finish: function () {
        var dirOffset = offset;
        var dirSize = 0;
        var dir = [];
        for (var i = 0; i < entries.length; i++) {
          var h = centralHeader(entries[i]);
          dir.push(h);
          dirSize += h.length;
        }
        dir.push(endRecord(entries.length, dirSize, dirOffset));
        return new Blob(parts.concat(dir), { type: "application/zip" });
      },
    };
  }

  var zip = { zipWriter: zipWriter, crc32: crc32, MAX_FILES: MAX_FILES, MAX_BYTES: MAX_BYTES };

  if (typeof module !== "undefined" && module.exports) module.exports = zip;
  else root.TreenilokiZip = zip;
})(typeof globalThis !== "undefined" ? globalThis : this);
