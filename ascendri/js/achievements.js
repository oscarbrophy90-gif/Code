/* ============================================================
   Acendri OS — Achievements: gamified progression.
   Level hero + ladder preview, cross-app stats, badge grid
   with detail modals ("Take me there" for locked ones), and
   a recent-XP history feed.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  /* ---------------- helpers ---------------- */

  // Cumulative XP thresholds for the next `count` levels, derived purely
  // from A.ui.levelProgress so the curve always matches core.
  function ladder(xp, count) {
    var lp = A.ui.levelProgress(xp);
    var out = [];
    var need = xp - lp.into + lp.span; // cumulative XP to reach lp.level + 1
    var lvl = lp.level + 1;
    for (var i = 0; i < count; i++) {
      out.push({ level: lvl, xp: need });
      var nx = A.ui.levelProgress(need); // sits exactly at the start of `lvl`
      need += nx.span;
      lvl++;
    }
    return out;
  }

  // Map an achievement id to its most relevant screen.
  var SCREEN_RULES = [
    ['goal', 'app/goals'], ['milestone', 'app/goals'],
    ['task', 'app/tasks'], ['focused', 'app/tasks'],
    ['habit', 'app/habits'], ['streak', 'app/habits'],
    ['money', 'app/finance'], ['budget', 'app/finance'], ['save', 'app/finance'],
    ['planner', 'app/schedule'],
    ['social', 'app/social'], ['group', 'app/social'], ['path', 'app/social'],
    ['ai', 'app/assistant'],
    ['level', 'app/dashboard'], ['welcome', 'app/dashboard']
  ];
  var SCREEN_LABELS = {
    'app/goals': 'Goals', 'app/tasks': 'Tasks', 'app/habits': 'Habits',
    'app/finance': 'Finance', 'app/schedule': 'Planner', 'app/social': 'Social',
    'app/assistant': 'Assistant', 'app/dashboard': 'Dashboard'
  };
  function screenFor(id) {
    for (var i = 0; i < SCREEN_RULES.length; i++) {
      if (id.indexOf(SCREEN_RULES[i][0]) !== -1) return SCREEN_RULES[i][1];
    }
    return 'app/dashboard';
  }

  // Actionable hint per locked achievement.
  var HINTS = {
    'welcome': 'Finish setting up your profile — your journey starts the moment you do.',
    'goal-starter': 'Head to Goals and create your first one — pick something that genuinely excites you.',
    'milestone': 'Open one of your goals and tick off its first milestone.',
    'goal-crusher': 'Finish every milestone on a goal, then mark the whole goal complete.',
    'first-task': 'Add a task and check it off — the first of many.',
    'task-10': 'Keep ticking tasks off — 10 completed tasks unlocks this.',
    'task-50': 'Complete 50 tasks in total. Slow and steady absolutely counts.',
    'focused': 'Complete 5 high-priority tasks — the scary ones give the most back.',
    'habit-first': 'Create your first habit — small daily actions compound fast.',
    'streak-3': 'Tick any habit 3 days in a row to warm up.',
    'streak-7': 'Keep a habit streak alive for a full week without missing.',
    'streak-30': 'Hold a habit streak for 30 straight days. Diamond hands.',
    'first-money': 'Log any income or expense in Finance to start mapping your money.',
    'budget-boss': 'Set a monthly limit for one spending category in Finance.',
    'saver': 'Create a savings goal in Finance — future you says thanks.',
    'save-500': 'Grow your combined savings goals to $500.',
    'planner': 'Open the Planner and generate your automatic weekly timetable.',
    'social-butterfly': 'Accept a friend request or add a suggested friend in Social.',
    'grouped': 'Join any group in the Social screen and climb its leaderboard.',
    'pathfinder': 'Follow a Path shared by the community in Social.',
    'ai-curious': 'Send your first message to the Acendri assistant.',
    'level-5': 'Keep earning XP from tasks, habits and goals to reach Level 5.',
    'level-10': 'The long game — stack XP every day until you hit Level 10.'
  };

  /* ---------------- A) level hero ---------------- */

  function heroHTML(s) {
    var esc = A.ui.esc;
    var xp = (s.profile && s.profile.xp) || 0;
    var lp = A.ui.levelProgress(xp);
    var next = ladder(xp, 3);
    var ladderRows = next.map(function (n) {
      return '<span class="tag">LV ' + n.level + ' ' + esc(A.ui.levelTitle(n.level).toUpperCase()) +
        ' · ' + n.xp + ' XP</span>';
    }).join('');
    return '<div class="dash-hero">' +
      '<div class="spread wrap" style="align-items:flex-start;gap:22px">' +
        '<div class="row" style="gap:16px;flex:1;min-width:260px;align-items:flex-start">' +
          '<span class="avatar lg acc-purple" style="font-size:2.2rem;font-weight:800">' + lp.level + '</span>' +
          '<div class="col" style="gap:6px;flex:1;min-width:0">' +
            '<div class="bold" style="font-size:1.3rem">Level ' + lp.level +
              ' — <span class="h-grad">' + esc(A.ui.levelTitle(lp.level).toUpperCase()) + '</span></div>' +
            '<div class="muted small">total XP: ' + xp + '</div>' +
            '<div class="bar lg acc-cyan"><div class="bar-fill" style="width:' + lp.pct + '%"></div></div>' +
            '<div class="small muted">' + lp.into + ' / ' + lp.span + ' XP to Level ' + (lp.level + 1) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="col" style="gap:8px;align-items:flex-end">' +
          '<div class="small dim">NEXT ON THE LADDER</div>' + ladderRows +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- B) stats row ---------------- */

  function statsHTML(s) {
    var esc = A.ui.esc;
    var defs = A.engine.ACHIEVEMENTS;
    var got = s.achievements || {};
    var unlocked = defs.filter(function (d) { return got[d.id]; });
    var achXp = unlocked.reduce(function (a, d) { return a + (d.xp || 0); }, 0);
    var best = 0;
    (s.habits || []).forEach(function (h) {
      var st = A.engine.habitStreak(h);
      if (st > best) best = st;
    });
    var doneTasks = (s.tasks || []).filter(function (t) { return t.done; }).length;
    function statCard(acc, emoji, v, k) {
      return '<div class="card acc acc-' + acc + '"><div class="stat">' +
        '<span class="v">' + emoji + ' ' + esc(String(v)) + '</span>' +
        '<span class="k">' + esc(k) + '</span></div></div>';
    }
    return '<div class="grid4 section-gap">' +
      statCard('yellow', '🏅', unlocked.length + '/' + defs.length, 'Badges unlocked') +
      statCard('cyan', '⚡', achXp + ' XP', 'XP from achievements') +
      statCard('orange', '🔥', best + (best === 1 ? ' day' : ' days'), 'Best habit streak') +
      statCard('green', '✅', doneTasks, 'Tasks completed') +
    '</div>';
  }

  /* ---------------- C) badge grid ---------------- */

  function badgeGridHTML(s) {
    var esc = A.ui.esc;
    var got = s.achievements || {};
    var cards = A.engine.ACHIEVEMENTS.map(function (a) {
      var ts = got[a.id];
      var sub = ts
        ? '<div class="muted small" style="margin-top:4px">🗓 ' + esc(new Date(ts).toDateString()) + '</div>'
        : '<div style="margin-top:6px"><span class="pill">+' + (a.xp || 0) + ' XP</span></div>';
      return '<div class="ach-card acc-' + esc(a.accent || 'yellow') + (ts ? ' unlocked' : ' locked') +
        '" data-ach="' + esc(a.id) + '" style="cursor:pointer" role="button" tabindex="0" ' +
        'title="' + esc(ts ? 'Unlocked — see details' : 'Locked — see how to earn it') + '">' +
        '<span style="font-size:1.6rem">' + (ts ? esc(a.emoji) : '🔒') + '</span>' +
        '<div class="li-main">' +
          '<div class="bold" style="font-size:.95rem">' + esc(a.title) + '</div>' +
          '<div class="li-sub">' + esc(a.desc) + '</div>' + sub +
        '</div>' +
      '</div>';
    }).join('');
    return '<div class="card section-gap">' +
      '<div class="card-title">' + A.ui.icon('trophy') + ' Badge collection</div>' +
      '<div class="ach-grid">' + cards + '</div>' +
    '</div>';
  }

  function openBadgeModal(a, ts, nav) {
    var esc = A.ui.esc;
    var unlocked = !!ts;
    var screen = screenFor(a.id);
    var body =
      '<div class="row" style="gap:14px;align-items:flex-start">' +
        '<span class="avatar lg acc-' + esc(a.accent || 'yellow') + '" style="font-size:1.9rem">' +
          (unlocked ? esc(a.emoji) : '🔒') + '</span>' +
        '<div class="col" style="gap:6px;flex:1;min-width:0">' +
          '<div class="bold" style="font-size:1.1rem">' + esc(a.title) + '</div>' +
          '<div class="muted small">' + esc(a.desc) + '</div>' +
          '<div class="row wrap" style="gap:8px;margin-top:2px">' +
            (a.xp ? '<span class="pill">⚡ +' + a.xp + ' XP</span>' : '<span class="tag">No XP — pure glory</span>') +
            (unlocked
              ? '<span class="pill">✔ Unlocked</span>'
              : '<span class="tag">🔒 Locked</span>') +
          '</div>' +
          (unlocked
            ? '<div class="muted small" style="margin-top:6px">🗓 Unlocked ' + esc(new Date(ts).toDateString()) +
              ' · ' + esc(A.ui.timeAgo(ts)) + '</div>'
            : '<hr class="sep"><div class="small" style="color:var(--body)">💡 ' +
              esc(HINTS[a.id] || a.desc) + '</div>') +
        '</div>' +
      '</div>';
    var actions = unlocked
      ? [{ label: 'Nice ✨', cls: 'btn-primary' }]
      : [
          { label: 'Close', cls: 'btn-ghost' },
          { label: 'Take me there ' + A.ui.icon('arrow', 'sm'), cls: 'btn-primary',
            onClick: function () { nav(screen); } }
        ];
    A.ui.modal({
      title: (unlocked ? '🏆 ' : '🔒 ') + esc(a.title),
      accent: a.accent || 'yellow',
      body: body,
      actions: actions
    });
    if (!unlocked) A.ui.toast('Earn it in ' + (SCREEN_LABELS[screen] || 'the app'), '🧭');
  }

  /* ---------------- D) XP history ---------------- */

  function xpHistoryHTML(s) {
    var esc = A.ui.esc;
    var entries = (s.activityLog || []).filter(function (e) { return e.xp > 0; }).slice(0, 8);
    var inner;
    if (!entries.length) {
      inner = '<div class="empty"><div class="e-emoji">⚡</div>' +
        '<p>Earn XP by completing tasks, milestones and habits.</p>' +
        '<button class="btn btn-acc acc-cyan" data-nav="app/tasks">Complete a task</button></div>';
    } else {
      inner = '<div class="list">' + entries.map(function (e) {
        return '<div class="list-item">' +
          '<span style="font-size:1.1rem">' + esc(e.emoji || '⚡') + '</span>' +
          '<div class="li-main"><div class="li-title" style="font-weight:500;font-size:.9rem">' + esc(e.text) + '</div>' +
          '<div class="li-sub">' + esc(A.ui.timeAgo(e.ts)) + '</div></div>' +
          '<span class="pill acc-cyan">+' + e.xp + ' XP</span>' +
        '</div>';
      }).join('') + '</div>';
    }
    return '<div class="card acc acc-cyan section-gap">' +
      '<div class="card-title">' + A.ui.icon('bolt') + ' Recent XP</div>' + inner + '</div>';
  }

  /* ---------------- screen ---------------- */

  A.registerScreen('app/achievements', {
    title: 'Achievements',
    icon: 'trophy',
    accent: 'yellow',
    inShell: true,
    order: 9,
    render: function (el, ctx) {
      var s = A.S.get();

      el.innerHTML =
        '<div class="screen-head"><h1><span class="h-grad">Achievements</span> 🏆</h1>' +
        '<div class="sub">Level up your life — every badge is a real-world win.</div></div>' +
        heroHTML(s) +
        statsHTML(s) +
        badgeGridHTML(s) +
        xpHistoryHTML(s);

      // badge cards -> detail modal (click or keyboard)
      var byId = {};
      A.engine.ACHIEVEMENTS.forEach(function (a) { byId[a.id] = a; });
      el.querySelectorAll('[data-ach]').forEach(function (cardEl) {
        var open = function () {
          var a = byId[cardEl.getAttribute('data-ach')];
          if (!a) return;
          openBadgeModal(a, (A.S.get().achievements || {})[a.id], ctx.nav);
        };
        cardEl.addEventListener('click', open);
        cardEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
      });

      // nav buttons (empty-state CTA)
      el.querySelectorAll('[data-nav]').forEach(function (b) {
        b.addEventListener('click', function () { ctx.nav(b.getAttribute('data-nav')); });
      });
    }
  });
})();
