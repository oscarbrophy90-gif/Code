# Progression and economy

## The rule everything follows

**Coins buy cosmetics and attributes. Money buys cosmetics.** There is no path that
converts a payment into a rating, a badge tier or a competitive advantage, and the code is
structured so that adding one later would require deliberately breaking the separation:
attribute purchases are a server-side `attribute_purchase` row backed by a
`currency_ledger` entry whose only sources are gameplay.

The premium battle pass sells cosmetics, an XP boost, and a small currency bonus that is
also capped by the same lengthFactor as every other reward. It cannot raise a rating.

## Attribute caps

A build's body determines what it can become. Nineteen attributes each get a hard ceiling
derived from height, weight, wingspan and position:

```
h    = (height − 78) / 12          6'6" is neutral
w    = (weight − 215) / 75
span = (wingspan − height) / 9

threePoint  = 99 − h·26 − max(0, w)·10
ballHandle  = 99 − h·30 − max(0, w)·14
speed       = 99 − h·18 − max(0, w)·16
offReb      = 60 + h·28 + w·15 + span·8
defReb      = 64 + h·27 + w·13 + span·8
closeShot   = 92 + h·8  + max(0, w)·4 − max(0, −h)·10
block       = 60 + h·28 + span·12
interiorD   = 66 + h·24 + w·14 + span·6
…
```

Position then applies a modest bias (a PG gets +5 Ball Handle and −7 Offensive Rebound, a C
gets +6 Block and −8 Ball Handle), so position choice matters without any one position
dominating.

The practical effect, measured in the test suite:

| | 6'0" 175 lb PG | 7'2" 270 lb C |
| --- | --- | --- |
| Ball Handle cap | 99 | 55 |
| Three Point cap | 99 | 55 |
| Defensive Rebound cap | 55 | 99 |
| Block cap | 55 | 99 |

A guard and a big genuinely cannot do each other's job. Wingspan is the interesting lever:
it buys defensive reach, blocks and rebounding without costing speed, and does nothing at
all for shooting.

## Overall rating

Attributes are averaged with position weights (a PG weights Ball Handle 1.5 and Three
Point 1.35; a C weights Defensive Rebound 1.5 and Interior Defense 1.45), then the useful band is
mapped onto 60–99:

```
overall = 60 + clamp01((weighted − 41) / (92 − 41)) × 39
```

Every build starts at **exactly 60 overall**. Rather than a fixed fraction toward the
cap — which lands different body types on different overalls — the starting fraction is
solved per build by binary search until `computeOverall` returns exactly 60. A guard and
a centre therefore begin equal in total and different in shape, which is the point. A
fully maxed focused build lands in the mid-to-high 90s.

The nineteen attributes are Close Shot, Mid Range, Three Point, Free Throw, Layup, Dunk,
Ball Handle, Pass Accuracy, Speed, Acceleration, Strength, Vertical, Stamina, Perimeter
Defense, Interior Defense, Steal, Block, Offensive Rebound and Defensive Rebound.

Rebounding is split because the two halves are genuinely different skills: chasing your
own miss is scored on Offensive Rebound, closing the possession on Defensive Rebound, and
the simulation picks the right one based on who took the shot.

## Upgrade costs

```
cost(v → v+1) = (120 + (v + 1 − 40)^1.85 × 0.85) × capPressure
capPressure   = 1 + max(0, 1 − (cap − v) / 12) × 1.35
```

The `capPressure` term makes the last twelve points toward a ceiling up to 2.35× more
expensive, so pushing a secondary skill to its cap is a real decision rather than a
formality.

Measured on an SG build (6'6", 205 lb, 6'10" wingspan) across all nineteen attributes:

| | Cost | At ~2,000 Coins/game |
| --- | --- | --- |
| Max eight core attributes | ~410,000 Coins | ~205 games |
| Max all nineteen (60 → high 90s) | ~640,000 Coins | ~320 games |

Roughly a season of steady play to reach a competitive build, with a long tail for the
last few points. Fast enough that progress is visible every session; slow enough that a
maxed build means something.

## Badges

Forty badges across Shooting, Finishing, Playmaking and Defense, each with five tiers —
Bronze, Silver, Gold, Hall of Fame, Legend.

A badge levels up **only** by doing the thing it improves. `Deadeye` climbs on contested
makes, `Ankle Taker` on breaking defenders down, `Chase-Down Artist` on chase-down blocks.
Progress is awarded by the simulation itself through `awardBadgeProgress(event)`, so it can
never be farmed by anything other than real play.

Each tier is also gated on an attribute. Deadeye needs 62 Three Point for Bronze and 93 for
Legend; you can accumulate progress but you will not promote past your ratings. This
deliberately couples the two systems: badges and attributes pull in the same direction, and
a build with maxed ratings and no badges is as incomplete as the reverse.

Badge strength scales 0.2 / 0.4 / 0.62 / 0.82 / 1.0 across the tiers and is consumed
multiplicatively by the simulation — a Legend Deadeye cuts the contest penalty on your
green window by 55% and softens the make-percentage penalty by 45%.

## Level and XP

Fifty levels on a `1400 × (level − 1)^1.42` curve. Levels gate park access (Night Park at
4, Rooftop at 8) and act as a general career-age signal. They do not gate ratings.

## Match rewards

```
Match played       220 × playlist
Victory            380 × playlist
Buckets            26 per point
Greens             34 per green
Defense            40/steal, 45/block, 18/rebound
Highlights         55/ankle breaker, 70/contact dunk, 80/chase-down
Turnovers          −22 each
Sharpshooter       260 at 50%+ green rate on 6+ attempts
Shutout            300
Win streak         90 × min(5, streak)
```

Events pay 1.15×, and practice-gym runs 0.25× so the no-defender mode cannot be farmed.
Everything is then scaled by `lengthFactor = clamp(duration / 150s, 0.25, 1)`, which is
what stops a 30-second quit from paying like a full game.

A win lands around 1,800–2,600 Coins and a similar amount of XP.

## Seasons

Eight weeks, measured deterministically from a fixed epoch so the client and server always
agree on which season it is without a round trip.

At the roll the battle pass resets. Career statistics and the difficulty ladder do not —
a cleared difficulty stays cleared, because it is a record of something you actually did.

The battle pass is 40 tiers at 2,400 XP each. The free track carries currency at every tier
and a cosmetic every tenth, so a non-paying player finishes a season with new gear. The
premium track adds cosmetics, animations, courts and XP boosts.

## Challenges

Daily, weekly and seasonal challenges are generated deterministically from the calendar
(`Rng(hash("daily-" + dayIndex))`), so every player worldwide sees the same board and the
client can render it offline. Progress is tracked locally and validated server-side against
match results.

Three dailies (450–800 Coins), three weeklies (2,200–4,000 Coins) and four seasonal
objectives (9,000–15,000 Coins).

## Why this is not pay-to-win

1. Attributes come only from `currency_ledger` rows whose reasons are gameplay events.
2. The premium pass grants cosmetics, boosts and a bounded currency bonus — never ratings.
3. Badges cannot be bought at any price; they require the underlying attribute *and* the
   gameplay to earn them.
4. The game is single-player, so there is no opponent for a spender to gain an advantage
   over. Difficulty, not other players, is the thing you measure yourself against.
5. Build caps mean there is no universally dominant build to spend toward — a maxed guard
   still loses the paint to a maxed centre.
