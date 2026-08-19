/* ============================================================
   Acendri OS — Dashboard: the Today system.
   Answers "what should I do right now?" — weekly review banner,
   hero greeting + quick actions, today's priorities (reorder /
   complete / focus), next up, today's progress, AI recommendation,
   and the grid of live summaries pulling from every engine.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  /* ---------------- small builders ---------------- */

  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function fullDate() {
    var d = new Date();
    return A.ui.DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + A.ui.MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function startOfTodayTs() {
    var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }

  function footerBtn(screen, label) {
    return '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-nav="' + screen + '">' +
      label + ' ' + A.ui.icon('arrow', 'sm') + '</button></div>';
  }

  function emptyBlock(emoji, text, screen, label) {
    return '<div class="empty"><div class="e-emoji">' + emoji + '</div><p>' + text + '</p>' +
      '<button class="btn btn-acc" data-nav="' + screen + '">' + label + '</button></div>';
  }

  // Set the focus task then jump into Focus Mode. Defensive about old saves.
  function startFocusOn(taskId, nav) {
    A.S.update(function (st) {
      if (!st.focus || typeof st.focus.sessions !== 'number') st.focus = { sessions: 0, minutes: 0, log: [] };
      st.focus.currentTaskId = taskId || null;
    }, { silent: true });
    nav('app/focus');
  }

  /* ---------------- 0) weekly review banner ---------------- */

  function reviewBanner(s) {
    if (!s.lastWeekReview || s.lastWeekReview.seen) return '';
    return '<div class="card acc glow acc-purple section-gap" style="padding:14px 18px">' +
      '<div class="spread wrap">' +
        '<div class="row" style="gap:10px">' +
          '<span style="font-size:1.3rem">🪞</span>' +
          '<span class="bold">Your weekly review is ready</span>' +
        '</div>' +
        '<button class="btn btn-acc btn-sm" data-nav="app/review">Read it ' + A.ui.icon('arrow', 'sm') + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- A) hero ---------------- */

  function heroHTML(s) {
    var esc = A.ui.esc;
    var name = (s.profile && s.profile.name) || 'there';
    var avatar = (s.profile && s.profile.avatar) || '🙂';
    var focus = s.profile && s.profile.focus;
    var lp = A.ui.levelProgress((s.profile && s.profile.xp) || 0);
    var best = 0;
    (s.habits || []).forEach(function (h) {
      if (h.archived) return;
      var st = A.engine.habitStreak(h);
      if (st > best) best = st;
    });
    return '<div class="dash-hero">' +
      '<div class="spread wrap">' +
        '<div>' +
          '<div class="big"><span class="h-grad">' + greeting() + ', ' + esc(name) + '</span> ' + esc(avatar) + '</div>' +
          '<div class="muted small" style="margin-top:4px">' + fullDate() +
            (focus ? ' &nbsp;<span class="tag">🎯 ' + esc(focus) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="row wrap">' +
          '<span class="pill acc-cyan">⭐ LV ' + lp.level + ' · ' + esc(A.ui.levelTitle(lp.level)) + '</span>' +
          (best > 0 ? '<span class="pill acc-orange">🔥 ' + best + ' day streak</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="row wrap" style="margin-top:16px">' +
        '<button class="btn btn-acc acc-blue" data-nav="app/goals">+ Goal</button>' +
        '<button class="btn btn-acc acc-green" data-nav="app/tasks">+ Task</button>' +
        '<button class="btn btn-acc acc-purple" data-nav="app/schedule">⚡ Plan my week</button>' +
        '<button class="btn btn-acc acc-cyan" data-nav="app/assistant">🤖 Ask Acendri</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- B1) today's priorities ---------------- */

  function prioritiesCard(s, pri) {
    var esc = A.ui.esc;
    var t = A.ui.todayISO();
    var t0 = startOfTodayTs();
    var accFor = { 1: 'cyan', 2: 'orange', 3: 'red' };

    // completed today = the priorities you already ticked off
    var doneToday = (s.tasks || []).filter(function (x) { return x.done && (x.doneAt || 0) >= t0; });
    doneToday.sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); });
    doneToday = doneToday.slice(0, 3);

    var inner, foot = '';
    if (!pri.length && !doneToday.length) {
      inner = '<div class="empty"><div class="e-emoji">🧭</div>' +
        '<p>No priorities yet — add tasks or ask Acendri.</p>' +
        '<div class="row wrap" style="justify-content:center">' +
          '<button class="btn btn-acc" data-nav="app/tasks">+ Add tasks</button>' +
          '<button class="btn btn-ghost" data-nav="app/assistant">🤖 Ask Acendri</button>' +
        '</div></div>';
    } else {
      var rows = pri.map(function (task, i) {
        var sub = [];
        if (task.due) {
          var overdue = task.due < t;
          sub.push('<span class="' + (overdue ? 'neg' : '') + '">' + (overdue ? '⚠️ ' : '') + esc(A.ui.fmtDate(task.due)) + '</span>');
        }
        if (task.duration) sub.push(esc(String(task.duration)) + ' min');
        if (task.priority === 3) sub.push('high priority');
        var up = i > 0
          ? '<button class="icon-btn" data-pri-up="' + i + '" title="Move up" aria-label="Move priority up">↑</button>'
          : (pri.length > 1 ? '<span class="icon-btn" style="visibility:hidden" aria-hidden="true">↑</span>' : '');
        var down = i < pri.length - 1
          ? '<button class="icon-btn" data-pri-down="' + i + '" title="Move down" aria-label="Move priority down">↓</button>'
          : (pri.length > 1 ? '<span class="icon-btn" style="visibility:hidden" aria-hidden="true">↓</span>' : '');
        return '<div class="list-item">' +
          '<button class="check acc-' + (accFor[task.priority] || 'cyan') + '" data-pri-toggle="' + esc(task.id) + '" title="Mark done" aria-label="Complete priority">' + A.ui.icon('check', 'sm') + '</button>' +
          '<div class="li-main"><div class="li-title">' + esc(task.title) + '</div>' +
          (sub.length ? '<div class="li-sub">' + sub.join(' · ') + '</div>' : '') + '</div>' +
          up + down +
          '<button class="btn btn-acc btn-sm" data-pri-focus="' + esc(task.id) + '" title="Start a Focus session on this">▶ Focus</button>' +
        '</div>';
      });
      var ticked = doneToday.map(function (task) {
        return '<div class="list-item done">' +
          '<button class="check on acc-green" data-pri-toggle="' + esc(task.id) + '" title="Undo — mark as not done" aria-label="Undo completed priority">' + A.ui.icon('check', 'sm') + '</button>' +
          '<div class="li-main"><div class="li-title">' + esc(task.title) + '</div>' +
          '<div class="li-sub">✔ Done today</div></div>' +
        '</div>';
      });
      inner = '<div class="list">' + rows.join('') + ticked.join('') + '</div>' +
        (!pri.length ? '<div class="small dim" style="margin-top:8px">🎉 All priorities done — brilliant.</div>' : '');
      foot = footerBtn('app/tasks', 'All tasks');
    }
    return '<div class="card acc glow acc-cyan">' +
      '<div class="card-title">' + A.ui.icon('bolt') + ' Today’s priorities</div>' + inner + foot + '</div>';
  }

  /* ---------------- B2) focus card ---------------- */

  function focusHTML() {
    var esc = A.ui.esc;
    var items = A.engine.focusSuggestions(4);
    var rows = items.map(function (it) {
      return '<div class="list-item acc-' + (it.accent || 'cyan') + '" data-nav="' + esc(it.screen) + '" style="cursor:pointer">' +
        '<span style="font-size:1.15rem">' + esc(it.emoji) + '</span>' +
        '<div class="li-main"><div class="li-title" style="font-weight:500">' + esc(it.text) + '</div></div>' +
        '<span class="h-acc">' + A.ui.icon('arrow', 'sm') + '</span>' +
      '</div>';
    }).join('');
    return '<div class="card acc glow acc-purple">' +
      '<div class="card-title">' + A.ui.icon('sparkles') + ' What matters most right now</div>' +
      (rows
        ? '<div class="list">' + rows + '</div>'
        : emptyBlock('🧘', 'All quiet — nothing urgent on your plate right now.', 'app/goals', 'Set a goal')) +
    '</div>';
  }

  /* ---------------- B3) next up ---------------- */

  function countdownLabel(nb) {
    if (nb.now) return 'NOW';
    var m = nb.inMinutes || 0;
    if (m >= 60) return 'in ' + Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
    return 'in ' + m + ' min';
  }

  function nextUpCard(nb) {
    if (!nb || !nb.block) return '';
    var esc = A.ui.esc;
    var b = nb.block;
    return '<div class="card acc acc-purple" data-nav="app/schedule" style="cursor:pointer">' +
      '<div class="card-title">' + A.ui.icon('clock') + ' Next up</div>' +
      '<div class="spread wrap">' +
        '<div>' +
          '<div class="big bold">' + esc(b.title) + '</div>' +
          '<div class="muted small" style="margin-top:4px">' +
            (nb.now ? 'Started at ' : 'Starts at ') + esc(A.ui.fmtTime(b.start)) + ' · until ' + esc(A.ui.fmtTime(b.end)) +
            ' · ' + (b.type === 'commitment' ? 'Commitment' : b.type === 'event' ? 'Event' : 'Task') +
          '</div>' +
        '</div>' +
        '<span class="pill ' + (nb.now ? 'acc-green' : 'acc-purple') + '" style="font-weight:700">' +
          (nb.now ? '▶ ' : '⏳ ') + countdownLabel(nb) + '</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- B4) today's progress ---------------- */

  function progressCard() {
    var ts = A.engine.todayStats();
    return '<div class="card acc acc-teal">' +
      '<div class="card-title">' + A.ui.icon('trend') + ' Today’s progress</div>' +
      '<div class="row wrap" style="gap:26px">' +
        '<div class="stat"><span class="v">' + (ts.tasksDone || 0) + '</span><span class="k">Tasks done</span></div>' +
        '<div class="stat"><span class="v">' + (ts.habitsDone || 0) + '/' + (ts.habitsTotal || 0) + '</span><span class="k">Habits</span></div>' +
        '<div class="stat"><span class="v h-acc">+' + (ts.xpToday || 0) + '</span><span class="k">XP today</span></div>' +
        '<div class="stat"><span class="v">' + (ts.focusToday || 0) + '</span><span class="k">Focus sessions</span></div>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- B5) AI recommendation ---------------- */

  function aiCard(sug) {
    var esc = A.ui.esc;
    return '<div class="card acc acc-pink section-gap">' +
      '<div class="card-title">' + A.ui.icon('bulb') + ' AI recommendation</div>' +
      '<div class="row" style="gap:10px;align-items:flex-start">' +
        '<span style="font-size:1.3rem">' + esc(sug.emoji || '💡') + '</span>' +
        '<div style="font-weight:500">' + esc(sug.text || 'Set a goal and Acendri will map out your next steps.') + '</div>' +
      '</div>' +
      '<div class="row wrap" style="margin-top:14px">' +
        '<button class="btn btn-primary" data-do-now="1">▶ Do It Now</button>' +
        '<button class="btn btn-ghost" data-nav="app/assistant">🤖 Ask Acendri</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- C1) today's timetable ---------------- */

  function timetableCard(s) {
    var esc = A.ui.esc;
    var t = A.ui.todayISO();
    var inner, foot = '';
    if (!s.timetable) {
      inner = emptyBlock('📅', 'No weekly plan yet — Acendri can fit your tasks around your commitments automatically.', 'app/schedule', 'Generate my week');
    } else {
      var blocks = (s.timetable.days && s.timetable.days[t]) || [];
      if (!blocks.length) {
        inner = emptyBlock('🌤️', 'Nothing scheduled today — enjoy the breathing room.', 'app/schedule', 'Open timetable');
      } else {
        var extra = blocks.length - 6;
        inner = '<div class="list">' + blocks.slice(0, 6).map(function (b) {
          return '<div class="list-item acc-' + (b.accent || 'cyan') + (b.done ? ' done' : '') + '" data-nav="app/schedule" style="cursor:pointer">' +
            '<span class="pill">' + esc(A.ui.fmtTime(b.start)) + '–' + esc(A.ui.fmtTime(b.end)) + '</span>' +
            '<div class="li-main"><div class="li-title">' + esc(b.title) + '</div>' +
            '<div class="li-sub">' + (b.type === 'commitment' ? 'Commitment' : b.type === 'event' ? 'Event' : 'Task') + (b.done ? ' · done ✔' : '') + '</div></div>' +
          '</div>';
        }).join('') + '</div>' +
        (extra > 0 ? '<div class="small dim" style="margin-top:8px">+' + extra + ' more block' + (extra === 1 ? '' : 's') + ' today</div>' : '');
        foot = footerBtn('app/schedule', 'Open timetable');
      }
    }
    return '<div class="card acc acc-purple">' +
      '<div class="card-title">' + A.ui.icon('calendar') + ' Today’s timetable</div>' + inner + foot + '</div>';
  }

  /* ---------------- C2) tasks due ---------------- */

  function tasksCard(s) {
    var esc = A.ui.esc;
    var t = A.ui.todayISO();
    var due = (s.tasks || []).filter(function (task) { return !task.done && task.due && task.due <= t; });
    due.sort(function (a, b) {
      if (a.due !== b.due) return a.due < b.due ? -1 : 1; // overdue (earlier) first
      return (b.priority || 1) - (a.priority || 1);
    });
    var inner, foot;
    if (!due.length) {
      inner = emptyBlock('✅', 'Nothing due — you’re ahead 🎉', 'app/tasks', 'Go to Tasks');
      foot = '';
    } else {
      var accFor = { 1: 'cyan', 2: 'orange', 3: 'red' };
      inner = '<div class="list">' + due.slice(0, 6).map(function (task) {
        var overdue = task.due < t;
        return '<div class="list-item">' +
          '<button class="check acc-' + (accFor[task.priority] || 'cyan') + '" data-task="' + esc(task.id) + '" title="Mark done" aria-label="Complete task">' + A.ui.icon('check', 'sm') + '</button>' +
          '<div class="li-main"><div class="li-title">' + esc(task.title) + '</div>' +
          '<div class="li-sub"><span class="' + (overdue ? 'neg' : '') + '">' + (overdue ? '⚠️ ' : '') + esc(A.ui.fmtDate(task.due)) + '</span>' +
          (task.priority === 3 ? ' · high priority' : '') + '</div></div>' +
        '</div>';
      }).join('') + '</div>';
      foot = footerBtn('app/tasks', 'View all tasks' + (due.length > 6 ? ' (' + due.length + ' due)' : ''));
    }
    return '<div class="card acc acc-green">' +
      '<div class="card-title">' + A.ui.icon('checksq') + ' Tasks due</div>' + inner + foot + '</div>';
  }

  /* ---------------- C3) goal progress ---------------- */

  function goalsCard(s) {
    var esc = A.ui.esc;
    var active = (s.goals || []).filter(function (g) { return g.status === 'active'; }).slice(0, 3);
    var inner, foot;
    if (!active.length) {
      inner = emptyBlock('🎯', 'Break a big dream into milestones and watch the bar fill up.', 'app/goals', 'Create your first goal');
      foot = '';
    } else {
      inner = '<div class="list">' + active.map(function (g) {
        var pct = A.engine.goalProgress(g);
        var next = (g.milestones || []).filter(function (m) { return !m.done; })[0];
        return '<div class="list-item acc-' + (g.accent || 'blue') + '" data-nav="app/goals" style="cursor:pointer">' +
          '<div class="li-main">' +
            '<div class="spread"><span class="li-title">' + esc(g.title) + '</span><span class="small bold h-acc">' + pct + '%</span></div>' +
            '<div class="bar" style="margin:7px 0 5px"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="li-sub">' + (next ? 'Next: ' + esc(next.title) : 'All milestones done — finish it off! 🏁') + '</div>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
      foot = footerBtn('app/goals', 'View all goals');
    }
    return '<div class="card acc acc-blue">' +
      '<div class="card-title">' + A.ui.icon('target') + ' Goal progress</div>' + inner + foot + '</div>';
  }

  /* ---------------- C4) habits today ---------------- */

  function habitsCard(s) {
    var esc = A.ui.esc;
    var t = A.ui.todayISO();
    var habits = (s.habits || []).filter(function (h) { return !h.archived; });
    var inner, foot;
    if (!habits.length) {
      inner = emptyBlock('🌱', 'Small daily actions compound — add your first habit.', 'app/habits', 'Add a habit');
      foot = '';
    } else {
      inner = '<div class="list">' + habits.slice(0, 6).map(function (h) {
        var on = !!(h.log && h.log[t]);
        var st = A.engine.habitStreak(h);
        return '<div class="list-item acc-' + (h.accent || 'orange') + '">' +
          '<span style="font-size:1.2rem">' + esc(h.emoji || '✨') + '</span>' +
          '<div class="li-main"><div class="li-title">' + esc(h.title) + '</div>' +
          '<div class="li-sub">🔥 ' + st + ' day streak · ' + A.engine.habitWeekCount(h) + '/' + (h.targetPerWeek || 7) + ' this week</div></div>' +
          '<button class="check' + (on ? ' on' : '') + '" data-habit="' + esc(h.id) + '" title="' + (on ? 'Untick for today' : 'Tick for today') + '" aria-label="Toggle habit">' + A.ui.icon('check', 'sm') + '</button>' +
        '</div>';
      }).join('') + '</div>';
      foot = footerBtn('app/habits', 'Open habits');
    }
    return '<div class="card acc acc-orange">' +
      '<div class="card-title">' + A.ui.icon('flame') + ' Habits today</div>' + inner + foot + '</div>';
  }

  /* ---------------- C5) money this month ---------------- */

  function moneyCard(s) {
    var esc = A.ui.esc;
    var hasTx = s.finance && s.finance.transactions && s.finance.transactions.length;
    var inner, foot;
    if (!hasTx) {
      inner = emptyBlock('💸', 'Track income and spending to see where your money actually goes.', 'app/finance', 'Log a transaction');
      foot = '';
    } else {
      var fin = A.engine.financeSummary();
      var over = fin.overBudget.map(function (o) { return esc(o.cat); }).join(', ');
      inner =
        '<div class="row wrap" style="gap:26px">' +
          '<div class="stat"><span class="v">' + esc(A.ui.fmtMoney(fin.income)) + '</span><span class="k">Income</span></div>' +
          '<div class="stat"><span class="v">' + esc(A.ui.fmtMoney(fin.expenses)) + '</span><span class="k">Expenses</span></div>' +
          '<div class="stat"><span class="v ' + (fin.net >= 0 ? 'pos' : 'neg') + '">' + esc(A.ui.fmtMoney(fin.net)) + '</span><span class="k">Net</span></div>' +
        '</div>' +
        (fin.overBudget.length ? '<div class="small neg" style="margin-top:12px">⚠️ Over budget: ' + over + '</div>' : '') +
        '<div class="small muted" style="margin-top:' + (fin.overBudget.length ? 6 : 12) + 'px">🏦 ' + esc(A.ui.fmtMoney(fin.savings)) + ' saved across your savings goals</div>';
      foot = footerBtn('app/finance', 'Open finance');
    }
    return '<div class="card acc acc-yellow">' +
      '<div class="card-title">' + A.ui.icon('wallet') + ' Money this month</div>' + inner + foot + '</div>';
  }

  /* ---------------- C6) latest achievements ---------------- */

  function achievementsCard(s) {
    var esc = A.ui.esc;
    var defs = A.engine.ACHIEVEMENTS;
    var byId = {};
    defs.forEach(function (d) { byId[d.id] = d; });
    var unlocked = Object.keys(s.achievements || {})
      .filter(function (id) { return byId[id]; })
      .map(function (id) { return { def: byId[id], ts: s.achievements[id] }; });
    unlocked.sort(function (a, b) { return b.ts - a.ts; });
    var locked = defs.length - unlocked.length;
    var inner, foot;
    if (!unlocked.length) {
      inner = emptyBlock('🏅', 'Complete tasks and build streaks to unlock your first badge.', 'app/achievements', 'See the badges');
      foot = '';
    } else {
      inner = '<div class="list">' + unlocked.slice(0, 3).map(function (u) {
        return '<div class="list-item acc-' + (u.def.accent || 'yellow') + '">' +
          '<span style="font-size:1.3rem">' + esc(u.def.emoji) + '</span>' +
          '<div class="li-main"><div class="li-title">' + esc(u.def.title) + '</div>' +
          '<div class="li-sub">' + esc(A.ui.timeAgo(u.ts)) + (u.def.xp ? ' · +' + u.def.xp + ' XP' : '') + '</div></div>' +
        '</div>';
      }).join('') + '</div>' +
      (locked > 0 ? '<div class="small dim" style="margin-top:8px">🔒 ' + locked + ' more to unlock</div>' : '');
      foot = footerBtn('app/achievements', 'All achievements');
    }
    return '<div class="card acc acc-yellow">' +
      '<div class="card-title">' + A.ui.icon('trophy') + ' Latest achievements</div>' + inner + foot + '</div>';
  }

  /* ---------------- screen ---------------- */

  A.registerScreen('app/dashboard', {
    title: 'Dashboard',
    icon: 'home',
    accent: 'cyan',
    inShell: true,
    order: 1,
    render: function (el, ctx) {
      var s = A.S.get();
      var pri = A.engine.priorities(3);
      var priIds = pri.map(function (task) { return task.id; });
      var nb = A.engine.nextBlock();
      var sug = A.engine.focusSuggestions(1)[0] ||
        { emoji: '🎯', text: 'Set a goal and Acendri will map out your next steps.', screen: 'app/goals' };
      var nu = nextUpCard(nb);

      el.innerHTML =
        reviewBanner(s) +
        heroHTML(s) +
        '<div class="grid2 section-gap">' + prioritiesCard(s, pri) + focusHTML() + '</div>' +
        (nu
          ? '<div class="grid2 section-gap">' + nu + progressCard() + '</div>'
          : '<div class="section-gap">' + progressCard() + '</div>') +
        aiCard(sug) +
        '<div class="grid2 section-gap">' +
          timetableCard(s) +
          tasksCard(s) +
          goalsCard(s) +
          habitsCard(s) +
          moneyCard(s) +
          achievementsCard(s) +
        '</div>';

      // navigation (banner, quick actions, focus items, next up, rows, footers, empty CTAs)
      el.querySelectorAll('[data-nav]').forEach(function (n) {
        n.addEventListener('click', function (e) {
          e.stopPropagation();
          ctx.nav(n.getAttribute('data-nav'));
        });
      });

      // priorities: complete / undo (XP only on the not-done -> done transition)
      el.querySelectorAll('[data-pri-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-pri-toggle');
          var completed = false, hit = false, prio = 1, title = '';
          A.S.update(function (st) {
            for (var i = 0; i < (st.tasks || []).length; i++) {
              var task = st.tasks[i];
              if (task.id === id) {
                if (task.done) { task.done = false; delete task.doneAt; }
                else { task.done = true; task.doneAt = Date.now(); completed = true; prio = task.priority; }
                title = task.title;
                hit = true;
                break;
              }
            }
          });
          if (!hit) return;
          if (completed) A.S.addXp(prio === 3 ? 15 : 10, 'Task completed: ' + title);
          else A.ui.toast('Marked "' + title + '" as not done', '↩️');
        });
      });

      // priorities: reorder — persist the visible order with the swap applied
      function swapOrder(i, j) {
        if (i < 0 || j < 0 || i >= priIds.length || j >= priIds.length) return;
        var arr = priIds.slice();
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        A.S.update(function (st) { st.priorityOrder = arr; });
      }
      el.querySelectorAll('[data-pri-up]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var i = parseInt(btn.getAttribute('data-pri-up'), 10);
          swapOrder(i, i - 1);
        });
      });
      el.querySelectorAll('[data-pri-down]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var i = parseInt(btn.getAttribute('data-pri-down'), 10);
          swapOrder(i, i + 1);
        });
      });

      // priorities: jump into Focus Mode on a specific task
      el.querySelectorAll('[data-pri-focus]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          startFocusOn(btn.getAttribute('data-pri-focus'), ctx.nav);
        });
      });

      // AI recommendation: Do It Now
      el.querySelectorAll('[data-do-now]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var top = A.engine.priorities(1)[0];
          if (top) { startFocusOn(top.id, ctx.nav); return; }
          var target = sug.screen || 'app/goals';
          if (target === 'app/dashboard') {
            A.ui.toast('Check the bell — a reminder needs you', '🔔');
            return;
          }
          ctx.nav(target);
        });
      });

      // complete a due task
      el.querySelectorAll('[data-task]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-task');
          var pr = 1, hit = false;
          A.S.update(function (st) {
            for (var i = 0; i < st.tasks.length; i++) {
              var task = st.tasks[i];
              if (task.id === id && !task.done) {
                task.done = true;
                task.doneAt = Date.now();
                pr = task.priority;
                hit = true;
                break;
              }
            }
          });
          if (hit) A.S.addXp(pr === 3 ? 15 : 10, 'Task completed');
        });
      });

      // toggle a habit for today
      el.querySelectorAll('[data-habit]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = btn.getAttribute('data-habit');
          var t = A.ui.todayISO();
          var ticked = false, hit = false, title = '';
          A.S.update(function (st) {
            for (var i = 0; i < st.habits.length; i++) {
              var h = st.habits[i];
              if (h.id === id) {
                if (!h.log) h.log = {};
                if (h.log[t]) delete h.log[t];
                else { h.log[t] = true; ticked = true; }
                title = h.title;
                hit = true;
                break;
              }
            }
          });
          if (!hit) return;
          if (ticked) A.S.addXp(5, 'Habit: ' + title);
          else A.ui.toast('Unticked "' + title + '" for today', '↩️');
        });
      });
    }
  });
})();
