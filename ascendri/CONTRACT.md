# Acendri OS — screen module contract

Every screen is one classic-script file in `ascendri/js/` (NO import/export, NO
frameworks, NO external network calls, NO CDN). Wrap everything in an IIFE.
Register exactly one screen:

```js
(function () {
  'use strict';
  var A = window.Ascendri;
  A.registerScreen('app/goals', {
    title: 'Goals',          // topbar + sidebar label
    icon: 'target',          // core icon name
    accent: 'blue',          // sidebar accent
    inShell: true,           // false for landing/onboarding (full-page, no sidebar)
    order: 2,                // (informational; load order in index.html decides)
    render: function (el, ctx) { /* build DOM inside el */ }
  });
})();
```

`ctx` = `{ nav, S, ui, engine }` (same objects as `window.Ascendri.{nav,S,ui,engine}`).

## Store — `A.S`
- `A.S.get()` → state (READ ONLY — never mutate outside update)
- `A.S.update(fn)` — `fn(state)` mutates; auto-saves, runs achievement checks,
  re-renders the current screen. Pass `{silent:true}` as 2nd arg to skip re-render
  (then update the DOM yourself — used by chat).
- `A.S.addXp(n, reason)` — award XP + toast (re-renders). Use AFTER the data
  update, e.g. task completed. Suggested: task 10 (priority high 15), milestone 25,
  goal complete 100, habit tick 5, transaction 2, generate timetable 5.
- `A.S.log(text, emoji)` — silent activity-log entry.
- `A.S.loadDemo()`, `A.S.reset()`, `A.S.exportJSON()`, `A.S.importJSON(txt)`.

## State shape (all optional fields may be absent — guard)
```
profile: { name, avatar, focus, onboarded, createdAt, xp }
goals: [{ id, title, category, why, accent, targetDate|null, status:'active'|'done',
          completedAt?, milestones:[{id,title,done}], createdAt }]
tasks: [{ id, title, priority:1|2|3, due:'YYYY-MM-DD'|null, duration(min),
          done, doneAt?, goalId?, createdAt }]
commitments: [{ id, title, days:[0..6 (Sun=0)], start:'HH:MM', end:'HH:MM', accent }]
habits: [{ id, title, emoji, accent, targetPerWeek, log:{'YYYY-MM-DD':true}, createdAt }]
finance: { transactions:[{id,type:'income'|'expense',amount,category,note,date}],
           budgets:{category:limit}, savingsGoals:[{id,title,emoji,target,saved,accent}] }
timetable: null | { generatedAt, unplaced:[titles],
                    days:{ 'YYYY-MM-DD':[{id,refId,title,type:'task'|'commitment',
                            accent,start:'HH:MM',end:'HH:MM',startMin,endMin,done?}] } }
achievements: { id: unlockTs }
activityLog: [{ts,text,emoji,xp}]
assistant: { history: [{role:'user'|'ai', text, ts, actions?:[{label,screen}]}] }
social: { friends:[{id,name,avatar,role,level,streak,online}],
          requests:[{id,name,avatar,role}], suggestions:[{id,name,avatar,role}],
          feed:[{id,author,avatar,me?,accent,kind,time,text,likes,liked,comments:[{author,avatar,text}]}],
          groups:[{id,name,emoji,accent,members,joined,desc,leaderboard:[{name,avatar,xp}]}],
          paths:[{id,title,author,avatar,accent,emoji,followers,following,done:{idx:true},steps:[str]}] }
settings: { wake:'07:00', sleep:'22:30', currency:'$', autoPost:true, notifications:true }
```

## UI kit — `A.ui`
- `esc(s)` — ALWAYS escape user data before putting it in innerHTML.
- `uid()`, `todayISO()`, `addDaysISO(iso,n)`, `monthISO()`, `fmtDate(iso)`
  ('Today'/'Tomorrow'/'Tue 19 Aug'), `fmtMoney(n)`, `fmtTime('14:30')`→'2:30pm',
  `timeAgo(ts)`, `minutes('HH:MM')`, `hhmm(min)`, `DAY_NAMES`, `MONTHS`.
