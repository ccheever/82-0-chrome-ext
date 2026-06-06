// Policy V2a (position-fluid) fixtures + V1 parity + simulator invariants.
// Run: node --test test/   (or: node --test test/policy-v2a.test.mjs)
//
// @ref LLP 0007#regression-fixtures — the doc's regression fixtures, plus the guarantee that
// V1 behavior is unchanged behind the flag and that movementRules never changes a decision.
// Imports through sim-core (engine + assign + policy, NOT board.js) — which also proves assign
// is DOM-free in Node.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { engine, policy, assign, runBatch } from "../scripts/sim-core.mjs";

beforeEach(() => policy.reset());

// Player factory: stats default to 0 / null so matching-only fixtures stay terse.
const P = (n, pos, s = {}) => ({
  n, t: s.t ?? "TST", d: s.d ?? "2010s", pos,
  ppg: s.ppg ?? 0, rpg: s.rpg ?? 0, apg: s.apg ?? 0,
  spg: s.spg ?? null, bpg: s.bpg ?? null,
});

const LEBRON = P("LeBron James", ["PG", "SG", "SF", "PF", "C"], { ppg: 27, rpg: 8, apg: 8, spg: 1.5, bpg: 0.6 });
const MALONE = P("Karl Malone", ["PF"], { ppg: 25, rpg: 12, apg: 3, spg: 1.5, bpg: 0.6 }); // val ~20.5

