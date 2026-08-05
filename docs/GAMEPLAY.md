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

| Band | Bar colour | Make chance |
| --- | --- | --- |
| **Green** | green | 100%. Always. No hidden roll, no contest that takes it away. |
| **Excellent** | green | 100%. Near enough to perfect that it also drops, every time. |
| **Slightly early / late** | white | The only roll in the game. Scaled by how open you are: wide open a good shooter converts most of them, a hand in your face takes it to zero. |
| **Early / Late** | orange | Miss. |
| **Very early / very late** | red | Miss. |

On release the whole meter floods with that colour, so you know what happened
before the ball lands: green is already in, white is live, orange and red are
not.

Only the white band is a percentage, and openness is what decides it: the base runs from
0.42 at 25 rated to 0.92 at 99, multiplied by `1 − contest × 1.55`, so any real contest
zeroes it outright. Distance beyond your range, stamina and the shot type apply on top.
Everything else is binary — green and excellent always score, orange and red never do.

Contest does not touch a green's make chance — it attacks the window instead. A defender
who leaves his feet without blocking the shot narrows the green half-width by up to 68%,
scaled down by your Three Point / Mid Range rating, so a great shooter keeps a usable
window under pressure and a poor one is left with almost nothing. That is the whole
mechanic: contest makes greens *harder to hit*, never less likely to go in once hit.

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

Which rating governs a shot depends on where it comes from: **Layup** for drives and
eurosteps, **Close Shot** for floaters and any jumper inside ten feet, **Mid Range**
outside that, **Three Point** past the arc, **Dunk** for throw-downs and **Free Throw**
at the stripe.

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
- **Rebounds.** A miss produces a physical carom off the rim. Which rating applies depends
  on who shot it: chasing your own miss uses **Offensive Rebound**, everything else uses
  **Defensive Rebound**. Contested boards resolve by weight from that rating, Vertical,
  Strength, height and whether you left the floor.

## Rules

Half court, make-it-take-it, 14-second shot clock. Twos from behind the arc, ones inside.
First to 11, win by 2, hard cap at 15.

**Possession changes on every failure.** Miss a shot, get blocked, or get stripped and the
ball goes straight to the other player — there is no scramble for the loose ball. Make a
shot and you keep it. That is `turnoverOnMiss` in `MatchConfig`, and it routes through a
single `changePossession()` so the three cases cannot drift apart.

After a change of possession or an offensive rebound the ball must be taken back past the
arc before it can be scored; the HUD calls this out and shots are suppressed until you
clear. A shot already in the air beats the shot-clock buzzer.

**Checking in.** A game does not start until you check the ball — the HUD says *Press
space bar to check*, and it is the same button whether it is your ball or you are
checking it back. Nothing runs on a timer: the CPU never checks in for you, so the clock
starts when you say it does. Whichever button press checks the ball in is swallowed, so
holding it never launches a shot on the first live frame (`checkGuard` in `MatchState`).

**Practice is not a game.** The gym and the training drills set `manualCheck: false` and
`instantInbound: true`: there is nothing to check in, and the ball is back in your hands
the instant a shot drops or misses. Chasing a carom across an empty gym is not a drill,
and the drill clock should be spent on reps. A real game keeps both off — a make or a
miss there still goes to a dead ball and a check.

## Fouls and free throws

A defender who leaves his feet into a finisher gives up a shooting foul. Rates are
deliberately low — around 1.8 fouls per game — so a foul punishes a reckless contest
rather than interrupting the flow.

```
chance  = 0.17 at the rim (0.08 outside) if the defender is airborne
        + 0.05 within two feet
        + 0.04 if the defender is already beaten
chance *= 1 − discipline        Interior Defense and Immovable reduce it
```

Inside the arc is one free throw, behind it is two, each worth a point. Free throws run
through the same meter with no contest, no drift and a window scaled by the **Free
Throw** rating — the one shot in the game that is purely your timing. A make keeps the
ball under make-it-take-it; a miss on the last attempt is a live rebound off the rim.

## AI

Six difficulties, and they are not one bot with a multiplier. The levers that change how
a game *feels* are reaction time (can you beat it with a move?), release error (does it
punish you?), the move pool (what can it do to you?) and tendency reading (does it
learn?).

| Difficulty | Reaction | Standoff | Release error | Moves | Reads you |
| --- | --- | --- | --- | --- | --- |
| Rookie | 420 ms | 5.2 ft | ±34% | basic only, no chaining | no |
| Semi-Pro | 320 ms | 4.4 ft | ±24% | basic, chains 2 | no |
| Pro | 250 ms | 3.8 ft | ±17% | advanced, chains 2 | a little |
| All-Star | 190 ms | 3.2 ft | ±11.5% | advanced, chains 3 | yes |
| Superstar | 140 ms | 2.7 ft | ±7.5% | signature, chains 3 | strongly |
| Hall of Fame | 95 ms | 2.3 ft | ±4.5% | signature, chains 4 | fully |

Higher difficulties also field a slightly better build — from −8 OVR at Rookie to +9 at
Hall of Fame — so the level changes both the opponent and the player behind it.

Measured against a **constant reference opponent** over 40 games each:

| | Rookie | Semi-Pro | Pro | All-Star | Superstar | Hall of Fame |
| --- | --- | --- | --- | --- | --- | --- |
| You win | 93% | 85% | 63% | 35% | 13% | 3% |
| CPU FG% | 22.5 | 27.9 | 31.2 | 46.4 | 61.8 | 71.3 |
| CPU green% | 5.4 | 10.6 | 13.1 | 23.6 | 35.2 | 49.6 |
| CPU moves/game | 5.2 | 6.2 | 7.1 | 9.8 | 11.7 | 14.9 |

Rookie genuinely "misses open shots often" at 22.5%; Hall of Fame genuinely plays like a
strong competitor at 71%. This curve is asserted in the test suite, so a balance change
that flattens it fails CI.

### Perception

The bot reads a **lagged** copy of your position from a rolling history buffer rather
than the current frame. That is what makes a hesitation or a well-timed combo work: at
Rookie you have 420 ms of lie in your favour, at Hall of Fame only 95 ms.

It also bites on pump fakes in proportion to difficulty — 75% at Rookie down to 9% at
Hall of Fame — so a fake is a real tool early and nearly wasted late.

### The scouting report

Every shot you take updates two rolling averages: what share come from behind the arc,
and what share attack the rim. From All-Star upward the bot acts on it:

```
standoff −= (threeRate − 0.4) × tendencyRead × 2.2   // crowd a shooter
standoff += (driveRate − 0.3) × tendencyRead × 1.6   // sag off a slasher
```

Spam threes against Superstar and it starts closing out past the arc, which opens the
drive. Live on drives and it walls up the paint, which opens the jumper. The
counter-play is to actually vary your shot selection.

### Adaptive difficulty

On top of that, the bot tracks the score margin and a rolling estimate of your green
rate, then nudges reaction time, standoff, contest IQ, release error and shot selection
by up to ±22%. It tightens when it is losing badly or you are shooting well, and loosens
when it is running away with the game — capped so it never becomes a different
difficulty than the one you chose.

### Offense

Willingness to shoot rises with the space you give it and with shot-clock pressure, so
possessions resolve. It commits to drives for a full second rather than re-deciding every
frame, picks moves from a difficulty-gated pool, and attacks immediately when it breaks
you down. It shoots its own free throws with a tighter error than in open play, because a
stationary uncontested shot is its best look of the game.
