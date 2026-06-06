// V1 vs V2a (position-fluid) comparison on IDENTICAL seeds.
//
// @ref LLP 0007#simulation-plan — the experiment that decides whether V2a (treating selected
// players as movable, so candidate legality is a matching question) is worth shipping. The
// objective is expected SPINS to a first 82-0; move burden is reported, never optimized.
//
// "V2a empty-only" and "V2a swap" make the SAME take/skip decisions (the decision is
// hasLegalAssignment only) — they differ ONLY in the reported move plan, so their spins/82-0
// columns must match; that equality is a built-in sanity check.
//
// Run: node scripts/compare-policies.mjs [games] [seeds]   e.g. 200000 1,2,3

import { runBatch, policy } from "./sim-core.mjs";

const GAMES = Number(process.argv[2] ?? 200000) || 200000;
const SEEDS = (process.argv[3] ?? "1,2,3").split(",").map(Number);

const ARMS = [
  { name: "V1", cfg: { positionFluid: false }, movementRules: "empty-only" },
  { name: "V2a empty-only", cfg: { positionFluid: true }, movementRules: "empty-only" },
  { name: "V2a swap", cfg: { positionFluid: true }, movementRules: "swap" },
];

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const rows = [];
for (const arm of ARMS) {
  const spins = [];
  const winPct = [];
  const shortPct = [];
  const ovr = [];
  const movesPerTake = [];
  const shareWithMove = [];
  for (const seed of SEEDS) {
    policy.reset();
    policy.configure(arm.cfg);
    const s = runBatch({ games: GAMES, seed, movementRules: arm.movementRules });
    spins.push(s.expSpinsToWin);
    winPct.push((s.tally.win / s.games) * 100);
    shortPct.push((s.tally.short / s.games) * 100);
    ovr.push(s.meanOVR);
    movesPerTake.push(s.moveBurden.meanMovesPerTake);
    shareWithMove.push(s.moveBurden.shareTakesWithMove * 100);
  }
  rows.push({
    name: arm.name,
    spinsMean: mean(spins),
    spinsMin: Math.min(...spins),
    spinsMax: Math.max(...spins),
    winMean: mean(winPct),
    shortMean: mean(shortPct),
    ovrMean: mean(ovr),
    movesPerTake: mean(movesPerTake),
    shareWithMove: mean(shareWithMove),
  });
}
policy.reset();

const base = rows.find((r) => r.name === "V1");

console.log(`82-0 Coach — V1 vs V2a comparison`);
console.log(`games=${GAMES.toLocaleString("en-US")}/arm × seeds [${SEEDS.join(",")}]`);
console.log(`objective: minimize expected spins to a first 82-0 (move burden is reported only)`);
console.log("");
console.log(`arm              spins(mean)  [min..max]    82-0%   short%  meanOVR  mv/take  %tk+mv   vs V1`);
for (const r of rows) {
  const delta = (1 - r.spinsMean / base.spinsMean) * 100;
  const tag = r.name === "V1" ? "  —" : `${delta >= 0 ? "-" : "+"}${Math.abs(delta).toFixed(1)}%`;
  console.log(
    `${r.name.padEnd(15)} ${r.spinsMean.toFixed(1).padStart(7)}    ` +
      `[${r.spinsMin.toFixed(0)}..${r.spinsMax.toFixed(0)}]`.padEnd(13) +
      ` ${r.winMean.toFixed(2).padStart(6)}% ${r.shortMean.toFixed(2).padStart(6)}% ` +
      `${r.ovrMean.toFixed(1).padStart(7)}  ${r.movesPerTake.toFixed(3).padStart(6)}  ` +
      `${r.shareWithMove.toFixed(1).padStart(5)}%  ${tag}`,
  );
}
console.log("");
console.log(`Note: a positive "vs V1" = fewer spins (better). V2a empty-only vs swap should match`);
console.log(`on spins/82-0 (decisions are identical); only mv/take and %tk+mv differ.`);
