// Unit tests for live board parsing edge cases.
// Run: node --test test/board.test.mjs

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const fakeDocument = {
  body: { innerText: "" },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};

globalThis.document = fakeDocument;
globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible" });

await import("../src/lib/board.js");
const { board } = globalThis.C820;

beforeEach(() => {
  fakeDocument.body.innerText = "";
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
