// 82-0 decision policy — "what should I do right now?" for the advisory overlay.
//
// Policy V1 is a data-derived heuristic for the live Standard-mode game. It ranks
// candidates by true marginal teamOVR, preserves scarce positions for flexible players,
// and uses simple anchor/skip/restart thresholds.
// @ref LLP 0001#policy-v1
//
// Thresholds are in "val" units (engine.val): a player's additive contribution to teamOVR.
// 82-0 needs teamOVR >= 109.5, i.e. roughly Sum(val) >= ~108 across the five picks
// (teamOVR runs ~1.3 above Sum(val) thanks to STL/BLK averaging).

(() => {
  const C820 = (globalThis.C820 = globalThis.C820 || {});
  const eng = () => C820.engine;

  // @ref LLP 0001#policy-v1
  const ANCHOR_MIN = 20;   // pick 1: restart (don't skip) until best pool player >= this
  const SKIP_BELOW = 18;   // picks 2-5: skip a pool whose best player is below this
  const PACE2_MIN = 40;    // restart if total val after 2 picks is below this
  const TARGET_SUMVAL = 108;
  const GOOD_PER_PICK = 26; // optimistic per-remaining-pick val, for the pace note
  const THIN_DECADES = ["1980s", "2000s"]; // weakest top-end pools — escape via era-skip
  const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
  const POSITION_PRIORITY = ["SG", "PG", "SF", "PF", "C"];

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

    const thin = THIN_DECADES.includes(decade);
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
      if (v >= ANCHOR_MIN) {
        return {
          action: ACT.TAKE,
          player: best.p,
          position: best.position,
          reason: `Strong anchor — ${best.p.n} (val ${v.toFixed(1)}). Place at ${best.position}.`,
          detail,
        };
      }
      return { action: ACT.RESTART, reason: `Pick-1 best is only ${v.toFixed(1)} val (<${ANCHOR_MIN}). Restart for a better anchor — keep both skips for the hard late picks.`, detail };
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
    if (k === 2 && T < PACE2_MIN) {
      return { action: ACT.RESTART, reason: `Behind pace — only ${T.toFixed(0)} val after 2 picks (want ≥ ${PACE2_MIN}). Restarting beats grinding out a doomed run.`, detail };
    }

    if (v >= SKIP_BELOW) {
      const need = TARGET_SUMVAL - T - v;
      const onPace = need <= (slotsLeft - 1) * GOOD_PER_PICK;
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
    return POSITION_PRIORITY.find((p) => openPositions.includes(p) && eligible.has(p)) || null;
  }

  C820.policy = {
    recommend,
    ACT,
    CONST: { ANCHOR_MIN, SKIP_BELOW, PACE2_MIN, TARGET_SUMVAL, THIN_DECADES, POSITION_PRIORITY },
  };
})();
