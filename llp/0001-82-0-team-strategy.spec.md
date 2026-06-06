# LLP 0001: Live 82-0 Strategy and Scoring

**Type:** Spec
**Status:** Active
**Systems:** Strategy, Scoring, Game-Data
**Author:** Charlie Cheever / Codex
**Date:** 2026-06-06
**Revised:** 2026-06-06
**Related:** [LLP 0000](./0000-82-0-chrome-ext.explainer.md), [LLP 0002](./0002-extension-product.spec.md), https://82-0.com

## Summary

This document is the product strategy spec for the extension's first target:
normal public play on `82-0.com` in Classic/HoopIQ mode. The live site has two
scoring paths in its JavaScript bundle:

- **Standard mode** (`testMode=false`): the public game path. It scores the five
  selected players by cumulative PPG/RPG/APG/SPG/BPG.
- **Adjusted mode** (`testMode=true`): an admin/test path with individual OVR,
  position weights, legacy bonuses, and geometric-mean team scoring. It is useful
  research, but it is not the public product path.

The extension therefore optimizes **Standard mode**, while respecting the live
game's **position placement constraints**. Positions matter for whether a player
can be placed into an open slot; they do not change the Standard score once the
player is selected.

Headline facts:

1. A public-game 82-0 requires **rounded teamOVR >= 109.5**. The raw unrounded
   formula threshold is about **109.45** because the live bundle rounds teamOVR to
   one decimal before projecting wins.
2. The local dataset is `src/data/players.json`: **10,626 player-season rows**.
   The upstream data has 10,932 rows, but the 306 1950s rows are excluded from the
   live draw pool and from the bundled file.
3. The live draft is five rounds into **PG, SG, SF, PF, C**. A player can be placed
   only into one of their listed eligible positions (`pos[]`). The live Standard
   score ignores the slot after placement.
4. Standard mode is additive enough that the strategy is: anchor on an elite
   high-value player, spend skips on weak pools after the first pick, and assign
   flexible players to the scarcest compatible open position.

## Source Of Truth

Use the live `82-0.com` bundle and the repo-local dataset as the authoritative
sources for implementation.

The bundled data schema is compact:

```json
{
  "n": "Nikola Jokić",
  "t": "DEN",
  "d": "2020s",
  "pos": ["C"],
  "ppg": 26.9,
  "rpg": 12.4,
  "apg": 9.3,
  "spg": 1.4,
  "bpg": 0.8,
  "slug": "nikola_jokic"
}
```

Field meanings:

| Field | Meaning |
|---|---|
| `n` | Display player name |
| `t` | Team abbreviation |
| `d` | Decade, `1960s` through `2020s` |
| `pos` | Eligibility array; valid playable values are `PG`, `SG`, `SF`, `PF`, `C` |
| `ppg`, `rpg`, `apg`, `spg`, `bpg` | Per-game statistics; `spg`/`bpg` may be `null` |
| `slug` | Stable local player slug |

Five low-stat rows have `pos: ["UNK"]`. Treat them as **ineligible for placement**
and therefore not selectable by the policy. They do not affect high-value tables.

## Live Game Rules

The public `/how-to-play` page contains stale copy about "one player per decade"
and "no positional restrictions." The live app and in-game modal are the source of
truth for extension behavior:

- The roster has exactly five slots: `PG`, `SG`, `SF`, `PF`, `C`.
- Each round spins a random populated `(team, decade)` pool from the 30 teams and
  seven live decades (`1960s` through `2020s`; `1950s` excluded).
- The player list shows all not-yet-used names in that pool. The site prevents
  duplicate player names.
- A selected player can be placed only into an open compatible position in `pos[]`.
- Each game has one **Team** skip and one **Era** skip.
  - Team skip keeps the current decade and redraws a different team.
  - Era skip keeps the current team and redraws a different decade.
- Starting a new game is free and unlimited.

## The Scoring Engine: Live Standard Mode

### Team OVR

Let `team` be the five selected player rows. The live bundle computes teamOVR from
team totals:

