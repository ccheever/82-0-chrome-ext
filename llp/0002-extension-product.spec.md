# LLP 0002: Extension Product

**Type:** Spec
**Status:** Active
**Systems:** Manifest, Content, UI, Strategy, Scoring, Game-Data
**Author:** Charlie Cheever / Codex
**Date:** 2026-06-06
**Related:** [LLP 0000](./0000-82-0-chrome-ext.explainer.md), [LLP 0001](./0001-82-0-team-strategy.spec.md)

## Product

The first extension product is **82-0 Coach**: an advisory overlay for live
`82-0.com` normal play. It reads the current team-decade pool, scores the visible
players with the Standard-mode engine from [LLP 0001](./0001-82-0-team-strategy.spec.md),
and tells the user whether to take a player, spend Team/Era skip, or restart.

The first release is **advisory only**. It does not click buttons or place players.
This keeps the Manifest V3 surface small, avoids fighting the live site's spinner
timers, and lets the DOM reader stabilize before any autopilot decision.

## User Experience

When the user opens `https://82-0.com` and starts Classic or HoopIQ mode:

1. A fixed panel appears in the lower-right corner.
2. During spinning, it shows a waiting state.
3. During selection, it shows:
   - primary action: `TAKE`, `TEAM-SKIP`, `ERA-SKIP`, or `RESTART`
   - recommended player and target position when taking
   - reason text
   - current round, pool, projected OVR/wins if taken, skip availability
   - top three alternatives
4. The recommended player card is highlighted.
5. The panel can be collapsed and the tracked lineup can be reset manually.

The overlay should be useful in both Classic mode and HoopIQ. In HoopIQ, visible
stats are hidden, so the content script enriches player rows from the bundled
dataset.

## Architecture

This release is a no-build Manifest V3 extension. Content scripts are injected in
order and share state through an isolated-world `globalThis.C820` namespace.

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest, least-privilege host matching, script/CSS injection |
| `src/lib/engine.js` | Standard-mode scoring engine from LLP 0001 |
| `src/lib/policy.js` | Policy V1 recommender from LLP 0001 |
| `src/lib/board.js` | DOM reader for the live board |
| `src/content.js` | Orchestrator, data enrichment, lineup tracking, overlay rendering |
| `src/overlay.css` | Overlay and recommended-card styles |
| `src/data/players.json` | Bundled 10,626-row player dataset |

No background service worker is needed for this release. There is no popup/options
UI. State is in-memory and scoped to the current tab.

## Manifest And Permissions

The manifest should request only what this release needs:

- content script matches: `https://82-0.com/*` and `https://www.82-0.com/*`
- web-accessible resource: `src/data/players.json` for the content script fetch
- no broad host permissions
- no `storage`, `tabs`, `scripting`, or background worker for the advisory MVP

If a future release adds settings, persistent run stats, or autopilot, document the
new permission rationale before widening the manifest.

## DOM Contract

The DOM reader is intentionally small and brittle. It relies on live app structure
observed in June 2026:

- selectable player rows are `[draggable="true"]`
- row text contains three `p` elements: player name, eligible positions, and
  `TEAM · DECADE`
- Classic-mode stat cells show `PPG`, `RPG`, `APG`, `SPG`, `BPG`
- skip buttons are text buttons labeled `Team` and `Era`
- the round label contains `Round N/5`
- completion screens contain a final record and no draggable player rows

When the live site changes, update `src/lib/board.js` and this section together.
Prefer text/structure selectors over Tailwind class names where possible.

## State Tracking

The live app owns the real roster. The extension keeps a best-effort mirror only
for scoring projections:

- committed players are tracked when the round advances after a recommended take
- each tracked player stores the target position recommended by the policy
- open positions are derived from tracked target positions
- if the user deviates from advice or the tracker drifts, the user can press
  `reset` and continue with round-local advice

The policy must never assume tracked state is authoritative enough to automate
clicks. That is why this release remains advisory.

## Non-Goals

- Autopilot clicking
- Timer bypassing or app-state patching
- Adjusted/test-mode optimization
- Persistent history or leaderboard tracking
- Chrome Web Store packaging polish

## Future Decisions

Write a new LLP before implementing any of these:

- autopilot and whether it clicks the DOM or hooks app state
- persistent settings/run stats and `chrome.storage` schema
- popup/options UI
- support for adjusted/testMode or Vercel clone analysis mode
