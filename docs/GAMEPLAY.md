# Gameplay systems

## Green-bar shooting

The shot meter is the game. Everything else exists to put you in a position to release it
cleanly or to stop someone else from doing so.

### The profile

When you press shoot, the player enters the `shooting` state and a `ShotProfile` is
recomputed **every frame** until release. That is deliberate: the green band is not
locked in at launch, so a defender arriving mid-animation visibly squeezes it and you can
decide to ride the shot out or eat the contest.

```
greenSeconds = animationWindow
             × shotTypeModifier
             × ratingMultiplier      0.55 (25 rated) … 1.55 (99 rated)
             × staminaMultiplier     collapses below 55% stamina
             × contestMultiplier     up to −50%, softened by Deadeye
             × driftMultiplier       moving hurts, Set Shooter rewards standing still
             × badgeMultiplier       situational badges
```

At 85 Three Point, open, full stamina, on the default animation, that is roughly a 60 ms
window on a 620 ms meter — about 5% of the bar on each side of the release point. Good
players green 25–35% of their shots; the bot-versus-bot balance suite settles at 16%.

### Resolution

The ideal release sits at 86% of the animation, so the bar reads like a real shooting
motion rather than a stopwatch.

| Band | Condition | Make chance |
| --- | --- | --- |
| **Green** | within the green half-width | 100%, unless heavily contested (>0.72), where it falls to 55–75% |
| **Excellent** | within green + 6% of the bar | interpolates from 80% of the green chance down to the base chance |
| **Early / Late / Wild** | beyond that | falls off toward roughly 28% of the base chance |

The base chance for a non-perfect shot comes from the governing rating (0.20 at 25 rated
to 0.62 at 99), then contest, distance falloff beyond your range, stamina and the shot
type all apply. A guaranteed green is the reward for perfect timing; everything else is a
percentage.

The signed timing error is preserved through to the ball's flight — an early release
lands long off the back rim, a late one is short. You can read your mistake from the
bounce without looking at the meter.

### Jump shots

Six animations, each a genuine trade rather than a strict upgrade:

| Animation | Release | Base window | Character |
| --- | --- | --- | --- |
| Base Rise | 620 ms | 46 ms | The default. Balanced and forgiving. |
| Metronome | 840 ms | 68 ms | Widest window in the game, slow enough to contest. |
| High Tower | 780 ms | 58 ms | Sky-high release that shrugs off contests. |
| Silk | 580 ms | 41 ms | Very stable while drifting. |
| Whip | 500 ms | 33 ms | Snappy; great off stepbacks. |
| Quick Trigger | 440 ms | 27 ms | Fastest release, tightest window. |

Quick Draw shortens the animation without shrinking the window, which is the badge that
makes a slow, forgiving animation viable at a high level.

### Contest

Contest is computed from geometry, not from a flag, so the server can recompute it from
authoritative positions:

```
proximity^1.35 × defenderRating × badges × handUp × airborne × facing × (1 − stagger) × heightAdvantage
```

Nothing is contested beyond 8 feet. A defender with a hand down contests at 55% strength.
A broken-down defender contests at almost nothing, which is what makes an ankle breaker
worth chasing.

## Movement and stamina

Top speed runs 13.5–21.5 ft/s from Speed, with a weight drag term. Acceleration governs
how fast you reach it. Carrying the ball costs ~6%, partly recovered by Speed Booster.

Stamina drains at 0.085/s sprinting (scaled by the Stamina rating, so a 99 drains at 58%
the rate of a 25), recovers at 0.115/s when walking, and trickles back passively.
Below 55% the green window starts collapsing and top speed begins to fall. Iron Lungs
recovers most of the shooting penalty; Handles For Days cuts the cost of dribble moves.

This is the main pacing lever: sprinting everywhere is the fastest way to lose the ability
to shoot.

## Dribbling

Twelve moves, each defined by duration, cancel point, burst, lateral displacement,
retreat, stamina cost, ankle-breaker base rate and a "misdirection" factor.

Signature moves are gated on Ball Handle: Spin at 68, Double Crossover at 74, Snatch Back
at 78, Fake Pull-Through at 82.