```js
score = 100 * (
  (sum(ppg) / 133.4) * 0.46 +
  (sum(rpg) / 39.7)  * 0.25 +
  (sum(apg) / 29.3)  * 0.18 +
  (adjSpg / 6.1)     * 0.07 +
  (adjBpg / 3.2)     * 0.04
)

teamOVR = round(score, 1 decimal)
```

For defensive stats, the live code averages only **positive tracked values** and
scales that average to a five-player equivalent:

```js
adjSpg = sum(player.spg where spg > 0) * 5 / count(player.spg where spg > 0)
adjBpg = sum(player.bpg where bpg > 0) * 5 / count(player.bpg where bpg > 0)
```

If no player has a positive value, the adjusted value is `0`. This handles
1960s and early-1970s missing steals/blocks without letting `null` values drag the
team down.

### Win Curve

```js
wins = Math.round(82 * Math.min(teamOVR / 110, 1) ** 1.15)
```

Because `teamOVR` is rounded first, a displayed/rounded `teamOVR` of **109.5** is
the first value that rounds to 82 wins. The unrounded score must be at least
approximately **109.45** to round there.

### The Currency: Player Value (`val`)

For ranking a pool before a full roster is known, use a player's additive Standard
contribution:

```js
val(player) = 100 * (
  (ppg / 133.4) * 0.46 +
  (rpg / 39.7)  * 0.25 +
  (apg / 29.3)  * 0.18 +
  (spg / 6.1)   * 0.07 +
  (bpg / 3.2)   * 0.04
)
```

`val` is not exactly the same as marginal teamOVR because teamOVR uses defensive
averaging for SPG/BPG. The extension should rank final candidates by **true
marginal teamOVR** against the currently tracked roster, with `val` as the stable
display and threshold unit.

## Data-Derived Scarcity

Computed over the 10,626 bundled player-season rows and 180 populated team-decade
pools.

### Decade Richness

Counts below use `val`, the Standard-mode player contribution.

| Decade | Rows | `val >= 22` | `val >= 20` | `val >= 18` | Read |
|---|---:|---:|---:|---:|---|
| 1960s | 473 | 6 | 9 | 12 | Top-heavy, Wilt/Oscar/Russell era |
| 1970s | 1,066 | 5 | 19 | 28 | Very rich |
| 1980s | 1,317 | 3 | 7 | 19 | Thin at the top |
| 1990s | 1,678 | 3 | 12 | 23 | Moderate |
| 2000s | 1,935 | 2 | 6 | 17 | Thin at the top |
| 2010s | 2,143 | 2 | 9 | 22 | Thin at the top, but has LeBron/Cousins |
| 2020s | 2,014 | 8 | 14 | 26 | Very rich |

### Position-Constrained Pool Scarcity

This table answers: "A random team-decade pool can field at least one player with
`val >= threshold` who is eligible for this open position."

| Pos | `val >= 22` | `val >= 20` | `val >= 18` | Avg best `val` |
|---|---:|---:|---:|---:|
| PG | 3.9% | 8.3% | 16.1% | 15.8 |
| SG | 2.8% | 7.8% | 18.3% | 15.8 |
| SF | 3.3% | 10.6% | 19.4% | 16.0 |
| PF | 4.4% | 20.6% | 38.9% | 17.3 |
| C | 12.2% | 24.4% | 37.2% | 17.5 |

For flexible players, fill the scarcest compatible open position first:

> **SG / PG / SF -> PF -> C**

This is a placement constraint, not a scoring weight. If the best player is
center-only, take them at C. If the best player can fill many positions, preserve
PF/C flexibility for later.

### Top Standard Contributors

Top rows by `val`:

