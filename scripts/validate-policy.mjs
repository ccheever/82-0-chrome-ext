// Multi-seed validation for candidate policy configs coming out of tune-policy.mjs.
// A single-seed sweep ranks candidates but its top cluster is within noise; this averages
// each candidate over several seeds so a winner is only declared if it robustly beats V1.
//
// @ref LLP 0001#policy-v1
// Run: node scripts/validate-policy.mjs [games] [seeds]

import { runBatch, policy } from "./sim-core.mjs";

const GAMES = Number(process.argv[2] ?? 200000) || 200000;
const SEEDS = (process.argv[3] ?? "1,2,3,4,5").split(",").map(Number);

const CONFIGS = [
  { name: "V1 baseline", cfg: { ANCHOR_MIN: 20, SKIP_BELOW: 18, PACE2_MIN: 40, REACH_CEIL: null } },
  { name: "A21 S17",     cfg: { ANCHOR_MIN: 21, SKIP_BELOW: 17, PACE2_MIN: 40, REACH_CEIL: null } },
  { name: "A22 S17",     cfg: { ANCHOR_MIN: 22, SKIP_BELOW: 17, PACE2_MIN: 40, REACH_CEIL: null } },
  { name: "A23 S17",     cfg: { ANCHOR_MIN: 23, SKIP_BELOW: 17, PACE2_MIN: 40, REACH_CEIL: null } },
  { name: "A24 S17",     cfg: { ANCHOR_MIN: 24, SKIP_BELOW: 17, PACE2_MIN: 40, REACH_CEIL: null } },
  { name: "A22 S16",     cfg: { ANCHOR_MIN: 22, SKIP_BELOW: 16, PACE2_MIN: 40, REACH_CEIL: null } },
];

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const rows = [];
for (const { name, cfg } of CONFIGS) {
  const spins = [];
  const wins = [];
  for (const seed of SEEDS) {
    policy.reset();
    policy.configure(cfg);
    const s = runBatch({ games: GAMES, seed });
    spins.push(s.expSpinsToWin);
    wins.push((s.tally.win / s.games) * 100);
  }
  rows.push({
    name,
    spinsMean: mean(spins),
    spinsMin: Math.min(...spins),
    spinsMax: Math.max(...spins),
    winMean: mean(wins),
  });
}
policy.reset();

const base = rows.find((r) => r.name === "V1 baseline");
rows.sort((a, b) => a.spinsMean - b.spinsMean);

console.log(`Validation — ${GAMES.toLocaleString("en-US")} games × seeds [${SEEDS.join(",")}]`);
console.log(`mean expected spins to a first 82-0 (lower is better)`);
console.log("");
console.log(`config         spins(mean)   [min..max]      82-0%   vs V1`);
for (const r of rows) {
  const delta = (1 - r.spinsMean / base.spinsMean) * 100;
  const tag = r.name === "V1 baseline" ? "  —" : `${delta >= 0 ? "-" : "+"}${Math.abs(delta).toFixed(1)}%`;
  console.log(
    `${r.name.padEnd(13)}  ${r.spinsMean.toFixed(1).padStart(7)}     ` +
      `[${r.spinsMin.toFixed(0)}..${r.spinsMax.toFixed(0)}]`.padEnd(14) +
      `  ${r.winMean.toFixed(2)}%   ${tag}`,
  );
}
