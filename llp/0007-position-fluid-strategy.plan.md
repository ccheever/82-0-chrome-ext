# LLP 0007: Position-Fluid Strategy

**Type:** Plan
**Status:** Active
**Systems:** Strategy, Content, UI, Simulation
**Author:** Charlie Cheever / Codex
**Date:** 2026-06-06
**Revised:** 2026-06-07
**Related:** [LLP 0001](./0001-82-0-team-strategy.spec.md), [LLP 0002](./0002-extension-product.spec.md), [LLP 0003](./0003-how-to-go-82-0.guide.md), [LLP 0004](./0004-82-0-team-candidates.reference.md), [LLP 0005](./0005-scoring-system-edges.research.md), [LLP 0008](./0008-lazy-autopilot.plan.md) (autopilot that executes these moves)

## Summary

Policy V1 treats a player placement as permanently consuming one slot. That misses a real
strategy edge when selected players can be moved between any of their eligible positions:
the current slot label is no longer the constraint that matters. The policy should ask:

> Does the selected player set, plus this candidate, have any legal assignment to
> `PG/SG/SF/PF/C`?

This fixes the motivating case. If LeBron is currently at PF and Karl Malone appears as a
PF-only player, a fixed-slot policy may reject Malone because PF is "closed." A
position-fluid policy should instead find the reassignment:

```text
Move LeBron James: PF -> SG
Take Karl Malone: PF
```

It also gives us a cleaner way to value flexibility. A multi-position player should get
credit only when their eligibility preserves future legal rosters, not merely because
`pos.length` is large.

This document is a plan for Policy V2. LLP 0001 remains the authoritative description of
the shipped V1 behavior until V2 is implemented, simulated, and accepted.

