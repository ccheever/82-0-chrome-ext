// Unit tests for Lazy Mode actuator (src/lib/actuator.js).
// Run: node --test test/actuator.test.mjs
//
// @ref LLP 0008#testing-and-verification — gesture mapping, halt cases, safety helpers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

await import("../src/lib/actuator.js");
const { actuator } = globalThis.C820;
const { LEVEL, planGesture, boardFingerprint, createAutopilot, paceDelayMs, clickElement, DEFAULTS } = actuator;

const btn = { click() {}, dispatchEvent() { return true; } };
const card = { el: btn, n: "LeBron James", key: "lebron|LAL|2000s" };

function selectingBoard(overrides = {}) {
  return {
    phase: "selecting",
    round: 1,
    pool: [card],
    teamSkipAvail: true,
    eraSkipAvail: true,
    teamSkipBtn: btn,
    eraSkipBtn: btn,
    placingName: null,
    slots: {
      PG: { el: btn, occupant: null },
      SG: { el: btn, occupant: null },
      SF: { el: btn, occupant: null },
      PF: { el: btn, occupant: null },
      C: { el: btn, occupant: null },
    },
    ...overrides,
  };
}

test("planGesture: manual level waits", () => {
  const plan = planGesture({ level: LEVEL.MANUAL, board: selectingBoard(), rec: { action: "TAKE" } });
  assert.equal(plan.wait, true);
});

test("planGesture: spinning clicks enabled Spin", () => {
  const plan = planGesture({
    level: LEVEL.ASSIST,
    board: { phase: "spinning", spinEnabled: true, spinBtn: btn },
    rec: null,
  });
  assert.equal(plan.kind, "spin");
  assert.equal(plan.target, btn);
});

test("planGesture: spinning waits when Spin disabled", () => {
  const plan = planGesture({
    level: LEVEL.ASSIST,
    board: { phase: "spinning", spinEnabled: false, spinBtn: btn },
    rec: null,
  });
  assert.equal(plan.wait, true);
});

test("planGesture: mode clicks Play Classic", () => {
  const plan = planGesture({
    level: LEVEL.ASSIST,
    board: { phase: "mode", classicBtn: btn },
    rec: null,
  });
  assert.equal(plan.kind, "classicMode");
  assert.equal(plan.target, btn);
});

test("planGesture: TAKE selects card then slot", () => {
  const rec = { action: "TAKE", player: card, position: "SF", reason: "take" };
  const pick = planGesture({ level: LEVEL.ASSIST, board: selectingBoard(), rec });
  assert.equal(pick.kind, "card");
  assert.equal(pick.target, btn);

  const place = planGesture({
    level: LEVEL.ASSIST,
    board: selectingBoard({ placingName: "LeBron James" }),
    rec,
  });
  assert.equal(place.kind, "slot");
  assert.equal(place.position, "SF");
});

test("planGesture: placing phase clicks slot after the card leaves the DOM", () => {
  const rec = { action: "TAKE", player: { n: "LeBron James" }, position: "SF", reason: "take" };
  const place = planGesture({
    level: LEVEL.ASSIST,
    board: selectingBoard({ phase: "placing", placingName: "LeBron James" }),
    rec,
  });
  assert.equal(place.kind, "slot");
  assert.equal(place.position, "SF");
});

test("planGesture: placement fallback clicks slot without parsed placing name", () => {
  const rec = { action: "TAKE", player: { n: "LeBron James" }, position: "SF", reason: "take" };
  const place = planGesture({
    level: LEVEL.ASSIST,
    board: selectingBoard({ phase: "placing", placingName: null }),
    rec,
  });
  assert.equal(place.kind, "slot");
  assert.equal(place.position, "SF");
});

test("createAutopilot: Assist advances from card click to placement fallback slot click", async () => {
  const ap = createAutopilot({ dryRun: true, PACE_MIN_MS: 0, PACE_MAX_MS: 0 });
  const rec = { action: "TAKE", player: card, position: "SF", reason: "take" };
  ap.setLevel(LEVEL.ASSIST);
  ap.step(selectingBoard(), rec);
  await delay(5);
  assert.equal(ap.stats.gestures, 1);

  ap.step(selectingBoard({ phase: "placing", placingName: null, pool: [], spinEnabled: false }), rec);
  await delay(5);
  assert.equal(ap.stats.gestures, 2);
});

test("planGesture: Assist restarts weak runs", () => {
  const plan = planGesture({
    level: LEVEL.ASSIST,
    board: selectingBoard({ newGameBtn: btn }),
    rec: { action: "RESTART", reason: "weak anchor" },
  });
  assert.equal(plan.kind, "newGame");
});

test("planGesture: Assist reloads when no restart control exists", () => {
  const plan = planGesture({
    level: LEVEL.ASSIST,
    board: selectingBoard({ newGameBtn: null }),
    rec: { action: "RESTART", reason: "weak anchor" },
  });
  assert.equal(plan.kind, "reload");
  assert.equal(plan.startsNewGame, true);
});

test("planGesture: Auto performs new game on RESTART", () => {
  const plan = planGesture({
    level: LEVEL.AUTO,
    board: selectingBoard({ newGameBtn: btn }),
    rec: { action: "RESTART", reason: "weak anchor" },
  });
  assert.equal(plan.kind, "newGame");
});

test("planGesture: Auto reloads weak runs when no restart control exists", () => {
  const plan = planGesture({
    level: LEVEL.AUTO,
    board: selectingBoard({ newGameBtn: null }),
    rec: { action: "RESTART", reason: "weak anchor" },
  });
  assert.equal(plan.kind, "reload");
});

