// Position-fluid assignment solver for Policy V2a.
//
// @ref LLP 0007#assignment-solver — selected players are MOVABLE between their eligible
//   slots, so "can I take this candidate?" is a bipartite-matching question (does the whole
//   selected set + candidate have a legal packing?), not "is a slot currently open?".
//
// DOM-FREE and norm-FREE on purpose: scripts/sim-core.mjs `await import`s this in Node, and
// it must not touch `document` or board.norm. Callers own identity construction — content.js
// builds selectionId = board.norm(n)+"|"+t+"|"+d; the simulator/tests use the raw name `n`
// (player names are unique within any legal lineup, so `n` is a sufficient id there).

(() => {
  const C820 = (globalThis.C820 = globalThis.C820 || {});

  const POSITIONS = ["PG", "SG", "SF", "PF", "C"]; // canonical matching-column order
  const POSIDX = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };
  const DEFAULT_PRIORITY = ["SG", "PG", "SF", "PF", "C"]; // tie-break only; policy passes cfg.POSITION_PRIORITY

  const isPos = (s) => Object.hasOwn(POSIDX, s); // PG/SG/SF/PF/C — excludes "UNK" and junk
  const defaultId = (p) => p.selectionId ?? p.id ?? p.n;
  const eligibleSlots = (p) => (Array.isArray(p.pos) ? p.pos : []).filter(isPos);
  const eligMask = (p) => {
    let m = 0;
    for (const s of Array.isArray(p.pos) ? p.pos : []) if (isPos(s)) m |= 1 << POSIDX[s];
    return m; // a row whose only position is "UNK" (or empty) gets mask 0 → ineligible
  };
  const popcount = (x) => {
    let c = 0;
    while (x) { c += x & 1; x >>>= 1; }
    return c;
  };

  // Visiting order: fewest eligible slots first (most-constrained-first pruning), then stable
  // id ASC. Output then depends only on (eligibility sets + ids), never on input array order.
  function prep(players, idOf) {
    const id = idOf || defaultId;
    return players
      .map((p) => ({ id: id(p), mask: eligMask(p) }))
      .sort((a, b) => popcount(a.mask) - popcount(b.mask) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  // Every legal matching as { id -> pos }, in canonical deterministic order.
  // [] if illegal (>5 players or any player with no real slot); [{}] for the empty set.
  function legalAssignments(players, idOf = defaultId) {
    if (!players.length) return [{}];
    const ord = prep(players, idOf);
    if (ord.length > 5 || ord.some((o) => o.mask === 0)) return [];
    const out = [];
    const cur = {};
    (function dfs(i, used) {
      if (i === ord.length) { out.push({ ...cur }); return; }
      const o = ord[i];
      for (let s = 0; s < 5; s++) { // fixed PG..C order keeps the output canonical
        const b = 1 << s;
        if (o.mask & b && !(used & b)) {
          cur[o.id] = POSITIONS[s];
          dfs(i + 1, used | b);
          delete cur[o.id];
        }
      }
    })(0, 0);
    return out;
  }

  // The ONLY thing the take/skip/restart decision consults. Early-exit DFS; never builds the
  // full list. @ref LLP 0007#candidate-evaluation
  function hasLegalAssignment(players, idOf = defaultId) {
    if (!players.length) return true;
    const ord = prep(players, idOf);
    if (ord.length > 5 || ord.some((o) => o.mask === 0)) return false;
    let found = false;
    (function dfs(i, used) {
      if (found) return;
      if (i === ord.length) { found = true; return; }
      const o = ord[i];
      for (let s = 0; s < 5 && !found; s++) {
        const b = 1 << s;
        if (o.mask & b && !(used & b)) dfs(i + 1, used | b);
      }
    })(0, 0);
    return found;
  }

  // Ordered, REALIZABLE existing-player moves that turn `currentAssignment` into
  // `nextAssignment` and leave the candidate's target slot empty for the human to drop into.
  // @ref LLP 0007#assignment-choice — emits only valid steps and verifies the sequence reaches
  //   the target. An empty-only plan is valid under EITHER live drag rule (swap or empty-only),
  //   so it is the safe default; "swap" yields shorter plans when the game allows it.
  function prePlacementMoves(currentAssignment, nextAssignment, candidateId, movementRules = "empty-only") {
    if (!currentAssignment) return { moves: [], ordered: false, certain: false }; // layout unknown → degrade
    const slotOf = { ...currentAssignment };
    const occ = {};
    for (const id in currentAssignment) occ[currentAssignment[id]] = id;
    const targetSlot = nextAssignment[candidateId];
    const need = new Set(
      Object.keys(nextAssignment).filter(
        (id) =>
          id !== candidateId &&
          currentAssignment[id] !== undefined &&
          currentAssignment[id] !== nextAssignment[id],
      ),
    );
    const moves = [];

    if (movementRules === "swap") {
      // Any permutation is reachable: fill free targets directly; resolve 2-cycles as swaps.
      while (need.size) {
        let progress = false;
        for (const id of [...need]) {
          const to = nextAssignment[id];
          const blocker = occ[to];
          if (blocker === undefined) {
            const from = slotOf[id];
            delete occ[from]; occ[to] = id; slotOf[id] = to;
            moves.push({ id, from, to });
            need.delete(id); progress = true;
          } else if (need.has(blocker)) {
            const a = slotOf[id], bs = slotOf[blocker];
            moves.push({ id, from: a, to: bs }, { id: blocker, from: bs, to: a });
            occ[bs] = id; occ[a] = blocker; slotOf[id] = bs; slotOf[blocker] = a;
            need.delete(id); need.delete(blocker); progress = true;
          }
        }
        if (!progress) return { moves, ordered: false, certain: false };
      }
      return { moves, ordered: true, certain: true };
    }

    // empty-only (default): only ever move a player INTO a currently-empty slot.
    while (need.size) {
      let progress = false;
      for (const id of [...need]) {
        const to = nextAssignment[id];
        if (occ[to] === undefined) {
          const from = slotOf[id];
          delete occ[from]; occ[to] = id; slotOf[id] = to;
          moves.push({ id, from, to });
          need.delete(id); progress = true;
        }
      }
      if (!progress) break; // deadlock — e.g. a PG<->SG 2-cycle while only SF/PF/C are empty
    }
    const certain = need.size === 0 && occ[targetSlot] === undefined;
    return { moves, ordered: certain, certain };
  }

  // Pick ONE legal assignment for the full set (selected players + candidate) and describe the
  // moves to reach it. Move burden is reported (moves/moveStatus/moveCost), never gating — the
  // TAKE decision is hasLegalAssignment only. Returns null iff the set is unassignable.
  function bestAssignment(players, currentAssignment, candidateId, movementRules = "empty-only", cfg, idOf = defaultId) {
    const priority = (cfg && cfg.POSITION_PRIORITY) || DEFAULT_PRIORITY;
    const all = legalAssignments(players, idOf);
    if (!all.length) return null;
    const cur = currentAssignment || null;
    const single = new Map(players.map((p) => [idOf(p), popcount(eligMask(p)) === 1]));
    const ser = (a) => Object.keys(a).sort().map((k) => k + ":" + a[k]).join("|");

    // Among legal assignments (lower wins, lexicographic): fewest existing-player moves, then
    // less cascade, then keep single-position players put, then candidate slot by POSITION_PRIORITY
    // (tie-break only), then a stable serialized key.
    const score = (A) => {
      const moved = Object.keys(A).filter((id) => id !== candidateId && cur && cur[id] !== undefined && A[id] !== cur[id]);
      const fromSlots = new Set(moved.map((id) => cur[id]));
      const cascade = moved.filter((id) => fromSlots.has(A[id])).length;
      const singleMoved = moved.filter((id) => single.get(id)).length;
      return { existing: moved.length, cascade, singleMoved, prio: priority.indexOf(A[candidateId]), key: ser(A) };
    };
    const ranked = all
      .map((A) => ({ A, s: score(A) }))
      .sort(
        (a, b) =>
          a.s.existing - b.s.existing ||
          a.s.cascade - b.s.cascade ||
          a.s.singleMoved - b.s.singleMoved ||
          a.s.prio - b.s.prio ||
          (a.s.key < b.s.key ? -1 : a.s.key > b.s.key ? 1 : 0),
      );

    let chosen = ranked[0];
    let plan = prePlacementMoves(cur, chosen.A, candidateId, movementRules);
    // empty-only can leave a comparator-best assignment unreachable (single-buffer final pick);
    // prefer a legal assignment whose plan IS executable, per LLP 0007#assignment-choice.
    if (cur && movementRules === "empty-only" && !plan.certain) {
      const reach = ranked.find((x) => prePlacementMoves(cur, x.A, candidateId, movementRules).certain);
      if (reach) { chosen = reach; plan = prePlacementMoves(cur, chosen.A, candidateId, movementRules); }
    }
    const moveStatus = !cur ? "unknown" : plan.certain ? "reachable" : "manual";
    return {
      assignment: chosen.A,
      targetPosition: chosen.A[candidateId],
      moves: plan.certain ? plan.moves : [],
      moveStatus,
      moveCost: plan.certain ? plan.moves.length : Infinity,
    };
  }

  C820.assign = { legalAssignments, hasLegalAssignment, bestAssignment, prePlacementMoves, eligibleSlots, POSITIONS, defaultId };
})();