**The plan rests on one fact, now confirmed on live `82-0.com` (2026-06-06): you can re-drag an
already-placed player into another of its eligible slots.** That is what makes position-fluidity
real rather than hypothetical, so the matching model below is worth building. One mechanic is
still open - whether dragging onto an occupied slot *swaps* the two players or you can only drop
onto an *empty* slot - and it shapes the move-planner; see
[Prerequisite](#prerequisite-verify-the-movement-model).

## Prerequisite: Verify The Movement Model

Everything below assumes the live game treats the five slots as a re-assignable packing of the
selected set, not a sequence of permanent placements.

**Confirmed on live `82-0.com` (2026-06-06): a placed player can be re-dragged into another of
its eligible slots.** The gating premise is met - position-fluid play is real, the bipartite
matching model applies, and implementation can proceed. Two follow-on questions remain; they are
refinements, not blockers:

- What are the actual drag operations: move only into empty slots, swap with an occupied slot,
  or temporarily hold a player while selecting another target? This is the one that shapes the
  move-planner (see [Assignment Choice](#assignment-choice)) - swaps make any legal target
  reachable directly, while empty-only makes the buffer/reachability analysis there load-bearing.
- Does the court DOM expose which player occupies which slot? That is needed for the `"dom"`
  confidence path in [Product And Tracking Impact](#product-and-tracking-impact), and
  `src/lib/board.js` does not read it today.

The original binary "can a placed player move at all?" form of this is now answered yes; the
finer interaction rules are tracked in [Open Questions](#open-questions).

## Implementation Status

**V2a is implemented behind a flag and accepted by simulation (2026-06-07).** V1 remains the
shipped default; V2a turns on via `C820.policy.configure({positionFluid: true})`.

Delivered:

- `src/lib/assign.js` — DOM-free, norm-free matching solver on `C820.assign`.
- `src/lib/policy.js` — `positionFluid` flag forks the candidate filter onto
  `hasLegalAssignment` and derives the target slot + move plan from `bestAssignment`; every V1
  threshold/flow is shared and unchanged. A pick-1 anchor-gate fix landed in the *shared* path
  (rank the pick-1 decision by `val`, since a lone defender's 1-man marginalOVR amplifies STL/BLK
  ×5 and could hide an anchor-grade scorer) — it improves V1 too; see [LLP 0001](./0001-82-0-team-strategy.spec.md#policy-v1).
- `scripts/sim-core.mjs` `playGameV2` (carries `selectedPlayers` + `assignment`, drops the fixed
  open-slot list) + `scripts/compare-policies.mjs`; `test/assign.test.mjs` + `test/policy-v2a.test.mjs`.
- `manifest.json` loads `assign.js` between `engine.js` and `policy.js`.

Realized API (the "Suggested API" below, as built):

```js
legalAssignments(players, idOf?) -> assignment[]                    // [{}] for empty, [] if illegal
hasLegalAssignment(players, idOf?) -> boolean                       // the ONLY take/skip gate
bestAssignment(players, currentAssignment, candidateId, movementRules='empty-only', cfg, idOf?)
  -> { assignment, targetPosition, moves:[{id,from,to}], moveStatus, moveCost } | null
prePlacementMoves(currentAssignment, nextAssignment, candidateId, movementRules='empty-only')
  -> { moves, ordered, certain }
```

`idOf` defaults to `p.selectionId ?? p.id ?? p.n` (callers own identity; content.js uses
`board.norm`-based keys, sim/tests use raw `n`). `moveStatus ∈ {reachable, manual, unknown}`;
`moveCost` is `Infinity` when not reachable. **Decided: `movementRules` defaults to `empty-only`**
because an empty-only ordered plan is valid whether or not the live game allows swaps.

Simulation result (`scripts/compare-policies.mjs`, seeds 1–3 × 100k):

| Policy | Expected spins to first 82-0 | 82-0 rate | moves/take |
|---|---:|---:|---:|
| V1 (post pick-1 fix) | ~187 | 1.21% | 0 |
| V2a (empty-only) | **~166 (−11%)** | 1.36% | 0.07 |
| V2a (swap) | ~166 (−11%) | 1.36% | 0.08 |

V2a is ~11% fewer expected spins, a higher 82-0 rate, and ~0.07 existing-player moves per TAKE
(only ~6% of takes need any reshuffle). `empty-only` and `swap` make identical *decisions* (only
the move plan differs), so `movementRules` is purely advisory — confirming the take/skip decision
depends on `hasLegalAssignment` alone.

Remaining (deferred, see [Implementation Sequence](#implementation-sequence) step 7): `content.js`
adopting the `selectedPlayers` + `assignment` state model and flipping the shipped default, so the
overlay/autopilot ([LLP 0008](./0008-lazy-autopilot.plan.md)) actually run V2a live. The autopilot
already consumes `rec.detail.moves` / `moveStatus` / `nextAssignment`, gated on `moveStatus ===
"reachable"` + live court tracking.

## Design Principles

V2 should keep three concerns distinct:

- **Set legality:** can the selected players be packed into distinct slots at all?
- **Candidate ranking:** how valuable is adding this candidate, including any future option
  value created by the selected set?
- **Move instructions:** among legal assignments for the same selected set, which one asks
  the human to do the least work?

If the game allows free movement between rounds, future feasibility depends on the selected
player set, not on today's visible layout. Assignment choice should therefore be a
user-effort decision unless live interaction rules prove that some assignments are harder
or impossible to reach.

## Current Limitation

The shipped policy uses a fixed-placement model:

- `content.js` tracks committed players with a `_position` chosen by the last recommendation
- `policy.js` derives `openPositions` from those `_position` values
- current-pool candidates are rejected unless they can fill one of those currently open
  positions
- flexible candidates are placed into the scarcest compatible open slot using
  `POSITION_PRIORITY = SG, PG, SF, PF, C`

That is correct only if prior placements cannot be changed. Under position-fluid play, the
current assignment is UI state. Standard-mode scoring still depends only on the selected
players, not their slots; positions constrain legal packing and user instructions.

Two facts about the shipped code sharpen the motivating case. First, `content.js` records a
player's `_position` only from a *recommended* TAKE (`state.lastTakeRec`), so the tracked
assignment is already fiction the moment the user places someone other than as advised. LLP
0002's [State Tracking](./0002-extension-product.spec.md#state-tracking) acknowledges this drift
and offers a manual reset. Second, V1's own `POSITION_PRIORITY` (`SG, PG, SF, PF, C`) places a
fully-flexible star like LeBron at **SG**, the scarcest open slot - never at PF while PF is the
slot worth preserving. So the "PF is closed for Malone" conflict never arises from V1's
*idealized* placement; it arises from the **actual** on-court layout: a user who deviated, a
tighter roster that already consumed SG/PG/SF, or the live board read directly. That is the real
reason slot occupancy must be modeled as mutable UI state rather than policy-owned truth.

## Target State Model

Represent lineup state with two explicit objects:

| Concept | Meaning |
|---|---|
| `selectedPlayers` | Player rows already committed to the roster. This drives scoring and duplicate-name filtering. |
| `assignment` | Current or recommended map from selected player identity to one slot. This drives move instructions and display. |

Use two identities:

| Identity | Suggested form | Purpose |
|---|---|---|
| `selectionId` | `board.norm(n) + "\|" + t + "\|" + d` | Distinguishes the selected player-season row. |
| `nameKey` | `board.norm(n)` | Enforces the live game's duplicate-name rule. |

Do not use slot assignment as player identity. A player moving from PF to SG is the same
selected row.

`selectionId` is exactly the key the shipped code already builds: `board.norm(n) + "|" + t +
"|" + d` (the `INDEX` map in `content.js`, via `board.norm` in `src/lib/board.js`). V2
reuses the established identity instead of inventing one. `nameKey` is its `board.norm(n)`
prefix. Because the live game forbids duplicate *names*, `nameKey` is already unique within any
legal selected set; `selectionId`'s extra `team|decade` only matters for matching a candidate
back to its dataset/DOM row, not for telling two selected players apart.

Rows with `pos: ["UNK"]` remain ineligible. A selected set is legal only if every selected
player has at least one real eligible position and all selected players can be assigned to
distinct slots.

## Assignment Solver

This is a tiny bipartite matching problem:

- left side: selected player rows
- right side: `PG`, `SG`, `SF`, `PF`, `C`
- edge: `player.pos[]` contains the slot
- success: every selected player is matched to one distinct slot

There are at most five players, so use deterministic DFS or bitmask enumeration rather than
a general matching dependency. Sort players by fewest eligible slots first, then by stable
`selectionId`, so the search is fast and reproducible.

Suggested API:

```js
legalAssignments(players) -> assignment[]
hasLegalAssignment(players) -> boolean
bestAssignment(players, currentAssignment, candidateId, movementRules, cfg) -> assignmentPlan
prePlacementMoves(currentAssignment, nextAssignment, candidateId, movementRules) -> movePlan
```

`legalAssignments` returns maps of `selectionId -> position`. `bestAssignment` chooses one
legal assignment for the selected set after the candidate is added and returns an
`assignmentPlan`:

```js
{
  assignment,        // Map selectionId -> position
  targetPosition,    // assignment[candidateId]
  moves,             // ordered existing-player moves, if known
  moveStatus,        // "reachable" | "manual" | "unknown"
  moveCost           // numeric tie-break; Infinity when unknown
}
```

`prePlacementMoves` returns the ordered moves for existing players needed before the
candidate is placed, under the verified live `movementRules`.

The candidate's target slot is `assignmentPlan.assignment[candidateId]`. Existing-player
moves should make that slot empty before the user places the candidate there.

## Legality vs Reachability

Do not conflate these two checks:

| Check | Question | Used for |
|---|---|---|
| Static legality | Does any one-player-per-slot assignment exist? | Strategy analysis and option value |
| UI reachability | Can the live board be transformed into that assignment using allowed drag operations? | Take recommendation and move instructions, when assignment is known |

If verification shows the live game supports arbitrary reassignment or direct swaps, static
legality may be enough for the shipped policy. If the game only allows moving an existing
player into an empty compatible slot, some static legal assignments are not reachable from a
given current layout without a temporary illegal parking move. In that stricter model, V2
must filter candidates by a reachable assignment whenever `assignmentConfidence` is `"dom"`
or `"recommended"`.

When assignment is unknown, the policy can still report that the candidate is statically
packable, but it should not present that as a precise TAKE unless the product copy makes the
uncertainty clear. A useful degraded recommendation is "take if you can free PF by moving an
eligible player" rather than a fabricated move list.

## Assignment Choice

Under full position mobility, two legal assignments for the same selected set have the same
future strategic value. Choose the assignment that is easiest for the user:

1. minimize existing-player moves from the current visible assignment
2. minimize ordered move complexity, especially cascades involving multiple occupied slots
3. prefer keeping single-position players in their current slots
4. prefer the candidate's target slot by `POSITION_PRIORITY` only as a tie-break
5. use stable `selectionId` ordering for final determinism

The move plan should be ordered, not just a diff. `prePlacementMoves` must emit only
realizable steps: each step moves one existing player according to the verified
`movementRules`, and the ordered sequence must actually reach `nextAssignment`.

Do not assume empty slots make every reassignment reachable. For example, swapping two
`PG/SG` players while all empty slots are `SF/PF/C` is statically legal but not reachable if
the UI only allows moving into an empty compatible slot. When the easiest static assignment
is not reachable, choose a different legal assignment that is reachable. If none exists,
return `moveStatus: "manual"` or `"unknown"` and avoid precise drag instructions. Whether the
candidate is still a TAKE depends on the verified movement model, per
[Legality vs Reachability](#legality-vs-reachability).

Example:

```text
Current: LeBron=PF, Jordan=SG, Bird=SF
Next:    LeBron=PG, Jordan=SG, Bird=SF, Malone=PF

Moves before placing Malone:
1. Move LeBron James: PF -> PG
2. Take Karl Malone: PF
```

If the current assignment is unknown or known to be stale, `bestAssignment` should still
return a legal assignment, but `prePlacementMoves` should be omitted or marked uncertain
rather than inventing precise drag instructions.

## Candidate Evaluation

V2a should make the smallest behavioral change that fixes reassignment legality:

```text
for each current-pool candidate:
  reject if candidate.nameKey is already selected
  after = selectedPlayers + candidate
  reject if hasLegalAssignment(after) is false
  if movementRules require UI reachability and assignmentConfidence is "dom" or "recommended":
    reject if no reachable assignmentPlan exists

  m = marginalOVR(selectedPlayers, candidate)   // the shipped engine.marginalOVR
  v = val(candidate)
  assignmentPlan = bestAssignment(after, currentAssignment, candidate.selectionId, movementRules)
  rank by m, then v, then lower known move cost, then stable identity
```

Keep V1's thresholds and skip/restart flow for V2a:

- pick 1 still uses `ANCHOR_MIN`
- middle picks still use `SKIP_BELOW`
- pick 5 still takes only if projected wins reach 82
- pace checks still use the same `val`-sum proxy until retuned

Do not let a flexibility bonus make the policy take a candidate below V1 thresholds until
simulation proves that changing those thresholds improves expected spins to a first 82-0.

For the final pick, ranking should be dominated by actual completion:

```text
if k === 4:
  choose the legal/reachable candidate with the best resulting teamOVR / wins
  take only if it reaches 82 wins, otherwise skip or finish-short as in V1
```

## Positional Option Value

After V2a is correct, test whether ranking should include an explicit option-value term.
The bonus should be based on legal future rosters, not raw `pos.length`.

A practical first approximation:

```text
optionValue(afterRoster, nextRound) =
  average over the simulator's next-spin pool distribution:
    best legal future candidate value above that round's acceptance floor
```

Where:

```text
future candidate q is legal iff hasLegalAssignment(afterRoster + q)
future candidate q is excluded iff q.nameKey is already selected
```

For rounds 2-4, the future candidate value can start as `val(q) - SKIP_BELOW`, floored at
zero. For a future final pick, it should instead reward candidates that actually complete
82-0, for example `teamOVR(afterRoster + q) - TARGET_TEAM_OVR`, floored at zero.

The first version should use the same draw model as `scripts/sim-core.mjs`: uniform over
populated `(team, decade)` pools, with already-selected names removed. Do not include Team/Era
skip branches in the first approximation; add them only as a separate experiment because they
turn this from a one-spin opportunity heuristic into a small policy search.

Then the middle-round ranking score becomes:

```text
score =
  marginalOVR(selectedPlayers, candidate)
  + OPTION_WEIGHT * optionValue(selectedPlayers + candidate, nextRound)
```

Start with `OPTION_WEIGHT = 0` for V2a. Sweep small positive values only after the matching
solver and simulator are in place. Candidate option value may change which player is best
within a pool, but it should not change the policy's take/skip/restart thresholds unless
those thresholds are retuned in the same experiment.

Precompute or memoize option values by selected-set signature. A naive full-pool average is
still small enough for simulation, but the overlay should avoid recomputing all 180 pools
on every mutation tick.

## Simulation Plan

Update the simulator before changing shipped defaults. `scripts/sim-core.mjs` currently
stores `roster` plus a fixed `open` slot list. V2 simulation needs:

- `selectedPlayers`
- `assignment`
- verified `movementRules`
- duplicate-name filtering by `nameKey`
- policy details that include `assignmentPlan`, candidate target position, move list, and
  move status
- no `open` slot list derived from previous placements

Compare these policies across the same seeds:

| Policy | Purpose |
|---|---|
| V1 current | Baseline from LLP 0001 |
| V2a reassignment only | Measures the value of legal repositioning |
| V2a reachable-only | Measures the cost of stricter live drag rules, if applicable |
| V2c reassignment + option value | Measures whether flexibility bonus helps |

Report the existing metrics plus move burden:

- expected spins to first 82-0
- per-game 82-0 rate
- short-finish rate
- mean completed-game teamOVR
- mean existing-player moves per TAKE
- share of TAKE recommendations requiring at least one move

The primary objective remains expected spins to a first 82-0. Move burden should initially
be reported, not optimized into the objective. If movement turns out to be slow enough to
matter, add an explicit `MOVE_SPIN_EQUIVALENT` or friction penalty and retune with that
objective documented.

Use the existing validation pattern: broad grid sweep first, then multi-seed confirmation.
Only claim improvement if expected-spin ranges are outside normal Monte Carlo noise.

## Regression Fixtures

Add focused tests before broad simulation:

- LeBron all-position row currently assigned to PF; Karl Malone PF-only row appears; policy
  recommends moving LeBron and taking Malone at PF
- current assignment unknown; the same selected set plus Malone is legal; policy recommends
  a take but omits precise move instructions
- candidate is high-value but makes the selected set unassignable; policy rejects it
- same selected set has multiple legal assignments; chosen assignment minimizes existing
  moves before applying `POSITION_PRIORITY`
- static assignment is legal but not reachable under "move only into empty compatible slot"
  rules; policy either chooses a reachable assignment or marks the move plan manual/unknown
- last pick has two legal candidates; lower-`val` candidate completes 82-0 because of the
  steals/blocks averaging quirk; policy chooses by resulting teamOVR
- no legal candidate in the pool; skip/restart behavior matches V1
- duplicate player name from a different team/decade is excluded even if assignment is legal

## Product And Tracking Impact

The overlay should separate the candidate action from prerequisite moves:

```text
TAKE  Karl Malone -> PF
Before placing:
1. LeBron James: PF -> SG
```

Alternatives should show:

- candidate target slot
- candidate `val`
- projected OVR/wins if taken
- move count, when known

Lineup state should change from `committed[]` carrying `_position` to:

```js
state.selectedPlayers = []
state.assignment = null // or Map selectionId -> position
state.assignmentConfidence = "dom" | "recommended" | "unknown"
state.movementRules = null // verified live drag/swap behavior
```

Prefer reading current court occupancy from the DOM if stable slot/player text exists. Note
that this is **new** DOM-contract surface: `src/lib/board.js` today reads only the candidate
pool, the round, the skip buttons, and the "Placing {name}" hint - which, as `content.js` notes,
does not identify a slot - so per-slot occupancy must be added to LLP 0002's DOM Contract and
`board.js` first. If the live page does not expose court occupancy reliably, keep the last
recommended assignment as advisory state and degrade gracefully:

- still score from `selectedPlayers`
- still use matching to decide whether candidates are legally packable
- show target slot for the candidate
- show move instructions only when assignment confidence and `moveStatus` are high enough
- keep the manual reset control from LLP 0002

When a TAKE recommendation is accepted and the round advances, commit the selected player
and replace `state.assignment` with the policy's `assignmentPlan.assignment`; do not infer a fixed
`_position` and then derive open slots from it.

This remains advisory-only. The extension should not drag players or click controls as part
of this plan.

## Implementation Sequence

1. **Verify the movement model on live `82-0.com`** (see
   [Prerequisite](#prerequisite-verify-the-movement-model)). If placed players cannot be moved,
   stop here and keep V1.
2. Add an assignment helper module with tests for legal assignment enumeration, assignment
   choice, duplicate-name handling, verified movement rules, and ordered,
   reachability-checked move plans.
3. Add Policy V2 behind a configuration flag or separate entry point; keep V1 as the default
   until simulation accepts V2.
4. Update `scripts/sim-core.mjs`, `scripts/tune-policy.mjs`, and validation scripts to run
   V1/V2 comparisons on identical seeds.
5. Tune `OPTION_WEIGHT` and any threshold changes only after V2a is measured.
6. If the overlay is to show move instructions from the real board, extend LLP 0002's DOM
   Contract and `src/lib/board.js` to read per-slot occupancy; until then V2 runs on advisory
   assignment state (see [Product And Tracking Impact](#product-and-tracking-impact)).
7. Update `content.js` and the overlay to carry `selectedPlayers` plus assignment state.
8. If V2 wins and ships, revise LLP 0001 from "Policy V1" to the accepted policy and update
   `@ref` annotations in `policy.js`, simulator code, and content tracking.

## Open Questions

- What exact live interactions are allowed: can players be moved between rounds, only while
  a candidate is selected, or only into empty compatible slots?
- Can the DOM reader reliably recover current court occupancy, or is assignment necessarily
  advisory state?
- Should option value use `val`, true marginal teamOVR, or a hybrid score for future
  candidates? `val` is faster and matches thresholds; marginal teamOVR better handles LLP
  0005's steals/blocks edge.
- Should skip availability enter option value? A state with both skips can tolerate narrower
  future position coverage than a state with no skips.
- Should human move cost become part of the objective, or only a UI tie-break and reported
  metric?

## Implementation References

When this plan is implemented, code should point back here:

- assignment solver:
  `// @ref LLP 0007#assignment-solver - selected players are movable; legality is matching`
- assignment choice / move ordering:
  `// @ref LLP 0007#assignment-choice - choose the legal assignment with least user movement`
- policy candidate filtering:
  `// @ref LLP 0007#candidate-evaluation - candidate fits if any reassignment exists`
- option-value ranking:
  `// @ref LLP 0007#positional-option-value - flexibility bonus is simulation-tuned`
- content tracking and move UI:
  `// @ref LLP 0007#product-and-tracking-impact - render reassignment-aware recommendations`