test("planGesture: Assist halts after sub-82-0 finish", () => {
  const plan = planGesture({
    level: LEVEL.ASSIST,
    board: { phase: "complete", complete: { is820: false, wins: 74 }, newGameBtn: btn },
    rec: null,
  });
  assert.equal(plan.halt, true);
  assert.match(plan.reason, /below 82-0/i);
});

test("planGesture: Auto plays again after sub-82-0 finish", () => {
  const plan = planGesture({
    level: LEVEL.AUTO,
    board: { phase: "complete", complete: { is820: false, wins: 74 }, newGameBtn: btn },
    rec: null,
  });
  assert.equal(plan.kind, "newGame");
});

test("planGesture: complete 82-0 halts", () => {
  const plan = planGesture({
    level: LEVEL.AUTO,
    board: { phase: "complete", complete: { is820: true, wins: 82 } },
    rec: null,
  });
  assert.equal(plan.halt, true);
  assert.match(plan.reason, /82-0/);
});

test("planGesture: moveStatus manual halts TAKE", () => {
  const plan = planGesture({
    level: LEVEL.AUTO,
    board: selectingBoard(),
    rec: {
      action: "TAKE",
      player: card,
      position: "PF",
      detail: { moveStatus: "manual", moves: [] },
    },
  });
  assert.equal(plan.halt, true);
});

test("planGesture: moveStatus unknown with no moves still places", () => {
  const rec = {
    action: "TAKE",
    player: card,
    position: "PF",
    detail: { moveStatus: "unknown", moves: [] },
  };
  const plan = planGesture({ level: LEVEL.AUTO, board: selectingBoard(), rec });
  assert.equal(plan.kind, "card");
});

test("planGesture: reachable prerequisite moves produce move gesture", () => {
  const plan = planGesture({
    level: LEVEL.AUTO,
    board: selectingBoard(),
    rec: {
      action: "TAKE",
      player: card,
      position: "PF",
      detail: {
        moveStatus: "reachable",
        moves: [{ id: "a", from: "SG", to: "PG" }],
      },
    },
    sub: {},
  });
  assert.equal(plan.kind, "move");
  assert.equal(plan.moveIndex, 0);
  assert.equal(plan.target.source, btn);
  assert.equal(plan.target.target, btn);
});

test("boardFingerprint changes when pool changes", () => {
  const a = selectingBoard({ pool: [card] });
  const b = selectingBoard({ pool: [] });
  assert.notEqual(boardFingerprint(a), boardFingerprint(b));
});

test("paceDelayMs stays within configured bounds", () => {
  for (let i = 0; i < 20; i++) {
    const d = paceDelayMs(DEFAULTS);
    assert.ok(d >= DEFAULTS.PACE_MIN_MS && d <= DEFAULTS.PACE_MAX_MS);
  }
});

test("clickElement sends one activation click", () => {
  const events = [];
  let activations = 0;
  const el = {
    dispatchEvent(ev) { events.push(ev.type); return true; },
    click() { activations += 1; },
  };
  assert.equal(clickElement(el), true);
  assert.deepEqual(events, ["pointerdown", "mousedown", "pointerup", "mouseup"]);
  assert.equal(activations, 1);
});

test("createAutopilot: trusted input sets halt reason", () => {
  const ap = createAutopilot();
  ap.setLevel(LEVEL.ASSIST);
  ap.noteTrustedInput();
  assert.match(ap.haltReason, /took control/i);
});

test("createAutopilot: dry-run does not require DOM contains", () => {
  const ap = createAutopilot({ dryRun: true });
  ap.setLevel(LEVEL.ASSIST);
  const b = { phase: "spinning", spinEnabled: true, spinBtn: btn };
  ap.step(b, null);
  assert.equal(ap.busy, true);
});

test("createAutopilot: pending gesture aborts after manual pause", async () => {
  let clicks = 0;
  const target = {
    dispatchEvent() { return true; },
    click() { clicks += 1; },
  };
  const ap = createAutopilot({ PACE_MIN_MS: 5, PACE_MAX_MS: 5 });
  ap.setLevel(LEVEL.ASSIST);
  ap.step({ phase: "spinning", spinEnabled: true, spinBtn: target }, null);
  ap.setLevel(LEVEL.MANUAL);
  await delay(15);
  assert.equal(clicks, 0);
  assert.equal(ap.busy, false);
});

test("createAutopilot: reload step snapshots state before reload", async () => {
  let snapshot = null;
  const ap = createAutopilot({
    dryRun: true,
    PACE_MIN_MS: 0,
    PACE_MAX_MS: 0,
    onBeforeReload: (s) => { snapshot = s; },
  });
  ap.setLevel(LEVEL.ASSIST);
  ap.step(selectingBoard({ newGameBtn: null }), { action: "RESTART", reason: "weak anchor" });
  await delay(5);
  assert.equal(snapshot.level, LEVEL.ASSIST);
  assert.equal(snapshot.stats.games, 1);
  assert.match(snapshot.reloadReason, /weak anchor/);
});

test("createAutopilot: restoreSnapshot resumes active level and stats", () => {
  const ap = createAutopilot();
  const restored = ap.restoreSnapshot({
    version: 1,
    level: LEVEL.AUTO,
    stats: { games: 12, spins: 20, gestures: 32 },
  });
  assert.equal(restored, true);
  assert.equal(ap.level, LEVEL.AUTO);
  assert.equal(ap.stats.games, 12);
  assert.equal(ap.stats.spins, 20);
});
