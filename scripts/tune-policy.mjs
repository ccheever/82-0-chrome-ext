// Policy tuner — sweeps a grid of policy constants over the shipped policy and ranks
// each config by the true objective: expected spins to a first 82-0 (fewest minutes).
//
// @ref LLP 0001#policy-v1 — this is how any change to the policy constants is justified.
// It drives the real policy.js via C820.policy.configure(); the winner becomes DEFAULTS.
//
// Run: node scripts/tune-policy.mjs [games] [seed]

import { runBatch, policy } from "./sim-core.mjs";

const GAMES = Number(process.argv[2] ?? 40000) || 40000;
const SEED = Number(process.argv[3] ?? 1) || 1;

// Grid. REACH_CEIL=null disables the V1.1 doom check (=> exact V1 behavior).
// First sweep (anchor/skip up + doom check) showed V1's A20/S18 is best and the doom
// check is a wash; this pass probes the LOOSER side around the optimum.
const ANCHOR_MIN = [16, 18, 19, 20, 21];
const SKIP_BELOW = [14, 16, 17, 18];
const REACH_CEIL = [null];
const PACE2_MIN = [30, 40, 50];

const combos = [];
for (const a of ANCHOR_MIN)
  for (const s of SKIP_BELOW)
    for (const r of REACH_CEIL)
      for (const p of PACE2_MIN)
        combos.push({ ANCHOR_MIN: a, SKIP_BELOW: s, REACH_CEIL: r, PACE2_MIN: p });

const isBaseline = (c) =>
  c.ANCHOR_MIN === 20 && c.SKIP_BELOW === 18 && c.REACH_CEIL == null && c.PACE2_MIN === 40;

const results = [];
for (const combo of combos) {
  policy.reset();
  policy.configure(combo);
  const s = runBatch({ games: GAMES, seed: SEED });
  results.push({ combo, ...s, baseline: isBaseline(combo) });
}
policy.reset();

results.sort((a, b) => a.expSpinsToWin - b.expSpinsToWin);
const baseline = results.find((r) => r.baseline);

const fmt = (c) =>
  `A${c.ANCHOR_MIN} S${c.SKIP_BELOW} R${c.REACH_CEIL == null ? "-" : c.REACH_CEIL} P${c.PACE2_MIN}`;
const pct = (n, g) => `${((n / g) * 100).toFixed(2)}%`;

console.log(`Policy tuning — games=${GAMES.toLocaleString("en-US")}/combo seed=${SEED}, ${combos.length} combos`);
console.log(`objective: minimize expected spins to a first 82-0`);
console.log("");
console.log(`rank  config              spins   games   82-0%   short%  meanOVR`);
results.forEach((r, i) => {
  const tag = r.baseline ? " <- V1 baseline" : "";
  console.log(
    `${String(i + 1).padStart(3)}  ${fmt(r.combo).padEnd(18)} ` +
      `${r.expSpinsToWin.toFixed(1).padStart(6)}  ${r.expGamesToWin.toFixed(1).padStart(6)}  ` +
      `${pct(r.tally.win, r.games).padStart(6)}  ${pct(r.tally.short, r.games).padStart(6)}  ` +
      `${r.meanOVR.toFixed(1).padStart(6)}${tag}`,
  );
});

const best = results[0];
console.log("");
console.log(`Baseline (V1): ${fmt(baseline.combo)} -> ${baseline.expSpinsToWin.toFixed(1)} spins (${pct(baseline.tally.win, baseline.games)} 82-0)`);
console.log(`Best:          ${fmt(best.combo)} -> ${best.expSpinsToWin.toFixed(1)} spins (${pct(best.tally.win, best.games)} 82-0)`);
const delta = (1 - best.expSpinsToWin / baseline.expSpinsToWin) * 100;
console.log(`Improvement:   ${delta.toFixed(1)}% fewer spins to a first 82-0`);
console.log("");
console.log(`Winner config: ${JSON.stringify(best.combo)}`);
