// Shared simulation core for the 82-0 policy simulator and tuner.
//
// @ref LLP 0001#policy-v1 — models the live draw so the shipped policy can be measured.
// Imports the real engine.js + policy.js (IIFEs that attach to globalThis.C820) so every
// run drives the exact code the extension ships, not a re-implementation.

import fs from "node:fs";

await import("../src/lib/engine.js");
await import("../src/lib/policy.js");
export const { engine, policy } = globalThis.C820;
const { ACT } = policy;

const rows = JSON.parse(fs.readFileSync(new URL("../src/data/players.json", import.meta.url), "utf8"));

// The live game spins a random populated (team, decade) pool, shows every player in it
// whose NAME is not already used this game, and lets you place one into an open compatible
// slot. One Team skip (keep decade, redraw team) + one Era skip (keep team, redraw decade)
// per game; restarts reset everything and are free. @ref LLP 0001#live-game-rules
const pools = new Map(); // "T|D" -> rows[]
const teamSet = new Set();
const decadeSet = new Set();
for (const r of rows) {
  teamSet.add(r.t);
  decadeSet.add(r.d);
  const key = `${r.t}|${r.d}`;
  if (!pools.has(key)) pools.set(key, []);
  pools.get(key).push(r);
}
const TEAMS = [...teamSet];
const DECADES = [...decadeSet];
const SLOTS = ["PG", "SG", "SF", "PF", "C"];

// Deterministic PRNG so runs are reproducible (Math.random would not be).
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeEnv(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const poolFor = (t, d, used) => (pools.get(`${t}|${d}`) || []).filter((p) => !used.has(p.n));
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

// Play one game to its end. Returns { result, spins, k, teamOVR? }.
//   result: "win" | "short" (finished <82-0) | "restart" | "nodraw" | "guard"
//   spins:  wheel spins consumed (the time proxy; skips and re-rolls each count one)
//   k:      roster size when the game ended (separates anchor-restart from pace-restart)
export function playGame(env) {
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

// Run `games` games on the CURRENT policy config and return summary stats.
// Expected spins/games to a first 82-0 use the geometric identity (games are i.i.d.
// because each fully resets): E[spins] = muWin + ((1-p)/p)*muLoss.
export function runBatch({ games = 200000, seed = 1 } = {}) {
  const env = makeEnv(seed);
  const tally = { win: 0, short: 0, restart: 0, nodraw: 0, guard: 0 };
  const restartByK = {};
  let winSpins = 0;
  let lossSpins = 0;
  let ovrSumComplete = 0;
  let completeCount = 0;

  for (let i = 0; i < games; i++) {
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

  const losses = games - tally.win;
  const p = tally.win / games;
  const muWin = tally.win ? winSpins / tally.win : 0;
  const muLoss = losses ? lossSpins / losses : 0;
  const muAll = (winSpins + lossSpins) / games;
  const expGamesToWin = p > 0 ? 1 / p : Infinity;
  const expSpinsToWin = p > 0 ? muWin + ((1 - p) / p) * muLoss : Infinity;

  return {
    games, seed, tally, restartByK, p, muWin, muLoss, muAll,
    meanOVR: completeCount ? ovrSumComplete / completeCount : 0,
    expGamesToWin, expSpinsToWin,
  };
}
