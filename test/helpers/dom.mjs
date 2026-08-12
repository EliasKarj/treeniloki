// Minimal DOM stand-in so the render layer can be exercised in Node.
//
// Deliberately dependency-free: pulling in jsdom would break the project's
// "no dependencies" promise for the sake of tests. Only the handful of APIs
// that app/main.mjs and app/render/* actually touch is implemented — anything
// else is absent on purpose, so an untested DOM call fails loudly rather than
// silently passing against a fake that is more capable than the real thing.

/** Canvas 2D context whose every method is a no-op and every property settable. */
function fakeContext() {
  return new Proxy(
    {},
    {
      get: (target, key) => (key in target ? target[key] : (target[key] = () => {})),
      set: (target, key, value) => ((target[key] = value), true),
    },
  );
}

class FakeClassList {
  constructor(el) {
    this.el = el;
  }
  get _set() {
    return new Set(String(this.el.className).split(/\s+/).filter(Boolean));
  }
  _write(set) {
    this.el.className = [...set].join(" ");
  }
  add(name) {
    const s = this._set;
    s.add(name);
    this._write(s);
  }
  remove(name) {
    const s = this._set;
    s.delete(name);
    this._write(s);
  }
  contains(name) {
    return this._set.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.contains(name) : force;
    on ? this.add(name) : this.remove(name);
    return on;
  }
}

export class FakeElement {
  constructor(tag = "div", id = "") {
    this.tagName = String(tag).toUpperCase();
    this.id = id;
    // Ordered mix of markup strings and child elements, so html() reflects the
    // real insertion order rather than lumping all raw markup at the front.
    this.nodes = [];
    this.listeners = {};
    this.className = "";
    this.textContent = "";
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.width = 0;
    this.height = 0;
    this.classList = new FakeClassList(this);
  }

  set innerHTML(value) {
    this.nodes = [String(value)];
  }
  get innerHTML() {
    return this.html();
  }

  appendChild(child) {
    this.nodes.push(child);
    return child;
  }
  append(...children) {
    for (const c of children) this.nodes.push(c);
  }
  insertAdjacentHTML(position, markup) {
    if (position !== "beforeend") throw new Error(`FakeElement: unsupported position ${position}`);
    this.nodes.push(String(markup));
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  /** Fire a listener the way the browser would, for interaction tests. */
  dispatch(type, event = {}) {
    for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, ...event });
  }
  getContext() {
    return fakeContext();
  }

  /** Rendered markup of this element and its subtree, in insertion order. */
  html() {
    return this.nodes.map((n) => (typeof n === "string" ? n : n.html())).join("");
  }
  /** Child elements only (raw markup strings excluded). */
  get children() {
    return this.nodes.filter((n) => typeof n !== "string");
  }
  /** Text contributed by this subtree — button labels and the like. */
  text() {
    return this.textContent + this.children.map((c) => c.text()).join("");
  }
}

/**
 * Install a document/window pair carrying the elements index.html declares.
 * Returns the element registry plus an uninstall function; call uninstall in a
 * test teardown so suites cannot leak globals into one another.
 */
export function installAppDom() {
  const ids = [
    "app", "hd-meta", "drop", "drop-note", "file", "verdict", "tabs",
    "tab-overview", "tab-progress", "tab-health", "tab-workouts",
  ];
  // The id must be set on the element itself: setTab() picks the visible panel
  // by comparing p.id, so an id-less stub would hide every panel at once.
  const byId = Object.fromEntries(ids.map((id) => [id, new FakeElement("div", id)]));

  const tabs = ["overview", "progress", "health", "workouts"].map((name) => {
    const b = new FakeElement("button");
    b.dataset.tab = name;
    b.className = name === "overview" ? "tab on" : "tab";
    return b;
  });
  const panels = ["overview", "progress", "health", "workouts"].map((name) => byId[`tab-${name}`]);

  const previous = { document: globalThis.document, window: globalThis.window };

  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => byId[id] ?? null,
    querySelectorAll: (selector) => {
      if (selector === "#tabs .tab") return tabs;
      if (selector === ".tabpanel") return panels;
      throw new Error(`FakeDocument: unhandled selector ${selector}`);
    },
  };
  globalThis.window = { devicePixelRatio: 1 };

  const uninstall = () => {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
  };
  return { byId, tabs, panels, uninstall };
}
