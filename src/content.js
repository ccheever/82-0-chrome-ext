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
  function extensionResourceURL(path) {
    // @ref LLP 0006#webextension-api-compatibility — Safari may expose browser.* instead of chrome.*.
    const runtime =
      (globalThis.chrome && globalThis.chrome.runtime) ||
      (globalThis.browser && globalThis.browser.runtime);
    if (!runtime || typeof runtime.getURL !== "function") {
      throw new Error("WebExtension runtime.getURL is unavailable");
    }
    return runtime.getURL(path);
  }

  async function loadData() {
    try {
      const url = extensionResourceURL("src/data/players.json");
      const rows = await (await fetch(url)).json();
      INDEX = new Map();
      for (const r of rows) INDEX.set(`${board.norm(r.n)}|${r.t}|${r.d}`, r);
      console.log(`[82-0 Coach] loaded ${rows.length} players`);
    } catch (e) {
      console.warn("[82-0 Coach] dataset load failed; using on-card stats only", e);
      INDEX = new Map();
    }
  }

  const STAT_KEYS = ["ppg", "rpg", "apg", "spg", "bpg"];
  const hasCardStats = (card) => STAT_KEYS.some((k) => card[k] != null && !Number.isNaN(card[k]));

  // Merge dataset stats into a card (dataset wins; card is fallback for unknowns).
  function enrich(card) {
    const d = INDEX && INDEX.get(card.key);
    const valueSource = d ? "dataset" : hasCardStats(card) ? "card" : "unknown";
    const p = d
      ? { n: card.n, t: card.t, d: card.d, pos: d.pos || card.pos, ppg: d.ppg, rpg: d.rpg, apg: d.apg, spg: d.spg, bpg: d.bpg, el: card.el }
      : { ...card };
    p.val = valueSource === "unknown" ? null : engine.val(p);
    p._valueSource = valueSource;
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

  function resetTrackedLineup() {
    state.committed = [];
    state.pendingFromHint = null;
    state.lastTakeRec = null;
  }

  function resolvePlayer(name, team, decade) {
    if (!name) return null;
    const d = INDEX && INDEX.get(`${board.norm(name)}|${team}|${decade}`);
    if (d) return { ...d, val: engine.val(d) };
    return null;
  }

  function trackLineup(b) {
    const round = b.round ?? null;
    const leavingCompletedGame = state.prevPhase === "complete" && b.phase !== "complete";
    const roundRewoundToStart = round === 1 && state.prevRound != null && state.prevRound > 1;
    // New game / restart: the page can briefly show no round while leaving the
    // completed screen, so reset on the phase transition instead of waiting for R1.
    if (leavingCompletedGame || roundRewoundToStart) resetTrackedLineup();

    // remember the in-flight pick from the hint
    if (b.placingName) {
      const p = resolvePlayer(b.placingName, b.team, b.decade);
      if (p) state.pendingFromHint = p;
    }
    // round advanced => a placement happened
    if (round != null && state.prevRound != null && round > state.prevRound) {
      const placed = state.lastTakeRec || state.pendingFromHint;
      if (placed && placed._position) state.committed.push(placed);
      state.pendingFromHint = null;
      state.lastTakeRec = null;
    }
    // Keep committed length consistent with round when we can (don't fabricate stats).
    // Preserve prevRound through transient no-round screens, except after completion,
    // where the next non-complete screen is a fresh game.
    if (round != null) state.prevRound = round;
    else if (b.phase === "complete" || leavingCompletedGame) state.prevRound = null;
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
      resetTrackedLineup();
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

  // @ref LLP 0002#user-experience — annotate each live player card with the
  // Standard-mode Val rating, using dataset stats in the extension and visible
  // Classic-mode stats in the bookmarklet fallback.
  function annotatePlayerValues(players) {
    const liveCards = new Set(players.map((p) => p.el).filter(Boolean));
    clearPlayerValueBadges(liveCards);
    players.forEach((p) => {
      if (!p.el) return;
      const badge = ensureValueBadge(p.el);
      const known = Number.isFinite(p.val);
      badge.classList.toggle("unknown", !known);
      badge.title = known
        ? `82-0 Coach Val rating from ${p._valueSource === "dataset" ? "bundled" : "visible"} stats`
        : "82-0 Coach Val rating unavailable without visible stats or bundled data";
      badge.querySelector(".c820-val-num").textContent = known ? p.val.toFixed(1) : "--";
    });
  }

  function clearPlayerValueBadges(keepCards) {
    document.querySelectorAll(".c820-val-badge").forEach((badge) => {
      const card = badge.closest('[draggable="true"]');
      if (!keepCards || !keepCards.has(card)) badge.remove();
    });
    document.querySelectorAll(".c820-valued").forEach((card) => {
      if (!keepCards || !keepCards.has(card)) card.classList.remove("c820-valued");
    });
  }

  function ensureValueBadge(cardEl) {
    cardEl.classList.add("c820-valued");
    const existing = [...cardEl.querySelectorAll(".c820-val-badge")];
    const badge = existing.shift() || createValueBadge();
    existing.forEach((extra) => extra.remove());
    const host = valueBadgeHost(cardEl);
    if (badge.parentElement !== host) host.appendChild(badge);
    return badge;
  }

  function createValueBadge() {
    const badge = document.createElement("div");
    badge.className = "c820-val-badge";
    const num = document.createElement("span");
    num.className = "c820-val-num";
    const lab = document.createElement("span");
    lab.className = "c820-val-label";
    lab.textContent = "VAL";
    badge.appendChild(num);
    badge.appendChild(lab);
    return badge;
  }

  function valueBadgeHost(cardEl) {
    const statCells = [...cardEl.querySelectorAll('[class*="w-7"]')];
    return statCells.length ? statCells[statCells.length - 1].parentElement : cardEl;
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
      clearPlayerValueBadges();
      A.className = "c820-action wait"; A.textContent = "Spin the wheel...";
      R.textContent = b && b.round ? `Round ${b.round}/5 — waiting for a team + decade.` : "Waiting…";
      G.innerHTML = ""; ALT.innerHTML = "";
      LU.textContent = lineupSummary();
      return;
    }
    if (b.phase === "complete") {
      clearPlayerValueBadges();
      const c = b.complete || {};
      A.className = "c820-action " + (c.is820 ? "take" : "restart");
      A.textContent = c.is820 ? "82-0. Perfect season." : `Game over — ${c.text || c.wins + " wins"}`;
      R.textContent = c.is820 ? "Perfect season. New game to do it again." : "Not 82-0 — start a new game and re-anchor.";
      G.innerHTML = ""; ALT.innerHTML = ""; LU.textContent = lineupSummary();
      return;
    }

    // selecting
    const pool = b.pool.map(enrich);
    annotatePlayerValues(pool);
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
