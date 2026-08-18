# Acendri OS — Your Life Operating System

> Stop juggling apps. Start living smarter. Acendri manages your productivity,
> finances, learning, health, and time through one intelligent platform.

This folder contains the working Acendri OS prototype: the marketing site from
the Figma design plus a fully functional app behind the **Start Your Acendri
Journey** button. Every button works.

### Just open it

Open **`ascendri/AcendriOS.html`** in any browser. It is a single self-contained
file — the whole platform in one HTML document, so you can email it, put it on a
USB stick or drop it in a folder and it still works. No install, no build, no
server, no internet. All of your data is stored in your browser (localStorage);
nothing is uploaded anywhere.

`ascendri/index.html` is the same app served from its separate source files —
use that one while editing. Rebuild the single-file version with:

```
node ascendri/build-standalone.mjs
```

Tip: during onboarding tick **"Load demo data"** to see the whole OS alive on
first open.

### What's inside

| Area | What it does |
| --- | --- |
| **Landing page** | Faithful recreation of the Figma site — hero, the ten glowing feature cards, testimonials and the CTA that launches the app. |
| **Onboarding** | Name + avatar, pick your focus (student / athlete / entrepreneur / professional / personal growth), optional first goal or demo data. |
| **Dashboard** | The command centre: "What matters most right now" (ranked by a real focus engine), today's timetable, due tasks, goal progress, habits, money snapshot, latest achievements. |
| **Goals** | Break big ambitions into milestones, suggested steps per category, one-click "turn milestone into task", completion celebrations. |
| **Tasks** | Priorities, due dates, durations, goal links, filters — completing tasks earns XP. |
| **Timetable** | Enter weekly commitments (school, training…), then **⚡ Generate my week**: Acendri automatically schedules your open tasks into your free time before their deadlines. Regenerate any time life changes. |
| **Habits** | Streaks, weekly targets, 7-day tick grid, consistency stats. |
| **Finance** | Income & expenses, category budgets with over-budget warnings, savings goals, monthly view and plain-language insights. |
| **Social Hub** | A demo community: positive feed (post, like, comment), friends & requests, groups with leaderboards, and **Paths** — step-by-step journeys you can follow or publish from your own completed goals. |
| **Achievements** | 23 achievements, XP, levels from *Newcomer* to *Ascendant*. |
| **AI Assistant** | A local assistant that reasons over *your actual data*: "What should I focus on today?", "Am I on track?", "How's my spending?", "Plan my week". |
| **Settings** | Profile, day shape (wake/sleep feed the timetable engine), currency, privacy-first data controls: export / import / demo / full reset. |

### The idea

Goals influence tasks. Tasks influence the timetable. The timetable reflects
priorities. Money connects to savings goals. Achievements reflect real
progress. The assistant understands the relationships between all of them.

**Plan → Act → Track → Learn → Improve → Plan again.**

### Tech

- Zero dependencies, zero build. `index.html` + `styles.css` + `js/*.js`.
- `js/core.js` — state store (localStorage), router, app shell, achievements
  engine, the automatic-timetable engine and the focus engine.
- One file per screen in `js/`, all registered against the same core API
  (documented in `CONTRACT.md`).
- Privacy by design: no network calls, no analytics, no accounts. Your life
  stays on your device.