| Player | Team | Decade | `val` |
|---|---|---:|---:|
| Wilt Chamberlain | GSW | 1960s | 32.0 |
| Wilt Chamberlain | PHI | 1960s | 28.8 |
| Kareem Abdul-Jabbar | MIL | 1970s | 28.5 |
| Kareem Abdul-Jabbar | LAL | 1970s | 26.7 |
| Nikola Jokic | DEN | 2020s | 25.4 |
| Russell Westbrook | WAS | 2020s | 24.2 |
| Hakeem Olajuwon | HOU | 1990s | 23.8 |
| Bob McAdoo | LAC | 1970s | 23.6 |
| Giannis Antetokounmpo | MIL | 2020s | 23.5 |
| David Robinson | SAS | 1990s | 23.5 |
| Michael Jordan | CHI | 1980s | 23.5 |
| Luka Doncic | DAL | 2020s | 23.4 |

Names here are shown without relying on diacritic-sensitive matching. Standard mode
has no legacy bonus, so the adjusted-mode Jokić/Jokic legacy issue does not apply
to public-game scoring.

## Policy V1

This is the policy the extension implements first. It is a strong, data-derived
heuristic, not a proven optimal MDP solution. The simulator this once called for now
exists (`scripts/simulate-policy.mjs`, see [Simulating Policy V1](#simulating-policy-v1)),
so the performance figures here are *measured* against the shipped code — but they
characterize this policy's behavior, they do not establish "time optimality."

Inputs:

- current open positions
- tracked roster rows
- current pool rows
- Team/Era skip availability
- current decade

Algorithm:

```text
each selecting round:
  enrich visible pool rows from src/data/players.json
  remove players that cannot fill any open position
  rank candidates by true marginal teamOVR, then by val

  if no placeable candidate:
    spend the best remaining skip
    if no skip remains, restart

  if pick 1:
    take the best placeable candidate only if val >= 20
    otherwise restart and preserve both skips

  if pick 5:
    take the best candidate if it projects to 82 wins
    otherwise spend the best remaining skip
    if no skip remains, take best to finish and then restart if short

  if after two locked picks the running val is below 40:
    restart

  if best candidate val >= 18:
    take it and place into the scarcest compatible open position

  otherwise:
    spend Era skip on a thin decade (especially 1980s/2000s) when available
    else spend Team skip
    else restart early, or take best late with no skips
```

Policy constants (as implemented in `src/lib/policy.js`):

| Constant | Value | Meaning |
|---|---:|---|
| `ANCHOR_MIN` | 21 | Minimum first-pick `val` worth anchoring; below it, restart. Tuned from 20 — see [Tuning](#tuning) |
| `SKIP_BELOW` | 17 | Weak-pool threshold after the anchor. Tuned from 18 |
| `PACE2_MIN` | 40 | Minimum running `val` after two picks before a restart |
| `TARGET_TEAM_OVR` | 109.5 | Rounded teamOVR needed for 82 wins (the real target) |
| `TARGET_SUMVAL` | 108 | Sum-of-`val` proxy for the target; teamOVR runs ~1.3 above `Sum(val)` thanks to STL/BLK averaging, so `Sum(val) >= ~108` ≈ teamOVR 109.5 |
| `GOOD_PER_PICK` | 26 | Optimistic per-remaining-pick `val`, used only for the on-pace note |
| `REACH_CEIL` | null | Optional optimistic-pace doom check; `null` = off. Evaluated and left off — see [Tuning](#tuning) |
| `THIN_DECADES` | 1980s, 2000s | Weakest top-end pools; prefer an Era-skip out of them |
| `POSITION_PRIORITY` | SG, PG, SF, PF, C | Fill flexible stars into scarce slots |

### Simulating Policy V1

`scripts/simulate-policy.mjs` imports the shipped `src/lib/engine.js` and
`src/lib/policy.js` (so it measures the real code, not a re-implementation) and plays
Policy V1 against a model of the live draw: each round spins a uniform populated
`(team, decade)` pool, removes already-used player names, and honors one Team and one
Era skip per game with free restarts.

```sh
node scripts/simulate-policy.mjs [games] [seed]   # defaults: 200000 1
```

Measured over 200,000 games (mean over seeds 1–5; current tuned constants):

| Metric | Value |
|---|---:|
| Per-game 82-0 rate | ~1.1% |
| Games restarted at pick 1 (no `val >= ANCHOR_MIN` anchor) | ~78% |
| Games finished below 82-0 | ~14% |
| Mean teamOVR of finished games | ~99 |
| Expected **games** to a first 82-0 | ~90 |
| Expected **spins** (re-rolls) to a first 82-0 | **~195** |

Because each game fully resets (empty roster, both skips, i.i.d. draws), games are
i.i.d., so games-to-first-82-0 is geometric in the per-game rate and the script reports
the expectation analytically rather than by nesting episodes. Two caveats: the draw model
assumes a uniform team×decade spin, which may not match the live site's distribution; and
these figures characterize the policy, they do not prove it minimizes time.

### Tuning

`scripts/tune-policy.mjs` sweeps a grid of policy constants over the shipped policy (via
`C820.policy.configure()`) and ranks each config by the real objective — expected spins to
a first 82-0. `scripts/validate-policy.mjs` re-runs the top candidates across several seeds,
because the single-seed sweep's leader sits inside the noise band.

```sh
node scripts/tune-policy.mjs [games] [seed]            # rank a grid
node scripts/validate-policy.mjs [games] [seeds]       # multi-seed confirm, e.g. 200000 1,2,3,4,5
```

What the sweep found:

- **`ANCHOR_MIN` 20 → 21 and `SKIP_BELOW` 18 → 17** lower expected spins by **~4.4%**
  (~204 → ~195, ranges non-overlapping across five seeds). The win raises the pick-1
  restart bar slightly: per-game 82-0 rate actually *drops* (~1.18% → ~1.1%), but because
  restarts are cheap (one spin) and the games that do play out waste less time, the *time
  to your first 82-0* improves. The objective is fewest spins, not per-game win rate.
- **`ANCHOR_MIN` past 21 reverses the gain** — 22 is roughly break-even, 23 is +12%, 24 is
  +27%. Demanding a rare anchor means too many played-out games still can't finish.
- **The optimistic-pace doom check (`REACH_CEIL`) does not help** and is left off. It does
  what it was meant to — sub-82-0 finishes drop from ~14.5% to ~7% and mean teamOVR rises —
  but expected spins is unchanged-to-slightly-worse: a run is only *provably* doomed once
  its spins are already spent, and bailing early occasionally kills a winnable run, which
  cancels the saving. The knob stays in `policy.js` (default `null`) for future tuning.
- **`PACE2_MIN` 50 is far worse** (forces too many pick-2 restarts); 30–40 are within noise,
  so it stays at 40.

## Extension Implementation Requirements

Code that implements this document should reference the relevant sections:

- Scoring constants and formula:
  `// @ref LLP 0001#the-scoring-engine-live-standard-mode`
- `val` and marginal ranking:
  `// @ref LLP 0001#the-currency-player-value-val`
- Policy constants and flow:
  `// @ref LLP 0001#policy-v1`
- Position placement priority:
  `// @ref LLP 0001#position-constrained-pool-scarcity`

The extension must not copy the adjusted/test-mode legacy bonus or geometric mean
logic into the public-game recommender unless the product explicitly changes target
mode.

## Reproducing The Tables

Run:

```sh
node scripts/verify-standard-analysis.mjs
```

The script reads `src/data/players.json`, checks the row count and schema, and
prints the threshold, decade table, position table, and top contributors used above.

## Adjusted Mode Note

The older adjusted-mode research remains useful only if the extension later targets
`testMode=true` or a clone that exposes adjusted scoring. If that happens, revise
this spec or create a new LLP first. Known adjusted-mode pitfalls:

- the local schema still uses `pos[]`, not `positions[]`
- legacy name matching must be diacritic-folded (`Jokić` vs `jokic`, `Ginóbili` vs
  `ginobili`)
- adjusted teamOVR is also rounded before wins, which changes threshold edge cases
- adjusted position scarcity is not the same as Standard placement scarcity
