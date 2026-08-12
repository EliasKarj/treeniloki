// Guards the deployed artefact rather than the logic.
//
// CI publishes this directory to GitHub Pages verbatim — no bundler resolves
// anything, so a stylesheet path or module specifier that does not exist on
// disk is a blank page in production that every unit test would happily miss.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFile(resolve(ROOT, p), "utf8");
const exists = async (p) => access(resolve(ROOT, p)).then(() => true, () => false);

const isLocal = (url) => !/^(https?:)?\/\//.test(url) && !url.startsWith("data:") && !url.startsWith("#");

test("every local href and src in index.html exists on disk", async () => {
  const html = await read("index.html");
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter(isLocal);

  assert.ok(refs.length > 0, "expected index.html to reference local assets");
  for (const ref of refs) {
    assert.ok(await exists(ref), `index.html references a missing file: ${ref}`);
  }
});

test("index.html loads the app as an ES module", async () => {
  const html = await read("index.html");
  // Without type="module" the imports in main.mjs are a syntax error in the browser.
  assert.match(html, /<script\s+type="module"\s+src="app\/main\.mjs"><\/script>/);
});

test("index.html declares every element main.mjs looks up", async () => {
  const [html, main] = await Promise.all([read("index.html"), read("app/main.mjs")]);
  const ids = [...main.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);

  assert.ok(ids.length > 0, "expected main.mjs to look up elements by id");
  for (const id of new Set(ids)) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html is missing #${id}, which main.mjs reads`);
  }
});

test("index.html provides the tab and panel structure main.mjs queries", async () => {
  const html = await read("index.html");
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ["overview", "progress", "health", "workouts"]);
  for (const tab of tabs) {
    assert.match(html, new RegExp(`id="tab-${tab}"[^>]*class="tabpanel"`), `missing panel for ${tab}`);
  }
});

/** Walk the static import graph from an entry module and return every file reached. */
async function moduleGraph(entry, seen = new Set()) {
  const abs = resolve(ROOT, entry);
  const rel = relative(ROOT, abs);
  if (seen.has(rel)) return seen;
  seen.add(rel);

  const source = await readFile(abs, "utf8");
  const specifiers = [...source.matchAll(/(?:^|\n)\s*import\s[^"']*from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  for (const spec of specifiers) {
    if (!spec.startsWith(".")) continue; // bare specifiers would need node_modules
    await moduleGraph(relative(ROOT, resolve(dirname(abs), spec)), seen);
  }
  return seen;
}

test("every module imported from app/main.mjs resolves to a real file", async () => {
  const graph = await moduleGraph("app/main.mjs");
  for (const file of graph) {
    assert.ok(await exists(file), `unresolved module in the graph: ${file}`);
  }
  // The entry pulls in the whole render layer and the analysis modules.
  assert.ok(graph.size > 15, `expected a broad graph, reached only ${graph.size} files`);
  assert.ok(graph.has("src/parse/gpx.mjs"), "the parser should be reachable from the entry");
});

test("no analysis module reaches into the DOM", async () => {
  const graph = await moduleGraph("app/main.mjs");
  const analysis = [...graph].filter((f) => f.startsWith("src/"));
  assert.ok(analysis.length > 10, "expected the analysis layer in the graph");

  for (const file of analysis) {
    const source = await read(file);
    // src/ is the pure layer: it must stay runnable in Node without a stub.
    assert.doesNotMatch(source, /\bdocument\.|\bwindow\.|localStorage/, `${file} touches the DOM`);
  }
});

test("the bookmarklet sources stay self-contained", async () => {
  // export.html concatenates these two into a javascript: URL. Anything they
  // pulled in at runtime would either break (no module loader in a bookmarklet)
  // or be blocked by the host page's CSP.
  for (const file of ["tools/core.js", "tools/export-overlay.js"]) {
    const source = await read(file);
    assert.doesNotMatch(source, /(?:^|\n)\s*import\s/, `${file} must not use import`);
    assert.doesNotMatch(source, /(?:^|\n)\s*(?:const|let|var).*\brequire\(/, `${file} must not use require`);
  }
});

test("core.js works in both Node and a bare browser page", async () => {
  const source = await read("tools/core.js");
  assert.match(source, /module\.exports = core/, "Node needs the CommonJS export");
  assert.match(source, /root\.TreenilokiCore = core/, "the bookmarklet needs the global");
  // The shared core is transport-only; anything DOM-shaped belongs in the overlay.
  assert.doesNotMatch(source, /\bdocument\.|showDirectoryPicker/, "core.js must stay DOM-free");
});

test("the overlay uses the shared core rather than its own copy of the fetch logic", async () => {
  const source = await read("tools/export-overlay.js");
  assert.match(source, /window\.TreenilokiCore/, "the overlay must read the shared core");
  assert.doesNotMatch(source, /apiserver\/v1/, "API paths belong to core.js alone");
});

test("export.html builds its bookmarklet from files that exist", async () => {
  const html = await read("export.html");
  const fetched = [...html.matchAll(/fetch\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(fetched.length >= 2, "expected the page to assemble the bookmarklet from sources");
  for (const ref of fetched) {
    assert.ok(await exists(ref), `export.html fetches a missing file: ${ref}`);
  }
  assert.match(html, /javascript:/, "the bookmarklet needs a javascript: URL");
});

test("export.html illustrates the drag and the click with accessible inline SVG", async () => {
  const html = await read("export.html");
  const figures = html.match(/<figure>/g) || [];
  assert.equal(figures.length, 2, "expected one diagram per non-obvious step");

  // Inline only: an <img> would be an extra request and could 404 on Pages.
  assert.doesNotMatch(html, /<img\b/, "diagrams must stay inline SVG");

  // Every diagram needs a title wired to aria-labelledby for screen readers.
  const labelled = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(labelled.length, 2);
  for (const id of labelled) {
    assert.match(html, new RegExp(`<title id="${id}">[^<]+</title>`), `missing <title> for ${id}`);
  }

  // The diagrams use theme tokens rather than baked-in colours.
  assert.match(html, /\.d-acc \{ fill: var\(--accent\)/, "diagrams should follow the site theme");
});
