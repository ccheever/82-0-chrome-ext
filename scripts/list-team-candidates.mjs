// Generates LLP 0004 — the 82-0 team-candidate catalog — directly from players.json,
// so the list always reflects the shipped dataset and the shipped scoring.
//
// @ref LLP 0001#the-currency-player-value-val — val is computed by the real engine.js.
// @ref LLP 0001#position-constrained-pool-scarcity — section order is scarcest-first.
//
// Run: node scripts/list-team-candidates.mjs [minVal]   (default 18)
// Writes: llp/0004-82-0-team-candidates.reference.md  (regenerate; do not hand-edit the tables)

import fs from "node:fs";

await import("../src/lib/engine.js");
const { engine } = globalThis.C820;

const MIN_VAL = Number(process.argv[2] ?? 18) || 18;
const ANCHOR = 21; // val at/above which a player can anchor a run (policy ANCHOR_MIN). @ref LLP 0001#policy-v1
const DATE = "2026-06-06";

// Scarcest-first: SG, PG, SF, PF, C — LLP 0001's position-scarcity finding, which the
// policy's POSITION_PRIORITY also uses. @ref LLP 0001#position-constrained-pool-scarcity
const ORDER = ["SG", "PG", "SF", "PF", "C"];
const POS_NAME = { SG: "Shooting Guard", PG: "Point Guard", SF: "Small Forward", PF: "Power Forward", C: "Center" };

const rows = JSON.parse(fs.readFileSync(new URL("../src/data/players.json", import.meta.url), "utf8"));
const cands = rows
  .map((r) => ({ ...r, val: engine.val(r) }))
  .filter((r) => r.val >= MIN_VAL)
  .filter((r) => Array.isArray(r.pos) && r.pos.some((p) => ORDER.includes(p))); // drop UNK-only / ineligible

const valCell = (v) => (v >= ANCHOR ? `${v.toFixed(1)} ★` : v.toFixed(1));
const posCell = (pos) => pos.filter((p) => ORDER.includes(p)).join(" · ");

const out = [];
const P = (...lines) => out.push(...lines);

P("<!-- GENERATED FILE — do not hand-edit the tables. Regenerate with:");
P("       node scripts/list-team-candidates.mjs");
P("     Prose lives in scripts/list-team-candidates.mjs. -->");
P("# LLP 0004: 82-0 Team Candidates");
P("");
P("**Type:** Reference");
P("**Status:** Active");
P("**Systems:** Strategy, Game-Data");
P("**Author:** Charlie Cheever / Claude");
P(`**Date:** ${DATE}`);
P("**Related:** [LLP 0001](./0001-82-0-team-strategy.spec.md) (val, scoring, scarcity — authoritative), [LLP 0003](./0003-how-to-go-82-0.guide.md) (the strategy in plain English)");
P("");
P("## What this is");
P("");
P(`Every player-season strong enough to plausibly start on a perfect-season roster — the **candidate pool** the Coach is choosing from. A player makes the list if their **\`val\` ≥ ${MIN_VAL}** (\`val\` = how much a player adds to your team's OVR; see [LLP 0001](./0001-82-0-team-strategy.spec.md#the-currency-player-value-val)). This file is generated from the shipped dataset by \`scripts/list-team-candidates.mjs\`; regenerate it rather than editing the tables by hand.`);
P("");
P("**A few things to know before you read the tables:**");
P("");
P(`- **★ marks an anchor-grade season (\`val\` ≥ ${ANCHOR}).** That's the bar the Coach holds out for on the first pick. A full 82-0 team needs its five \`val\`s to sum to ~108 — about **21.6 apiece** — so the starred players are the ones you build around, and the rest fill in.`);
P("- **These are player-*seasons*, not players.** The same name can appear for more than one (team, era) — each is a separate thing you can draw, with its own `val`. The live game won't let you put two of the same name on one roster.");
P("- **A player is listed under *every* position they can fill.** Versatile stars (LeBron can play all five) show up in several tables — that flexibility is exactly what makes them valuable for filling a scarce slot.");
P(`- **\`val\` is not "how good were they," it's "how much do they move *this* game's score."** The live formula rewards points, rebounds, assists, steals, and blocks — and has **no three-point term**. So volume scorers and big men who fill the box score rate high, while pure shooters rate lower than their reputation (e.g. some great shooting seasons fall below the ${MIN_VAL} cut).`);
P("");
P("Sections are ordered **scarcest position first** — Shooting Guard, Point Guard, Small Forward, Power Forward, Center — because that's the order in which elite, position-eligible talent is hardest to find ([LLP 0001](./0001-82-0-team-strategy.spec.md#position-constrained-pool-scarcity)), so those are the lists worth studying most. Within each, players are sorted by `val`, best first.");
P("");

// Summary
P("## Summary");
P("");
P(`Candidates with \`val\` ≥ ${MIN_VAL}: **${cands.length}** distinct player-seasons.`);
P("");
P("| Position | Eligible candidates | Anchor-grade (★) |");
P("|---|---:|---:|");
for (const pos of ORDER) {
  const list = cands.filter((c) => c.pos.includes(pos));
  const anchors = list.filter((c) => c.val >= ANCHOR).length;
  P(`| ${pos} — ${POS_NAME[pos]} | ${list.length} | ${anchors} |`);
}
P("");

// Per-position tables
for (const pos of ORDER) {
  const list = cands.filter((c) => c.pos.includes(pos)).sort((a, b) => b.val - a.val || a.n.localeCompare(b.n));
  const hi = list[0]?.val.toFixed(1);
  const lo = list[list.length - 1]?.val.toFixed(1);
  P(`## ${pos} — ${POS_NAME[pos]}`);
  P("");
  P(`${list.length} candidates · \`val\` ${lo}–${hi} · ${list.filter((c) => c.val >= ANCHOR).length} anchor-grade (★)`);
  P("");
  P("| # | Player | val | Positions | Team | Era |");
  P("|---:|---|---:|---|---|---|");
  list.forEach((c, i) => {
    P(`| ${i + 1} | ${c.n} | ${valCell(c.val)} | ${posCell(c.pos)} | ${c.t} | ${c.d} |`);
  });
  P("");
}

P("---");
P("");
P(`*Generated by \`scripts/list-team-candidates.mjs\` from \`src/data/players.json\` (\`val\` ≥ ${MIN_VAL}). For the scoring formula, the position-scarcity data behind the section order, and the playing strategy that uses this pool, see [LLP 0001](./0001-82-0-team-strategy.spec.md) and [LLP 0003](./0003-how-to-go-82-0.guide.md).*`);

const target = new URL("../llp/0004-82-0-team-candidates.reference.md", import.meta.url);
fs.writeFileSync(target, out.join("\n") + "\n");

// stdout summary
console.log(`Wrote ${target.pathname}`);
console.log(`val>=${MIN_VAL}: ${cands.length} player-seasons`);
for (const pos of ORDER) {
  const list = cands.filter((c) => c.pos.includes(pos));
  console.log(`  ${pos}: ${list.length} (${list.filter((c) => c.val >= ANCHOR).length} ★)`);
}