- `icon(name, cls)` → svg string. Names: home target check checksq plus x calendar
  clock dollar pulse users sparkles bolt flame trophy bulb route chat gear bell star
  wallet arrow trend edit trash download upload heart send grad book sun moon menu
  flag eye shield. cls: '' | 'sm' | 'lg'.
- `toast(msg, emoji)`.
- `modal({title, accent, wide?, body(html), actions?:[{label, cls, onClick(modalEl)->false to keep open}], onOpen(modalEl, close), onClose})` → `{close, el}`.
  Build forms in `body` html, read values in an action's onClick via
  `modalEl.querySelector('#myid').value`. Return `false` from onClick to keep the
  modal open (validation failed → also `A.ui.toast('...')`).
- `confirm(msg, onYes, {title?, yesLabel?, danger?:false})` — destructive confirms.
- `confetti()` — big celebrations only (goal complete, level up handled by core).
- `ACCENT_NAMES` = ['cyan','blue','orange','green','purple','pink','teal','indigo','red','yellow'],
  `ACCENTS[name] = {c, b}` hex colors.
- `levelFor(xp)`, `levelTitle(l)`, `levelProgress(xp)` → {level, into, span, pct}.

## Engines — `A.engine`
- `generateTimetable(state)` — call inside `A.S.update(function(s){ A.engine.generateTimetable(s); })`.
- `focusSuggestions(n)` → [{emoji,text,accent,screen,score}] ranked "what matters now".
- `financeSummary(ym?)` → {month,income,expenses,net,byCat,savings,overBudget:[{cat,spent,limit}]}.
- `habitStreak(h)`, `habitWeekCount(h)`, `goalProgress(g)` (0-100).
- `ACHIEVEMENTS` — [{id,title,desc,emoji,accent,xp,test}] for the achievements screen.

## CSS classes available (styles.css — do NOT add <style> blocks; reuse these)
Layout: `.row .col .spread .wrap .grid2 .grid3 .grid4 .section-gap`
Cards: `.card` (+`.acc`/`.glow` with an `acc-*` class), `.card-title`, `.icon-tile`(+`.lg`), `.dash-hero`
Text: `.h-grad .h-acc .muted .dim .small .big .bold`
Buttons: `.btn .btn-primary .btn-acc .btn-ghost .btn-danger .btn-sm .btn-lg .icon-btn`(+`.danger`)
Pills: `.pill .tag .badge-dot`  Bars: `.bar>` `.bar-fill` (+`.lg` on .bar; set inline width %)
Forms: `.field>label+input`, `.input .select .textarea .checkbox .emoji-pick .swatches`
Lists: `.list .list-item`(+`.done`) `.li-main .li-title .li-sub`, `.check`(+`.on`) round toggle
Stats: `.stat > .v + .k`  Avatar: `.avatar`(+`.sm .lg`)  Empty: `.empty > .e-emoji + p + button`
Screen: `.screen-head > h1 + .sub`  Tables: `.tbl .num .pos .neg`  Misc: `hr.sep .scroll-x`
Timetable: `.tt-scroll > .tt-grid > .tt-daylabel(.today) .tt-col > .tt-block(.done) > .tt-time`, `.tt-hourlabel`
Habits: `.habit-days > .habit-day(.on .today)`
Chat: `.chat-wrap > .chat-log > .msg.me|.msg.ai(.msg-actions)`, `.chips > .chip`, `.typing > i i i`
Achievements: `.ach-grid > .ach-card(.unlocked|.locked)`
Feed: `.post(.acc)`, `.react-btn(.on)`
Landing: `.landing .l-hero .l-sub .l-desc .l-features .l-card(.vis) .l-card-top .l-testimonials
  .t-sub .t-grid .t-card .t-head .t-name .t-role .t-stars .t-quote .l-cta .l-cta-inner .l-cta-btn .l-foot`
Onboarding: `.onb .onb-card .onb-dots>span(.on) .focus-opt(.sel)`

