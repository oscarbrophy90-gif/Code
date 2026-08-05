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

## Speed With Ball

Raw **Speed** is your open-floor speed. **Speed With Ball** is what you keep of it while
dribbling, and it also sets how fast you can throw moves: 0.66× top speed with a 300 ms
cooldown and a 1.25× slower animation at 25 rated, up to full speed with a 50 ms cooldown
and a 0.72× animation at 99. A guard can put the ball through his legs three times in the
time a centre labours through one, which is what makes chained through-the-legs into an
ankle breaker a guard's move.

It deliberately pulls against **Ball Handle**: Speed With Ball buys you more moves, and
every move is another fumble check. Fast hands with no control is a liability, not a build.

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

The ball's position during a move is driven by the sim, not decorated by the renderer, so
what you see is the move: a between-the-legs drops the ball to the floor and back up while
the feet split wide, a crossover whips it across the body in the direction you aimed, a
hesitation lifts it over the head with the arms rising, a behind-the-back takes it round
the waist and a spin carries it all the way around. `placeHeldBall()` owns this.

**Hands.** The ball lives in one hand and moves change which. A crossover and a
behind-the-back put it on the side you aimed at, so J finishes right and L finishes left;
through-the-legs simply alternates, so pressing it again sends the ball back the other
way. A crossover is drawn as the lie it is — the ball goes to the fake side first and then
whips across.

**Fumbles.** Halfway through a move — the moment the ball is most exposed — a handle
check runs. It is roughly `(1 − skill)² × 0.16` against Ball Handle, multiplied up by
signature moves, by each move already in the chain, and by up to 1.8× for a defender in
your chest; Tight Handles and Handles For Days pull it back down. Lose it and the ball
squirts loose in the direction it was travelling with you staggered, so the defender has a
real shot at it. A 30 Ball Handle build spamming crossovers under pressure coughs it up
several times a game; a 95 build is effectively clean. That is what stops move-spam being
free.


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

## Dunking

Sprint into the rim with the ball and hold shoot: the meter runs and you go up
with it. **Green it and the game cuts away** to your equipped dunk package played
out at size — skippable with any key or a tap, and skipped entirely if reduced
motion is on. The same renderer draws the looping preview in the Locker, so what
you see there is what you get.

A defender who leaves his feet at you squeezes the window by a further 45% on top
of the ordinary contest, which on a hard closeout leaves almost nothing. Hit it
anyway and it is a **poster**: contact-dunk credit, a different cutaway, and the
defender lands on the floor. Miss and the ball clangs off the iron and goes
fifteen feet in the air before coming down live.

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

## Getting broken down

Every ankle breaker on the same defender inside a six-second window counts. The
**third one in a row puts him on the floor** — a `fallen` state he cannot move,
contest or block out of for 1.75 seconds. Contest goes to zero, which means the
green window opens to whatever your rating actually allows: a 90 Three Point
shooter gets an enormous band, a 40 gets a slightly less awful one and should
still drive. Being posterised drops you too, for a shorter beat.

## Rules

Half court, make-it-take-it, 14-second shot clock. Twos from behind the arc, ones inside.
First to 11, win by 2, hard cap at 15.

**A takeaway ends the possession; a miss goes to the glass.** Get blocked or get stripped
and the ball is the defender's outright — you have to earn those, so they are not a
scramble the shooter can win back. A *miss* caroms off the iron and hangs high, and both
players can go up and take it out of the air. Make a shot and you keep it.

Winning the board is two checks. First proximity and reach decide who gets a hand on it,
weighted by Offensive or Defensive Rebound, Vertical, Strength, height and whether you
left the floor. Then a *secure* roll decides whether you come down with it: about 42% at
25 rated up to 92% at 99, plus Box Out, Strength and a bonus for being in the air. Fail it
and you tip the ball away and it stays live. A weak board man really does bobble them.

After a change of possession or an offensive rebound the ball must be taken back past the
arc before it can be scored; the HUD calls this out and shots are suppressed until you
clear. A shot already in the air beats the shot-clock buzzer.

**Checking in.** A game does not start until you check the ball. Both players stand still
— movement is zeroed, not just actions — and the HUD says *Press space bar to check*. One
press runs the whole ceremony: a bounce pass out to the other player, a bounce pass back,
then the clock starts. The pass swings wide of the line between the two so it is not
hidden behind a body. Nothing either player presses during the ceremony does anything
else, and the press that started it is swallowed until released (`checkGuard`), so
checking in can never turn into a jump or a shot. The CPU never checks in for you.

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
