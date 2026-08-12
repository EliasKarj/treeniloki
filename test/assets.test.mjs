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

test("the export tool stays a single self-contained file", async () => {
  const source = await read("tools/sports-tracker-export.js");
  // It is pasted into a browser console, so it cannot import anything.
  assert.doesNotMatch(source, /(?:^|\n)\s*import\s/, "the console script must not use import");
  assert.doesNotMatch(source, /\brequire\(/, "the console script must not use require");
  assert.match(source, /module\.exports/, "but it must still expose its helpers to the tests");
});
