// Unit tests for the position-fluid assignment solver (src/lib/assign.js).
// Run: node --test test/   (or: node --test test/assign.test.mjs)
//
// @ref LLP 0007#assignment-solver — covers matching legality/determinism, UNK/over-constrained
// sets, and the move planner under both empty-only and swap rules (incl. the verify-replay guard).

import { test } from "node:test";
import assert from "node:assert/strict";

await import("../src/lib/assign.js"); // DOM-free + norm-free: no engine/board needed here
const { assign } = globalThis.C820;
const { legalAssignments, hasLegalAssignment, bestAssignment, prePlacementMoves } = assign;

const P = (n, pos) => ({ n, pos });
const serList = (list) =>
  list.map((a) => Object.keys(a).sort().map((k) => `${k}:${a[k]}`).join("|")).join(" ; ");

test("empty set: legalAssignments -> [{}], hasLegalAssignment -> true", () => {
  assert.deepEqual(legalAssignments([]), [{}]);
  assert.equal(hasLegalAssignment([]), true);
});

test("LeBron(all 5) + Malone(PF-only) -> 4 legal assignments, all with Malone:PF", () => {
  const lebron = P("LeBron", ["PG", "SG", "SF", "PF", "C"]);
  const malone = P("Malone", ["PF"]);
  const all = legalAssignments([lebron, malone]);
  assert.equal(all.length, 4);
  for (const a of all) assert.equal(a.Malone, "PF");
  // LeBron occupies each of the other four slots exactly once
  assert.deepEqual(all.map((a) => a.LeBron).sort(), ["C", "PG", "SF", "SG"]);
});

test("five PF-only players -> unassignable", () => {
  const five = [0, 1, 2, 3, 4].map((i) => P("p" + i, ["PF"]));
  assert.deepEqual(legalAssignments(five), []);
  assert.equal(hasLegalAssignment(five), false);
});

test("a pos:['UNK'] row poisons the set", () => {
  const players = [P("a", ["PG"]), P("u", ["UNK"])];
  assert.deepEqual(legalAssignments(players), []);
  assert.equal(hasLegalAssignment(players), false);
  // a mixed ['UNK','C'] row keeps C (UNK is just dropped)
  assert.equal(hasLegalAssignment([P("a", ["PG"]), P("c", ["UNK", "C"])]), true);
});

test(">5 players -> unassignable", () => {
  const six = [0, 1, 2, 3, 4, 5].map((i) => P("p" + i, ["PG", "SG", "SF", "PF", "C"]));
  assert.deepEqual(legalAssignments(six), []);
  assert.equal(hasLegalAssignment(six), false);
});

test("output order is independent of input order (determinism)", () => {
  const players = [P("a", ["PG", "SG"]), P("b", ["SG", "SF"]), P("c", ["PF", "C"])];
  const forward = legalAssignments(players);
  const reversed = legalAssignments([...players].reverse());
  assert.equal(serList(forward), serList(reversed));
  assert.ok(forward.length > 1);
});

test("hasLegalAssignment returns a boolean without throwing on a large flex set", () => {
  const five = [0, 1, 2, 3, 4].map((i) => P("p" + i, ["PG", "SG", "SF", "PF", "C"]));
  assert.equal(hasLegalAssignment(five), true);
});

test("bestAssignment returns null for an unassignable set", () => {
  const five = [0, 1, 2, 3, 4].map((i) => P("p" + i, ["C"]));
  assert.equal(bestAssignment(five, null, "p0", "empty-only", null), null);
});

test("prePlacementMoves vacates an occupied candidate slot (empty-only, reachable)", () => {
  // current: LeBron at PF; next: LeBron->SG, Malone->PF (candidate Malone)
  const current = { LeBron: "PF" };
  const next = { LeBron: "SG", Malone: "PF" };
  const plan = prePlacementMoves(current, next, "Malone", "empty-only");
  assert.equal(plan.certain, true);
  assert.deepEqual(plan.moves, [{ id: "LeBron", from: "PF", to: "SG" }]);
});

test("prePlacementMoves: a PG<->SG 2-cycle is unreachable empty-only but reachable via swap", () => {
  const current = { a: "PG", b: "SG" };
  const next = { a: "SG", b: "PG", c: "C" }; // candidate c into empty C, but a/b must swap
  const empty = prePlacementMoves(current, next, "c", "empty-only");
  assert.equal(empty.certain, false);
  const swap = prePlacementMoves(current, next, "c", "swap");
  assert.equal(swap.certain, true);
  assert.equal(swap.moves.length, 2);
});

test("prePlacementMoves: replaying the returned plan reaches nextAssignment with the candidate slot empty", () => {
  const current = { LeBron: "PF", Bird: "SF" };
  const next = { LeBron: "PG", Bird: "SF", Malone: "PF" };
  const plan = prePlacementMoves(current, next, "Malone", "empty-only");
  assert.equal(plan.certain, true);
  // replay
  const occ = {};
  const slotOf = { ...current };
  for (const id in current) occ[current[id]] = id;
  for (const m of plan.moves) {
    assert.equal(slotOf[m.id], m.from, "move.from must match the player's current slot");
    assert.equal(occ[m.to], undefined, "empty-only: target slot must be empty at this step");
    delete occ[m.from];
    occ[m.to] = m.id;
    slotOf[m.id] = m.to;
  }
  assert.equal(occ[next.Malone], undefined, "candidate's target slot is empty after the moves");
  for (const id in next) if (id !== "Malone") assert.equal(slotOf[id], next[id]);
});

test("bestAssignment minimizes existing moves before applying POSITION_PRIORITY", () => {
  // a@PG, b@SG already; candidate c is fully flexible. Keeping a/b put (0 moves) and placing c
  // at the next free priority slot beats moving b to give c the higher-priority SG.
  const a = P("a", ["PG", "SG", "SF", "PF", "C"]);
  const b = P("b", ["PG", "SG", "SF", "PF", "C"]);
  const c = P("c", ["PG", "SG", "SF", "PF", "C"]);
  const cfg = { POSITION_PRIORITY: ["SG", "PG", "SF", "PF", "C"] };
  const plan = bestAssignment([a, b, c], { a: "PG", b: "SG" }, "c", "empty-only", cfg);
  assert.equal(plan.moveCost, 0);
  assert.equal(plan.assignment.a, "PG");
  assert.equal(plan.assignment.b, "SG");
  assert.equal(plan.targetPosition, "SF"); // SG is taken; SF is the next priority not requiring a move
});

test("bestAssignment with unknown current layout reports moveStatus 'unknown', no moves", () => {
  const lebron = P("LeBron", ["PG", "SG", "SF", "PF", "C"]);
  const malone = P("Malone", ["PF"]);
  const plan = bestAssignment([lebron, malone], null, "Malone", "empty-only", null);
  assert.equal(plan.moveStatus, "unknown");
  assert.deepEqual(plan.moves, []);
  assert.equal(plan.targetPosition, "PF");
});
