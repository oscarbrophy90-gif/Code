/* ============================================================
   Acendri OS — Weekly Review: the story of your last planned
   week. Core writes s.lastWeekReview when a planned week
   settles; this screen tells it back — the numbers, the wins,
   the rough edges, and one rule-based insight — then points
   you at building the next week.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  /* ---------------- helpers ---------------- */

  function firstName(s) {
    var n = (s.profile && s.profile.name) || '';
    n = String(n).trim();
    if (!n) return 'you';
    return n.split(/\s+/)[0];
  }

  // Completion % of planned task blocks, or null when nothing was planned.
  function blockPct(r) {
    var total = r.blocksTotal || 0;
    if (!total) return null;
    return Math.round(((r.blocksDone || 0) / total) * 100);
  }

  function achievementTitles(ids) {
    var byId = {};
    (A.engine.ACHIEVEMENTS || []).forEach(function (a) { byId[a.id] = a; });
    var out = [];
    (ids || []).forEach(function (id) {
      var a = byId[id];
      if (a) out.push({ emoji: a.emoji || '🏆', title: a.title });
    });
    return out;
  }

  function bestStreak(s) {
    var best = null;
    (s.habits || []).forEach(function (h) {
      if (h.archived) return;
      var st = A.engine.habitStreak(h);
      if (st >= 2 && (!best || st > best.streak)) best = { habit: h, streak: st };
    });
    return best;
  }

  function staleHabits(s) {
    var out = [];
    (s.habits || []).forEach(function (h) {
      if (h.archived) return;
      var d = A.engine.daysSinceLastTick(h);
      if (d >= 3) out.push({ habit: h, days: d });
    });
    out.sort(function (a, b) { return b.days - a.days; });
    return out;
  }

  /* ---------------- A) stats ---------------- */

  function statsHTML(r) {
    var esc = A.ui.esc;
    function statCard(acc, emoji, v, k) {
      return '<div class="card acc acc-' + acc + '"><div class="stat">' +
        '<span class="v">' + emoji + ' ' + esc(String(v)) + '</span>' +
        '<span class="k">' + esc(k) + '</span></div></div>';
    }
    var pct = blockPct(r);
    var done = r.blocksDone || 0;
    var total = r.blocksTotal || 0;
    var blocksCard =
      '<div class="card acc acc-purple"><div class="stat">' +
        '<span class="v">📅 ' + done + '/' + total + '</span>' +
        '<span class="k">Planned blocks done</span></div>' +
        '<div class="bar acc-purple" style="margin-top:10px"><div class="bar-fill" style="width:' + (pct == null ? 0 : pct) + '%"></div></div>' +
        '<div class="small muted" style="margin-top:6px">' +
          (pct == null ? 'No task blocks were planned that week' : pct + '% of the plan became reality') +
        '</div>' +
      '</div>';
    var achCount = (r.achievements || []).length;
    var achCard =
      '<div class="card acc acc-yellow"><div class="stat">' +
        '<span class="v">🏅 ' + achCount + '</span>' +
        '<span class="k">Achievements unlocked</span></div>' +
        '<div class="small muted" style="margin-top:6px">' +
          (achCount ? 'New badges earned during the week' : 'No new badges that week — plenty left to earn') +
        '</div>' +
      '</div>';
    return '<div class="card section-gap">' +
      '<div class="card-title">' + A.ui.icon('pulse') + ' Your week</div>' +
      '<div class="grid4">' +
        statCard('green', '✅', r.tasksDone || 0, 'Tasks completed') +
        statCard('teal', '🌱', r.habitTicks || 0, 'Habit ticks') +
        statCard('indigo', '🎧', r.focusSessions || 0, 'Focus sessions') +
        statCard('cyan', '⚡', r.xpEarned || 0, 'XP earned') +
      '</div>' +
      '<div class="grid2" style="margin-top:12px">' + blocksCard + achCard + '</div>' +
    '</div>';
  }

  /* ---------------- B) what went well ---------------- */

  function wentWellHTML(r, s) {
    var esc = A.ui.esc;
    var wins = [];
    (r.goalsMoved || []).forEach(function (title) {
      wins.push({ emoji: '🎯', text: '"' + esc(String(title)) + '" moved forward' });
    });
    achievementTitles(r.achievements).forEach(function (a) {
      wins.push({ emoji: esc(a.emoji), text: 'Unlocked "' + esc(a.title) + '"' });
    });
    var pct = blockPct(r);
    if (pct != null && pct >= 80) {
      wins.push({ emoji: '🗓️', text: 'You did ' + pct + '% of what you planned' });
    }
    var best = bestStreak(s);
    if (best) {
      wins.push({ emoji: '🔥', text: '"' + esc(best.habit.title) + '" is on a ' + best.streak + '-day streak' });
    }
    wins = wins.slice(0, 4);
    var inner;
    if (!wins.length) {
      inner = '<p class="muted" style="margin:0">A quiet week — no headline wins this time, and that\'s okay. ' +
        'Showing up to read this is already a step.</p>';
    } else {
      inner = '<div class="list">' + wins.map(function (w) {
        return '<div class="list-item">' +
          '<span style="font-size:1.1rem">' + w.emoji + '</span>' +
          '<div class="li-main"><div class="li-title" style="font-weight:500;font-size:.92rem">' + w.text + '</div></div>' +
        '</div>';
      }).join('') + '</div>';
    }
    return '<div class="card acc acc-green section-gap">' +
      '<div class="card-title">' + A.ui.icon('trophy') + ' What went well</div>' + inner + '</div>';
  }

  /* ---------------- C) what needs work ---------------- */

  function needsWorkHTML(r, s) {
    var esc = A.ui.esc;
    var items = [];
    var pct = blockPct(r);
    if (pct != null && pct < 50) {
      items.push({ emoji: '📉', text: 'Only ' + pct + '% of planned blocks happened — the plan may have asked for more than the week could give' });
    }
    (r.unfinished || []).slice(0, 5).forEach(function (title) {
      items.push({ emoji: '📋', text: '"' + esc(String(title)) + '" didn\'t get finished' });
    });
    staleHabits(s).forEach(function (x) {
      items.push({ emoji: '🥀', text: '"' + esc(x.habit.title) + '" hasn\'t been ticked in ' + x.days + ' days' });
    });
    var inner;
    if (!items.length) {
      inner = '<p class="muted" style="margin:0">Honestly? Not much. Nothing rolled over and your habits are alive — a clean week.</p>';
    } else {
      inner = '<div class="list">' + items.map(function (w) {
        return '<div class="list-item">' +
          '<span style="font-size:1.1rem">' + w.emoji + '</span>' +
          '<div class="li-main"><div class="li-title" style="font-weight:500;font-size:.92rem">' + w.text + '</div></div>' +
        '</div>';
      }).join('') + '</div>' +
      '<div class="small dim" style="margin-top:10px">No judgement — this list exists so next week\'s plan can be kinder to you.</div>';
    }
    return '<div class="card acc acc-orange section-gap">' +
      '<div class="card-title">' + A.ui.icon('flag') + ' What needs work</div>' + inner + '</div>';
  }

  /* ---------------- D) AI insight ---------------- */

  function insightText(r, s) {
    var name = firstName(s);
    var pct = blockPct(r);
    var unfinished = (r.unfinished || []).length;
    var primary, secondary = '';

    if (pct != null && pct >= 80 && unfinished <= 2) {
      primary = name + ', you completed ' + pct + '% of your plan and left almost nothing behind — that\'s a green light to raise the bar. Add one stretch block next week.';
    } else if (unfinished >= 5) {
      primary = name + ', ' + unfinished + ' tasks rolled past the week — try planning fewer, shorter blocks next time; finishing a modest plan beats abandoning an ambitious one.';
    } else if (pct != null && pct < 50) {
      primary = name + ', under half the planned blocks happened — that usually means the plan was too heavy, not that you were. Halve the block count and win the week on purpose.';
    } else if (pct != null) {
      primary = name + ', a solid middle-of-the-road week at ' + pct + '% of plan — protect your best hours for the hardest block and that number climbs on its own.';
    } else {
      primary = name + ', the week ran without task blocks on the timetable — put even two or three on next week\'s plan and the review gets much more interesting.';
    }

    if (!(r.focusSessions > 0)) {
      secondary = ' You didn\'t run a single Focus session — try one tomorrow; twenty-five undistracted minutes can carry a whole day.';
    } else if (r.focusSessions >= 3) {
      secondary = ' ' + r.focusSessions + ' Focus sessions is real deep work — keep that engine running.';
    } else if (!(r.habitTicks > 0)) {
      secondary = ' Habits went quiet too — one tiny tick tomorrow restarts the flywheel.';
    }
    return primary + secondary;
  }

  function insightHTML(r, s) {
    return '<div class="card acc acc-cyan section-gap">' +
      '<div class="card-title">' + A.ui.icon('bulb') + ' AI insight</div>' +
      '<p style="margin:0;line-height:1.6">' + A.ui.esc(insightText(r, s)) + '</p>' +
    '</div>';
  }

  /* ---------------- screen ---------------- */

  A.registerScreen('app/review', {
    title: 'Weekly Review',
    icon: 'eye',
    accent: 'purple',
    inShell: true,
    order: 10,
    render: function (el, ctx) {
      var s = A.S.get();
      var esc = A.ui.esc;
      var r = s.lastWeekReview;

      if (!r) {
        el.innerHTML =
          '<div class="screen-head"><h1><span class="h-grad">Weekly Review</span> 🪞</h1>' +
          '<div class="sub">Your week, reflected back at you.</div></div>' +
          '<div class="empty"><div class="e-emoji">🪞</div>' +
          '<p>Your first review appears when a planned week finishes. Plan a week and live it.</p>' +
          '<button class="btn btn-acc acc-purple" data-nav="app/schedule">Open timetable</button></div>';
        el.querySelectorAll('[data-nav]').forEach(function (b) {
          b.addEventListener('click', function () { ctx.nav(b.getAttribute('data-nav')); });
        });
        return;
      }

      var range = A.ui.fmtDate(r.weekStart) + ' – ' + A.ui.fmtDate(r.weekEnd);

      el.innerHTML =
        '<div class="screen-head"><h1><span class="h-grad">Weekly Review</span> 🪞</h1>' +
        '<div class="sub">' + esc(range) + ' — here\'s how it really went.</div></div>' +
        statsHTML(r) +
        wentWellHTML(r, s) +
        needsWorkHTML(r, s) +
        insightHTML(r, s) +
        '<div class="row section-gap" style="justify-content:center;padding-bottom:8px">' +
          '<button class="btn btn-primary btn-lg" data-act="plan-next">⚡ Build my next week</button>' +
        '</div>';

      var planBtn = el.querySelector('[data-act="plan-next"]');
      if (planBtn) planBtn.addEventListener('click', function () {
        ctx.nav('app/schedule');
        A.ui.toast('Pick how to plan — repeat last week or start fresh', '🗓️');
      });

      // First read of an unseen review unlocks Reflector. Mark it seen AFTER
      // this render finishes (never mid-build), silently — the DOM already
      // shows the review; the achievement toast still surfaces on its own.
      if (!r.seen) {
        setTimeout(function () {
          var cur = A.S.get().lastWeekReview;
          if (!cur || cur.seen) return;
          A.S.update(function (st) {
            if (st.lastWeekReview && !st.lastWeekReview.seen) st.lastWeekReview.seen = true;
          }, { silent: true });
        }, 0);
      }
    }
  });
})();
