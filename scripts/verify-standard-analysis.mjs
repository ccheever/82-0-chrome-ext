import fs from "node:fs";

const players = JSON.parse(fs.readFileSync(new URL("../src/data/players.json", import.meta.url), "utf8"));

const W = { ppg: 0.46, rpg: 0.25, apg: 0.18, spg: 0.07, bpg: 0.04 };
const BASE = { ppg: 133.4, rpg: 39.7, apg: 29.3, spg: 6.1, bpg: 3.2 };
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

const num = (x) => (x == null || Number.isNaN(x) ? 0 : x);
const round1 = (x) => Math.round(x * 10) / 10;
const val = (p) =>
  100 *
  (W.ppg * num(p.ppg) / BASE.ppg +
    W.rpg * num(p.rpg) / BASE.rpg +
    W.apg * num(p.apg) / BASE.apg +
    W.spg * num(p.spg) / BASE.spg +
    W.bpg * num(p.bpg) / BASE.bpg);

const projectedWins = (ovr) => Math.round(82 * Math.min(ovr / 110, 1) ** 1.15);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function printTable(rows) {
  for (const row of rows) console.log(row.join("\t"));
}

assert(players.length === 10626, `expected 10626 rows, got ${players.length}`);
for (const p of players) {
  for (const key of ["n", "t", "d", "pos", "ppg", "rpg", "apg", "spg", "bpg", "slug"]) {
    assert(Object.hasOwn(p, key), `missing ${key} on ${JSON.stringify(p)}`);
  }
  assert(Array.isArray(p.pos), `pos must be an array for ${p.n}`);
  assert(p.d !== "1950s", `1950s row should be excluded: ${p.n}`);
}

for (const p of players) p.val = val(p);

console.log("Rows:", players.length);
console.log("First rounded teamOVR that projects to 82 wins:");
for (let ovr = 108; ovr <= 110; ovr += 0.1) {
  const rounded = round1(ovr);
  if (projectedWins(rounded) >= 82) {
    console.log(rounded.toFixed(1));
    break;
  }
}

console.log("\nDecade richness");
printTable([["Decade", "Rows", "val>=22", "val>=20", "val>=18"]]);
for (const decade of [...new Set(players.map((p) => p.d))].sort()) {
  const rows = players.filter((p) => p.d === decade);
  printTable([
    [
      decade,
      rows.length,
      rows.filter((p) => p.val >= 22).length,
      rows.filter((p) => p.val >= 20).length,
      rows.filter((p) => p.val >= 18).length,
    ],
  ]);
}

const pools = new Map();
for (const p of players) {
  const key = `${p.t}|${p.d}`;
  if (!pools.has(key)) pools.set(key, []);
  pools.get(key).push(p);
}
assert(pools.size === 180, `expected 180 team-decade pools, got ${pools.size}`);

console.log("\nPosition-constrained pool scarcity");
printTable([["Pos", "val>=22", "val>=20", "val>=18", "avgBestVal"]]);
for (const pos of POSITIONS) {
  const poolRows = [...pools.values()];
  const count = (threshold) =>
    poolRows.filter((pool) => pool.some((p) => p.pos.includes(pos) && p.val >= threshold)).length;
  const bestVals = poolRows.map((pool) => Math.max(0, ...pool.filter((p) => p.pos.includes(pos)).map((p) => p.val)));
  const avgBest = bestVals.reduce((a, b) => a + b, 0) / bestVals.length;
  printTable([
    [
      pos,
      `${(count(22) / poolRows.length * 100).toFixed(1)}%`,
      `${(count(20) / poolRows.length * 100).toFixed(1)}%`,
      `${(count(18) / poolRows.length * 100).toFixed(1)}%`,
      avgBest.toFixed(1),
    ],
  ]);
}

console.log("\nTop contributors");
for (const p of [...players].sort((a, b) => b.val - a.val).slice(0, 12)) {
  console.log(`${p.n}\t${p.t}\t${p.d}\t${p.val.toFixed(1)}`);
}
