# BetterMe

**You don't level up a character. You level up yourself.**

A real-life progression game. You fill in a survey about your actual life, it
builds you a rating card, and then it hands you a short list of real things to
do every day. Doing them raises real numbers.

Lives at `betterme/`, entirely separate from Hoops Elite.

```
npm run dev:betterme      # http://localhost:5174
npm run build:betterme
npm run test:betterme
npm run typecheck         # covers both apps
```

---

## The loop

```
survey → starting card → today's list → tick things off
            ↑                                  ↓
            └──── tomorrow's list ←──── XP → attributes → Overall → levels
```

1. **Survey** (10 steps). Age, goals, fitness, study, sleep, health, routine,
   people, interests, and three free-text questions.
2. **Starting card.** Nine attributes seeded 30–72, and an Overall.
3. **Lock In screen.** 4–7 activities a day, sized to the time you said you had,
   plus one optional bonus challenge.
4. **Completing an activity** pays XP into your account level *and* into the
   attribute it belongs to. Enough attribute XP ticks the rating up.
5. **Locking in the day** (60% of the core list) extends your streak.
6. **End-of-day summary** shows what you did, what you earned, and whether the
   Overall moved.

## The numbers

| Thing | Range | Moves when |
| --- | --- | --- |
| Attribute rating | 25–99 | You bank enough XP in that area |
| Overall | 25–99 | Weighted mean of the nine; focus areas count 1.5× |
| Level | 1+ | Total XP, from any source. Never goes down |
| Streak | 0+ | Days locked in back to back |

**Ratings are derived, never stored** — always `seed (from the survey) + XP
earned`. Two consequences that matter: retaking the survey re-derives your seed
without touching a point of earned progress, and a tuning change to the rating
curve re-rates everyone consistently instead of stranding old saves.

**Only activities feed attribute XP.** Bonus XP from weekly challenges and
milestones goes to your account level alone — otherwise your Fitness rating
could climb in a week you never trained, and the number would stop meaning
anything.

### Curves

- **Rating step**: `70 + 3 · (rating − 40)^1.6`. ~100 XP for 45→46, ~750 for
  70→71, ~1750 for 90→91. Cheap at the bottom, a grind at the top.
- **Level**: `200 + 140 · level^1.22` XP per level.
- **Activity XP**: light ~25, steady ~55, hard ~100, elite ~165. Daily challenge
  pays 1.6×. Streak bonus up to +30%. Comeback day pays +25%.

## The generator (`core/generator.ts`)

Answers one question — *what should this specific person do today?* — from four
inputs, in strict priority order:

1. **Safety.** Age, injuries, mobility, equipment and weekly physical load are
   hard filters. A rule here can only ever *remove* work.
2. **Goals.** Every focus area is guaranteed a slot.
3. **Weakness.** The lowest ratings get pulled in next — that is where Overall
   has the most room.
4. **Variety.** Anything offered recently is pushed down by cadence-aware
   cooldowns, so the list does not calcify into the same five chores.

Seeded off `profileId:date`, so a day's plan is stable — closing the app and
coming back does not reroll work you already started.

Difficulty is never a setting the user picks. The tier of each activity comes
from their current rating in that area (`<46` light, `<60` steady, `<74` hard,
else elite), capped by the safety ceiling, and eased in for the first three days.

### Safety rules, in one place

- Age gates per activity (`minAge`), and no elite fitness work under 18 or over 60.
- Injury → no high-load or impact work at all. Low mobility → light work only,
  and the accessible alternatives unlock.
- Weekly high-load budget from self-reported fitness level (0–5 sessions), never
  two hard sessions in one day, and no back-to-back hard days for beginners.
- Sleep and water targets derived from age.
- Nutrition content is **additive only** — add water, add vegetables, add
  daylight. Nothing in the catalogue asks anyone to restrict, cut or weigh
  anything, and there is no body-composition content anywhere.

## Not punishing people

The whole design of the missed-day path:

- Missing a day never removes XP, ratings, levels or badges. The only thing at
  risk is the streak counter.
- **Streak shields**: one earned every 7 consecutive days, 2 max. Spent
  automatically to cover a gap — but only if they can cover the *whole* gap, so
  you never burn a shield on a break that breaks the streak anyway.
- **Comeback bonus**: after a break, everything you do on your first day back
  pays +25%, and the app leads with "welcome back", not a count of days lost.
- Every line of copy lives in `core/motivation.ts` under three rules: no shame,
  no guilt about broken streaks, no comparisons to other people.

## Adding content

**A new activity** is one entry in `core/catalog.ts` and nothing else:

```ts
{
  id: 'cold-plunge',
  label: 'Cold plunge',
  attribute: 'discipline',
  secondary: 'health',
  tags: ['morning', 'routine'],
  load: 'light',
  cadence: 'most-days',
  requires: { minAge: 18 },
  tiers: [
    T('light', 30, 'Two minutes in the cold', 'Slow breathing, not bracing.', mins(2)),
    T('steady', 55, 'Five minutes', 'Get out the moment you start shivering hard.', mins(5)),
  ],
}
```

Rules the tests enforce: unique id, at least one tier, tiers listed easiest
first and paying more as they get harder, and every attribute keeping at least
five activities of its own.

**A new attribute** is three edits: the key in `core/types.ts`, its meta in
`core/attributes.ts`, and at least one activity that feeds it. The radar, the
Overall, the seeding and the achievements all read off that one list.

**New achievements** (`core/achievements.ts`) are pure functions of the profile,
so one added next month is awarded retroactively to people who already did the
work. Same for **milestones** (`core/milestones.ts`) and **weekly challenges**
(`core/challenges.ts`), whose progress is always recomputed from the day records
rather than incremented.

## Layout

```
betterme/
  src/core/        pure rules engine — no DOM, no storage, no timers
    types.ts       the data model
    attributes.ts  the nine areas, rating curve, Overall
    levels.ts      XP curve
    survey.ts      onboarding questions, declared as data
    seed.ts        survey → traits + starting ratings
    catalog.ts     every activity in the game
    generator.ts   what this person does today
    progress.ts    completing, undoing, streaks, day rollover
    challenges.ts  weekly objectives
    achievements.ts / milestones.ts / motivation.ts
  src/state/       localStorage persistence + subscribe/notify store
  src/ui/          plain-DOM screens, hand-rolled SVG charts
  test/            38 tests driving the engine directly
```

`core/` being pure is what lets a test simulate a full year of progression in
under a second.

## Storage

One `localStorage` key, no account, no server — the right default for a diary of
someone's sleep, study and mood. Two years of day records are kept, a save from
an older build is migrated additively on load, and Settings has export/import so
the data is genuinely the user's.

## Not built yet

- Notifications and reminders (needs a service worker, and probably a real
  push backend).
- Offline install as a PWA — there is a manifest, but no service worker.
- Friends, leaderboards, sharing a card.
- Per-activity notes and history ("what did I lift last Tuesday?").
- Multiple profiles on one device.
