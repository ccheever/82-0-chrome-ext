// Monte Carlo validator for Policy V1.
//
// @ref LLP 0001#policy-v1 — LLP 0001 says: "Before claiming exact expected times or
//   'time optimality,' commit and run a simulator against this policy." This is that
//   simulator. It does NOT prove optimality; it measures how the shipped Policy V1
//   actually performs against a faithful model of the live draw.
//
// It drives the real engine.js + policy.js (imported only for their globalThis.C820
// side effects — both files are IIFEs that attach to globalThis.C820, no exports) so
// the numbers below reflect the exact code the extension ships, not a re-implementation.
//
// Run: node scripts/simulate-policy.mjs [games] [seed]

import fs from "node:fs";

// Load the shipped engine + policy for their globalThis.C820 side effects (order matters:
// policy.js reads C820.engine lazily, but engine must be defined before the first call).
await import("../src/lib/engine.js");
await import("../src/lib/policy.js");
const { engine, policy } = globalThis.C820;
const { ACT } = policy;

const rows = JSON.parse(fs.readFileSync(new URL("../src/data/players.json", import.meta.url), "utf8"));

// ---- the draw environment ------------------------------------------------------------
// Each round the live game spins a random populated (team, decade) pool, shows every
// player in that pool whose NAME is not already used this game, and lets you place one
// into an open compatible slot. One Team skip (keep decade, redraw team) and one Era skip
// (keep team, redraw decade) per game; restarts are free and reset everything.
// @ref LLP 0001#live-game-rules
const pools = new Map(); // "T|D" -> rows[]
const teamSet = new Set();
const decadeSet = new Set();
for (const r of rows) {
  teamSet.add(r.t);
  decadeSet.add(r.d);
  const k = `${r.t}|${r.d}`;
  if (!pools.has(k)) pools.set(k, []);
  pools.get(k).push(r);
}
const TEAMS = [...teamSet];
const DECADES = [...decadeSet];
const SLOTS = ["PG", "SG", "SF", "PF", "C"];

// Deterministic PRNG so runs are reproducible (Math.random would not be).
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeEnv(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const poolFor = (t, d, used) => (pools.get(`${t}|${d}`) || []).filter((p) => !used.has(p.n));
  // Draw a populated pool, optionally constraining team or decade for skip semantics.
  const draw = (used, { team = null, notTeam = null, decade = null, notDecade = null } = {}) => {
    for (let i = 0; i < 400; i++) {
      const t = team ?? pick(notTeam ? TEAMS.filter((x) => x !== notTeam) : TEAMS);
      const d = decade ?? pick(notDecade ? DECADES.filter((x) => x !== notDecade) : DECADES);
      const pool = poolFor(t, d, used);
      if (pool.length) return { t, d, pool };
    }
    return null;
  };
  return { draw };
}

// Play one game to its end. Returns { result, spins, k, teamOVR }.
//   result: "win" | "short" (finished <82-0) | "restart" | "nodraw"
//   spins:  number of wheel spins consumed (the time proxy; skips and re-rolls count)
//   k:      roster size when the game ended (tells anchor-restart from pace-restart)
function playGame(env) {
  const roster = [];
  const used = new Set();
  let open = SLOTS.slice();
  let teamSkipAvail = true;
  let eraSkipAvail = true;
  let spins = 0;

  let cur = env.draw(used);
  spins++;
  for (let guard = 0; guard < 64; guard++) {
    if (!cur) return { result: "nodraw", spins, k: roster.length };
    const rec = policy.recommend({
      roster,
      pool: cur.pool,
      openPositions: open,
      teamSkipAvail,
      eraSkipAvail,
      decade: cur.d,
    });

    if (rec.action === ACT.TAKE) {
      roster.push({ ...rec.player, _position: rec.position });
      used.add(rec.player.n);
      open = open.filter((p) => p !== rec.position);
      if (roster.length === 5) {
        const r = engine.teamResult(roster);
        return { result: r.is820 ? "win" : "short", spins, k: 5, teamOVR: r.teamOVR };
      }
      cur = env.draw(used);
      spins++;
    } else if (rec.action === ACT.TEAM_SKIP) {
      teamSkipAvail = false;
      cur = env.draw(used, { decade: cur.d, notTeam: cur.t });
      spins++;
    } else if (rec.action === ACT.ERA_SKIP) {
      eraSkipAvail = false;
      cur = env.draw(used, { team: cur.t, notDecade: cur.d });
      spins++;
    } else {
      return { result: "restart", spins, k: roster.length };
    }
  }
  return { result: "guard", spins, k: roster.length };
}

