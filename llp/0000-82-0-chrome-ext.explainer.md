# LLP 0000: 82-0-chrome-ext

**Type:** Explainer
**Status:** Active
**Systems:** Core
**Role:** Root
**Author:** Charlie Cheever / Claude
**Date:** 2026-06-06
**Related:** [AGENTS.md](../AGENTS.md), https://github.com/ccheever/llp

## Overview

`82-0-chrome-ext` is a Chrome browser extension (Manifest V3) **companion for the
[82-0](https://82-0.com) game** — the "build an all-time NBA roster and see if you
can go 82-0" slot-machine game. Its job is to help a player reach a literal **82-0**
team in the fewest minutes by executing the optimal play strategy against the live
game: reading each slot-machine draw, recommending (or automating) the
restart / re-roll / pick decision, and tracking lineup state. This document is the
root of the project's **Linked Literate Programming (LLP)** corpus.

The live-game scoring and strategy spec is
**[LLP 0001](./0001-82-0-team-strategy.spec.md)**. The first extension product is
**[LLP 0002](./0002-extension-product.spec.md)**: an advisory overlay for public
`82-0.com` normal play. It intentionally does not click the page or bypass the
site's spinner timers. For a plain-English walkthrough of the playing strategy
itself — no formulas — see **[LLP 0003](./0003-how-to-go-82-0.guide.md)**, and for a
by-position catalog of the players strong enough to start on an 82-0 team, see
**[LLP 0004](./0004-82-0-team-candidates.reference.md)**. For the edges of the scoring
system — the highest-rated team possible and why it still only goes 82-0 — see
**[LLP 0005](./0005-scoring-system-edges.research.md)**.

As features land, the non-obvious decisions behind them get captured as additional
LLP documents and pointed at from the code with `@ref` annotations.

## Architecture

A Manifest V3 extension is made of a few cooperating parts. The first release is
specified in [LLP 0002](./0002-extension-product.spec.md). The game-specific pieces
(scoring, policy, board-reading) are what make this more than a generic extension;
their behavior is specified in [LLP 0001](./0001-82-0-team-strategy.spec.md) and
[LLP 0002](./0002-extension-product.spec.md).

| Part | Role | Likely `System` |
|------|------|-----------------|
| `manifest.json` | Declares least-privilege content script injection for `82-0.com` | `Manifest` |
| Content scripts | Read the live slot-machine draw / lineup from the page DOM and render advice | `Content` |
| Scoring engine | Re-implements the live Standard teamOVR / win formulas — see [LLP 0001 → scoring](./0001-82-0-team-strategy.spec.md#the-scoring-engine-live-standard-mode) | `Scoring` |
| Decision/policy engine | The anchor / skip / restart / position-placement policy — see [LLP 0001 → policy](./0001-82-0-team-strategy.spec.md#policy-v1) | `Strategy` |
| Overlay UI | Fixed advisory panel and recommended-card highlight | `UI` |
| Bundled player data | `src/data/players.json`, exposed as a web-accessible resource | `Game-Data` |

The first release does not need a service worker, popup/options UI, or
`chrome.storage`. Add those only with a new LLP documenting the permission and
lifecycle decisions.

## How this project uses LLP

### What LLP is

LLP keeps humans in markdown and lets AI write and review most of the code. Design
rationale lives in numbered, versioned markdown documents in this repo (the `llp/`
directory); source code carries thin, machine-readable pointers (`@ref`) to the
exact section of the exact document that explains a decision. An agent following an
`@ref` can check whether a change still satisfies the documented intent; a human
can steer the system by editing prose rather than code.

The full specification, rationale, and guides live in the upstream project:
**https://github.com/ccheever/llp** (see its `llp/0000` explainer). This repo
**adopts those conventions but does not vendor the upstream repo** — there is no
git submodule. Only the documents under this repo's own `llp/` directory are
authoritative for `82-0-chrome-ext`; the upstream link is for the methodology
itself.

### Conventions adopted here

- **Documents live in `llp/`** and are named `NNNN-slug.type.md` (e.g.
  `0001-manifest-permissions.decision.md`). Take the next free number; don't plan
  the numbering.
- **Every document opens with a metadata header**: `Type`, `Status`, `Systems`,
  `Author`, `Date` (required) and `Role`, `Revised`, `Related` (optional).
- **Standard types:** RFC, Spec, Decision, Plan, Explainer, Principle, Guide,
  Issue, Research. Define others if none fit.
- **Documents are living.** Update them when the design changes. When one is
  historical but still useful, move it to `llp/tombstones/` and set
  `**Status:** Tombstoned`. Don't leave stale guidance unmarked.
- **Code points back with `@ref`:** `// @ref LLP NNNN#anchor — short gloss`
  (optionally `[implements]` / `[constrained-by]` / `[tests]` / `[explains]`).
  Prefer heading-slug anchors so documents can be restructured without breaking
  references.
- **Co-evolve.** An `@ref` lands in the same commit as the code it annotates; an
  LLP edit lands with the change that motivated it.

Agent-facing instructions are in [AGENTS.md](../AGENTS.md) (with a `CLAUDE.md`
symlink for tools that expect that name).

### What's worth a `@ref` in a Chrome extension

Browser extensions are full of code that looks fine locally but is bound by a
global constraint that isn't visible at the call site — exactly the case LLP is
built for. The rule of thumb still applies: *if an agent might "simplify" this
code in a way that breaks the design intent, it needs a reference.* For this
project, the highest-value reference targets are likely:

- **Manifest permissions & host access.** Each permission has a least-privilege
  justification and affects Chrome Web Store review. Removing or widening one is a
  decision, not a tidy-up. A `@ref` on the manifest (or the code that needs a
  permission) ties it to the rationale.
- **Service-worker lifecycle.** MV3 background workers are torn down when idle, so
  in-memory state does not survive. Code that assumes persistence is a classic
  "locally plausible, globally wrong" bug — reference the LLP that documents the
  state-rehydration strategy.
- **Content-script ↔ service-worker ↔ popup messaging.** The message protocol
  (shapes, channels, sender validation) is a cross-cutting contract. Annotate the
  senders/receivers so a change on one side is checked against the documented
  protocol.
- **Content-script injection (`matches`, `run_at`, isolated world).** Timing and
  match-pattern decisions are easy to "fix" in a way that breaks on real pages.
- **`chrome.storage` schema & migrations.** Storage shape and any versioned
  migration logic should reference the schema decision so data isn't silently
  broken.

Don't annotate mechanically. A reference should tell a reader something they
couldn't get from the code and filename alone. Early, volatile code can wait —
add references once a module's design stabilizes.

## Key decisions

- **[LLP 0001 — Live 82-0 strategy and scoring](./0001-82-0-team-strategy.spec.md)**
  *(Active)* — the live Standard scoring engine, bundled data schema, position
  placement constraints, and Policy V1.
- **[LLP 0002 — Extension product](./0002-extension-product.spec.md)**
  *(Active)* — the advisory overlay product, manifest/permission scope, DOM contract,
  and non-goals.
- **[LLP 0006 — iOS Safari extension packaging](./0006-ios-safari-extension.plan.md)**
  *(Active)* — the iPhone install paths, Safari packaging script, mobile overlay
  constraints, and generated Xcode wrapper.

Decisions still to capture as they're made (write them when the reasoning is fresh,
not preemptively):

- Autopilot and whether it clicks DOM controls or hooks app state *(not yet written)*
- Persistent settings / run stats and `chrome.storage` schema *(not yet written)*
- Popup/options UI *(not yet written)*
