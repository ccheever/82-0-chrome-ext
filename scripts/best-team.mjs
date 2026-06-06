// Answers: what's the best possible legal team, how rare is it to draw, and how much
// better is it than a bare-minimum 82-0 team?
//
// @ref LLP 0001#the-scoring-engine-live-standard-mode — uses the real engine (teamOVR is
//   NOT a plain sum of vals: steals/blocks are averaged over positive values, so the true
//   optimum must be found on actual teamOVR, which is what this brute-forces).
// Run: node scripts/best-team.mjs [K]   (K = candidates per position to search; default 40)

import fs from "node:fs";
await import("../src/lib/engine.js");
const { engine } = globalThis.C820;

const K = Number(process.argv[2] ?? 40) || 40;
const rows = JSON.parse(fs.readFileSync(new URL("../src/data/players.json", import.meta.url), "utf8"));
const ORDER = ["PG", "SG", "SF", "PF", "C"];
const num = (x) => (x == null || Number.isNaN(x) ? 0 : x);

// Top-K eligible candidates per position, with numeric stat fields for a fast inner loop.
const cand = {};
for (const pos of ORDER) {
  cand[pos] = rows
    .filter((r) => Array.isArray(r.pos) && r.pos.includes(pos))
    .map((r) => ({
      n: r.n, t: r.t, d: r.d, pos: r.pos, val: engine.val(r),
      p: num(r.ppg), r: num(r.rpg), a: num(r.apg), s: num(r.spg), b: num(r.bpg),
    }))
    .sort((x, y) => y.val - x.val)
    .slice(0, K);
}

// teamOVR inline (matches engine: pts/reb/ast summed; stl/blk averaged over positives x5).
const BASE = { ppg: 133.4, rpg: 39.7, apg: 29.3, spg: 6.1, bpg: 3.2 };
const W = { ppg: 0.46, rpg: 0.25, apg: 0.18, spg: 0.07, bpg: 0.04 };
function ovr5(team) {
  let P = 0, R = 0, A = 0, sSum = 0, sCnt = 0, bSum = 0, bCnt = 0;
  for (const x of team) {
    P += x.p; R += x.r; A += x.a;
    if (x.s > 0) { sSum += x.s; sCnt++; }
    if (x.b > 0) { bSum += x.b; bCnt++; }
  }
  const adjS = sCnt ? (sSum * 5) / sCnt : 0;
  const adjB = bCnt ? (bSum * 5) / bCnt : 0;
  const score = 100 * (P / BASE.ppg * W.ppg + R / BASE.rpg * W.rpg + A / BASE.apg * W.apg + adjS / BASE.spg * W.spg + adjB / BASE.bpg * W.bpg);
  return Math.round(score * 10) / 10;
}

// Brute force, one player per slot, distinct names, maximize teamOVR.
let best = null, bestOVR = -1;
for (const c of cand.C)
  for (const pf of cand.PF) { if (pf.n === c.n) continue;
    for (const sf of cand.SF) { if (sf.n === c.n || sf.n === pf.n) continue;
      for (const sg of cand.SG) { if (sg.n === c.n || sg.n === pf.n || sg.n === sf.n) continue;
        for (const pg of cand.PG) {
          if (pg.n === c.n || pg.n === pf.n || pg.n === sf.n || pg.n === sg.n) continue;
          const o = ovr5([pg, sg, sf, pf, c]);
          if (o > bestOVR) { bestOVR = o; best = { PG: pg, SG: sg, SF: sf, PF: pf, C: c }; }
        }
      }
    }
  }

const team = ORDER.map((pos) => best[pos]);
// Cross-check the inline score against the shipped engine (engine reads ppg/rpg/... fields;
// our search objects use p/r/...; spg/bpg of 0 behave like null in the engine's positive-only
// averaging, so the value matches).
const enginePlayers = team.map((x) => ({ ppg: x.p, rpg: x.r, apg: x.a, spg: x.s, bpg: x.b }));
const engineOVR = engine.teamOVR(enginePlayers);
const wins = engine.projectedWins(engineOVR);
const sumVal = team.reduce((acc, x) => acc + x.val, 0);
let sCnt = 0, bCnt = 0;
for (const x of team) { if (x.s > 0) sCnt++; if (x.b > 0) bCnt++; }

