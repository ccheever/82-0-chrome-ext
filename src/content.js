// 82-0 Coach — content-script orchestrator + advisory overlay.
//
// Pipeline each time the board changes: board.read() -> enrich pool from bundled dataset
// -> track the lineup across placements -> policy.recommend() -> render panel + highlight
// the recommended card. Advisory only: it tells you the move; you click.
// @ref LLP 0002#product
//
// Runs in the isolated world alongside engine.js / policy.js / board.js (shared C820).

(() => {
  const C820 = globalThis.C820 || {};
  const { engine, policy, board } = C820;
  if (!engine || !policy || !board) {
    console.error("[82-0 Coach] engine/policy/board not loaded");
    return;
  }

  // ---- bundled dataset (for exact stats incl. HoopIQ where the page hides them) ----
  let INDEX = null; // key "name|team|decade" -> player
  async function loadData() {
    try {
      const url = chrome.runtime.getURL("src/data/players.json");
      const rows = await (await fetch(url)).json();
      INDEX = new Map();
      for (const r of rows) INDEX.set(`${board.norm(r.n)}|${r.t}|${r.d}`, r);
      console.log(`[82-0 Coach] loaded ${rows.length} players`);
    } catch (e) {
      console.warn("[82-0 Coach] dataset load failed; using on-card stats only", e);
      INDEX = new Map();
    }
  }

  // Merge dataset stats into a card (dataset wins; card is fallback for unknowns).
  function enrich(card) {
    const d = INDEX && INDEX.get(card.key);
    const p = d
      ? { n: card.n, t: card.t, d: card.d, pos: d.pos || card.pos, ppg: d.ppg, rpg: d.rpg, apg: d.apg, spg: d.spg, bpg: d.bpg, el: card.el }
      : { ...card };
    p.val = engine.val(p);
    return p;
  }

  // ---- lineup tracking across placements -------------------------------------------
  // Best-effort: commit a recommended TAKE when the round advances. The page's
  // "Placing {Name}" hint is retained as a fallback signal but does not identify a slot.
  // Used only for pace/last-pick math; the core take/skip/restart call does not need it.
  // @ref LLP 0002#state-tracking
  const state = {
    committed: [], prevRound: null, prevPhase: null,
    pendingFromHint: null, lastTakeRec: null,
  };

  function resolvePlayer(name, team, decade) {
    if (!name) return null;
    const d = INDEX && INDEX.get(`${board.norm(name)}|${team}|${decade}`);
    if (d) return { ...d, val: engine.val(d) };
    return null;
  }

  function trackLineup(b) {
    // new game / restart: round back to 1 (from >1 or from a completed screen)
    if (b.phase !== "complete" && b.round === 1 &&
        (state.prevPhase === "complete" || (state.prevRound != null && state.prevRound > 1))) {
      state.committed = [];
    }
    // remember the in-flight pick from the hint
    if (b.placingName) {
      const p = resolvePlayer(b.placingName, b.team, b.decade);
      if (p) state.pendingFromHint = p;
    }
    // round advanced => a placement happened
    if (b.round != null && state.prevRound != null && b.round > state.prevRound) {
      const placed = state.lastTakeRec || state.pendingFromHint;
      if (placed && placed._position) state.committed.push(placed);
      state.pendingFromHint = null;
      state.lastTakeRec = null;
    }
    // keep committed length consistent with round when we can (don't fabricate stats)
    state.prevRound = b.round;
    state.prevPhase = b.phase;
  }

  // ---- overlay ----------------------------------------------------------------------
  let root, lastRecCardEl = null;
  function ui() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "c820-coach";
    root.innerHTML = `
      <div class="c820-hd"><span class="c820-logo">82-0</span> COACH
        <button class="c820-min" title="collapse">–</button></div>
      <div class="c820-body">
        <div class="c820-action" id="c820-action">…</div>
        <div class="c820-reason" id="c820-reason"></div>
        <div class="c820-grid" id="c820-grid"></div>
        <div class="c820-alts" id="c820-alts"></div>
        <div class="c820-foot">
          <span id="c820-lineup"></span>
          <button class="c820-reset" id="c820-reset" title="Reset tracked lineup">reset</button>
        </div>
      </div>`;
    document.documentElement.appendChild(root);
    root.querySelector(".c820-min").onclick = () => root.classList.toggle("c820-collapsed");
    root.querySelector("#c820-reset").onclick = () => {
      state.committed = [];
      state.pendingFromHint = null;
      state.lastTakeRec = null;
      render(lastBoard);
    };
    return root;
  }

  const ACT_LABEL = {
    TAKE: "TAKE", TEAM_SKIP: "TEAM-SKIP", ERA_SKIP: "ERA-SKIP", RESTART: "RESTART",
  };
  const ACT_CLASS = {
    TAKE: "take", TEAM_SKIP: "skip", ERA_SKIP: "skip", RESTART: "restart",
  };

  function clearHighlight() {
    if (lastRecCardEl) { lastRecCardEl.classList.remove("c820-rec"); lastRecCardEl = null; }
  }

  function render(b) {
    ui();
    const A = root.querySelector("#c820-action");
    const R = root.querySelector("#c820-reason");
    const G = root.querySelector("#c820-grid");
    const ALT = root.querySelector("#c820-alts");
    const LU = root.querySelector("#c820-lineup");
    clearHighlight();

    if (!b || b.phase === "spinning") {
      A.className = "c820-action wait"; A.textContent = "Spin the wheel...";
      R.textContent = b && b.round ? `Round ${b.round}/5 — waiting for a team + decade.` : "Waiting…";
      G.innerHTML = ""; ALT.innerHTML = "";
      LU.textContent = lineupSummary();
      return;
    }
    if (b.phase === "complete") {
      const c = b.complete || {};
      A.className = "c820-action " + (c.is820 ? "take" : "restart");
      A.textContent = c.is820 ? "82-0. Perfect season." : `Game over — ${c.text || c.wins + " wins"}`;
      R.textContent = c.is820 ? "Perfect season. New game to do it again." : "Not 82-0 — start a new game and re-anchor.";
      G.innerHTML = ""; ALT.innerHTML = ""; LU.textContent = lineupSummary();
      return;
    }

    // selecting
    const pool = b.pool.map(enrich);
    const open = openPositions();
    const rec = policy.recommend({
      roster: state.committed, pool,
      openPositions: open,
      teamSkipAvail: b.teamSkipAvail, eraSkipAvail: b.eraSkipAvail, decade: b.decade,
    });
    if (rec.action === "TAKE" && rec.player && rec.position) {
      state.lastTakeRec = { ...rec.player, _position: rec.position };
    }

    A.className = "c820-action " + (ACT_CLASS[rec.action] || "");
    A.textContent = (ACT_LABEL[rec.action] || rec.action) +
      (rec.action === "TAKE" && rec.player ? `  ${rec.player.n} -> ${rec.position}` : "");
    R.textContent = rec.reason;

    const d = rec.detail || {};
    const proj = d.afterOVR != null ? `${d.afterOVR} OVR → ${d.afterWins} wins` : "—";
    G.innerHTML = "";
    G.appendChild(stat("Round", `${b.round || "?"}/5`));
    G.appendChild(stat("Roll", `${b.team || "?"} · ${b.decade || "?"}`));
    G.appendChild(stat("Best pick", d.bestVal != null ? `${d.bestVal.toFixed(1)} val` : "—"));
    G.appendChild(stat("If taken", proj));
    G.appendChild(stat("Open slots", open.join("/") || "none"));
    G.appendChild(stat("Lineup so far", `${state.committed.length}/5 · ${runningOVR()} OVR`));
    G.appendChild(stat("Skips", `${b.teamSkipAvail ? "Team yes" : "Team no"} ${b.eraSkipAvail ? "Era yes" : "Era no"}`));

    // highlight the recommended card + show alternatives
    ALT.innerHTML = "";
    if (rec.player && rec.player.el) {
      rec.player.el.classList.add("c820-rec"); lastRecCardEl = rec.player.el;
    }
    (d.top3 || []).forEach((c, i) => {
      const row = document.createElement("div"); row.className = "c820-alt" + (i === 0 ? " best" : "");
      const nm = document.createElement("span"); nm.textContent = `${c.p.n} -> ${c.position}`; row.appendChild(nm);
      const vv = document.createElement("b"); vv.textContent = c.v.toFixed(1); row.appendChild(vv);
      ALT.appendChild(row);
    });
    LU.textContent = lineupSummary();
  }

  function stat(label, value) {
    const el = document.createElement("div"); el.className = "c820-stat";
    const l = document.createElement("span"); l.className = "c820-k"; l.textContent = label;
    const v = document.createElement("span"); v.className = "c820-v"; v.textContent = value;
    el.appendChild(l); el.appendChild(v); return el;
  }
  function runningOVR() { return state.committed.length ? engine.teamOVR(state.committed) : 0; }
  function openPositions() {
    const all = ["PG", "SG", "SF", "PF", "C"];
    const filled = new Set(state.committed.map((p) => p._position).filter(Boolean));
    return all.filter((p) => !filled.has(p));
  }
  function lineupSummary() {
    if (!state.committed.length) return "lineup: (empty)";
    return "lineup: " + state.committed.map((p) => `${p._position || "?"}:${p.n.split(" ").slice(-1)[0]}`).join(", ");
  }

  // ---- run loop ---------------------------------------------------------------------
  let lastBoard = null, scheduled = false;
  function tick() {
    scheduled = false;
    let b;
    try { b = board.read(); } catch (e) { console.warn("[82-0 Coach] read error", e); return; }
    lastBoard = b;
    try { trackLineup(b); } catch (e) { console.warn("[82-0 Coach] track error", e); }
    try { render(b); } catch (e) { console.warn("[82-0 Coach] render error", e); }
  }
  function schedule() { if (!scheduled) { scheduled = true; setTimeout(tick, 180); } }

  (async () => {
    await loadData();
    ui();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
  })();
})();
