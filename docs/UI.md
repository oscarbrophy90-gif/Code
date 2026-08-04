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
--orange  #ff7a3d    primary accent, ranked
--amber   #ffc53d    currency, contested green
--blue    #4aa3ff    casual, blocks
--purple  #a06bff    parks, elite tier
--red     #ff4d5e    danger, low stamina
```

Panels use a clipped corner (`clip-path` notching the top-right and bottom-left) which
reads as sports-broadcast furniture without needing any image assets. Section headers are
11px, 900 weight, 0.18em tracking, uppercase, with a rule that fills the remaining width.

Nothing in the interface is an image file. Player portraits are drawn from build data,
team crests from a `{shape, glyph, motif}` descriptor, and the favicon is an inline SVG
data URI.

## Layout

A fixed top bar (brand, nav, level/currency/rank chips) over a single scrolling screen
host. Screens are plain DOM; only the match is a canvas.

```
┌──────────────────────────────────────────────────────────────┐
│ ◉ HOOPS ELITE   HOME PLAY MYPLAYER PARKS …   LV 12  24,850 CC │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─ player card ─────────────┐  ┌─ season ──────────────┐   │
│   │ [portrait]  Rookie    61  │  │ S4: Skyline           │   │
│   │ SG 6'5" 200lb      OVR    │  │ ▓▓▓▓▓▓░░░  12d 22h    │   │
│   │ LV 1  ▓▓▓░░░░░░           │  └───────────────────────┘   │
│   └───────────────────────────┘  ┌─ rank ────────────────┐   │
│   ┌─ RANKED 1v1 ──────────────┐  │ ⬡ Bronze IV   0 RP    │   │
│   │ Climb Bronze to Legend.   │  └───────────────────────┘   │
│   └───────────────────────────┘  ┌─ daily challenges ────┐   │
│   ┌ QUICK PLAY ┐ ┌ PRACTICE ┐    │ Land 3 chase-downs    │   │
│   └────────────┘ └──────────┘    └───────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

Mode tiles carry a `--tint` custom property that drives a radial glow, the kicker colour
and the hover border, so a new mode is one call with a colour.

## Screens

| Screen | Purpose |
| --- | --- |
| **Home** | Player card, mode tiles, season banner, rank, live events, daily challenges, career summary. |
| **Play** | Online queues with the live search band, solo with five difficulties and a free-run gym, the event list, court selection, and the rules panel. |
| **MyPlayer** | Three tabs. *Attributes* shows every rating with its cap marked in red and the exact upgrade price. *Badges* shows all forty with tier, progress and gating attribute. *Animations* covers jump shots, dunk packages and the equipped loadout. |
| **Builder** | Save slots, body sliders with live cap recalculation, appearance, templates, and a "what this build does well" grading panel. |
| **Parks** | Five parks with a walk-around top-down hub — WASD or drag to move, step onto a court ring to queue. |
| **Season** | Battle pass with both tracks and per-tier claiming, the challenge board, and end-of-season ranked rewards. |
| **Store** | Twelve cosmetic categories, rarity-coloured, with purchase and equip in one tap. |
| **Stats** | Career totals with per-game averages, highlight counters, teammate grade, and a per-build comparison. |
| **Ranks** | Your standing, the tier ladder, and worldwide/regional leaderboards (with a deterministic offline sample when the server is unreachable). |
| **Settings** | Shot meter style, display, audio, server address and region, cloud save, profile export/import. |

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
  SPACE shoot · E drive · F steal            60 FPS · 34 ms
```

- **Score bug** — score, shot clock, format, and the ranked tier when it applies.
- **Shot meter** — five styles, switchable in Settings or mid-match from the pause menu.
- **Stamina and contest** — the two numbers that decide whether the next shot is worth
  taking, shown as bars rather than percentages so they are readable peripherally.
- **Callouts** — `CLEAR THE BALL`, `CHECK BALL`, and the grade flash (`GREEN`, `EXCELLENT`,
  `EARLY`, `LATE`, `WILD`) in the grade's own colour.
- **World popups** — `+2`, `ANKLES!`, `POSTER!`, `CHASE-DOWN!` rise from the player who
  earned them and fade.

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