test("fixture 1: LeBron@PF, Malone PF-only appears -> TAKE Malone@PF, reachable plan moves LeBron off PF", () => {
  policy.configure({ positionFluid: true });
  const rec = policy.recommend({
    roster: [LEBRON], pool: [MALONE], assignment: { [LEBRON.n]: "PF" },
    movementRules: "empty-only", teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  assert.equal(rec.action, "TAKE");
  assert.equal(rec.player.n, "Karl Malone");
  assert.equal(rec.position, "PF");
  assert.ok(rec.detail.moves.length >= 1, "expected at least one prerequisite move");
  assert.notEqual(rec.detail.nextAssignment[LEBRON.n], "PF", "LeBron must vacate PF");
  assert.equal(rec.detail.moveStatus, "reachable");
});

test("fixture 2: same set legal but assignment unknown -> TAKE with moveStatus 'unknown', no fabricated moves", () => {
  policy.configure({ positionFluid: true });
  const rec = policy.recommend({
    roster: [LEBRON], pool: [MALONE], // no assignment provided
    teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  assert.equal(rec.action, "TAKE");
  assert.equal(rec.player.n, "Karl Malone");
  assert.equal(rec.detail.moveStatus, "unknown");
  assert.deepEqual(rec.detail.moves, []);
});

test("fixture 3: a high-val candidate that makes the set unassignable is filtered out", () => {
  policy.configure({ positionFluid: true });
  const roster = [P("pg", ["PG"], { ppg: 18 }), P("sg", ["SG"], { ppg: 18 }), P("sf", ["SF"], { ppg: 18 }), P("c1", ["C"], { ppg: 18 })];
  const bigC = P("Huge Center", ["C"], { ppg: 40, rpg: 20, apg: 10, spg: 3, bpg: 3 }); // 2nd C-only -> PF unfillable
  const rec = policy.recommend({
    roster, pool: [bigC], assignment: { pg: "PG", sg: "SG", sf: "SF", c1: "C" },
    movementRules: "empty-only", teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  assert.notEqual(rec.action, "TAKE", "an unassignable candidate must not be taken despite high val");
});

test("fixture 4: among legal assignments, the chosen one minimizes existing moves before POSITION_PRIORITY", () => {
  // (also covered directly in assign.test.mjs) — verify via the policy's cfg-passed priority.
  const a = P("a", ["PG", "SG", "SF", "PF", "C"]);
  const b = P("b", ["PG", "SG", "SF", "PF", "C"]);
  const c = P("c", ["PG", "SG", "SF", "PF", "C"]);
  const plan = assign.bestAssignment([a, b, c], { a: "PG", b: "SG" }, "c", "empty-only", policy.CONST);
  assert.equal(plan.moveCost, 0);
  assert.equal(plan.assignment.a, "PG");
  assert.equal(plan.assignment.b, "SG");
});

test("fixture 5: movementRules never changes the decision (only the move plan)", () => {
  policy.configure({ positionFluid: true });
  const base = {
    roster: [LEBRON], pool: [MALONE], assignment: { [LEBRON.n]: "PF" },
    teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  };
  const e = policy.recommend({ ...base, movementRules: "empty-only" });
  const s = policy.recommend({ ...base, movementRules: "swap" });
  assert.equal(e.action, s.action);
  assert.equal(e.player.n, s.player.n);
  assert.equal(e.position, s.position);
});

test("fixture 6: k===4 STL/BLK quirk — lower-val candidate that completes 82-0 is chosen (marginalOVR-first)", () => {
  const base = [
    P("b1", ["PG"], { ppg: 30, rpg: 12, apg: 5 }),
    P("b2", ["SG"], { ppg: 28, rpg: 11, apg: 4 }),
    P("b3", ["SF"], { ppg: 27, rpg: 11, apg: 5 }),
    P("b4", ["PF"], { ppg: 25, rpg: 11, apg: 4 }),
  ];
  const candX = P("candX", ["C"], { ppg: 28, rpg: 8, apg: 6, spg: 1.0, bpg: 0.5 }); // higher val, dilutes D
  const candY = P("candY", ["C"], { ppg: 8, rpg: 10, apg: 1, spg: 2.0, bpg: 4.0 });  // lower val, lone rim protector

  assert.ok(engine.val(candX) > engine.val(candY), "candX must be the higher-val player");
  assert.ok(engine.teamResult([...base, candX]).wins < 82, "candX falls short of 82-0");
  assert.equal(engine.teamResult([...base, candY]).is820, true, "candY completes 82-0 via the quirk");

  policy.configure({ positionFluid: true });
  const rec = policy.recommend({
    roster: base, pool: [candX, candY],
    assignment: { b1: "PG", b2: "SG", b3: "SF", b4: "PF" },
    movementRules: "empty-only", teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  assert.equal(rec.action, "TAKE");
  assert.equal(rec.player.n, "candY");
  assert.ok(rec.detail.afterWins >= 82);
});

test("fixture 7: no legal candidate -> action is identical to V1 (shared skip/restart flow)", () => {
  const roster = [P("pg", ["PG"], { ppg: 20 }), P("sg", ["SG"], { ppg: 20 }), P("sf", ["SF"], { ppg: 20 }), P("pf", ["PF"], { ppg: 20 })];
  const extraPG = P("extra PG", ["PG"], { ppg: 25 }); // only C is open; a PG can't be placed
  const v1 = policy.recommend({
    roster, pool: [extraPG], openPositions: ["C"],
    teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  policy.configure({ positionFluid: true });
  const v2 = policy.recommend({
    roster, pool: [extraPG], assignment: { pg: "PG", sg: "SG", sf: "SF", pf: "PF" },
    teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  assert.equal(v1.action, v2.action);
  assert.notEqual(v1.action, "TAKE");
});

test("fixture 8: a duplicate name from a different team/decade is filtered, even if legally packable", () => {
  policy.configure({ positionFluid: true });
  const lebronMIA = P("LeBron James", ["PF"], { t: "MIA", d: "2010s", ppg: 28, rpg: 8, apg: 7 });
  const rec = policy.recommend({
    roster: [LEBRON], pool: [lebronMIA], assignment: { [LEBRON.n]: "SG" },
    movementRules: "empty-only", teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  assert.notEqual(rec.action, "TAKE", "duplicate name must be excluded before legality");
});

test("V1 parity: when no reassignment is needed, V1 and V2a agree on action/player/position/reason", () => {
  const anchor = P("Anchor", ["PG", "SG", "SF", "PF", "C"], { ppg: 30, rpg: 12, apg: 8, spg: 2, bpg: 1 }); // val ~26
  const v1 = policy.recommend({
    roster: [], pool: [anchor], openPositions: ["PG", "SG", "SF", "PF", "C"],
    teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  policy.configure({ positionFluid: true });
  const v2 = policy.recommend({
    roster: [], pool: [anchor], assignment: null,
    teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  assert.equal(v1.action, v2.action);
  assert.equal(v1.player.n, v2.player.n);
  assert.equal(v1.position, v2.position);
  assert.equal(v1.reason, v2.reason);
});

test("pick-1 anchor gate: a high-val scorer is taken even when a low-val defender leads marginalOVR", () => {
  // On an empty roster, marginalOVR == 1-man teamOVR, which amplifies a lone defender's STL/BLK
  // x5 — so a sub-ANCHOR_MIN defender can top the marginalOVR sort. The pick-1 decision must rank
  // by val so the ANCHOR_MIN gate sees the anchor-grade scorer. @ref LLP 0001#policy-v1
  const defender = P("Rim Protector", ["C"], { ppg: 5, rpg: 5, apg: 1, spg: 3, bpg: 4 }); // val ~14
  const scorer = P("Scorer", ["SG", "SF"], { ppg: 30, rpg: 10, apg: 7, spg: 1, bpg: 0.5 }); // val ~23
  assert.ok(engine.val(scorer) >= policy.CONST.ANCHOR_MIN, "scorer clears the anchor gate");
  assert.ok(engine.val(defender) < policy.CONST.ANCHOR_MIN, "defender is below the anchor gate");
  assert.ok(engine.marginalOVR([], defender) > engine.marginalOVR([], scorer), "defender leads the marginalOVR sort");
  // default (V1) path — the fix lives in the shared path, so it applies here too.
  const rec = policy.recommend({
    roster: [], pool: [defender, scorer], openPositions: ["PG", "SG", "SF", "PF", "C"],
    teamSkipAvail: true, eraSkipAvail: true, decade: "2010s",
  });
  assert.equal(rec.action, "TAKE");
  assert.equal(rec.player.n, "Scorer");
});

test("sim: V2a empty-only and swap make identical decisions (only move burden differs)", () => {
  policy.reset(); policy.configure({ positionFluid: true });
  const e = runBatch({ games: 4000, seed: 1, movementRules: "empty-only" });
  policy.reset(); policy.configure({ positionFluid: true });
  const s = runBatch({ games: 4000, seed: 1, movementRules: "swap" });
  assert.deepEqual(e.tally, s.tally);
  assert.equal(e.expSpinsToWin, s.expSpinsToWin);
});

test("sim: V1 path is deterministic and reports zero move burden", () => {
  policy.reset();
  const a = runBatch({ games: 4000, seed: 1 });
  policy.reset();
  const b = runBatch({ games: 4000, seed: 1 });
  assert.equal(a.expSpinsToWin, b.expSpinsToWin);
  assert.equal(a.moveBurden.meanMovesPerTake, 0);
});

test("sim: V2a produces 82-0 wins (not pathological)", () => {
  policy.reset(); policy.configure({ positionFluid: true });
  const s = runBatch({ games: 4000, seed: 1 });
  assert.ok(s.tally.win > 0);
  assert.ok(Number.isFinite(s.expSpinsToWin) && s.expSpinsToWin > 0);
});

test("assign solver loads in Node without board.js (DOM-free)", () => {
  assert.ok(globalThis.C820.assign, "C820.assign present");
  assert.equal(globalThis.C820.board, undefined, "board.js must not be required for the matcher");
});