Moves with a `followUp` cancel directly into a shot once past their cancel point —
stepback and snatch back into a stepback jumper, hop jumper into a hop shot, eurostep into
a euro layup. Chaining raises a combo counter that feeds Tight Handles and adds a small
bonus to the next ankle-breaker roll.

### Ankle breakers

```
chance = base × misdirection
       × (0.35 + ballHandleVsPerimeterD × 1.6)
       × (0.4 + defenderWrongWayMomentum)
       × (0.45 + proximity)
       + comboBonus
```

The defender's own momentum is the biggest term. Committing hard in the wrong direction
is what gets you broken down, which means the counter-play is real: stay balanced, do not
over-commit to the first move in a chain. A successful break staggers the defender for
0.5–1.15 s with their control cut by 85%.

Tuned to roughly one per game between evenly matched players, not one per possession.

## Finishing

`E` near the rim picks a finish from context. A dunk needs 60 Dunk, 55 Vertical, and
either a gather of speed or a standing leaper's rating right under the basket; otherwise
you get a layup, floater or eurostep finish, all of which run through the normal shot
meter with a wider window.

A contact dunk requires a contact-capable dunk package and a defender inside 3.4 feet,
then rolls your Dunk/Strength/Vertical and Contact Finisher against their Interior
Defense/Strength and Rim Protector. It knocks the defender back and finishes at ~97%.

## Defense

- **Body up.** Inside 1.75 feet the two players resolve a push contest weighted by
  Strength, Perimeter Defense, Bully and Immovable. The winner keeps their ground; the
  handler loses speed and stamina. Menace drains the handler faster.
- **Contest.** `Space` without the ball jumps. A hand up matters even without leaving the
  floor, and jumping too early leaves you airborne while the shot goes up late.
- **Blocks.** Resolved at the shot's release point from block power versus escape power,
  scaled by reach advantage and distance. A trailing defender closing at speed on a rim
  attempt gets the chase-down bonus, which Chase-Down Artist extends.
- **Steals.** `F` reaches in. The handler is 45% more vulnerable mid-dribble-animation and
  40% less vulnerable while shooting. A failed reach staggers you for 0.32 s and puts the
  attempt on a 1.25 s cooldown — the risk is real.
- **Rebounds.** A miss produces a physical carom off the rim. Both players have a grab
  radius from Rebounding and Rebound Chaser; contested boards resolve by weight from
  Rebounding, Vertical, Strength, height and whether you left the floor.

## Rules

Half court, make-it-take-it, 14-second shot clock. Twos from behind the arc, ones inside.
First to 11, win by 2, hard cap at 15.

After a change of possession or an offensive rebound the ball must be taken back past the
arc before it can be scored; the HUD calls this out and shots are suppressed until you
clear. A shot already in the air beats the shot-clock buzzer.

## AI

The bot is not a cheating mirror of your inputs. It reads a **lagged** copy of your
position from a rolling history buffer — 340 ms at Rookie down to 100 ms at Legend — so
a well-timed hesitation genuinely beats it.

| Difficulty | Reaction | Standoff | Contest IQ | Release error |
| --- | --- | --- | --- | --- |
| Rookie | 340 ms | 4.6 ft | 30% | ±30% |
| Pro | 260 ms | 3.9 ft | 48% | ±20% |
| All-Star | 190 ms | 3.3 ft | 64% | ±13% |
| Superstar | 140 ms | 2.8 ft | 78% | ±8.5% |
| Legend | 100 ms | 2.4 ft | 90% | ±5.5% |

On defense it predicts where you are going (scaled by its help IQ), positions between you
and the rim, contests jumpers on a timing read, protects the rim, and gambles for strips
mostly while you are mid-animation.

On offense its willingness to shoot rises with how much space you give it and with shot
clock pressure, so possessions resolve. It commits to drives for a full second rather than
re-deciding every frame, uses dribble moves at a difficulty-scaled rate, and attacks
immediately when it breaks you down.

**Adaptive difficulty** tracks the score margin and a rolling estimate of your green rate,
then nudges reaction time, standoff, contest IQ, release error and shot selection by up to
±22%. It tightens when it is losing badly or you are shooting well, and loosens when it is
running away with the game — but it is capped so it never becomes a different difficulty
than the one you selected.
