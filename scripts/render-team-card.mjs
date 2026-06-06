// Renders a faithful "share card" for a five-man 82-0 team, scored by the real engine.
// This is NOT a 82-0.com artifact — it's a local visualization of our own analysis, so it
// carries an explicit "scoring simulation" label. Defaults to the floor team from LLP 0005.
//
// @ref LLP 0005#the-floor-team
// Usage: node scripts/render-team-card.mjs   ->  writes dist/team-card.html
//   then screenshot it with a headless browser (see the commit that adds assets/).

import fs from "node:fs";
await import("../src/lib/engine.js");
const { engine } = globalThis.C820;
const rows = JSON.parse(fs.readFileSync(new URL("../src/data/players.json", import.meta.url), "utf8"));

// The floor team — weakest summed val that still projects 82-0 (scripts/worst-team.mjs, seed 1).
const ROSTER = [
  ["PG", "Jacob Gilyard", "MEM", "2020s"],
  ["SG", "Dick Van Arsdale", "PHX", "1960s"],
  ["SF", "Elgin Baylor", "LAL", "1960s"],
  ["PF", "Elvin Hayes", "HOU", "1960s"],
  ["C", "Mark Eaton", "UTA", "1980s"],
];
const ANCHOR = "Mark Eaton";

const find = (n, t, d) => {
  const p = rows.find((r) => r.n === n && r.t === t && r.d === d);
  if (!p) throw new Error(`player not found: ${n} ${t} ${d}`);
  return p;
};
const team = ROSTER.map(([slot, n, t, d]) => ({ slot, ...find(n, t, d) })).map((p) => ({ ...p, val: engine.val(p) }));
const ovr = engine.teamOVR(team);
const wins = engine.projectedWins(ovr);
const sumVal = team.reduce((a, p) => a + p.val, 0);
const { adjBpg } = engine.adjustSpgBpg(team);

const fmt = (v) => (v == null || Number.isNaN(v) ? "—" : (Math.round(v * 10) / 10).toFixed(1));
const st = (label, v) => `<div class="st"><span>${fmt(v)}</span><label>${label}</label></div>`;
const cards = team
  .map(
    (p) => `
    <div class="p${p.n === ANCHOR ? " anchor" : ""}">
      <div class="pos">${p.slot}</div>
      <div class="nm">${p.n}</div>
      <div class="te">${p.t} · ${p.d}</div>
      <div class="stats">${st("PPG", p.ppg)}${st("RPG", p.rpg)}${st("APG", p.apg)}${st("SPG", p.spg)}${st("BPG", p.bpg)}</div>
      <div class="val">val ${p.val.toFixed(1)}</div>
    </div>`,
  )
  .join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1200px;height:600px}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;overflow:hidden}
  .card{width:1200px;height:600px;padding:42px 54px;display:flex;flex-direction:column;
    background:radial-gradient(125% 120% at 82% -12%, #1b2438 0%, #0b0d14 56%);color:#e6e8ee}
  .top{display:flex;justify-content:space-between;align-items:flex-start}
  .brand .logo{display:inline-block;background:linear-gradient(90deg,#f59e0b,#ef4444);color:#0b0d14;
    font-weight:900;font-size:30px;padding:5px 13px;border-radius:11px;letter-spacing:1px}
  .brand .tag{margin-top:14px;font-size:13px;letter-spacing:.34em;color:#aab1c4;font-weight:800;text-transform:uppercase}
  .brand .sub{margin-top:7px;font-size:15px;color:#8b93a7}
  .record{text-align:right}
  .record .rec{font-size:92px;font-weight:900;line-height:.85;
    background:linear-gradient(90deg,#22c55e,#86efac);-webkit-background-clip:text;background-clip:text;color:transparent}
  .record .ovr{margin-top:10px;font-size:16px;color:#aab1c4;letter-spacing:.06em}
  .record .ovr b{color:#e6e8ee;font-size:19px}
  .players{display:grid;grid-template-columns:repeat(5,1fr);gap:13px;margin-top:30px;margin-bottom:26px}
  .p{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:15px;
    padding:15px 14px;display:flex;flex-direction:column;gap:5px;min-height:228px}
  .p.anchor{border-color:rgba(34,197,94,.55);background:rgba(34,197,94,.09)}
  .pos{font-size:12px;font-weight:900;letter-spacing:.14em;color:#f59e0b}
  .p.anchor .pos{color:#22c55e}
  .nm{font-size:18px;font-weight:800;line-height:1.12}
  .te{font-size:12px;color:#aab1c4;letter-spacing:.03em}
  .stats{display:flex;gap:9px;margin-top:9px;flex-wrap:wrap}
  .st{display:flex;flex-direction:column;min-width:28px}
  .st span{font-size:15px;font-weight:700}
  .st label{font-size:9px;color:#8b93a7;letter-spacing:.07em;margin-top:1px}
  .val{margin-top:auto;align-self:flex-start;font-size:12px;font-weight:800;color:#cbd2e0;
    background:rgba(255,255,255,.06);padding:3px 9px;border-radius:7px}
  .foot{margin-top:auto;border-top:1px solid rgba(255,255,255,.08);padding-top:15px;font-size:14.5px;color:#b8bfce;line-height:1.5}
  .foot b{color:#e6e8ee}
  .attrib{margin-top:7px;font-size:11px;color:#69718a;letter-spacing:.02em}
</style></head><body>
  <div class="card">
    <div class="top">
      <div class="brand">
        <span class="logo">82-0</span>
        <div class="tag">Perfect Season</div>
        <div class="sub">The leanest roster that still goes 82-0</div>
      </div>
      <div class="record">
        <div class="rec">${wins}&#8211;${82 - wins}</div>
        <div class="ovr">TEAM OVR <b>${ovr.toFixed(1)}</b></div>
      </div>
    </div>
    <div class="players">${cards}</div>
    <div class="foot">
      Weakest five that still wins 82-0 — summed player value <b>${sumVal.toFixed(1)}</b>, barely two-thirds of a
      balanced perfect-season team. Carried by <b>${ANCHOR}</b>: his 4.21 BPG is the only tracked rim protection, so
      the engine scales it &#215;5 to <b>${adjBpg.toFixed(1)} team-blocks</b> — as if all five blocked like him.
      <div class="attrib">82-0 Coach · faithful scoring simulation (LLP 0005) · not an actual 82-0.com result</div>
    </div>
  </div>
</body></html>`;

fs.mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
const out = new URL("../dist/team-card.html", import.meta.url);
fs.writeFileSync(out, html);
console.log(`wrote ${out.pathname}`);
console.log(`teamOVR ${ovr} -> ${wins}-${82 - wins} | summed val ${sumVal.toFixed(1)} | adjBpg ${adjBpg.toFixed(2)}`);