console.log(`Best possible team (searched top ${K} per position):\n`);
for (const pos of ORDER) {
  const x = best[pos];
  console.log(`  ${pos.padEnd(2)}  ${x.n.padEnd(24)} ${x.t} ${x.d}   val ${x.val.toFixed(1).padStart(5)}   [${x.pos.join("·")}]`);
}
console.log(`\n  teamOVR ${engineOVR}  (inline ${bestOVR}, sum of vals ${sumVal.toFixed(1)})`);
console.log(`  projected record: ${wins}-${82 - wins}`);
console.log(`  steals tracked for ${sCnt}/5 players, blocks for ${bCnt}/5 — the engine averages`);
console.log(`  defense over only the tracked players and scales to a 5-man line, so teamOVR (${engineOVR})`);
console.log(`  tops the plain sum of vals (${sumVal.toFixed(1)}): a few tracked defenders get amplified.`);

// --- How rare is it to draw? ---
const pools = team.map((x) => `${x.t}|${x.d}`);
const distinctPools = new Set(pools);
const NPOOLS = 180; // populated (team, decade) pools. @ref LLP 0001#data-derived-scarcity
console.log(`\nDraw rarity (assuming each spin is a uniform draw over the ${NPOOLS} populated pools):`);
console.log(`  the 5 players sit in ${distinctPools.size} distinct (team, decade) pools: ${[...distinctPools].join(", ")}`);

let pGame;
if (distinctPools.size === 5) {
  // need all 5 distinct pools across 5 rounds, in any order: 5! / 180^5
  pGame = (120) / Math.pow(NPOOLS, 5);
} else {
  // general: multiply availability as pools are consumed, accounting for shared pools
  const counts = {};
  for (const k of pools) counts[k] = (counts[k] || 0) + 1;
  // probability of one specific multiset of 5 draws (with repeats) in order, x arrangements
  let denom = Math.pow(NPOOLS, 5);
  let arrangements = 120; // 5!
  for (const k in counts) arrangements /= factorial(counts[k]);
  pGame = arrangements / denom;
}
function factorial(n) { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; }

const games = 1 / pGame;
console.log(`  P(a single game draws exactly this team) = ${pGame.toExponential(3)}`);
console.log(`  => expected games to assemble it: ${games.toExponential(3)}  (~${(games / 1e9).toFixed(2)} billion)`);
console.log(`  at ~5 s per attempt that is ~${(games * 5 / (3600 * 24 * 365)).toFixed(0)} years of nonstop play`);
console.log(`  (skips barely help: a Team/Era skip only swaps the team OR the decade, so it can't`);
console.log(`   jump to an arbitrary specific pool — chasing one exact team, you mostly just restart.)`);

// --- How much better than the worst 82-0 team? ---
const THRESH = 109.5; // smallest rounded teamOVR that projects to 82 wins. @ref LLP 0001#win-curve
const CAP = 110;      // teamOVR at/above which wins are capped at 82. @ref LLP 0001#win-curve
console.log(`\nVs. the worst 82-0 team:`);
console.log(`  a bare-minimum 82-0 team just clears teamOVR ${THRESH} (the rounding threshold for 82 wins)`);
console.log(`  best team teamOVR ${engineOVR} vs ${THRESH}  =>  +${(engineOVR - THRESH).toFixed(1)} OVR  (${((engineOVR / THRESH - 1) * 100).toFixed(0)}% higher)`);
console.log(`  both project to ${engine.projectedWins(engineOVR)}-${82 - engine.projectedWins(engineOVR)} and ${engine.projectedWins(THRESH)}-${82 - engine.projectedWins(THRESH)}: identical, because wins cap at 82 once teamOVR hits ${CAP}.`);
console.log(`  the best team sits ${(engineOVR - CAP).toFixed(1)} OVR above that cap — pure overkill the game never rewards.`);