// ---- run ------------------------------------------------------------------------------
const GAMES = Number(process.argv[2] ?? 200000) || 200000;
const SEED = Number(process.argv[3] ?? 1) || 1;
const env = makeEnv(SEED);

const tally = { win: 0, short: 0, restart: 0, nodraw: 0, guard: 0 };
const restartByK = {}; // roster size at restart -> count
let winSpins = 0;
let lossSpins = 0;
let ovrSumComplete = 0;
let completeCount = 0;

for (let i = 0; i < GAMES; i++) {
  const g = playGame(env);
  tally[g.result]++;
  if (g.result === "win") {
    winSpins += g.spins;
    ovrSumComplete += g.teamOVR;
    completeCount++;
  } else {
    lossSpins += g.spins;
    if (g.result === "short") {
      ovrSumComplete += g.teamOVR;
      completeCount++;
    }
    if (g.result === "restart") restartByK[g.k] = (restartByK[g.k] || 0) + 1;
  }
}

const losses = GAMES - tally.win;
const p = tally.win / GAMES; // per-game probability of an 82-0
const muWin = tally.win ? winSpins / tally.win : 0;
const muLoss = losses ? lossSpins / losses : 0;
const muAll = (winSpins + lossSpins) / GAMES;

// Games are i.i.d. (each fully resets — empty roster, both skips, i.i.d. draws), so the
// count of games until the first 82-0 is Geometric(p). By Wald's identity the spins until
// the first 82-0 is E = muWin + ((1-p)/p) * muLoss  (one winning game + a geometric number
// of losing games, each averaging muLoss spins).
const expGamesToWin = p > 0 ? 1 / p : Infinity;
const expSpinsToWin = p > 0 ? muWin + ((1 - p) / p) * muLoss : Infinity;

const pct = (n) => `${((n / GAMES) * 100).toFixed(2)}%`;
console.log(`82-0 Coach — Policy V1 simulation`);
console.log(`games=${GAMES.toLocaleString("en-US")} seed=${SEED}`);
console.log("");
console.log(`Per-game 82-0 rate:        ${pct(tally.win)}  (${tally.win.toLocaleString("en-US")} of ${GAMES.toLocaleString("en-US")})`);
console.log(`Per-game outcomes:`);
console.log(`  win (82-0)               ${pct(tally.win)}`);
console.log(`  short (finished <82-0)   ${pct(tally.short)}`);
console.log(`  restart                  ${pct(tally.restart)}`);
for (const k of Object.keys(restartByK).sort()) {
  console.log(`     - after ${k} pick(s)       ${pct(restartByK[k])}`);
}
if (tally.nodraw) console.log(`  nodraw (env exhausted)   ${pct(tally.nodraw)}`);
if (tally.guard) console.log(`  guard (loop cap hit)     ${pct(tally.guard)}`);
console.log("");
console.log(`Mean spins/game:           all ${muAll.toFixed(2)} · win ${muWin.toFixed(2)} · loss ${muLoss.toFixed(2)}`);
if (completeCount) console.log(`Mean teamOVR (finished):   ${(ovrSumComplete / completeCount).toFixed(2)}`);
console.log("");
console.log(`Expected to first 82-0 (geometric, games are i.i.d.):`);
console.log(`  games:  ${expGamesToWin.toFixed(1)}`);
console.log(`  spins:  ${expSpinsToWin.toFixed(1)}`);
