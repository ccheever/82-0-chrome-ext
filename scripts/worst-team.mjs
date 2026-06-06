// The opposite of best-team.mjs: the WEAKEST team that still goes 82-0 — i.e. minimize the
// summed player value subject to teamOVR >= 109.5 (every 82-0 team ties at that rating, so
// "worst" means least raw talent, not lowest rating).
//
// @ref LLP 0005#the-floor-team — the answer leans hard on the steals/blocks amplification.
// @ref LLP 0001#the-scoring-engine-live-standard-mode — uses the real engine for teamOVR.
//
// Local search (coordinate descent, seeded random restarts) so runs are reproducible.
// Run: node scripts/worst-team.mjs [restarts] [seed] [valFloor]

import fs from "node:fs";
await import("../src/lib/engine.js");
const { engine } = globalThis.C820;

const RESTARTS = Number(process.argv[2] ?? 1200) || 1200;
const SEED = Number(process.argv[3] ?? 1) || 1;
const FLOOR = Number(process.argv[4] ?? 6) || 6; // ignore players below this val (can't help)
const THRESH = 109.5; // smallest rounded teamOVR that projects to 82-0. @ref LLP 0001#win-curve

const ORDER = ["PG", "SG", "SF", "PF", "C"];
const rows = JSON.parse(fs.readFileSync(new URL("../src/data/players.json", import.meta.url), "utf8"))
  .map((r) => ({ ...r, val: engine.val(r) }))
  .filter((r) => Array.isArray(r.pos) && r.pos.some((p) => ORDER.includes(p)) && r.val >= FLOOR);
const cand = {};
for (const pos of ORDER) cand[pos] = rows.filter((r) => r.pos.includes(pos)).sort((a, b) => a.val - b.val);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);

const arr = (t) => ORDER.map((p) => t[p]);
const ovr = (t) => engine.teamOVR(arr(t));
const sv = (t) => ORDER.reduce((a, p) => a + t[p].val, 0);
const feasible = (t) => ovr(t) >= THRESH;

function randStart() {
  for (let k = 0; k < 8000; k++) {
    const t = {};
    for (const pos of ORDER) { const top = cand[pos].slice(-60); t[pos] = top[Math.floor(rng() * top.length)]; }
    if (new Set(ORDER.map((p) => t[p].n)).size === 5 && feasible(t)) return t;
  }
  return null;
}

// Coordinate descent: repeatedly swap each slot for the lowest-summed-val feasible candidate.
function minimize(t) {
  let improved = true;
  while (improved) {
    improved = false;
    for (const pos of ORDER) {
      const others = new Set(ORDER.filter((p) => p !== pos).map((p) => t[p].n));
      let bestR = t[pos], bestS = sv(t);
      for (const r of cand[pos]) {
        if (others.has(r.n)) continue;
        const trial = { ...t, [pos]: r };
        if (ovr(trial) >= THRESH) { const s = sv(trial); if (s < bestS) { bestS = s; bestR = r; } }
      }
      if (bestR !== t[pos]) { t[pos] = bestR; improved = true; }
    }
  }
  return t;
}

let best = null, bestSV = Infinity;
for (let i = 0; i < RESTARTS; i++) {
  const start = randStart();
  if (!start) continue;
  const t = minimize(start);
  if (feasible(t) && sv(t) < bestSV) { bestSV = sv(t); best = { ...t }; }
}

const team = arr(best);
const o = engine.teamOVR(team), wins = engine.projectedWins(o);
const { adjSpg, adjBpg } = engine.adjustSpgBpg(team);
const blkOVR = (100 * adjBpg) / 3.2 * 0.04, stlOVR = (100 * adjSpg) / 6.1 * 0.07;

console.log(`Weakest 82-0 team (min summed val; restarts=${RESTARTS} seed=${SEED} floor=${FLOOR}):\n`);
for (const pos of ORDER) {
  const p = best[pos];
  console.log(`  ${pos.padEnd(2)} ${p.n.padEnd(22)} ${(p.t + " " + p.d).padEnd(11)} val ${p.val.toFixed(1).padStart(5)}   ppg ${String(p.ppg).padStart(5)}  stl ${String(p.spg ?? "—").padStart(4)}  blk ${String(p.bpg ?? "—").padStart(4)}`);
}
console.log(`\n  teamOVR ${o}  ->  ${wins}-${82 - wins}`);
console.log(`  summed val ${sv(best).toFixed(1)}   (a balanced 82-0 team ~108; the ceiling team 120.6)`);
console.log(`  tracked steals: ${team.filter((p) => p.spg > 0).map((p) => p.n).join(", ") || "none"}  -> adjSpg ${adjSpg.toFixed(2)} (x5)`);
console.log(`  tracked blocks: ${team.filter((p) => p.bpg > 0).map((p) => p.n).join(", ") || "none"}  -> adjBpg ${adjBpg.toFixed(2)} (x5)`);
console.log(`  that amplified defense alone is ~${(blkOVR + stlOVR).toFixed(1)} of the ${o} teamOVR (blk ~${blkOVR.toFixed(1)}, stl ~${stlOVR.toFixed(1)})`);
