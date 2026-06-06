<!-- GENERATED FILE — do not hand-edit the tables. Regenerate with:
       node scripts/list-team-candidates.mjs
     Prose lives in scripts/list-team-candidates.mjs. -->
# LLP 0004: 82-0 Team Candidates

**Type:** Reference
**Status:** Active
**Systems:** Strategy, Game-Data
**Author:** Charlie Cheever / Claude
**Date:** 2026-06-06
**Related:** [LLP 0001](./0001-82-0-team-strategy.spec.md) (val, scoring, scarcity — authoritative), [LLP 0003](./0003-how-to-go-82-0.guide.md) (the strategy in plain English)

## What this is

Every player-season strong enough to plausibly start on a perfect-season roster — the **candidate pool** the Coach is choosing from. A player makes the list if their **`val` ≥ 18** (`val` = how much a player adds to your team's OVR; see [LLP 0001](./0001-82-0-team-strategy.spec.md#the-currency-player-value-val)). This file is generated from the shipped dataset by `scripts/list-team-candidates.mjs`; regenerate it rather than editing the tables by hand.

**A few things to know before you read the tables:**

- **★ marks an anchor-grade season (`val` ≥ 21).** That's the bar the Coach holds out for on the first pick. A full 82-0 team needs its five `val`s to sum to ~108 — about **21.6 apiece** — so the starred players are the ones you build around, and the rest fill in.
- **These are player-*seasons*, not players.** The same name can appear for more than one (team, era) — each is a separate thing you can draw, with its own `val`. The live game won't let you put two of the same name on one roster.
- **A player is listed under *every* position they can fill.** Versatile stars (LeBron can play all five) show up in several tables — that flexibility is exactly what makes them valuable for filling a scarce slot.
- **`val` is not "how good were they," it's "how much do they move *this* game's score."** The live formula rewards points, rebounds, assists, steals, and blocks — and has **no three-point term**. So volume scorers and big men who fill the box score rate high, while pure shooters rate lower than their reputation (e.g. some great shooting seasons fall below the 18 cut).

Sections are ordered **scarcest position first** — Shooting Guard, Point Guard, Small Forward, Power Forward, Center — because that's the order in which elite, position-eligible talent is hardest to find ([LLP 0001](./0001-82-0-team-strategy.spec.md#position-constrained-pool-scarcity)), so those are the lists worth studying most. Within each, players are sorted by `val`, best first.

## Summary

Candidates with `val` ≥ 18: **147** distinct player-seasons.

| Position | Eligible candidates | Anchor-grade (★) |
|---|---:|---:|
| SG — Shooting Guard | 37 | 10 |
| PG — Point Guard | 31 | 11 |
| SF — Small Forward | 40 | 10 |
| PF — Power Forward | 79 | 21 |
| C — Center | 80 | 36 |

## SG — Shooting Guard

37 candidates · `val` 18.1–23.5 · 10 anchor-grade (★)

| # | Player | val | Positions | Team | Era |
|---:|---|---:|---|---|---|
| 1 | Michael Jordan | 23.5 ★ | SG · SF | CHI | 1980s |
| 2 | Luka Dončić | 23.4 ★ | PG · SG · SF | DAL | 2020s |
| 3 | Luka Dončić | 23.1 ★ | PG · SG · SF | LAL | 2020s |
| 4 | James Harden | 22.5 ★ | PG · SG | BKN | 2020s |
| 5 | LeBron James | 22.1 ★ | SF · PF · PG · C · SG | LAL | 2010s |
| 6 | LeBron James | 21.7 ★ | SF · PF · PG · C · SG | CLE | 2010s |
| 7 | James Harden | 21.3 ★ | PG · SG | HOU | 2010s |
| 8 | Michael Jordan | 21.2 ★ | SG · SF | CHI | 1990s |
| 9 | Magic Johnson | 21.1 ★ | PG · SG · PF | LAL | 1980s |
| 10 | LeBron James | 21.1 ★ | SF · PF · PG · C · SG | CLE | 2000s |
| 11 | LeBron James | 20.9 | SF · PF · PG · C · SG | MIA | 2010s |
| 12 | Jerry West | 20.9 | PG · SG | LAL | 1970s |
| 13 | LeBron James | 20.4 | SF · PF · PG · C · SG | LAL | 2020s |
| 14 | James Harden | 20.3 | PG · SG | PHI | 2020s |
| 15 | Tracy McGrady | 20.3 | SF · SG | ORL | 2000s |
| 16 | Kevin Durant | 20.3 | PF · SF · SG | BKN | 2020s |
| 17 | Kevin Durant | 19.9 | PF · SF · SG | OKC | 2010s |
| 18 | Magic Johnson | 19.8 | PG · SG · PF | LAL | 1990s |
| 19 | Shai Gilgeous-Alexander | 19.6 | PG · SG | OKC | 2020s |
| 20 | Kevin Durant | 19.5 | PF · SF · SG | GSW | 2010s |
| 21 | Allen Iverson | 19.4 | PG · SG | PHI | 2000s |
| 22 | Kobe Bryant | 19.2 | SG · SF | LAL | 2000s |
| 23 | Dwyane Wade | 19.2 | PG · SG | MIA | 2000s |
| 24 | Grant Hill | 19.0 | SF · SG | DET | 1990s |
| 25 | Kevin Durant | 19.0 | PF · SF · SG | PHX | 2020s |
| 26 | Fat Lever | 18.8 | PG · SG | DEN | 1990s |
| 27 | Jason Kidd | 18.6 | PG · SG | PHX | 2000s |
| 28 | Grant Hill | 18.6 | SF · SG | DET | 2000s |
| 29 | Fat Lever | 18.5 | PG · SG | DEN | 1980s |
| 30 | Julius Erving | 18.4 | SF · SG | PHI | 1970s |
| 31 | Damian Lillard | 18.4 | PG · SG | POR | 2020s |
| 32 | Kawhi Leonard | 18.4 | SF · SG · PF | TOR | 2010s |
| 33 | Marques Johnson | 18.3 | SF · SG | MIL | 1970s |
| 34 | Kyrie Irving | 18.2 | PG · SG | BKN | 2020s |
| 35 | Paul George | 18.2 | PF · SF · SG | OKC | 2010s |
| 36 | Clyde Drexler | 18.2 | SG · SF | POR | 1990s |
| 37 | Julius Erving | 18.1 | SF · SG | PHI | 1980s |

## PG — Point Guard

31 candidates · `val` 18.1–24.2 · 11 anchor-grade (★)

| # | Player | val | Positions | Team | Era |
|---:|---|---:|---|---|---|
| 1 | Russell Westbrook | 24.2 ★ | PG | WAS | 2020s |
| 2 | Giannis Antetokounmpo | 23.5 ★ | PF · PG · SF · C | MIL | 2020s |
| 3 | Luka Dončić | 23.4 ★ | PG · SG · SF | DAL | 2020s |
| 4 | Luka Dončić | 23.1 ★ | PG · SG · SF | LAL | 2020s |
| 5 | James Harden | 22.5 ★ | PG · SG | BKN | 2020s |
| 6 | Oscar Robertson | 22.2 ★ | PG | SAC | 1960s |
| 7 | LeBron James | 22.1 ★ | SF · PF · PG · C · SG | LAL | 2010s |
| 8 | LeBron James | 21.7 ★ | SF · PF · PG · C · SG | CLE | 2010s |
| 9 | James Harden | 21.3 ★ | PG · SG | HOU | 2010s |
| 10 | Magic Johnson | 21.1 ★ | PG · SG · PF | LAL | 1980s |
| 11 | LeBron James | 21.1 ★ | SF · PF · PG · C · SG | CLE | 2000s |
| 12 | LeBron James | 20.9 | SF · PF · PG · C · SG | MIA | 2010s |
| 13 | Jerry West | 20.9 | PG · SG | LAL | 1970s |
| 14 | Russell Westbrook | 20.7 | PG | OKC | 2010s |
| 15 | LeBron James | 20.4 | SF · PF · PG · C · SG | LAL | 2020s |
| 16 | James Harden | 20.3 | PG · SG | PHI | 2020s |
| 17 | Magic Johnson | 19.8 | PG · SG · PF | LAL | 1990s |
| 18 | Shai Gilgeous-Alexander | 19.6 | PG · SG | OKC | 2020s |
| 19 | Allen Iverson | 19.4 | PG · SG | PHI | 2000s |
| 20 | Dwyane Wade | 19.2 | PG · SG | MIA | 2000s |
| 21 | Trae Young | 18.9 | PG | ATL | 2020s |
| 22 | Fat Lever | 18.8 | PG · SG | DEN | 1990s |
| 23 | Gary Payton | 18.8 | PG | OKC | 2000s |
| 24 | Ben Simmons | 18.7 | PG | PHI | 2010s |
| 25 | Jason Kidd | 18.6 | PG · SG | PHX | 2000s |
| 26 | Chris Paul | 18.6 | PG | NOP | 2000s |
| 27 | Fat Lever | 18.5 | PG · SG | DEN | 1980s |
| 28 | Damian Lillard | 18.4 | PG · SG | POR | 2020s |
| 29 | Kyrie Irving | 18.2 | PG · SG | BKN | 2020s |
| 30 | Kevin Johnson | 18.2 | PG | PHX | 1980s |
| 31 | Isiah Thomas | 18.1 | PG | DET | 1980s |

## SF — Small Forward

40 candidates · `val` 18.1–23.5 · 10 anchor-grade (★)

| # | Player | val | Positions | Team | Era |
|---:|---|---:|---|---|---|
| 1 | Giannis Antetokounmpo | 23.5 ★ | PF · PG · SF · C | MIL | 2020s |
| 2 | Michael Jordan | 23.5 ★ | SG · SF | CHI | 1980s |
| 3 | Luka Dončić | 23.4 ★ | PG · SG · SF | DAL | 2020s |
| 4 | Luka Dončić | 23.1 ★ | PG · SG · SF | LAL | 2020s |
| 5 | Kevin Garnett | 22.5 ★ | C · PF · SF | MIN | 2000s |
| 6 | LeBron James | 22.1 ★ | SF · PF · PG · C · SG | LAL | 2010s |
| 7 | Larry Bird | 21.9 ★ | PF · SF | BOS | 1980s |
| 8 | LeBron James | 21.7 ★ | SF · PF · PG · C · SG | CLE | 2010s |
| 9 | Michael Jordan | 21.2 ★ | SG · SF | CHI | 1990s |
| 10 | LeBron James | 21.1 ★ | SF · PF · PG · C · SG | CLE | 2000s |
| 11 | Elgin Baylor | 21.0 | SF | LAL | 1960s |
| 12 | LeBron James | 20.9 | SF · PF · PG · C · SG | MIA | 2010s |
| 13 | Charles Barkley | 20.9 | PF · SF | PHX | 1990s |
| 14 | Charles Barkley | 20.8 | PF · SF | PHI | 1990s |
| 15 | Charles Barkley | 20.7 | PF · SF | PHI | 1980s |
| 16 | LeBron James | 20.4 | SF · PF · PG · C · SG | LAL | 2020s |
| 17 | Larry Bird | 20.4 | PF · SF | BOS | 1990s |
| 18 | Tracy McGrady | 20.3 | SF · SG | ORL | 2000s |
| 19 | Kevin Durant | 20.3 | PF · SF · SG | BKN | 2020s |
| 20 | Adrian Dantley | 20.1 | SF | IND | 1970s |
| 21 | Kevin Durant | 19.9 | PF · SF · SG | OKC | 2010s |
| 22 | Billy Cunningham | 19.9 | PF · SF | PHI | 1970s |
| 23 | Kevin Durant | 19.5 | PF · SF · SG | GSW | 2010s |
| 24 | Jayson Tatum | 19.4 | PF · SF | BOS | 2020s |
| 25 | Kobe Bryant | 19.2 | SG · SF | LAL | 2000s |
| 26 | Rick Barry | 19.1 | SF | GSW | 1970s |
| 27 | Grant Hill | 19.0 | SF · SG | DET | 1990s |
| 28 | Kevin Durant | 19.0 | PF · SF · SG | PHX | 2020s |
| 29 | Scottie Pippen | 18.7 | SF | CHI | 1990s |
| 30 | Grant Hill | 18.6 | SF · SG | DET | 2000s |
| 31 | Rick Barry | 18.6 | SF | GSW | 1960s |
| 32 | Larry Kenon | 18.6 | PF · SF | SAS | 1970s |
| 33 | Julius Erving | 18.4 | SF · SG | PHI | 1970s |
| 34 | Kawhi Leonard | 18.4 | SF · SG · PF | TOR | 2010s |
| 35 | David Lee | 18.3 | C · PF · SF | NYK | 2010s |
| 36 | Marques Johnson | 18.3 | SF · SG | MIL | 1970s |
| 37 | Terry Cummings | 18.2 | PF · SF | LAC | 1980s |
| 38 | Paul George | 18.2 | PF · SF · SG | OKC | 2010s |
| 39 | Clyde Drexler | 18.2 | SG · SF | POR | 1990s |
| 40 | Julius Erving | 18.1 | SF · SG | PHI | 1980s |

## PF — Power Forward

79 candidates · `val` 18.0–23.6 · 21 anchor-grade (★)

| # | Player | val | Positions | Team | Era |
|---:|---|---:|---|---|---|
| 1 | Bob McAdoo | 23.6 ★ | C · PF | LAC | 1970s |
| 2 | Giannis Antetokounmpo | 23.5 ★ | PF · PG · SF · C | MIL | 2020s |
| 3 | Nate Thurmond | 22.6 ★ | C · PF | GSW | 1970s |
| 4 | Kevin Garnett | 22.5 ★ | C · PF · SF | MIN | 2000s |
| 5 | LeBron James | 22.1 ★ | SF · PF · PG · C · SG | LAL | 2010s |
| 6 | Bob McAdoo | 22.1 ★ | C · PF | NYK | 1970s |
| 7 | Anthony Davis | 22.1 ★ | C · PF | DAL | 2020s |
| 8 | Bob Pettit | 22.0 ★ | C · PF | ATL | 1960s |
| 9 | Larry Bird | 21.9 ★ | PF · SF | BOS | 1980s |
| 10 | Chris Webber | 21.8 ★ | C · PF | SAC | 1990s |
| 11 | LeBron James | 21.7 ★ | SF · PF · PG · C · SG | CLE | 2010s |
| 12 | Elvin Hayes | 21.5 ★ | C · PF | WAS | 1970s |
| 13 | Elvin Hayes | 21.4 ★ | C · PF | HOU | 1960s |
| 14 | Dwight Howard | 21.4 ★ | C · PF | ORL | 2010s |
| 15 | Chris Webber | 21.2 ★ | C · PF | SAC | 2000s |
| 16 | Magic Johnson | 21.1 ★ | PG · SG · PF | LAL | 1980s |
| 17 | Karl Malone | 21.1 ★ | PF | UTA | 1990s |
| 18 | LeBron James | 21.1 ★ | SF · PF · PG · C · SG | CLE | 2000s |
| 19 | Patrick Ewing | 21.0 ★ | C · PF | NYK | 1990s |
| 20 | Truck Robinson | 21.0 ★ | PF | UTA | 1970s |
| 21 | Elvin Hayes | 21.0 ★ | C · PF | HOU | 1970s |
| 22 | LeBron James | 20.9 | SF · PF · PG · C · SG | MIA | 2010s |
| 23 | Charles Barkley | 20.9 | PF · SF | PHX | 1990s |
| 24 | Charles Barkley | 20.8 | PF · SF | PHI | 1990s |
| 25 | Anthony Davis | 20.8 | C · PF | LAL | 2020s |
| 26 | Charles Barkley | 20.7 | PF · SF | PHI | 1980s |
| 27 | Jerry Lucas | 20.7 | C · PF | SAC | 1960s |
| 28 | Anthony Davis | 20.7 | C · PF | NOP | 2010s |
| 29 | Domantas Sabonis | 20.7 | C · PF | IND | 2020s |
| 30 | Dave Cowens | 20.6 | C · PF | BOS | 1970s |
| 31 | Tim Duncan | 20.6 | C · PF | SAS | 2000s |
| 32 | Spencer Haywood | 20.5 | PF | OKC | 1970s |
| 33 | LeBron James | 20.4 | SF · PF · PG · C · SG | LAL | 2020s |
| 34 | Larry Bird | 20.4 | PF · SF | BOS | 1990s |
| 35 | Tim Duncan | 20.3 | C · PF | SAS | 1990s |
| 36 | Kevin Durant | 20.3 | PF · SF · SG | BKN | 2020s |
| 37 | George McGinnis | 20.2 | PF | PHI | 1970s |
| 38 | George McGinnis | 20.1 | PF | DEN | 1970s |
| 39 | Chris Webber | 19.9 | C · PF | WAS | 1990s |
| 40 | Kevin Durant | 19.9 | PF · SF · SG | OKC | 2010s |
| 41 | Billy Cunningham | 19.9 | PF · SF | PHI | 1970s |
| 42 | Magic Johnson | 19.8 | PG · SG · PF | LAL | 1990s |
| 43 | Domantas Sabonis | 19.7 | C · PF | SAC | 2020s |
| 44 | Karl-Anthony Towns | 19.5 | C · PF | MIN | 2010s |
| 45 | Kevin Durant | 19.5 | PF · SF · SG | GSW | 2010s |
| 46 | Truck Robinson | 19.5 | PF | ATL | 1970s |
| 47 | Jayson Tatum | 19.4 | PF · SF | BOS | 2020s |
| 48 | Anthony Davis | 19.1 | C · PF | WAS | 2020s |
| 49 | Sidney Wicks | 19.1 | PF | POR | 1970s |
| 50 | Karl-Anthony Towns | 19.1 | C · PF | NYK | 2020s |
| 51 | Patrick Ewing | 19.1 | C · PF | NYK | 1980s |
| 52 | Alonzo Mourning | 19.1 | C · PF | MIA | 1990s |
| 53 | Elton Brand | 19.0 | C · PF | LAC | 2000s |
| 54 | Kevin Durant | 19.0 | PF · SF · SG | PHX | 2020s |
| 55 | Alonzo Mourning | 19.0 | C · PF | CHA | 1990s |
| 56 | Kevin Love | 18.9 | C · PF | MIN | 2010s |
| 57 | Dwight Howard | 18.8 | C · PF | LAL | 2010s |
| 58 | Karl Malone | 18.7 | PF | UTA | 1980s |
| 59 | Spencer Haywood | 18.6 | PF | UTA | 1970s |
| 60 | Ralph Sampson | 18.6 | C · PF | HOU | 1980s |
| 61 | Larry Kenon | 18.6 | PF · SF | SAS | 1970s |
| 62 | Derrick Coleman | 18.5 | C · PF | BKN | 1990s |
| 63 | Chris Bosh | 18.5 | C · PF | TOR | 2010s |
| 64 | Julius Randle | 18.5 | C · PF | NYK | 2020s |
| 65 | Karl Malone | 18.4 | PF | UTA | 2000s |
| 66 | Nate Thurmond | 18.4 | C · PF | GSW | 1960s |
| 67 | Kawhi Leonard | 18.4 | SF · SG · PF | TOR | 2010s |
| 68 | Al Jefferson | 18.4 | C · PF | MIN | 2000s |
| 69 | Mickey Johnson | 18.3 | PF | IND | 1980s |
| 70 | David Lee | 18.3 | C · PF · SF | NYK | 2010s |
| 71 | Dwight Howard | 18.3 | C · PF | ORL | 2000s |
| 72 | Pau Gasol | 18.3 | C · PF | CHI | 2010s |
| 73 | Terry Cummings | 18.2 | PF · SF | LAC | 1980s |
| 74 | Karl-Anthony Towns | 18.2 | C · PF | MIN | 2020s |
| 75 | Paul George | 18.2 | PF · SF · SG | OKC | 2010s |
| 76 | Elvin Hayes | 18.1 | C · PF | WAS | 1980s |
| 77 | Chris Webber | 18.1 | C · PF | GSW | 1990s |
| 78 | Tom Chambers | 18.1 | PF | PHX | 1980s |
| 79 | Al Jefferson | 18.0 | C · PF | CHA | 2010s |

## C — Center

80 candidates · `val` 18.0–32.0 · 36 anchor-grade (★)

| # | Player | val | Positions | Team | Era |
|---:|---|---:|---|---|---|
| 1 | Wilt Chamberlain | 32.0 ★ | C | GSW | 1960s |
| 2 | Wilt Chamberlain | 28.8 ★ | C | PHI | 1960s |
| 3 | Kareem Abdul-Jabbar | 28.5 ★ | C | MIL | 1970s |
| 4 | Kareem Abdul-Jabbar | 26.7 ★ | C | LAL | 1970s |
| 5 | Nikola Jokić | 25.4 ★ | C | DEN | 2020s |
| 6 | Hakeem Olajuwon | 23.8 ★ | C | HOU | 1990s |
| 7 | Bob McAdoo | 23.6 ★ | C · PF | LAC | 1970s |
| 8 | Giannis Antetokounmpo | 23.5 ★ | PF · PG · SF · C | MIL | 2020s |
| 9 | David Robinson | 23.5 ★ | C | SAS | 1990s |
| 10 | DeMarcus Cousins | 23.4 ★ | C | NOP | 2010s |
| 11 | Moses Malone | 23.1 ★ | C | HOU | 1980s |
| 12 | Shaquille O'Neal | 23.1 ★ | C | ORL | 1990s |
| 13 | Wilt Chamberlain | 23.1 ★ | C | LAL | 1960s |
| 14 | Hakeem Olajuwon | 22.9 ★ | C | HOU | 1980s |
| 15 | Victor Wembanyama | 22.9 ★ | C | SAS | 2020s |
| 16 | Shaquille O'Neal | 22.8 ★ | C | LAL | 2000s |
| 17 | Nate Thurmond | 22.6 ★ | C · PF | GSW | 1970s |
| 18 | Kevin Garnett | 22.5 ★ | C · PF · SF | MIN | 2000s |
| 19 | Bill Russell | 22.2 ★ | C | BOS | 1960s |
| 20 | LeBron James | 22.1 ★ | SF · PF · PG · C · SG | LAL | 2010s |
| 21 | Bob McAdoo | 22.1 ★ | C · PF | NYK | 1970s |
| 22 | Anthony Davis | 22.1 ★ | C · PF | DAL | 2020s |
| 23 | Bob Pettit | 22.0 ★ | C · PF | ATL | 1960s |
| 24 | Shaquille O'Neal | 22.0 ★ | C | LAL | 1990s |
| 25 | Chris Webber | 21.8 ★ | C · PF | SAC | 1990s |
| 26 | Joel Embiid | 21.8 ★ | C | PHI | 2020s |
| 27 | LeBron James | 21.7 ★ | SF · PF · PG · C · SG | CLE | 2010s |
| 28 | Elvin Hayes | 21.5 ★ | C · PF | WAS | 1970s |
| 29 | Elvin Hayes | 21.4 ★ | C · PF | HOU | 1960s |
| 30 | Bill Walton | 21.4 ★ | C | POR | 1970s |
| 31 | Dwight Howard | 21.4 ★ | C · PF | ORL | 2010s |
| 32 | Bob Lanier | 21.2 ★ | C | DET | 1970s |
| 33 | Chris Webber | 21.2 ★ | C · PF | SAC | 2000s |
| 34 | LeBron James | 21.1 ★ | SF · PF · PG · C · SG | CLE | 2000s |
| 35 | Patrick Ewing | 21.0 ★ | C · PF | NYK | 1990s |
| 36 | Elvin Hayes | 21.0 ★ | C · PF | HOU | 1970s |
| 37 | LeBron James | 20.9 | SF · PF · PG · C · SG | MIA | 2010s |
| 38 | Artis Gilmore | 20.8 | C | CHI | 1970s |
| 39 | Joel Embiid | 20.8 | C | PHI | 2010s |
| 40 | Anthony Davis | 20.8 | C · PF | LAL | 2020s |
| 41 | Jerry Lucas | 20.7 | C · PF | SAC | 1960s |
| 42 | Anthony Davis | 20.7 | C · PF | NOP | 2010s |
| 43 | Domantas Sabonis | 20.7 | C · PF | IND | 2020s |
| 44 | Dave Cowens | 20.6 | C · PF | BOS | 1970s |
| 45 | Tim Duncan | 20.6 | C · PF | SAS | 2000s |
| 46 | Moses Malone | 20.6 | C | PHI | 1980s |
| 47 | LeBron James | 20.4 | SF · PF · PG · C · SG | LAL | 2020s |
| 48 | Tim Duncan | 20.3 | C · PF | SAS | 1990s |
| 49 | Moses Malone | 20.2 | C | HOU | 1970s |
| 50 | Wilt Chamberlain | 20.1 | C | LAL | 1970s |
| 51 | Chris Webber | 19.9 | C · PF | WAS | 1990s |
| 52 | Walt Bellamy | 19.9 | C | WAS | 1960s |
| 53 | Domantas Sabonis | 19.7 | C · PF | SAC | 2020s |
| 54 | Karl-Anthony Towns | 19.5 | C · PF | MIN | 2010s |
| 55 | Anthony Davis | 19.1 | C · PF | WAS | 2020s |
| 56 | Karl-Anthony Towns | 19.1 | C · PF | NYK | 2020s |
| 57 | Patrick Ewing | 19.1 | C · PF | NYK | 1980s |
| 58 | Alonzo Mourning | 19.1 | C · PF | MIA | 1990s |
| 59 | Bob Lanier | 19.0 | C | DET | 1980s |
| 60 | Elton Brand | 19.0 | C · PF | LAC | 2000s |
| 61 | Alonzo Mourning | 19.0 | C · PF | CHA | 1990s |
| 62 | DeMarcus Cousins | 18.9 | C | SAC | 2010s |
| 63 | Kevin Love | 18.9 | C · PF | MIN | 2010s |
| 64 | Dwight Howard | 18.8 | C · PF | LAL | 2010s |
| 65 | Dikembe Mutombo | 18.6 | C | DEN | 1990s |
| 66 | Ralph Sampson | 18.6 | C · PF | HOU | 1980s |
| 67 | Derrick Coleman | 18.5 | C · PF | BKN | 1990s |
| 68 | Chris Bosh | 18.5 | C · PF | TOR | 2010s |
| 69 | Julius Randle | 18.5 | C · PF | NYK | 2020s |
| 70 | Rudy Gobert | 18.4 | C | UTA | 2020s |
| 71 | Nate Thurmond | 18.4 | C · PF | GSW | 1960s |
| 72 | Al Jefferson | 18.4 | C · PF | MIN | 2000s |
| 73 | David Lee | 18.3 | C · PF · SF | NYK | 2010s |
| 74 | Elmore Smith | 18.3 | C | LAL | 1970s |
| 75 | Dwight Howard | 18.3 | C · PF | ORL | 2000s |
| 76 | Pau Gasol | 18.3 | C · PF | CHI | 2010s |
| 77 | Karl-Anthony Towns | 18.2 | C · PF | MIN | 2020s |
| 78 | Elvin Hayes | 18.1 | C · PF | WAS | 1980s |
| 79 | Chris Webber | 18.1 | C · PF | GSW | 1990s |
| 80 | Al Jefferson | 18.0 | C · PF | CHA | 2010s |

---

*Generated by `scripts/list-team-candidates.mjs` from `src/data/players.json` (`val` ≥ 18). For the scoring formula, the position-scarcity data behind the section order, and the playing strategy that uses this pool, see [LLP 0001](./0001-82-0-team-strategy.spec.md) and [LLP 0003](./0003-how-to-go-82-0.guide.md).*
