// 82-0 scoring engine — faithful port of the LIVE 82-0.com normal-play (Standard) engine.
//
// @ref LLP 0001#the-scoring-engine-live-standard-mode — these constants/formulas are
//   the exact ones shipped by 82-0.com (calculateTeamResult(roster, testMode=false)).
//   The geometric/position-weighted "Adjusted" path (exp 2.2) is testMode-only and is
//   deliberately NOT implemented here; advice would be wrong if the constants drift.
//   If the live site changes these, re-extract and update both this file and LLP 0001.
//
// Shared via an isolated-world global so the other content-script files can use it
// without a bundler (manifest injects engine.js -> policy.js -> board.js -> content.js
// into the same isolated world; they cooperate through globalThis.C820).
// @ref LLP 0002#architecture

(() => {
  const C820 = (globalThis.C820 = globalThis.C820 || {});

  // Team-rating weights and per-stat "league total" bases (the denominators that a
  // 5-man cumulative stat line is measured against). teamOVR caps its win value at 110.
  const W = { ppg: 0.46, rpg: 0.25, apg: 0.18, spg: 0.07, bpg: 0.04 };
  const BASE = { ppg: 133.4, rpg: 39.7, apg: 29.3, spg: 6.1, bpg: 3.2 };
  const WIN_EXP = 1.15;          // gentle exponent — Standard mode
  const OVR_FOR_82_0 = 109.5;    // teamOVR that rounds to 82 wins. @ref LLP 0001#win-curve

  // Decades actually in the draw pool (1950s excluded by the live game).
  const DECADES = ["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];

  const num = (x) => (x == null || Number.isNaN(x) ? 0 : x);
  // JS Math.round is half-up; the game uses it, so we match it.
  const jsRound = (x) => Math.floor(x + 0.5);
  const round1 = (x) => jsRound(x * 10) / 10;

  // STL/BLK are averaged over positive tracked values, then scaled to a 5-man
  // equivalent — so old-era players with null steals/blocks don't drag the team down,
  // and stacking steals has diminishing returns. PTS/REB/AST are pure sums.
  // @ref LLP 0001#the-scoring-engine-live-standard-mode — adjustSpgBpg
  function adjustSpgBpg(team) {
    const sp = team.map((p) => p.spg).filter((v) => v != null && v > 0);
    const bp = team.map((p) => p.bpg).filter((v) => v != null && v > 0);
    const adjSpg = sp.length ? (sp.reduce((a, b) => a + b, 0) * 5) / sp.length : 0;
    const adjBpg = bp.length ? (bp.reduce((a, b) => a + b, 0) * 5) / bp.length : 0;
    return { adjSpg, adjBpg };
  }

  // Exact live team OVR for a (partial or full) roster.
  function teamOVR(team) {
    if (!team || team.length === 0) return 0;
    const P = team.reduce((a, p) => a + num(p.ppg), 0);
    const R = team.reduce((a, p) => a + num(p.rpg), 0);
    const A = team.reduce((a, p) => a + num(p.apg), 0);
    const { adjSpg, adjBpg } = adjustSpgBpg(team);
    return round1(
      100 *
        (P / BASE.ppg * W.ppg +
          R / BASE.rpg * W.rpg +
          A / BASE.apg * W.apg +
          adjSpg / BASE.spg * W.spg +
          adjBpg / BASE.bpg * W.bpg)
    );
  }

  // Win projection from a teamOVR. Caps at 82 (teamOVR >= 110).
  function projectedWins(ovr) {
    return jsRound(82 * Math.pow(Math.min(ovr / 110, 1), WIN_EXP));
  }

  function teamResult(team) {
    const ovr = teamOVR(team);
    const wins = projectedWins(ovr);
    return { teamOVR: ovr, wins, losses: 82 - wins, is820: wins >= 82 };
  }

  // Single-player contribution proxy — what one player adds to teamOVR if STL/BLK were
  // summed. Additive and ~equal to a player's marginal teamOVR; used for ranking pools
  // and for the policy thresholds (which are expressed in these "val" units).
  // @ref LLP 0001#the-currency-player-value-val
  function val(p) {
    return (
      100 *
      (W.ppg * num(p.ppg) / BASE.ppg +
        W.rpg * num(p.rpg) / BASE.rpg +
        W.apg * num(p.apg) / BASE.apg +
        W.spg * num(p.spg) / BASE.spg +
        W.bpg * num(p.bpg) / BASE.bpg)
    );
  }

  // True marginal teamOVR gain from adding `cand` to `roster` (honors STL/BLK averaging).
  function marginalOVR(roster, cand) {
    return teamOVR(roster.concat([cand])) - teamOVR(roster);
  }

  C820.engine = {
    W, BASE, WIN_EXP, OVR_FOR_82_0, DECADES,
    val, teamOVR, projectedWins, teamResult, marginalOVR, adjustSpgBpg, round1,
  };
})();
