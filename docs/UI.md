# Interface

## Visual language

Dark stadium base, one hot accent, angular clipped panels, heavy compressed type. The
palette is deliberately narrow so that green — the colour of a perfect release — is never
competing with anything else on screen.

```
--bg      #07090e    near-black stadium base
--panel   #141924    elevated surface
--line    #2a3346    hairline borders
--text    #eef2f8

--green   #3ef07a    perfect release. Reserved.
--orange  #ff7a3d    primary accent, All-Star
--amber   #ffc53d    currency, contested green
--blue    #4aa3ff    Rookie, blocks
--purple  #a06bff    parks, Superstar
--red     #ff4d5e    danger, low stamina
```

Panels use a clipped corner (`clip-path` notching the top-right and bottom-left) which
reads as sports-broadcast furniture without needing any image assets. Section headers are
11px, 900 weight, 0.18em tracking, uppercase, with a rule that fills the remaining width.

Nothing in the interface is an image file. Player portraits are drawn from build data,
team crests from a `{shape, glyph, motif}` descriptor, and the favicon is an inline SVG
data URI.

## Layout

A fixed top bar (brand, nav, level/Coins/highest-difficulty chips) over a single scrolling
screen host. Screens are plain DOM; only the match is a canvas.

```
┌──────────────────────────────────────────────────────────────┐
│ ◉ HOOPS ELITE  HOME PLAY MYPLAYER PARKS …  LV 12 24,850 All-Star│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─ player card ─────────────┐  ┌─ season ──────────────┐   │
│   │ [portrait]  Rookie    61  │  │ S4: Skyline           │   │
│   │ SG 6'5" 200lb      OVR    │  │ ▓▓▓▓▓▓░░░  12d 22h    │   │
│   │ LV 1  ▓▓▓░░░░░░           │  └───────────────────────┘   │
│   └───────────────────────────┘  ┌─ career ladder ───────┐   │
│   ┌─ 1v1 vs CPU ──────────────┐  │ ⬡ All-Star  3/6 clear │   │
│   │ Six difficulties.         │  └───────────────────────┘   │
│   └───────────────────────────┘  ┌─ daily challenges ────┐   │
│   ┌ PRACTICE  ┐ ┌ RECORDS  ┐     │ Land 3 chase-downs    │   │
│   └───────────┘ └──────────┘     └───────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

Mode tiles and difficulty cards carry a `--tint` custom property that drives the glow, the
accent colour and the hover border, so a new mode or difficulty is one call with a colour.
The six difficulties run cool to hot — blue for Rookie through pink for Hall of Fame — so
the ladder reads as a temperature before you read a word of it.

Attribute graphs are drawn on canvas as a seven-axis radar: the filled green polygon is
what you are, the dashed orange outline is your build's ceiling. Nineteen attributes do
not fit on a radar legibly, so each axis averages a related group.

## Screens

| Screen | Purpose |
| --- | --- |
| **Home** | Player card, mode tiles, season banner, career ladder, live events, daily challenges, career summary. |
| **Play** | The six-difficulty picker, each card showing its traits, a difficulty meter and your record on it; the selected level expands into what it actually does. Plus the practice gym, event list, court selection, career ladder and rules. |
| **Practice Gym** | Two halves. *Shoot around* is an empty gym — no defender, no shot clock, no score, no payout. *Training Skills* is four timed drills (three-point, layup, blocking & stealing, defending) with bronze/silver/gold rep tiers, a saved personal best per drill, and a payout per rep. |
| **Locker** | Everything you own grouped into Identity, Kit, Accessories, Animations and Flair, with a walkout preview at the top showing your equipped title and win-streak tag. One tap equips. |
| **MyPlayer** | Three tabs. *Attributes* opens with a radar graph of your spread against your build ceiling, then all nineteen ratings with the cap marked in red and the exact upgrade price. *Badges* shows all forty with tier, progress and gating attribute. *Animations* covers jump shots, dunk packages and the equipped loadout. |
| **Builder** | Save slots, body sliders with live cap recalculation, jersey number, appearance, accessories, templates, a live radar graph, and a "what this build does well" grading panel. |
| **Parks** | Five parks with a walk-around top-down hub — WASD or drag to move, step onto a court ring to start a run. |
| **Season** | Battle pass with both tracks and per-tier claiming, the challenge board — weeklies pay a cosmetic and seasonals pay a title on top of coins and XP — and end-of-season rewards. |
| **Store** | Thirteen cosmetic categories including titles, rarity-coloured, with purchase and equip in one tap. Earned-only items show what unlocks them instead of a price. |
| **Stats** | Career totals with per-game averages, highlight counters, teammate grade, and a per-build comparison. |
| **Records** | The six-rung career ladder with your record on each difficulty, highest level cleared, and personal bests. |
| **Controls** | Every input grouped by what you are doing — moving, with the ball, on defence — with the keyboard key, the gamepad button and the touch control side by side. All twelve dribble moves list their key, their swipe, what the move does to you and to the defender, how long it lasts, and the rating gate; a move you cannot throw yet is greyed out and shows what it needs against what you have. Jump shots and dunk packages are listed with their release times and requirements. Readable before you have built a player. |
| **Settings** | Shot meter style, display, audio, profile export/import and reset. |

## The match HUD

Everything on screen during play answers a question the player is actively asking.

```
              ┌──────────────────────────────────┐
              │ ROOKIE      12.5      MARO VANCE │   score bug
              │   3      SHOT CLOCK          2   │
              └──────────────────────────────────┘

                         ╭─────────╮                shot meter
                        ╱     █     ╲               (green band + needle)

                        ╱▔▔▔╲                       player
                        └───┘

  STAMINA  ▓▓▓▓▓▓▓░░░    CONTEST ▓▓░░░░             bottom-left readouts
  SPACE shoot · E drive · F steal                     60 FPS
