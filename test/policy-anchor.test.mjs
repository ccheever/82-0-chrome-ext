// Regression tests for first-pick anchor gating.
// Run: node --test test/policy-anchor.test.mjs
//
// @ref LLP 0001#policy-v1 — pick 1 gates on ANCHOR_MIN in `val` units before choosing
// among acceptable anchors by marginalOVR.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { engine, policy } from "../scripts/sim-core.mjs";

beforeEach(() => policy.reset());

const P = (n, pos, s) => ({
  n,
  t: "LAL",
  d: "2020s",
  pos,
  ppg: s.ppg,
  rpg: s.rpg,
  apg: s.apg,
  spg: s.spg,
  bpg: s.bpg,
});

test("pick 1 takes an anchor-grade val player even when a below-threshold player leads empty-roster OVR", () => {
  const davis = P("Anthony Davis", ["C", "PF"], { ppg: 23.9, rpg: 10.7, apg: 3.1, spg: 1.2, bpg: 2.0 });
  const luka = P("Luka Doncic", ["PG", "SG", "SF"], { ppg: 30.9, rpg: 7.9, apg: 8.0, spg: 1.7, bpg: 0.5 });
  const lebron = P("LeBron James", ["SF", "PF", "PG", "C", "SG"], { ppg: 25.9, rpg: 7.6, apg: 7.4, spg: 1.1, bpg: 0.7 });

  assert.ok(engine.marginalOVR([], davis) > engine.marginalOVR([], luka), "fixture needs Davis to lead empty-roster OVR");
  assert.ok(engine.val(davis) < policy.CONST.ANCHOR_MIN, "fixture needs Davis below the anchor val threshold");
  assert.ok(engine.val(luka) >= policy.CONST.ANCHOR_MIN, "fixture needs Luka above the anchor val threshold");

  const rec = policy.recommend({
    roster: [],
    pool: [davis, luka, lebron],
    openPositions: ["PG", "SG", "SF", "PF", "C"],
    teamSkipAvail: true,
    eraSkipAvail: true,
    decade: "2020s",
  });

  assert.equal(rec.action, "TAKE");
  assert.equal(rec.player.n, "Luka Doncic");
  assert.equal(rec.position, "SG");
  assert.equal(rec.detail.bestPlayer.n, "Luka Doncic");
  assert.equal(rec.detail.top3[0].p.n, "Luka Doncic");
  assert.equal(rec.detail.bestVal.toFixed(1), "23.1");
});
