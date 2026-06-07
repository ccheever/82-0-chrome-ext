// Unit tests for live board parsing edge cases.
// Run: node --test test/board.test.mjs

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

class FakeElement {
  constructor(tag, text = "", opts = {}) {
    this.tagName = tag.toUpperCase();
    this._text = text;
    this.className = opts.className || "";
    this.disabled = !!opts.disabled;
    this.attrs = opts.attrs || {};
    this.parentElement = null;
    this.children = [];
    for (const child of opts.children || []) this.appendChild(child);
  }

  get innerText() {
    return [this._text, ...this.children.map((c) => c.innerText)].filter(Boolean).join("\n");
  }

  set innerText(value) {
    this._text = value;
    this.children = [];
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  getBoundingClientRect() {
    return { width: 10, height: 10 };
  }

  matches(selector) {
    return selector.split(",").some((part) => this.matchesOne(part.trim()));
  }

  closest(selector) {
    let cur = this;
    while (cur) {
      if (cur.matches(selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    const visit = (el) => {
      for (const child of el.children) {
        if (child.matches(selector)) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out;
  }

  matchesOne(selector) {
    if (!selector) return false;
    const tag = selector.match(/^[a-z]+$/i);
    if (tag) return this.tagName === selector.toUpperCase();
    if (selector === "[role='button']" || selector === '[role="button"]') return this.getAttribute("role") === "button";
    if (selector === '[draggable="true"]' || selector === "[draggable='true']") return this.getAttribute("draggable") === "true";
    const exact = selector.match(/^\[([^=\^\]]+)="([^"]+)"\]$/);
    if (exact) return this.getAttribute(exact[1]) === exact[2];
    const prefix = selector.match(/^\[([^\^\]]+)\^="([^"]+)"\]$/);
    if (prefix) return (this.getAttribute(prefix[1]) || "").startsWith(prefix[2]);
    return false;
  }
}

const fakeDocument = {
  body: new FakeElement("body"),
  querySelector() { return null; },
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); },
};

globalThis.document = fakeDocument;
globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible" });

await import("../src/lib/board.js");
const { board } = globalThis.C820;

beforeEach(() => {
  fakeDocument.body = new FakeElement("body");
});

test("read detects placement from Placing copy with an em dash", () => {
  fakeDocument.body.innerText = "Round 2/5\nPlacing LeBron James — select a court position";
  const b = board.read();
  assert.equal(b.phase, "placing");
  assert.equal(b.placingName, "LeBron James");
});

test("read detects live placement copy with colon and click wording", () => {
  fakeDocument.body.innerText = "Round 2/5\nPlacing: LeBron James — click a court position";
  const b = board.read();
  assert.equal(b.phase, "placing");
  assert.equal(b.placingName, "LeBron James");
});

test("read detects placement from select-position-for copy", () => {
  fakeDocument.body.innerText = "Round 2/5\nSelect a position for LeBron James PG SG SF PF C";
  const b = board.read();
  assert.equal(b.phase, "placing");
  assert.equal(b.placingName, "LeBron James");
});

test("read detects placement from click-position-to-place copy", () => {
  fakeDocument.body.innerText = "Round 2/5\nClick a court position to place LeBron James.";
  const b = board.read();
  assert.equal(b.phase, "placing");
  assert.equal(b.placingName, "LeBron James");
});

test("slotElement prefers center court slot over C position filter", () => {
  const filterRow = new FakeElement("div", "", {
    children: ["PG", "SG", "SF", "PF", "C"].map((p) =>
      new FakeElement("button", p, { className: "h-7 px-2 text-xs" }),
    ),
  });
  const courtButton = new FakeElement("button", "C", { className: "w-16 h-16 rounded-xl" });
  const courtSlot = new FakeElement("div", "", {
    className: "absolute",
    children: [courtButton],
  });
  fakeDocument.body.appendChild(filterRow);
  fakeDocument.body.appendChild(courtSlot);

  assert.equal(board.slotElement("C"), courtButton);
});
