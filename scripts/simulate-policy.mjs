// Monte Carlo validator for the shipped policy.
//
// @ref LLP 0001#policy-v1 — LLP 0001 says: "Before claiming exact expected times or
//   'time optimality,' commit and run a simulator against this policy." This is that
//   simulator. It does NOT prove optimality; it measures how the shipped policy actually
//   performs against a faithful model of the live draw (see scripts/sim-core.mjs).
//
// Run: node scripts/simulate-policy.mjs [games] [seed]

import { runBatch, policy } from "./sim-core.mjs";

const GAMES = Number(process.argv[2] ?? 200000) || 200000;
const SEED = Number(process.argv[3] ?? 1) || 1;

const s = runBatch({ games: GAMES, seed: SEED });
const pct = (n) => `${((n / s.games) * 100).toFixed(2)}%`;
const c = policy.CONST;

console.log(`82-0 Coach — policy simulation`);
console.log(`games=${GAMES.toLocaleString("en-US")} seed=${SEED}`);
console.log(`config: ANCHOR_MIN=${c.ANCHOR_MIN} SKIP_BELOW=${c.SKIP_BELOW} PACE2_MIN=${c.PACE2_MIN} REACH_CEIL=${c.REACH_CEIL}`);
console.log("");
console.log(`Per-game 82-0 rate:        ${pct(s.tally.win)}  (${s.tally.win.toLocaleString("en-US")} of ${GAMES.toLocaleString("en-US")})`);
console.log(`Per-game outcomes:`);
console.log(`  win (82-0)               ${pct(s.tally.win)}`);
console.log(`  short (finished <82-0)   ${pct(s.tally.short)}`);
console.log(`  restart                  ${pct(s.tally.restart)}`);
for (const k of Object.keys(s.restartByK).sort()) {
  console.log(`     - after ${k} pick(s)       ${pct(s.restartByK[k])}`);
}
if (s.tally.nodraw) console.log(`  nodraw (env exhausted)   ${pct(s.tally.nodraw)}`);
if (s.tally.guard) console.log(`  guard (loop cap hit)     ${pct(s.tally.guard)}`);
console.log("");
console.log(`Mean spins/game:           all ${s.muAll.toFixed(2)} · win ${s.muWin.toFixed(2)} · loss ${s.muLoss.toFixed(2)}`);
console.log(`Mean teamOVR (finished):   ${s.meanOVR.toFixed(2)}`);
console.log("");
console.log(`Expected to first 82-0 (geometric, games are i.i.d.):`);
console.log(`  games:  ${s.expGamesToWin.toFixed(1)}`);
console.log(`  spins:  ${s.expSpinsToWin.toFixed(1)}`);
