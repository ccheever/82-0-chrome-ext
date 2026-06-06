// 82-0 decision policy — "what should I do right now?" for the advisory overlay.
//
// Policy is a data-derived heuristic for the live Standard-mode game. It ranks
// candidates by true marginal teamOVR, preserves scarce positions for flexible players,
// and uses anchor/skip/restart thresholds plus an optimistic-pace check that bails a
// doomed run early instead of grinding it out below 82-0.
// @ref LLP 0001#policy-v1
//
// Thresholds are in "val" units (engine.val): a player's additive contribution to teamOVR.
// 82-0 needs teamOVR >= 109.5, i.e. roughly Sum(val) >= ~108 across the five picks
// (teamOVR runs ~1.3 above Sum(val) thanks to STL/BLK averaging).
//
// Constants are overridable via C820.policy.configure({...}) — used by the simulator/
// tuner (scripts/simulate-policy.mjs, scripts/tune-policy.mjs). The shipped extension
// never calls configure(), so it runs on DEFAULTS.

(() => {
  const C820 = (globalThis.C820 = globalThis.C820 || {});
  const eng = () => C820.engine;

  // @ref LLP 0001#policy-v1 — constants are documented in LLP 0001's "Policy constants" table.
  // ANCHOR_MIN/SKIP_BELOW tuned (20->21, 18->17) by scripts/tune-policy.mjs +
  // scripts/validate-policy.mjs: ~4.4% fewer spins to a first 82-0 vs the original V1.
  const DEFAULTS = {
    ANCHOR_MIN: 21,    // pick 1: restart (don't skip) until best pool player >= this
    SKIP_BELOW: 17,    // picks 2-5: skip a pool whose best placeable player is below this
    PACE2_MIN: 40,     // restart if total val after 2 picks is below this
    TARGET_SUMVAL: 108, // sum-of-val proxy for teamOVR 109.5
    GOOD_PER_PICK: 26, // optimistic per-remaining-pick val, for the pace note
    REACH_CEIL: null,  // optimistic-pace doom check; off by default — tuning showed no gain
    THIN_DECADES: ["1980s", "2000s"], // weakest top-end pools — escape via era-skip
    POSITION_PRIORITY: ["SG", "PG", "SF", "PF", "C"], // fill flexible stars into scarce slots
  };
  let cfg = { ...DEFAULTS };
  const configure = (partial) => { cfg = { ...cfg, ...partial }; return cfg; };
  const reset = () => { cfg = { ...DEFAULTS }; return cfg; };

  const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

  const ACT = {
    TAKE: "TAKE", TEAM_SKIP: "TEAM_SKIP", ERA_SKIP: "ERA_SKIP", RESTART: "RESTART",
  };

  // state = { roster:[player], pool:[player] (current team+decade, persons not yet used),
  //           openPositions:[pos], teamSkipAvail:bool, eraSkipAvail:bool, decade:string }
  function recommend(state) {
    const E = eng();
    const { roster = [], pool = [], teamSkipAvail, eraSkipAvail, decade } = state;
    const k = roster.length; // slots already locked (0..4)
    const openPositions = normalizeOpenPositions(state.openPositions, roster);

    const ranked = pool
      .map((p) => ({ p, v: E.val(p), m: E.marginalOVR(roster, p), position: targetPosition(p, openPositions) }))
      .filter((c) => c.position)
      .sort((a, b) => b.m - a.m || b.v - a.v);

    const thin = cfg.THIN_DECADES.includes(decade);
    const chooseSkip = () => {
      if (eraSkipAvail && (thin || !teamSkipAvail)) return ACT.ERA_SKIP;
      if (teamSkipAvail) return ACT.TEAM_SKIP;
      if (eraSkipAvail) return ACT.ERA_SKIP;
      return null;
    };

    if (ranked.length === 0) {
      const skip = chooseSkip();
      if (skip) {
        return {
          action: skip,
          reason: `No player in this pool can fill ${openPositions.join("/") || "an open slot"}. ${skip === ACT.ERA_SKIP ? "Era" : "Team"}-skip.`,
          detail: { round: k + 1, openPositions, teamSkipAvail, eraSkipAvail },
        };
      }
      return {
        action: ACT.RESTART,
        reason: "No placeable players available and no skips remain — restart.",
        detail: { round: k + 1, openPositions },
      };
    }

    const best = ranked[0];
    const v = best.v;
    const after = roster.concat([best.p]);
    const afterOVR = E.teamOVR(after);
    const afterWins = E.projectedWins(afterOVR);
    const T = roster.reduce((a, p) => a + E.val(p), 0); // running total val
    const slotsLeft = 5 - k;

    const detail = {
      round: k + 1, bestPlayer: best.p, bestVal: v,
      curOVR: E.teamOVR(roster), afterOVR, afterWins,
      runningVal: T, top3: ranked.slice(0, 3),
      teamSkipAvail, eraSkipAvail, openPositions, targetPosition: best.position,
    };

    // ---- Pick 1: secure a strong anchor cheaply by restarting (preserve both skips). ----
    if (k === 0) {
      if (v >= cfg.ANCHOR_MIN) {
        return {
          action: ACT.TAKE,
          player: best.p,
          position: best.position,
          reason: `Strong anchor — ${best.p.n} (val ${v.toFixed(1)}). Place at ${best.position}.`,
          detail,
        };
      }
      return { action: ACT.RESTART, reason: `Pick-1 best is only ${v.toFixed(1)} val (<${cfg.ANCHOR_MIN}). Restart for a better anchor — keep both skips for the hard late picks.`, detail };
    }

    // ---- Last pick: it's all about whether you finish at 82-0. ----
    if (k === 4) {
      if (afterWins >= 82) {
        return {
          action: ACT.TAKE,
          player: best.p,
          position: best.position,
          reason: `${best.p.n} at ${best.position} completes the lineup at teamOVR ${afterOVR} -> 82-0.`,
          detail,
        };
      }
      const skip = chooseSkip();
      if (skip) {
        return { action: skip, reason: `Best finish here is only ${afterOVR} OVR (${afterWins} wins). ${skip === ACT.ERA_SKIP ? "Era" : "Team"}-skip to chase the final piece.`, detail };
      }
      return { action: ACT.TAKE, player: best.p, position: best.position, reason: `No skips left; best possible is ${afterWins} wins (not 82-0). Take ${best.p.n} at ${best.position} to finish, then start a new game.`, detail, fallShort: true };
    }

    // ---- Middle picks (k = 1,2,3). ----
    if (k === 2 && T < cfg.PACE2_MIN) {
      return { action: ACT.RESTART, reason: `Behind pace — only ${T.toFixed(0)} val after 2 picks (want ≥ ${cfg.PACE2_MIN}). Restarting beats grinding out a doomed run.`, detail };
    }

    // Optimistic-pace doom check: if even taking the best player here, plus the most we can
    // realistically hope for from each remaining slot (REACH_CEIL), can't reach the target,
    // the run is already lost — skip toward a stronger pool, or restart, rather than locking
    // in a pick that grinds the season to a sub-82-0 finish. DISABLED by default
    // (REACH_CEIL=null): it does cut sub-82-0 finishes, but tuning showed it does not reduce
    // expected spins-to-82-0, because a doomed run is only provable once its spins are spent.
    // @ref LLP 0001#tuning — kept behind the knob for future tuning.
    if (cfg.REACH_CEIL != null) {
      const needAfterBest = cfg.TARGET_SUMVAL - (T + v);
      const optimisticRemaining = (slotsLeft - 1) * cfg.REACH_CEIL;
      if (needAfterBest > optimisticRemaining) {
        const skip = chooseSkip();
        if (skip) {
          return { action: skip, reason: `Off pace for 82-0 — even taking ${best.p.n} (val ${v.toFixed(1)}) leaves more than the last ${slotsLeft - 1} slot(s) can make up. ${skip === ACT.ERA_SKIP ? "Era" : "Team"}-skip for a stronger pool.`, detail };
        }
        return { action: ACT.RESTART, reason: `Off pace for 82-0 and no skips left (running ${T.toFixed(0)} val, best here ${v.toFixed(1)}). Restart.`, detail };
      }
    }

    if (v >= cfg.SKIP_BELOW) {
      const need = cfg.TARGET_SUMVAL - T - v;
      const onPace = need <= (slotsLeft - 1) * cfg.GOOD_PER_PICK;
      const note = onPace ? "on pace for 82-0" : "slightly behind — aim high on the rest";
      return {
        action: ACT.TAKE,
        player: best.p,
        position: best.position,
        reason: `Take ${best.p.n} at ${best.position} (val ${v.toFixed(1)}) — ${note}.`,
        detail,
      };
    }

    // Weak pool (best < SKIP_BELOW).
    const skip = chooseSkip();
    if (skip) {
      const why = thin ? `${decade} is a thin decade` : `this pool tops out at ${v.toFixed(1)} val`;
      return { action: skip, reason: `Weak pool (${why}). ${skip === ACT.ERA_SKIP ? "Era" : "Team"}-skip for a stronger pool.`, detail };
    }
    if (k <= 2) {
      return { action: ACT.RESTART, reason: `Weak pool (val ${v.toFixed(1)}), no skips left, only ${k} locked. Restart.`, detail };
    }
    return {
      action: ACT.TAKE,
      player: best.p,
      position: best.position,
      reason: `Weak pool, but ${k} picks are locked and no skips remain — take ${best.p.n} at ${best.position}; restart only if the run falls short.`,
      detail,
    };
  }

  function normalizeOpenPositions(openPositions, roster) {
    if (Array.isArray(openPositions) && openPositions.length) {
      return openPositions.filter((p) => POSITIONS.includes(p));
    }
    const filled = new Set(roster.map((p) => p._position).filter(Boolean));
    return POSITIONS.filter((p) => !filled.has(p));
  }

  // Pick the scarcest still-open position that this player can fill.
  // @ref LLP 0001#position-constrained-pool-scarcity
  function targetPosition(player, openPositions) {
    const eligible = new Set(Array.isArray(player.pos) ? player.pos : []);
    if (eligible.has("UNK")) return null;
    return cfg.POSITION_PRIORITY.find((p) => openPositions.includes(p) && eligible.has(p)) || null;
  }

  C820.policy = {
    recommend,
    ACT,
    configure,
    reset,
    DEFAULTS,
    get CONST() { return { ...cfg }; },
  };
})();