## Hard rules
1. EVERY interactive element must do something visible (action, modal, toast, or nav).
   No dead buttons, ever.
2. Escape ALL user-entered strings with `A.ui.esc()` when building HTML.
3. Rebuild your DOM idempotently in `render(el, ctx)` — it is called repeatedly.
4. Empty states: friendly `.empty` block with an emoji, one sentence, and a CTA button.
5. Keep everything local — no fetch/XHR, no external images/fonts. Emoji are fine.
6. Nav between screens: `ctx.nav('app/goals')` etc. Screen ids: landing, onboarding,
   app/dashboard, app/goals, app/tasks, app/schedule, app/habits, app/finance,
   app/social, app/achievements, app/assistant, app/settings.
7. After `A.S.update` your render runs again — don't hold references to old DOM.
8. Delete/destructive actions go through `A.ui.confirm`.

## Round 2 additions

State additions:
- `reminders: [{id, text, due:'YYYY-MM-DD'|null, done, doneAt?, createdAt}]` — shown in the
  topbar bell and focus engine. Create via A.S.update push.
- `habits[i].archived` / `archivedAt` — habits untouched for `A.engine.HABIT_FADE_DAYS` (14)
  days fade to the archive automatically (core does this). ALL screens must filter
  `!h.archived` for active lists; the habits screen shows an archive section with restore.
- `timetable.settled` — set by core when a planned week ends; XP for a week is awarded by
  core at settlement based on completed task blocks (4 XP/block, +30 bonus at >=80%).
  Do NOT award XP for merely generating a timetable.

Engine additions: `A.engine.daysSinceLastTick(h)`, `A.engine.HABIT_FADE_DAYS`.

## The brain — `A.brain` (js/brain.js)

- `A.brain.classify(text)` -> { intent, score, slots } — one of 20 intents:
  goal_management, schedule_management, productivity_support, habit_management,
  finance_management, study_management, training_management, wellbeing_support,
  personal_development, progress_tracking, social_management, general_assistant,
  reminder_management, life_planning, career_planning, event_planning,
  purchase_budgeting, app_navigation, troubleshooting, general_conversation.
  slots: { topic (e.g. 'basketball'), when ('today'|'tomorrow'|'week'|null), amount (number|null) }.
- `A.brain.goalFromText(text)` -> draft { title, category, accent, why, milestones:[str] } — never null.
- `A.brain.tasksFromText(text)` -> [{ title, priority, due, duration }] (2-6 tasks, never empty).
- `A.brain.planFromText(text)` -> { sessions: [{ title, count, duration, accent }], summary } —
  e.g. "basketball training 3x plus study" -> basketball session x3 + study session x2. Never empty.
- `A.brain.respond(text)` -> { text, actions:[{label, screen}] } — full assistant reply; it MAY
  perform its own A.S.update effects (create reminder, generate timetable, etc.) before returning.

## Round 3 — timetable week lifecycle

- `timetable.weekStart` / `timetable.lockedUntil` / `timetable.settled` — a generated plan
  covers `weekStart .. weekStart+6` and is LOCKED until `lockedUntil` (weekStart + 7).
  While locked, screens must not offer regeneration — only adding.
- `lastWeekPlan: { weekStart, savedAt, items:[{title,dow,startMin,duration,accent}] } | null`
  — snapshot core saves when a week settles, powering "keep the same as last week".
  Clearing the plan wipes it too (a cleared week starts from a blank page).
- Engine: `weekLock(s)` -> {locked, unlocksOn, daysLeft}; `planWindow(s)` -> the plan's 7 ISO days;
  `addTasksToTimetable(s, taskIds)` -> {placed, unplaced} fits tasks into free gaps WITHOUT
  moving existing blocks; `repeatLastWeek(s)` rebuilds this week from `lastWeekPlan`;
  `generateTimetable(s, prefer?)` where prefer maps taskId -> {dow, startMin}.
- Anything that schedules (screens or brain) must ADD to an existing plan via
  `addTasksToTimetable`, and only call `generateTimetable` when there is no plan.
