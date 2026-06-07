// Lazy Mode actuator — maps policy actions to DOM gestures. The only code that clicks or
// browser-reloads.
//
// @ref LLP 0008#click-the-dom-not-the-react-state — drives user-facing controls; never patches
//   React state or bypasses spinner timers.
// @ref LLP 0008#what-auto-does-the-action-vocabulary — action→gesture mapping lives in planGesture.

(() => {
  const C820 = (globalThis.C820 = globalThis.C820 || {});

  const LEVEL = { MANUAL: "manual", ASSIST: "assist", AUTO: "auto" };

  const DEFAULTS = {
    PACE_MIN_MS: 300,
    PACE_MAX_MS: 700,
    WATCHDOG_MS: 8000,
    GESTURES_PER_MIN: 180,
    NO_PROGRESS_TICKS: 25,
    MAX_GAMES: 250,
    MAX_SPINS: 600,
  };

  function freshStats() {
    return {
      gestures: 0,
      games: 0,
      spins: 0,
      gestureWindowStart: Date.now(),
      gestureWindowCount: 0,
    };
  }

  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  function namesMatch(a, b) {
    if (!a || !b) return false;
    return norm(a) === norm(b);
  }

  function canRestartRun(level) {
    // Assist + Auto restart weak in-progress runs; Manual does not click.
    return level === LEVEL.ASSIST || level === LEVEL.AUTO;
  }

  function canLoopAfterFinish(level) {
    // Only Auto keeps going across finished games until a literal 82-0.
    return level === LEVEL.AUTO;
  }

  function haltPlan(reason) {
    return { kind: "halt", halt: true, reason };
  }

  function waitPlan(reason) {
    return { kind: "wait", wait: true, reason };
  }

  function gesturePlan(kind, target, meta = {}) {
    return { kind, target, halt: false, wait: false, ...meta };
  }

  function movePlanKey(rec) {
    const d = rec?.detail || {};
    const moves = Array.isArray(d.moves)
      ? d.moves.map((m) => `${m.id}:${m.from}->${m.to}`).join(",")
      : "";
    return `${rec?.player?.key || rec?.player?.selectionId || rec?.player?.n || ""}|${rec?.position || ""}|${moves}`;
  }

  // @ref LLP 0008#position-fluid-policy-interaction — automate only DOM-verified reachable
  // prerequisite moves; uncertain movement stays manual.
  function planPrerequisiteMove(b, rec, sub) {
    const d = rec?.detail || {};
    const moves = Array.isArray(d.moves) ? d.moves : [];
    if (moves.length === 0) {
      if (d.moveStatus === "manual") return haltPlan("Position-fluid plan is manual — manual placement required.");
      return null;
    }
    if (d.moveStatus === "manual" || d.moveStatus === "unknown") {
      return haltPlan(`Position-fluid plan is ${d.moveStatus} — manual placement required.`);
    }
    if (d.moveStatus !== "reachable") {
      return haltPlan("Prerequisite moves are not verified reachable.");
    }

    const key = movePlanKey(rec);
    if (sub && sub.planKey !== key) {
      sub.planKey = key;
      sub.moveIndex = 0;
    }

    const moveIdx = sub.moveIndex || 0;
    if (moveIdx >= moves.length) return null;

    const move = moves[moveIdx];
    const fromSlot = b.slots?.[move.from];
    const toSlot = b.slots?.[move.to];
    const source = fromSlot?.dragEl || fromSlot?.dropEl || fromSlot?.el;
    const target = toSlot?.dropEl || toSlot?.el;
    if (!source) return haltPlan(`Cannot find source slot ${move.from}.`);
    if (!target) return haltPlan(`Cannot find target slot ${move.to}.`);

    return gesturePlan("move", { source, target }, {
      move, moveIndex: moveIdx, position: move.to,
      reason: `Move existing player: ${move.from} -> ${move.to}`,
      completesMove: true,
    });
  }

  // @ref LLP 0008#what-auto-does-the-action-vocabulary
  function planGesture(ctx) {
    const { level, board: b, rec, sub = {} } = ctx;
    if (!level || level === LEVEL.MANUAL) return waitPlan("Lazy Mode manual");

    if (b.phase === "complete") {
      const c = b.complete || {};
      if (c.is820) return haltPlan("82-0 — perfect season.");
      if (!canLoopAfterFinish(level)) {
        return haltPlan("Game finished below 82-0 — your turn (Assist).");
      }
      const btn = b.newGameBtn;
      if (!btn) return haltPlan("Play Again button not found.");
      return gesturePlan("newGame", btn, { reason: "Start a new game after sub-82-0 finish." });
    }

    if (b.phase === "mode") {
      const btn = b.classicBtn;
      if (!btn || btn.disabled) return waitPlan("Waiting for Play Classic button.");
      return gesturePlan("classicMode", btn, { reason: "Start Classic mode." });
    }

    if (b.phase === "spinning") {
      if (!b.spinEnabled) return waitPlan("Waiting for Spin button to enable.");
      const btn = b.spinBtn;
      if (!btn) return haltPlan("Spin button not found.");
      return gesturePlan("spin", btn, { reason: "Spin the wheel." });
    }

    if (!["selecting", "placing"].includes(b.phase) || !rec) return waitPlan("No actionable recommendation.");

    if (rec.action === "RESTART") {
      if (!canRestartRun(level)) return haltPlan(rec.reason || "Policy recommends restart.");
      const btn = b.newGameBtn;
      if (!btn) {
        return gesturePlan("reload", null, {
          reason: rec.reason || "Restart weak run.",
          startsNewGame: true,
        });
      }
      return gesturePlan("newGame", btn, { reason: rec.reason || "Restart weak run." });
    }

    if (rec.action === "TEAM_SKIP") {
      const btn = b.teamSkipBtn;
      if (!btn || !b.teamSkipAvail) return haltPlan("Team skip unavailable.");
      return gesturePlan("teamSkip", btn, { reason: rec.reason });
    }

    if (rec.action === "ERA_SKIP") {
      const btn = b.eraSkipBtn;
      if (!btn || !b.eraSkipAvail) return haltPlan("Era skip unavailable.");
      return gesturePlan("eraSkip", btn, { reason: rec.reason });
    }

    if (rec.action === "TAKE") {
      const movePlan = planPrerequisiteMove(b, rec, sub);
      if (movePlan) return movePlan;

      const player = rec.player;
      const position = rec.position;
      if (!player || !position) return haltPlan("TAKE missing player or position.");

      const placing = b.placingName;
      if (b.phase === "placing" || placing) {
        if (placing && !namesMatch(placing, player.n)) {
          return haltPlan(`Unexpected placing state (${placing}); expected ${player.n}.`);
        }
        const slot = b.slots?.[position]?.el || b.slots?.[position]?.clickEl || b.slots?.[position]?.dropEl || null;
        if (!slot) return haltPlan(`Court slot ${position} not found.`);
        return gesturePlan("slot", slot, { position, player, reason: `Place ${player.n} at ${position}.` });
      }

      if (!player.el || (typeof document !== "undefined" && !document.contains(player.el))) {
        return haltPlan("Recommended player card is no longer in the DOM.");
      }
      return gesturePlan("card", player.el, { position, player, reason: `Select ${player.n}.` });
    }

    return haltPlan(`Unknown action: ${rec.action}`);
  }

  // @ref LLP 0008#safety-model — synthetic clicks are not trusted; pacing uses human-scale delay.
  function clickElement(el) {
    if (!el || typeof el.dispatchEvent !== "function") return false;
    const opts = { bubbles: true, cancelable: true, view: globalThis };
    const MouseCtor = typeof MouseEvent === "function" ? MouseEvent : Event;
    const PointerCtor = typeof PointerEvent === "function" ? PointerEvent : MouseCtor;
    const down = (type, Ctor = MouseCtor) => el.dispatchEvent(new Ctor(type, opts));
    down("pointerdown", PointerCtor);
    down("mousedown");
    down("pointerup", PointerCtor);
    down("mouseup");
    if (typeof el.click === "function") el.click();
    else down("click");
    return true;
  }

  function makeDataTransfer() {
    if (typeof DataTransfer === "function") return new DataTransfer();
    const data = {};
    return {
      dropEffect: "move",
      effectAllowed: "all",
      files: [],
      items: [],
      types: [],
      clearData(type) {
        if (type) delete data[type];
        else for (const k of Object.keys(data)) delete data[k];
        this.types = Object.keys(data);
      },
      getData(type) { return data[type] || ""; },
      setData(type, value) {
        data[type] = String(value);
        this.types = Object.keys(data);
      },
    };
  }

  function dispatchDrag(el, type, dataTransfer) {
    if (!el || typeof el.dispatchEvent !== "function") return false;
    let ev;
    const opts = { bubbles: true, cancelable: true, view: globalThis, dataTransfer };
    if (typeof DragEvent === "function") {
      ev = new DragEvent(type, opts);
    } else {
      ev = new Event(type, opts);
      Object.defineProperty(ev, "dataTransfer", { value: dataTransfer });
    }
    return el.dispatchEvent(ev);
  }

  // @ref LLP 0008#position-fluid-policy-interaction — existing-player moves use the live
  // court's drag/drop handlers instead of changing private game state.
  function dragElement(source, target) {
    if (!source || !target) return false;
    const dataTransfer = makeDataTransfer();
    dispatchDrag(source, "dragstart", dataTransfer);
    setTimeout(() => {
      dispatchDrag(target, "dragenter", dataTransfer);
      dispatchDrag(target, "dragover", dataTransfer);
      dispatchDrag(target, "drop", dataTransfer);
      dispatchDrag(source, "dragend", dataTransfer);
    }, 50);
    return true;
  }

  // @ref LLP 0008#mid-game-restart-via-browser-reload — the live game has no mid-run
  // restart control, so RESTART falls back to the same manual browser reload a player uses.
  function reloadPage() {
    if (!globalThis.location || typeof globalThis.location.reload !== "function") return false;
    globalThis.location.reload();
    return true;
  }

  function executeGesture(plan) {
    if (!plan || plan.halt || plan.wait) return false;
    if (plan.kind === "reload") return reloadPage();
    if (plan.kind === "move") return dragElement(plan.target?.source, plan.target?.target);
    if (!plan.target) return false;
    return clickElement(plan.target);
  }

  function paceDelayMs(cfg = DEFAULTS) {
    const min = cfg.PACE_MIN_MS ?? DEFAULTS.PACE_MIN_MS;
    const max = cfg.PACE_MAX_MS ?? DEFAULTS.PACE_MAX_MS;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function boardFingerprint(b) {
    if (!b) return "";
    const poolKeys = (b.pool || []).map((p) => p.key).join(",");
    const slotOcc = b.slots
      ? Object.entries(b.slots).map(([k, v]) => `${k}:${v.occupant?.key || "-"}:${v.text || ""}`).join(",")
      : "";
    return [
      b.phase, b.round, poolKeys, b.placingName || "", b.teamSkipAvail, b.eraSkipAvail,
      b.spinEnabled, b.complete?.text || "", slotOcc,
    ].join("|");
  }

  function createAutopilot(opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    let onHalt = opts.onHalt || (() => {});
    let onWin = opts.onWin || (() => {});
    let onBeforeReload = opts.onBeforeReload || (() => {});

    const ap = {
      level: LEVEL.MANUAL,
      busy: false,
      busySince: 0,
      haltReason: null,
      sub: { moveIndex: 0 },
      stats: freshStats(),
      lastFingerprint: null,
      noProgressTicks: 0,
      dryRun: !!opts.dryRun,
      get enabled() { return ap.level !== LEVEL.MANUAL && !ap.haltReason; },
      setHandlers(handlers = {}) {
        if (handlers.onHalt) onHalt = handlers.onHalt;
        if (handlers.onWin) onWin = handlers.onWin;
        if (handlers.onBeforeReload) onBeforeReload = handlers.onBeforeReload;
      },
      setLevel(level) {
        ap.level = level;
        if (level === LEVEL.MANUAL) {
          ap.busy = false;
          ap.haltReason = null;
          ap.sub = { moveIndex: 0 };
        } else {
          ap.haltReason = null;
        }
      },
      halt(reason) {
        ap.haltReason = reason;
        ap.busy = false;
        onHalt(reason);
      },
      snapshot(extra = {}) {
        return {
          version: 1,
          level: ap.level,
          sub: { ...ap.sub },
          stats: { ...ap.stats },
          ...extra,
        };
      },
      restoreSnapshot(snapshot) {
        if (!snapshot || !Object.values(LEVEL).includes(snapshot.level)) return false;
        if (snapshot.level === LEVEL.MANUAL) return false;
        ap.level = snapshot.level;
        ap.busy = false;
        ap.busySince = 0;
        ap.haltReason = null;
        ap.sub = { moveIndex: 0, ...(snapshot.sub || {}) };
        ap.stats = { ...freshStats(), ...(snapshot.stats || {}) };
        return true;
      },
      noteTrustedInput() {
        if (ap.level !== LEVEL.MANUAL) ap.halt("Paused — you took control.");
      },
      observeBoard(b) {
        const fp = boardFingerprint(b);
        if (ap.lastFingerprint != null && fp !== ap.lastFingerprint) {
          ap.noProgressTicks = 0;
          if (ap.busy) ap.busy = false;
        } else if (ap.enabled && !ap.busy) {
          ap.noProgressTicks += 1;
        }
        ap.lastFingerprint = fp;
      },
      checkSafety(b) {
        if (ap.level === LEVEL.MANUAL) return null;
        const now = Date.now();
        if (now - ap.stats.gestureWindowStart > 60_000) {
          ap.stats.gestureWindowStart = now;
          ap.stats.gestureWindowCount = 0;
        }
        if (ap.stats.gestureWindowCount >= cfg.GESTURES_PER_MIN) {
          return `Gesture cap (${cfg.GESTURES_PER_MIN}/min) reached.`;
        }
        if (ap.noProgressTicks >= cfg.NO_PROGRESS_TICKS) {
          return `No board progress for ${cfg.NO_PROGRESS_TICKS} ticks.`;
        }
        if (ap.stats.games >= cfg.MAX_GAMES) {
          return `Max games (${cfg.MAX_GAMES}) reached.`;
        }
        if (ap.stats.spins >= cfg.MAX_SPINS) {
          return `Max spins (${cfg.MAX_SPINS}) reached.`;
        }
        return null;
      },
      checkWatchdog() {
        if (!ap.busy || !ap.busySince) return;
        if (Date.now() - ap.busySince > cfg.WATCHDOG_MS) {
          ap.halt(`Timed out waiting for UI (${cfg.WATCHDOG_MS}ms).`);
        }
      },
      step(b, rec) {
        if (ap.level === LEVEL.MANUAL) return;
        ap.observeBoard(b);
        ap.checkWatchdog();

        if (b.phase === "complete" && b.complete?.is820) {
          ap.setLevel(LEVEL.MANUAL);
          onWin(b.complete);
          return;
        }

        if (ap.haltReason) return;
        if (ap.busy) return;

        const safety = ap.checkSafety(b);
        if (safety) { ap.halt(safety); return; }

        const plan = planGesture({ level: ap.level, board: b, rec, sub: ap.sub });
        if (plan.halt) { ap.halt(plan.reason); return; }
        if (plan.wait) return;

        const delay = paceDelayMs(cfg);
        const plannedLevel = ap.level;
        ap.busy = true;
        ap.busySince = Date.now();

        const run = () => {
          if (ap.level !== plannedLevel || ap.haltReason) {
            ap.busy = false;
            return;
          }
          ap.stats.gestures += 1;
          ap.stats.gestureWindowCount += 1;
          if (plan.kind === "spin") ap.stats.spins += 1;
          if (plan.kind === "newGame" || plan.kind === "reload" || plan.startsNewGame) {
            ap.stats.games += 1;
          }
          if (plan.kind === "reload") {
            onBeforeReload(ap.snapshot({ reloadReason: plan.reason || "" }));
          }
          if (ap.dryRun) {
            console.log("[82-0 Coach autopilot]", plan.kind, plan.reason || "", plan.target);
          } else {
            executeGesture(plan);
          }
          if (plan.completesMove && plan.moveIndex != null) {
            ap.sub.moveIndex = plan.moveIndex + 1;
          }
        };

        setTimeout(run, delay);
      },
    };
    return ap;
  }

  C820.actuator = {
    LEVEL,
    DEFAULTS,
    planGesture,
    executeGesture,
    clickElement,
    dragElement,
    reloadPage,
    paceDelayMs,
    boardFingerprint,
    createAutopilot,
  };
})();