```

- **Score bug** — score, shot clock and format.
- **Shot meter** — five styles, switchable in Settings or mid-match from the pause menu.
- **Stamina and contest** — the two numbers that decide whether the next shot is worth
  taking, shown as bars rather than percentages so they are readable peripherally.
- **Callouts** — `CLEAR THE BALL`, `CHECK BALL`, `FREE THROW · n TO SHOOT`, and the grade
  flash (`GREEN`, `EXCELLENT`, `EARLY`, `LATE`, `WILD`) in the grade's own colour.
- **World popups** — `+2`, `ANKLES!`, `POSTER!`, `CHASE-DOWN!`, `FOUL — 2 SHOTS` rise from
  the player who earned them and fade.

### Shot meter styles

| Style | Where | Why you would pick it |
| --- | --- | --- |
| **Arc** | Curved bar above the player | Default. Easiest to read at a glance. |
| **Side bar** | Vertical, pinned right | Never overlaps the defender. |
| **Ring** | On the floor at your feet | Keeps your eyes on the court, not above it. |
| **Pips** | Segmented ticks above the player | The green band reads as discrete steps. |
| **Off** | Nothing | Time it by the animation. |

Because the green window is genuinely small — around 5% of the bar per side — every style
enforces a minimum size in screen space. An invisible target is not a skill test.

## Mobile

Touch controls appear automatically on coarse pointers: a left thumbstick, a right action
cluster (shoot/contest, drive, sprint, steal, fake) and a swipe pad that maps flick
direction and length onto dribble moves — flick right for a crossover, hard right for a
spin, down for a stepback, hard down for a snatch back, tap for a size-up.

All layout uses `dvh`, `env(safe-area-inset-*)` and `clamp()`. Nav and tab strips scroll
horizontally rather than wrapping. Menus are DOM, so they stay crisp and cheap on mobile
while the canvas handles only gameplay.

## Accessibility

- Reduced motion disables camera shake and screen transitions.
- The meter's green band never relies on colour alone — it has a distinct width, a glow,
  and a needle position.
- A heavily contested green turns amber, so the "this is no longer automatic" state is a
  shape and hue change together.
- Toasts are `role="status"` with `aria-live="polite"`.
- Tabs carry `role="tablist"` / `aria-selected`; every icon-only control has an
  `aria-label`.
- Type never goes below 10px, and body copy sits at 15px with a 1.45 line height.
