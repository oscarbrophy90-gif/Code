/* ============================================================
   Acendri OS — Dashboard: the command centre.
   Hero greeting + quick actions, "What matters most right now",
   and a grid of live summaries pulling from every engine.
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

  function footerBtn(screen, label) {
    return '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-nav="' + screen + '">' +
      label + ' ' + A.ui.icon('arrow', 'sm') + '</button></div>';
  }

  function emptyBlock(emoji, text, screen, label) {
    return '<div class="empty"><div class="e-emoji">' + emoji + '</div><p>' + text + '</p>' +
      '<button class="btn btn-acc" data-nav="' + screen + '">' + label + '</button></div>';
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

  /* ---------------- B) focus card ---------------- */

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
    return '<div class="card acc glow acc-purple section-gap">' +
      '<div class="card-title">' + A.ui.icon('sparkles') + ' What matters most right now</div>' +
      (rows
        ? '<div class="list">' + rows + '</div>'
        : emptyBlock('🧘', 'All quiet — nothing urgent on your plate right now.', 'app/goals', 'Set a goal')) +
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
            '<div class="li-sub">' + (b.type === 'commitment' ? 'Commitment' : 'Task') + (b.done ? ' · done ✔' : '') + '</div></div>' +
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
    var habits = s.habits || [];
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

      el.innerHTML =
        heroHTML(s) +
        focusHTML() +
        '<div class="grid2 section-gap">' +
          timetableCard(s) +
          tasksCard(s) +
          goalsCard(s) +
          habitsCard(s) +
          moneyCard(s) +
          achievementsCard(s) +
        '</div>';

      // navigation (quick actions, focus items, goal/timetable rows, footers, empty CTAs)
      el.querySelectorAll('[data-nav]').forEach(function (n) {
        n.addEventListener('click', function () { ctx.nav(n.getAttribute('data-nav')); });
      });

      // complete a due task
      el.querySelectorAll('[data-task]').forEach(function (btn) {
        btn.addEventListener('click', function () {
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
        btn.addEventListener('click', function () {
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
