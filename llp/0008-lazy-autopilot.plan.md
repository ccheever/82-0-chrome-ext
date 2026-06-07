# LLP 0008: Lazy Mode (Autopilot)

**Type:** Plan
**Status:** Active
**Systems:** Autopilot, Content, UI, Strategy
**Role:** Decision + plan for the auto-play layer
**Author:** Charlie Cheever / Claude
**Date:** 2026-06-06
**Revised:** 2026-06-07
**Related:** [LLP 0000](./0000-82-0-chrome-ext.explainer.md), [LLP 0001](./0001-82-0-team-strategy.spec.md), [LLP 0002](./0002-extension-product.spec.md) (the advisory product this extends), [LLP 0003](./0003-how-to-go-82-0.guide.md), [LLP 0007](./0007-position-fluid-strategy.plan.md)

## Summary

**Lazy Mode** is an opt-in autopilot for 82-0 Coach. With it on, the extension stops
*advising* and starts *acting*: it clicks Spin, takes the recommended player, places them
into the recommended court slot, and spends Team/Era skips — all by driving the live
`82-0.com` UI exactly the way a human hand would. When a position-fluid recommendation
requires repositioning already-placed players, Lazy Mode automates only the ordered,
reachable move plan whose source and target court slots are visible in the DOM; otherwise
it stops and hands control back. See
[Position-fluid policy interaction](#position-fluid-policy-interaction).

It comes in **two levels**. Both can automate the policy's in-progress `RESTART`
recommendation, because the live site has no first-class mid-game restart control and the
manual human equivalent is a browser reload. The line between the levels is whether Lazy
Mode may keep looping after a finished, sub-82-0 game:

- **Assist** — plays the current run for you (spin, take, place, skip) and reloads weak
  runs when the policy says `RESTART`, but **hands control back when a completed game
  falls short of 82-0**.
- **Auto** — does all of that *and* starts the next game after a sub-82-0 finish, looping
  game after game until it lands a literal **82-0**, then stops. The true walk-away grind.

See [Two levels: Assist and Auto](#two-levels-assist-and-auto).

It makes **no strategic decisions**. The board reader
([LLP 0002 → DOM Contract](./0002-extension-product.spec.md#dom-contract)) and the active
policy remain the decision source: Policy V1
([LLP 0001 → Policy V1](./0001-82-0-team-strategy.spec.md#policy-v1)) by default, and any
future/flagged position-fluid policy only under the constraints in
[LLP 0007](./0007-position-fluid-strategy.plan.md). Lazy Mode is a thin **actuator**
bolted onto the existing `read → enrich → track → recommend → render` tick loop: after the
overlay renders the recommendation, the actuator performs *the same action the overlay is
already showing*.

The core decision recorded here: **autopilot clicks the DOM; it does not patch the
game's React state, and it does not bypass the spinner timers.** The one non-DOM gesture
is the mid-game restart fallback: browser reload, which is the same manual action a player
uses when the game offers no in-page restart button. It is a tireless hand, not a cheat.
See [Click the DOM, not the React state](#click-the-dom-not-the-react-state) and
[Mid-game restart via browser reload](#mid-game-restart-via-browser-reload).

This crosses a line that [LLP 0002](./0002-extension-product.spec.md#non-goals) drew for
the *first* release ("Autopilot clicking" was a non-goal there). That non-goal stands for
the advisory product; Lazy Mode is the deliberate, separately-gated next release that
supersedes it, with its own safety model.

## Motivation — why "lazy"

Going 82-0 is mostly waiting and re-rolling, not deciding. The Policy V1 simulator
([LLP 0001 → Simulating Policy V1](./0001-82-0-team-strategy.spec.md#simulating-policy-v1))
measures the grind directly:

| Metric (200k games, tuned constants) | Value |
|---|---:|
| Games restarted at pick 1 (no anchor) | **~78%** |
| Expected **games** to a first 82-0 | ~90 |
| Expected **spins** to a first 82-0 | **~195** |

The decisions are already solved by the policy; what's left for the human is ~195
near-mechanical spins and clicks per 82-0, the overwhelming majority of which are
"this pool is weak — spin again." That's a chore a machine should do. Lazy Mode lets the
user flip a switch, watch the coach play its own strategy, and walk away until the panel
says **82-0**.

Because each game is i.i.d. and restarts are cheap (one spin), the *right* play is to
restart aggressively — which is exactly the play a human finds most tedious and a loop
finds trivial. The policy and the autopilot are a natural fit.

## Click the DOM, not the React state

There are two ways to automate this game from inside a content script. This is the
decision [LLP 0000](./0000-82-0-chrome-ext.explainer.md#key-decisions) flagged as open
("Autopilot and whether it clicks DOM controls or hooks app state").

### Option A — drive the UI (CHOSEN)

Find the same controls a player uses (Spin button, player cards, court slots, Team/Era
buttons, Play Again) and dispatch real input events at them. The app's own handlers run;
the app's own state transitions happen; the app's own timers are respected. When the
policy recommends abandoning a weak in-progress run and the live game exposes no restart
control, use browser reload as the manual-equivalent fallback; do not reach into React
state to simulate a reset.

### Option B — patch React state (REJECTED for autopilot)

Walk the React fiber tree, find the game's `useState` hooks, and `dispatch()` new values
directly. This repo already contains a working proof of exactly this:
[`snippets/set-worst-82-0-team-console.js`](../snippets/set-worst-82-0-team-console.js)
locates the fiber, anchors on the skip-state hook, and writes an entire finished roster
in one shot via positional indexing (`setHook(skipIndex - 8 … skipIndex + 2, …)`).

**Lazy Mode chooses Option A.** Rationale:

- **It's a hand, not a cheat.** Option A can only do what the player could do, at human
  speed, through the real controls. Option B instantly materializes a finished 82-0 team
  and sets `isSpinning = false` — it bypasses the spinner timers and fabricates state.
  That's the line between "play the game fast for me" and "fake a result," and we stay on
  the playing side. Timer-bypass and state-patching remain **non-goals** (they already
  were in [LLP 0002 → Non-Goals](./0002-extension-product.spec.md#non-goals)).
- **Robustness.** Option B is extraordinarily brittle: the snippet identifies game state
  by the *ordinal position* of hooks relative to the skip hook (`skipIndex - 9` is phase,
  `- 8` is current team, …). Any change to the app's hook order — adding a `useState`,
  reordering, a React upgrade — silently corrupts a different slice of state. The DOM
  contract is brittle too, but it leans on visible text/structure
  ([LLP 0002 → DOM Contract](./0002-extension-product.spec.md#dom-contract)), which
  changes less often and fails *loudly* (the reader returns an empty pool) instead of
  writing garbage into the live store.
- **No desync.** Writing hooks out of band can leave the rendered tree and the store
  disagreeing. Clicking goes through the app's reducers, so the app stays internally
  consistent.
- **Same permission surface.** Both run in a content script with DOM access, so neither
  needs new manifest permissions — but Option A needs no main-world bridge and no
  reverse-engineered private state, keeping the Chrome Web Store review story clean
  (see [Manifest and permissions](#manifest-and-permissions)).
- **Transparency.** Option A is observable and interruptible: the user sees each click
  land and can take over mid-step. Option B is invisible.

The fiber-hooking snippet stays in `snippets/` as a **research/demo artifact** (it shows
the floor team from [LLP 0005](./0005-scoring-system-edges.research.md) instantly). It is
explicitly *not* the autopilot mechanism and must not be imported by the extension.

### Mid-game restart via browser reload

Live verification found no first-class restart/new-game control during an in-progress
run. A human who wants to abandon a weak round must reload the page and start from the
fresh initial state. Lazy Mode therefore treats policy `RESTART` as:

1. Prefer an in-page restart/new-game control if the site adds one later.
2. Otherwise call `location.reload()` and let the game boot normally.

This fallback is still **not** React state patching: it does not fabricate a roster, skip
animation timers, or mutate private hooks. It does destroy and recreate the content
script, so the extension writes a **one-shot, tab-scoped `sessionStorage` resume token**
immediately before the actuator-triggered reload and consumes it on the next load. The
token is short-lived, cleared on halt/manual control, and exists only to continue an
explicitly selected Lazy level across the restart gesture. It is not a persisted
preference and does not require `chrome.storage`.

## What "auto" does: the action vocabulary

The policy emits four core actions, and the board contributes the non-policy phases
(`mode`, `spinning`, and `complete`). Lazy Mode maps each to UI gestures. This is the
actuator's entire contract.

| Phase / policy action | UI gesture the actuator performs |
|---|---|
| `spinning` (no pool yet) | Click **Spin** once the button is present and enabled; otherwise wait. |
| `mode` (fresh page after restart) | Click **Play Classic** once the mode picker is present and enabled. |
| `TAKE` (player + position) | Click the recommended **player card** (`rec.player.el`), wait for the live "Placing: {Name} — click a court position" state, then click the **court slot** for `rec.position`. |
| `TAKE` with position-fluid metadata | If `rec.detail.moves[]` is non-empty and `moveStatus === "reachable"`, first perform each verified existing-player move in order, one gesture per tick; then click the player card and target slot. If `moves[]` is empty, use the normal card-then-slot path unless `moveStatus === "manual"`. Non-empty `manual` / `unknown` move plans halt. |
| `TEAM_SKIP` | Click the **Team** button (`board.read().teamSkipBtn`). |
| `ERA_SKIP` | Click the **Era** button (`board.read().eraSkipBtn`). |
| `RESTART` | **Assist + Auto:** start a new game; prefer a restart/new-game button, otherwise browser-reload with a one-shot resume token. |
| `complete`, is 82-0 | **Both levels stop.** Surface the win. |
| `complete`, not 82-0 | **Auto:** click **Play Again** to re-anchor (the common case — most games restart). **Assist:** halt and hand back. |

For selection-phase decisions, the actuator never *chooses* — it reads `rec.action`
straight off the recommendation the overlay just rendered, so what the panel says and what
the autopilot does can never diverge. ([Architecture](#architecture) explains how the same
`rec` reaches both.) The level changes only whether the autopilot is allowed to cross a
finished sub-82-0 screen into the next game; see
[Two levels](#two-levels-assist-and-auto).

## Position-fluid policy interaction

[LLP 0007](./0007-position-fluid-strategy.plan.md) introduces a future Policy V2a where
selected players may be reassigned between eligible slots. The policy module keeps V2a
behind a disabled-by-default flag (`src/lib/assign.js`,
`policy.CONST.positionFluid`,
`rec.detail.nextAssignment`, `rec.detail.moves`, `rec.detail.moveStatus`), while
`content.js` explicitly opts the live coach into position-fluid recommendations once it can
track selected players plus their assignment map. Lazy Mode composes with that split
carefully.

Rules:

- **V1 / no-move TAKE stays simple.** If position-fluid metadata is absent, TAKE is the
  simple card-then-slot gesture from the action table. If position-fluid metadata is
  present but `moves[]` is empty, placement is still automatic unless the policy marks the
  plan `"manual"`. This covers the first-pick / no-current-assignment case where
  `moveStatus` can be `"unknown"` but no existing player needs to move.
- **Move automation is allowed only for verified plans.** If `rec.detail.moves` is present,
  automate it only when `rec.detail.moveStatus === "reachable"`, the board can identify the
  current occupant and target slot for every move, and the verified live movement model from
  LLP 0007 says the gesture sequence is valid. In the June 2026 live desktop app, occupied
  court-slot moves are HTML5 drag/drop gestures from the source slot container onto the
  target slot container. Otherwise halt in advisory mode and show the move list for the
  human.
- **Do not infer reassignment from the old V1 tracker.** The `_position` tracker from
  [LLP 0002 → State Tracking](./0002-extension-product.spec.md#state-tracking) remains a
  best-effort fallback for the V1 path. For position-fluid mode, `content.js` now carries
  LLP 0007's selected-player identities plus an `assignment` map, and treats
  `rec.detail.nextAssignment` as the source of truth after a successful placement.
- **Moves are actuator steps, not policy decisions.** The policy chooses the candidate,
  target slot, and ordered move plan. The actuator may only realize that plan, one DOM
  gesture at a time, with the same re-entry, pacing, stall, and kill-switch rules as Spin or
  TAKE.

Those conditions are currently met only for reachable, empty-only move plans. `manual`,
`unknown`, stale, or unresolvable prerequisite moves are still manual handoff in both
Assist and Auto. Auto may continue only after the user explicitly resumes it from the new
board state.

## Two levels: Assist and Auto

Both levels share one actuator and one decision source. They differ by a single rule:
**may the autopilot continue after a completed game falls short of 82-0?**

| | **Assist** | **Auto** |
|---|---|---|
| Spin, take, place, skip within a game | ✅ auto | ✅ auto |
| Mid-game `RESTART` (abandon a weak run) | ✅ auto, browser reload if needed | ✅ auto, browser reload if needed |
| Sub-82-0 finish → Play Again | ⛔ halt, hand back | ✅ auto |
| 82-0 finish | 🎉 stop | 🎉 stop |
| Walk away and come back to an 82-0? | Usually no — you'll be needed after a short completed game | Yes |

The dividing gesture is the **post-game Play Again** / next-game transition. A mid-game
`RESTART` is different: it is a policy decision to abandon a weak run before locking in
more picks, and the live site currently implements the human version of that choice as a
browser reload rather than a game button. Assist is allowed to perform that reload, but it
still stops at a completed sub-82-0 result.

**An honest note on Assist.** Because ~78% of games restart at pick 1
([Motivation](#motivation--why-lazy)), Assist may reload many times before it finds a
promising anchor. Assist is therefore best understood as "**play until this game needs a
human end-of-game decision**": it handles the cheap early re-roll grind, but if the run
plays out and misses 82-0, it hands control back instead of looping forever. **Auto** is the
mode for someone who genuinely wants to walk away; it's the one that cashes in the full
~195-spins-for-free payoff.

This is why Assist is the safer default and ships first ([Milestones](#milestones)): an
autopilot that stops at finished short games has a natural boundary. Because Assist can
still reload weak in-progress runs, the gesture caps and max-games/max-spins budget apply
to both active levels, with Auto carrying the larger unattended-loop risk in the
[safety model](#safety-model).

## DOM action targets

This extends [LLP 0002 → DOM Contract](./0002-extension-product.spec.md#dom-contract)
with the **action** targets (the reader so far only needed to *parse*). When the live site
changes, update `src/lib/board.js`, `src/lib/actuator.js`, and both DOM-contract sections
together. The targets below were checked against the live June-2026 app bundle and are the
current actuator contract:

- **Player card** — already located: `[draggable="true"]`, exposed as `card.el`. Clicking
  it begins placement; the reader then sees copy such as
  **"Placing: {Name} — click a court position"**. Placement is therefore **card click,
  then slot click**, not card drag.
- **Court slots** — the five placement targets for `PG/SG/SF/PF/C`. On desktop, each slot
  has an outer court container and an inner position button; placement clicks must target
  the inner button. The board reader exposes `slotParts` through `b.slots[position]` as
  `clickEl` / `el` for placement, `dragEl` for a current occupant, and `dropEl` for
  existing-player moves. Mobile bottom-sheet position buttons are also found through the
  same label-based lookup. The player-pool position filters use the same text labels
  (`PG/SG/SF/PF/C`), so slot lookup must prefer large court/bottom-sheet controls and
  exclude small sibling filter buttons.
- **Existing-player moves** — live desktop court movement is HTML5 drag/drop: dispatch
  `dragstart` on the source slot/occupant, then `dragenter` / `dragover` / `drop` on the
  target slot, followed by `dragend`. The actuator uses this only for
  `moveStatus === "reachable"` plans.
- **Mode picker / Play Classic** — after a browser-reload restart, the fresh page can show
  a mode picker before any pool exists. `board.read()` reports `phase: "mode"` when it sees
  **Play Classic**, and Assist/Auto click that button before waiting for Spin.
- **Spin button** — the control that starts a round's spin. Present during the `spinning`
  phase; disabled during the animation. The actuator waits for *enabled* and never forces
  it.
- **Skip buttons** — already located: `skipButton("Team")` / `skipButton("Era")`, surfaced
  as `teamSkipBtn` / `eraSkipBtn` with availability flags. Reused as-is.
- **Play Again** — the completed-screen "Play Again" button, already a substring the
  completion detector keys on. Used by Auto after a completed sub-82-0 game.
- **Mid-game restart** *(verified absent on 2026-06-07)* — no in-progress
  restart/new-game control is visible in the live game. For policy `RESTART`, the actuator
  prefers a restart/new-game button if one appears in a future site revision, but otherwise
  uses [browser reload](#mid-game-restart-via-browser-reload).

To keep the brittle bits in one place, action-target lookups live in the board module
(or a sibling) and are referenced from the actuator, mirroring how the reader is
structured today.

## Architecture

Lazy Mode adds one new module and a small controller; it does not touch the engine,
scoring, or policy decision rules.

| File | Role | Status |
|---|---|---|
| `src/lib/actuator.js` | Maps a policy action → a UI gesture; the only code that clicks or browser-reloads. | **new** |
| `src/content.js` | Gains the autopilot controller, the Off/Assist/Auto control, and the kill-switch wiring. | extend |
| `src/overlay.css` | Lazy Mode control + active-level badge styling. | extend |
| `src/lib/board.js` | Gains action-target lookups (slots, spin, new-game). | extend |
| `src/lib/policy.js`, `src/lib/assign.js` | Decision source; no autopilot-specific code. Position-fluid move metadata is consumed only under [Position-fluid policy interaction](#position-fluid-policy-interaction). | unchanged |
| `src/lib/engine.js` | **Unchanged.** | — |

Everything stays in the shared isolated-world `globalThis.C820` namespace, consistent with
[LLP 0002 → Architecture](./0002-extension-product.spec.md#architecture). New surface:
`C820.actuator` and `C820.autopilot`.

The reload fallback adds a tiny content-script persistence surface: before an
actuator-triggered browser reload, `content.js` writes the active level, counters, and
sub-step state to a short-lived `sessionStorage` token, then consumes and clears it after
the fresh load. This keeps `chrome.storage` out of scope while preserving safety budgets
across reloads.

### Integration with the existing tick loop

The current loop is `tick(): read → track → render`
(`src/content.js`). Lazy Mode appends one conditional step:

```text
tick():
  b   = board.read()
  track(b)
  rec = render(b)          # selecting phase: returns the recommendation it just drew
  if autopilot.enabled and not autopilot.busy:
    autopilot.step(b, rec) # perform one phase/rec gesture, then return
```

`render()` already computes `rec` and assigns `state.lastTakeRec` on a TAKE; it is
refactored to **return** that `rec` for selection screens so the controller acts on the
identical object. For `spinning` and `complete`, there is no policy recommendation; the
controller acts from `b.phase` and the level gate in this LLP. In the V1 path this
preserves lineup tracking for free: the existing round-advance detector
([LLP 0002 → State Tracking](./0002-extension-product.spec.md#state-tracking)) still
commits `lastTakeRec` when the round advances, whether the click came from a human or the
actuator. In the position-fluid path, the state model must be upgraded per
[Position-fluid policy interaction](#position-fluid-policy-interaction): `content.js`
tracks stable selected-player identities plus the policy's assignment map so the next tick
can distinguish an open slot from a player who should be moved.

### The step state machine

`autopilot.step()` performs **one** gesture per invocation, then yields. It must:

- **Guard against re-entry.** Set `busy = true` with a timestamp before acting; clear it
  only after the board has *changed* (next tick observing a new phase/round/pool) or a
  watchdog timeout fires. Never issue a second click while one is in flight — double-takes
  and double-spins are the main failure mode.
- **Act on fresh state.** Each step re-reads via the tick's `b`; it never replays a stale
  `rec` after the DOM has moved on.
- **Validate the target immediately before the gesture.** Resolve the card/button/slot from
  the current DOM at action time, confirm it still matches the current board and
  recommendation, and halt if it does not. Stored element references are hints, not
  authority.
- **Pace deliberately.** Insert a small, human-scale delay (≈300–700 ms) between gestures
  so the run is watchable and interruptible, and so it never outruns the app's own
  transitions. This is a feature, not a limitation: Lazy Mode is "play it for me," not
  "play it impossibly fast."
- **Detect stalls.** If an expected transition doesn't happen within a watchdog window
  (e.g., clicked Spin but still `spinning` N ticks later, or clicked a card but no
  "Placing" hint), **halt**, drop back to advisory, and show why. Do not retry blindly.

## Safety model

Autopilot acts on a live third-party site on the user's behalf. The safety model is
load-bearing, not decorative.

- **Default OFF, per session.** Lazy Mode starts at **Off** on a normal page load; the user
  explicitly selects **Assist** or **Auto**. The only exception is an actuator-triggered
  browser reload for mid-game `RESTART`, which writes a short-lived one-shot resume token
  so the explicit Lazy selection can survive that single restart gesture. No durable
  preference is persisted in this release (persisting the setting would need
  `chrome.storage` — deferred to a storage LLP; see [Manifest](#manifest-and-permissions)).
- **A three-state control** in the overlay header — **Off / Assist / Auto** — with an
  unmissable badge naming the active level (e.g. **"AUTO ▸ playing until 82-0"** vs
  **"ASSIST ▸ reloading weak runs"**) whenever it's active. The user must always know *which*
  level is clicking for them, because the two behave very differently when a game ends.
- **Kill switch, many ways.** Set it to Off; press **Esc**; or simply *click anything
  yourself* — a detected trusted human interaction pauses autopilot immediately. Use
  `event.isTrusted` (and ignore the actuator's own synthetic events) so Lazy Mode does not
  pause itself after every click. Resuming is another explicit opt-in. The human always wins
  a race with the machine.
- **Runaway caps (Auto especially).** A high ceiling on gestures-per-minute
  (`180/min` as of 2026-06-07) and a halt after K consecutive no-progress ticks. The
  ceiling is deliberately above normal Assist throughput because one weak-run cycle can
  legitimately include reload, Play Classic, Spin, card select, and slot placement. The
  no-progress watchdog is the primary stuck-page protection. Because Assist can now reload
  weak runs, both active levels carry **max-games / max-spins budgets** after which they
  halt and report. **Auto** still has the heavier risk because it also loops through
  completed short games until 82-0.
- **Stop on anomaly.** Unexpected DOM (an unrecognized modal, a missing slot, a stall) →
  halt + advisory + reason. Fail safe and visible, never thrash.
- **Stop on uncertain movement.** A TAKE with a non-empty move plan whose
  `moveStatus` is `"manual"` / `"unknown"`, a stale assignment, an occupied target slot
  that was expected to be empty, or a missing current occupant target is an anomaly for
  automation even if it is still a valid advisory recommendation. An empty move list with
  `moveStatus: "unknown"` is allowed, because no existing player movement is being
  attempted.
- **Stop on success — both levels.** On a `complete` + 82-0 screen, switch off and
  celebrate rather than starting another game. (A "keep farming multiple 82-0s" variant of
  Auto is easy but wants a persisted preference, hence the storage LLP.)
- **Never bypass timers or patch state.** Restated from the decision above because it is a
  safety property, not just a design taste: the actuator touches enabled, user-facing
  controls, with browser reload as the documented fallback only when the site provides no
  in-game restart control.

## Respecting the site / fair play

Lazy Mode automates *the player's own legitimate inputs* at human pace. It clicks live
controls where they exist and uses browser reload only for the missing mid-game restart
control. It does not bypass spinner timers, does not fabricate or inject game state, makes
no network calls, and does not touch any score-submission or leaderboard path. It is a
personal-use convenience for a single-player roster game. The timer-respecting,
state-respecting posture is what keeps "lazy mode" on the right side of the line the
project already drew in [LLP 0002](./0002-extension-product.spec.md#non-goals); if
82-0.com's terms or UX signal that automated play is unwelcome, that's a product decision
to revisit here, and the default-off gating means nothing automates without an explicit
user choice.

## Manifest and permissions

**No new permissions are required.** Content scripts already run in the page with full
DOM access; calling `.click()` / dispatching pointer+mouse events and listening for
`keydown`/user interaction need nothing beyond what
[LLP 0002 → Manifest And Permissions](./0002-extension-product.spec.md#manifest-and-permissions)
already grants (the `82-0.com` content-script match). No `scripting`, no `tabs`, no
background worker, and crucially **no main-world bridge** (which the React-fiber approach
would have pushed toward). This keeps the least-privilege story from LLP 0002 intact.

The one thing that *would* widen the surface is **durably persisting the chosen level / run
stats**, which needs `chrome.storage`. That is deliberately out of scope here and gated
behind its own LLP (the storage-schema decision LLP 0000 lists as not-yet-written). The
mid-game restart fallback uses `sessionStorage` instead: tab-scoped, same-origin,
short-lived, and consumed once after an actuator-triggered reload. Lazy Mode still forgets
on ordinary page loads, new tabs, browser restarts, and manual reloads that were not
initiated by the actuator.

**Implementation note (React + synthetic clicks):** React attaches delegated listeners at
the root, so a plain `element.click()` usually registers. If a target ignores it, dispatch
a realistic `pointerdown → mousedown → pointerup → mouseup → click` sequence; do **not**
attempt to forge `isTrusted`. Inputs (none needed yet) would require the native value
setter + `input` event — noted only so a future contributor doesn't rediscover it the hard
way.

## `@ref` targets

Code implementing this plan should point back here (per
[LLP 0000 → conventions](./0000-82-0-chrome-ext.explainer.md#conventions-adopted-here)):

- The actuator's action→gesture mapping: `// @ref LLP 0008#what-auto-does-the-action-vocabulary`
- New DOM action-target selectors (alongside the existing `0002#dom-contract` refs):
  `// @ref LLP 0008#dom-action-targets`
- The click-not-hook choice, wherever someone might be tempted to reach into fibers:
  `// @ref LLP 0008#click-the-dom-not-the-react-state`
- The Assist-vs-Auto gate on the post-game loop:
  `// @ref LLP 0008#two-levels-assist-and-auto`
- The browser-reload fallback and one-shot resume token:
  `// @ref LLP 0008#mid-game-restart-via-browser-reload`
- Position-fluid move gating:
  `// @ref LLP 0008#position-fluid-policy-interaction`
- The kill switch / pacing / caps: `// @ref LLP 0008#safety-model`
- The toggle's default-off gating: `// @ref LLP 0008#manifest-and-permissions`

## Milestones

Ship in risk order. The two levels fall out naturally: everything through milestone 4 *is*
**Assist** (it plays and reloads weak in-progress runs, but stops after completed short
games); position-fluid move automation is a guarded compatibility step, and **Auto**
follows as the post-game loop plus the heavier unattended risk it demands.

1. **Dry-run actuator — done.** `actuator.js` computes the gesture for each `rec` and can
   log it without clicking. Live target resolution fed the current DOM action contract.
2. **Control + safe gestures — done.** The Manual/Assist/Auto control, badge, kill
   switches, Spin, Team/Era skip, and pacing guards are implemented.
3. **Take + place, no prerequisite moves — done.** The live answer is card click, then
   position-button click. This covers V1 TAKE and position-fluid TAKEs whose move list is
   empty, including first-pick `moveStatus: "unknown"`.
4. **Assist complete — done.** `RESTART` uses an in-page restart/new-game control if
   present, otherwise browser reload with the one-shot resume token; Assist halts and
   hands back on sub-82-0 finishes and stops on 82-0.
5. **Position-fluid compatibility — active.** With `positionFluid` enabled, reachable
   empty-only prerequisite moves are automated with the verified drag/drop path from
   [Position-fluid policy interaction](#position-fluid-policy-interaction). `manual`,
   `unknown`, stale, or unresolvable prerequisite moves halt and hand back in both Assist
   and Auto.
6. **Auto.** Enable the post-game Play Again loop, gated behind the Auto level, with the
   gestures-per-minute ceiling and the max-games/max-spins budget from the
   [safety model](#safety-model). This is the milestone that delivers the
   ~195-spins-for-free walk-away payoff.
7. **(Deferred, separate LLP)** Persist the chosen level and run stats via
   `chrome.storage`; optional "keep farming multiple 82-0s" variant of Auto.

## Testing and verification

The brain is already covered by the simulator and tuner
([LLP 0001](./0001-82-0-team-strategy.spec.md#simulating-policy-v1)); Lazy Mode adds no
new decision logic to test. The actuator is DOM-bound and can't run under the Node
simulator, so verification is:

- **Dry-run logging** (milestone 1) as the primary automated-ish check: assert the right
  gesture is selected for representative board states, including halt cases.
- **Actuator unit tests** with fake DOM nodes for action mapping, browser-reload fallback,
  reload snapshot/restore, re-entry guards, stale target detection, trusted-event kill
  switching, and the `moveStatus` manual/unknown halt.
- **Current regression coverage (2026-06-07)** includes `phase: "mode"` → **Play Classic**,
  TAKE card-then-slot, one activation per synthetic click, browser-reload snapshot/restore,
  no-move `moveStatus: "unknown"` placement, and reachable prerequisite move planning.
- **Live bundle inspection (2026-06-07)** confirmed the `Play Classic` button text, the
  desktop inner position button used for slot placement, and the desktop drag/drop handlers
  used for existing-player court moves.
- **Manual live verification** of each gesture against `82-0.com`, ideally captured in a
  short note appended to this LLP (the way [LLP 0006](./0006-ios-safari-extension.plan.md)
  records install outcomes).
- Keep the actuator **thin and dumb** precisely so the tested policy stays the only place
  decisions live.

## Non-goals

- Bypassing the spinner timers or patching React/game state (see the
  [decision](#click-the-dom-not-the-react-state)). The fiber-hooking snippet is research
  only.
- Any network, score-submission, or leaderboard interaction.
- Automating position-fluid moves whose current occupants, target slots, or reachability
  cannot be verified from the live DOM.
- Persisting durable settings/stats in this release (deferred to a `chrome.storage` LLP).
  The short-lived reload resume token is explicitly limited to the
  [mid-game restart fallback](#mid-game-restart-via-browser-reload).
- Multi-tab or background autopilot — it runs only in the focused, visible game tab.
- Adjusted/test-mode automation (the product still targets Standard mode,
  [LLP 0001](./0001-82-0-team-strategy.spec.md#summary)).

## Open questions

- **Take = click or drag?** Resolved 2026-06-07: placing a new player is card click, then
  slot-position button click. Existing-player movement is the part that requires HTML5
  drag/drop.
- **Spin trigger.** Is there always a discrete Spin button to click, or do some rounds
  auto-spin? Affects whether the `spinning` phase needs a gesture or just patience.
- **Court-slot identity.** Resolved 2026-06-07 for the current live app: slots are
  identified by `PG/SG/SF/PF/C` labels plus aria/data-position fallbacks, with separate
  click/drag/drop elements exposed by `board.read().slots`.
- **Mid-game restart target.** Resolved 2026-06-07: no first-class control was visible in
  the live in-progress game. Policy `RESTART` uses browser reload unless a future site
  revision adds an in-page restart/new-game button.
- **Position-fluid automation readiness.** Resolved for reachable empty-only plans on the
  current desktop court: the DOM reader identifies source/target slot parts and the
  actuator issues the drag/drop sequence. Other move statuses remain advisory-only.
- **Should success keep going?** Default is stop-on-82-0; a "farm mode" is easy but wants a
  persisted preference, hence the storage LLP.
