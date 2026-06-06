// 82-0 Coach — content-script orchestrator + advisory overlay (+ optional Lazy Mode autopilot).
//
// Pipeline each time the board changes: board.read() -> enrich pool from bundled dataset
// -> track the lineup across placements -> policy.recommend() -> render panel + highlight
// the recommended card -> optional autopilot.step() when Lazy Mode is on.
// @ref LLP 0002#product
// @ref LLP 0008#architecture — actuator bolted onto the existing tick loop
//
// Runs in the isolated world alongside engine.js / policy.js / board.js (shared C820).

(() => {
  const C820 = globalThis.C820 || {};
  const { engine, policy, board, actuator } = C820;
  if (!engine || !policy || !board || !actuator) {
    console.error("[82-0 Coach] engine/policy/board/actuator not loaded");
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
  const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
  const hasCardStats = (card) => STAT_KEYS.some((k) => card[k] != null && !Number.isNaN(card[k]));
  const selectionId = (p) => p.selectionId || `${board.norm(p.n)}|${p.t}|${p.d}`;
  const nameKey = (p) => p?._nameKey || board.norm(p?.n);
  const sameName = (a, b) => board.norm(a) === board.norm(b);

  // Merge dataset stats into a card (dataset wins; card is fallback for unknowns).
  function enrich(card) {
    const d = INDEX && INDEX.get(card.key);
    const valueSource = d ? "dataset" : hasCardStats(card) ? "card" : "unknown";
    const p = d
      ? { n: card.n, t: card.t, d: card.d, pos: d.pos || card.pos, ppg: d.ppg, rpg: d.rpg, apg: d.apg, spg: d.spg, bpg: d.bpg, el: card.el }
      : { ...card };
    p.selectionId = selectionId(p);
    p._nameKey = board.norm(p.n);
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
    assignment: {},
    movementRules: "empty-only",
  };

  function resetTrackedLineup() {
    state.committed = [];
    state.pendingFromHint = null;
    state.lastTakeRec = null;
    state.assignment = {};
  }

  function findCommittedByName(name) {
    const key = board.norm(name);
    return state.committed.find((p) => nameKey(p) === key) || null;
  }

  function applyAssignmentToCommitted() {
    for (const p of state.committed) {
      const pos = state.assignment?.[selectionId(p)];
      if (pos) p._position = pos;
    }
  }

  function upsertCommitted(player, position) {
    const id = selectionId(player);
    const key = nameKey(player);
    let existing = state.committed.find((p) => selectionId(p) === id || nameKey(p) === key);
    if (!existing) {
      existing = { ...player, selectionId: id, _nameKey: key };
      state.committed.push(existing);
    }
    existing._position = position || existing._position;
    return existing;
  }

  function resolvePlayer(name, team, decade) {
    if (!name) return null;
    const d = INDEX && INDEX.get(`${board.norm(name)}|${team}|${decade}`);
    if (d) {
      const p = { ...d, val: engine.val(d) };
      p.selectionId = `${board.norm(p.n)}|${p.t}|${p.d}`;
      p._nameKey = board.norm(p.n);
      return p;
    }
    return null;
  }

  function playerFromSlotOccupant(occupant) {
    if (!occupant?.n) return null;
    if (occupant._slotSource === "sibling") return findCommittedByName(occupant.n);
    if (occupant.t && occupant.d) {
      const key = occupant.key || `${board.norm(occupant.n)}|${occupant.t}|${occupant.d}`;
      return enrich({ ...occupant, key });
    }
    return findCommittedByName(occupant.n);
  }

  // @ref LLP 0007#product-and-tracking-impact — prefer real court occupancy when the DOM
  // exposes it, so move advice is based on where players actually are, not just our last
  // recommendation.
  function syncAssignmentFromSlots(b) {
    if (!b?.slots) return;
    const next = {};
    let found = 0;
    for (const pos of POSITIONS) {
      const p = playerFromSlotOccupant(b.slots[pos]?.occupant);
      if (!p) continue;
      const committed = upsertCommitted(p, pos);
      next[selectionId(committed)] = pos;
      found += 1;
    }
    if (!found) return;
    state.assignment = { ...state.assignment, ...next };
    applyAssignmentToCommitted();
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
      const last = state.lastTakeRec;
      const p =
        last?.player && sameName(last.player.n, b.placingName)
          ? last.player
          : resolvePlayer(b.placingName, b.team, b.decade);
      if (p) state.pendingFromHint = p;
    }
    // round advanced => a placement happened
    if (round != null && state.prevRound != null && round > state.prevRound) {
      const last = state.lastTakeRec;
      const placed = last?.player || state.pendingFromHint;
      const position = last?.position || placed?._position;
      if (placed && position) {
        const committed = upsertCommitted(placed, position);
        if (last?.nextAssignment) {
          state.assignment = { ...last.nextAssignment };
        } else {
          state.assignment = { ...state.assignment, [committed.selectionId]: position };
        }
        applyAssignmentToCommitted();
      }
      state.pendingFromHint = null;
      state.lastTakeRec = null;
    }
    syncAssignmentFromSlots(b);
    // Keep committed length consistent with round when we can (don't fabricate stats).
    // Preserve prevRound through transient no-round screens, except after completion,
    // where the next non-complete screen is a fresh game.
    if (round != null) state.prevRound = round;
    else if (b.phase === "complete" || leavingCompletedGame) state.prevRound = null;
    state.prevPhase = b.phase;
  }

  // ---- Lazy Mode autopilot ---------------------------------------------------------
  const LAZY_RELOAD_RESUME_KEY = "c820.lazyReloadResume.v1";
  const LAZY_RELOAD_RESUME_TTL_MS = 120_000;

  function clearLazyReloadResume() {
    try { sessionStorage.removeItem(LAZY_RELOAD_RESUME_KEY); } catch (_) {}
  }

  // @ref LLP 0008#mid-game-restart-via-browser-reload — reload destroys the content
  // script, so an actuator-triggered restart gets one short-lived tab-scoped resume token.
  function saveLazyReloadResume(snapshot) {
    try {
      if (!snapshot || snapshot.level === actuator.LEVEL.MANUAL) return;
      sessionStorage.setItem(
        LAZY_RELOAD_RESUME_KEY,
        JSON.stringify({ ...snapshot, href: location.href, savedAt: Date.now() }),
      );
    } catch (e) {
      console.warn("[82-0 Coach] could not save Lazy Mode reload resume token", e);
    }
  }

  function consumeLazyReloadResume() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(LAZY_RELOAD_RESUME_KEY);
      sessionStorage.removeItem(LAZY_RELOAD_RESUME_KEY);
    } catch (e) {
      console.warn("[82-0 Coach] could not read Lazy Mode reload resume token", e);
      return null;
    }
    if (!raw) return null;
    try {
      const snapshot = JSON.parse(raw);
      const fresh = Date.now() - (snapshot.savedAt || 0) <= LAZY_RELOAD_RESUME_TTL_MS;
      return fresh && snapshot.href === location.href ? snapshot : null;
    } catch (e) {
      console.warn("[82-0 Coach] invalid Lazy Mode reload resume token", e);
      return null;
    }
  }

  // @ref LLP 0008#manifest-and-permissions — default Manual each session; no chrome.storage.
  // @ref LLP 0007#product-and-tracking-impact — content carries selected players plus an
  // assignment map so position-fluid recommendations can include concrete move plans.
  policy.configure({ positionFluid: true });

  const autopilot = actuator.createAutopilot({
    onHalt: (reason) => { clearLazyReloadResume(); updateLazyBadge(reason); },
    onWin: () => { clearLazyReloadResume(); updateLazyBadge("82-0 — Lazy Mode stopped."); },
    onBeforeReload: saveLazyReloadResume,
  });

  function lazyBadgeText() {
    if (autopilot.level === actuator.LEVEL.MANUAL) return "";
    if (autopilot.haltReason) return `PAUSED ▸ ${autopilot.haltReason}`;
    if (autopilot.level === actuator.LEVEL.AUTO) return "AUTO ▸ playing until 82-0";
    return "ASSIST ▸ reloading weak runs";
  }

  function updateLazyBadge(extra) {
    const badge = root?.querySelector("#c820-lazy-badge");
    if (!badge) return;
    const text = extra || lazyBadgeText();
    badge.textContent = text;
    badge.hidden = !text;
    root.classList.toggle("c820-lazy-on", autopilot.level !== actuator.LEVEL.MANUAL);
    root.classList.toggle("c820-lazy-assist", autopilot.level === actuator.LEVEL.ASSIST);
    root.classList.toggle("c820-lazy-auto", autopilot.level === actuator.LEVEL.AUTO);
    root.classList.toggle("c820-lazy-paused", !!autopilot.haltReason);
  }

  function setLazyLevel(level) {
    if (level === actuator.LEVEL.MANUAL) clearLazyReloadResume();
    autopilot.setLevel(level);
    updateLazyBadge();
    syncLazyButtons();
  }

  function syncLazyButtons() {
    if (root) {
      root.querySelectorAll(".c820-lazy-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.level === autopilot.level);
      });
    }
  }

  function restoreLazyFromReload() {
    const snapshot = consumeLazyReloadResume();
    if (!snapshot) return;
    if (autopilot.restoreSnapshot(snapshot)) {
      updateLazyBadge();
      syncLazyButtons();
    }
  }

  function wireKillSwitches() {
    // @ref LLP 0008#safety-model — Esc and trusted human clicks pause autopilot.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && autopilot.level !== actuator.LEVEL.MANUAL) setLazyLevel(actuator.LEVEL.MANUAL);
    }, true);
    const pauseOnHuman = (e) => {
      if (!e.isTrusted) return;
      if (e.target?.closest?.("#c820-coach")) return;
      if (autopilot.level !== actuator.LEVEL.MANUAL) autopilot.noteTrustedInput();
      updateLazyBadge();
    };
    document.addEventListener("pointerdown", pauseOnHuman, true);
    document.addEventListener("click", pauseOnHuman, true);
  }

  // ---- overlay ----------------------------------------------------------------------
  let root, lastRecCardEl = null;
  function ui() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "c820-coach";
    root.innerHTML = `
      <div class="c820-hd"><span class="c820-logo">82-0</span> COACH
        <div class="c820-lazy" title="Lazy Mode autopilot">
          <button class="c820-lazy-btn active" data-level="manual" type="button">Manual</button>
          <button class="c820-lazy-btn" data-level="assist" type="button">Assist</button>
          <button class="c820-lazy-btn" data-level="auto" type="button">Auto</button>
        </div>
        <button class="c820-min" title="collapse">–</button></div>
      <div class="c820-lazy-badge" id="c820-lazy-badge" hidden></div>
      <div class="c820-body">
        <div class="c820-action" id="c820-action">…</div>
        <div class="c820-reason" id="c820-reason"></div>
        <div class="c820-moves" id="c820-moves"></div>
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
    root.querySelectorAll(".c820-lazy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        setLazyLevel(btn.dataset.level);
        tick();
      });
    });
    wireKillSwitches();
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
    const M = root.querySelector("#c820-moves");
    const G = root.querySelector("#c820-grid");
    const ALT = root.querySelector("#c820-alts");
    const LU = root.querySelector("#c820-lineup");
    clearHighlight();
    updateLazyBadge();

    if (activePlacementBoard(b)) {
      return renderPlacement(b, placementRecommendation(b, { fallback: true }));
    }

    if (!b || b.phase === "spinning") {
      clearPlayerValueBadges();
      A.className = "c820-action wait"; A.textContent = "Spin the wheel...";
      R.textContent = b && b.round ? `Round ${b.round}/5 — waiting for a team + decade.` : "Waiting…";
      M.innerHTML = ""; G.innerHTML = ""; ALT.innerHTML = "";
      LU.textContent = lineupSummary();
      return null;
    }
    if (b.phase === "mode") {
      clearPlayerValueBadges();
      A.className = "c820-action wait"; A.textContent = "Start Classic mode...";
      R.textContent = "Waiting on the mode picker.";
      M.innerHTML = ""; G.innerHTML = ""; ALT.innerHTML = "";
      LU.textContent = lineupSummary();
      return null;
    }
    if (b.phase === "complete") {
      clearPlayerValueBadges();
      const c = b.complete || {};
      A.className = "c820-action " + (c.is820 ? "take" : "restart");
      A.textContent = c.is820 ? "82-0. Perfect season." : `Game over — ${c.text || c.wins + " wins"}`;
      R.textContent = c.is820 ? "Perfect season. New game to do it again." : "Not 82-0 — start a new game and re-anchor.";
      M.innerHTML = ""; G.innerHTML = ""; ALT.innerHTML = ""; LU.textContent = lineupSummary();
      return null;
    }
    if (b.phase === "placing") return renderPlacement(b, placementRecommendation(b));

    // selecting
    const pool = b.pool.map(enrich);
    annotatePlayerValues(pool);
    const open = openPositions();
    const rec = policy.recommend({
      roster: state.committed, pool,
      openPositions: open,
      assignment: Object.keys(state.assignment).length ? state.assignment : null,
      movementRules: state.movementRules,
      teamSkipAvail: b.teamSkipAvail, eraSkipAvail: b.eraSkipAvail, decade: b.decade,
    });
    if (rec.action === "TAKE" && rec.player && rec.position) {
      state.lastTakeRec = {
        player: { ...rec.player, _position: rec.position },
        position: rec.position,
        nextAssignment: rec.detail?.nextAssignment || rec.detail?._plan?.assignment || null,
        moves: rec.detail?.moves || [],
        moveStatus: rec.detail?.moveStatus || null,
        moveCost: rec.detail?.moveCost ?? null,
      };
    }

    A.className = "c820-action " + (ACT_CLASS[rec.action] || "");
    A.textContent = (ACT_LABEL[rec.action] || rec.action) +
      (rec.action === "TAKE" && rec.player ? `  ${rec.player.n} -> ${rec.position}` : "");
    R.textContent = rec.reason;

    const d = rec.detail || {};
    const proj = d.afterOVR != null ? `${d.afterOVR} OVR → ${d.afterWins} wins` : "—";
    renderMovePlan(M, rec);
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
      const mv = c._plan?.moveCost && Number.isFinite(c._plan.moveCost) ? ` · ${c._plan.moveCost} move${c._plan.moveCost === 1 ? "" : "s"}` : "";
      const vv = document.createElement("b"); vv.textContent = `${c.v.toFixed(1)} val${mv}`; row.appendChild(vv);
      ALT.appendChild(row);
    });
    LU.textContent = lineupSummary();
    return rec;

    function renderPlacement(boardState, rec) {
      clearPlayerValueBadges();
      A.className = "c820-action " + (rec ? "take" : "wait");
      A.textContent = rec ? `PLACE  ${rec.player.n} -> ${rec.position}` : "Choose position";
      R.textContent = rec
        ? `Click ${rec.position} to place ${rec.player.n}.`
        : `Placing ${boardState.placingName || "player"} — choose a compatible open position.`;
      renderMovePlan(M, rec, { placing: true });
      G.innerHTML = "";
      G.appendChild(stat("Round", `${boardState.round || "?"}/5`));
      G.appendChild(stat("Target slot", rec?.position || "—"));
      G.appendChild(stat("Lineup so far", `${state.committed.length}/5 · ${runningOVR()} OVR`));
      G.appendChild(stat("Open slots", openPositions().join("/") || "none"));
      ALT.innerHTML = "";
      LU.textContent = lineupSummary();
      return rec;
    }
  }

  function stat(label, value) {
    const el = document.createElement("div"); el.className = "c820-stat";
    const l = document.createElement("span"); l.className = "c820-k"; l.textContent = label;
    const v = document.createElement("span"); v.className = "c820-v"; v.textContent = value;
    el.appendChild(l); el.appendChild(v); return el;
  }

  function activePlacementBoard(b) {
    return !!(
      b &&
      (b.phase === "placing" ||
        (
          b.phase === "selecting" &&
          state.lastTakeRec &&
          b.placingName &&
          sameName(b.placingName, state.lastTakeRec.player?.n)
        ) ||
        (
          b.phase === "spinning" &&
          state.lastTakeRec &&
          !b.spinEnabled &&
          !(b.pool && b.pool.length) &&
          b.round != null &&
          state.prevRound === b.round
        ))
    );
  }

  function placementRecommendation(b, opts = {}) {
    const last = state.lastTakeRec;
    if (!last?.player || !last.position) return null;
    if (b?.placingName && !sameName(b.placingName, last.player.n)) return null;
    return {
      action: "TAKE",
      player: last.player,
      position: last.position,
      reason: `Place ${last.player.n} at ${last.position}.`,
      detail: {
        nextAssignment: last.nextAssignment || null,
        moves: last.moves || [],
        moveStatus: last.moveStatus || null,
        moveCost: last.moveCost ?? null,
        placementFallback: !!opts.fallback,
      },
    };
  }

  function movePlayerName(id) {
    const p = state.committed.find((x) => selectionId(x) === id || x.n === id);
    return p ? p.n : id.split("|")[0] || id;
  }

  // @ref LLP 0007#product-and-tracking-impact — the candidate action and prerequisite
  // assignment moves are separate pieces of advice in the overlay.
  function renderMovePlan(host, rec, opts = {}) {
    host.innerHTML = "";
    if (!rec || rec.action !== "TAKE") return;
    const d = rec.detail || {};
    const moves = Array.isArray(d.moves) ? d.moves : [];
    if (moves.length) {
      const title = document.createElement("div");
      title.className = "c820-moves-title";
      title.textContent = "Before placing";
      host.appendChild(title);
      moves.forEach((m, i) => {
        const row = document.createElement("div");
        row.className = "c820-move";
        row.textContent = `${i + 1}. ${movePlayerName(m.id)}: ${m.from} -> ${m.to}`;
        host.appendChild(row);
      });
      return;
    }
    if (!opts.placing && d.moveStatus === "manual") {
      const row = document.createElement("div");
      row.className = "c820-move warn";
      row.textContent = `Legal fit, but moves are manual. Free ${rec.position}, then place ${rec.player.n}.`;
      host.appendChild(row);
    }
  }
  function runningOVR() { return state.committed.length ? engine.teamOVR(state.committed) : 0; }
  function openPositions() {
    const assigned = new Set(Object.values(state.assignment || {}));
    if (assigned.size) return POSITIONS.filter((p) => !assigned.has(p));
    const filled = new Set(state.committed.map((p) => p._position).filter(Boolean));
    return POSITIONS.filter((p) => !filled.has(p));
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
    let rec = null;
    try { rec = render(b); } catch (e) { console.warn("[82-0 Coach] render error", e); }
    try {
      if (autopilot.level !== actuator.LEVEL.MANUAL) {
        const actionBoard = rec?.detail?.placementFallback
          ? { ...b, phase: "placing", placingName: b.placingName || rec.player?.n || null }
          : b;
        autopilot.step(actionBoard, rec);
      }
    } catch (e) { console.warn("[82-0 Coach] autopilot error", e); }
  }
  function schedule() { if (!scheduled) { scheduled = true; setTimeout(tick, 180); } }

  C820.autopilot = autopilot;

  (async () => {
    await loadData();
    ui();
    restoreLazyFromReload();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
  })();
})();
