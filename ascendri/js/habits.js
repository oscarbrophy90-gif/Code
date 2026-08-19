/* ============================================================
   Acendri OS — Habits: streak-powered daily actions.
   Stats row (with perfect-day note), glowing habit cards with a
   7-day tick strip, weekly progress bars, 8-week consistency
   graphs, goal links / preferred time / difficulty metadata,
   a "Why am I struggling?" analysis and a new/edit modal.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var EMOJIS = ['📚', '🏃', '🤸', '💪', '🥗', '💧', '😴', '🧹', '🎸', '🧠', '📖', '☀️'];

  var TIME_OPTS = [
    ['', 'Any time of day'],
    ['morning', '🌅 Morning'],
    ['afternoon', '🌤️ Afternoon'],
    ['evening', '🌙 Evening']
  ];
  var TIME_NOTE = {
    morning: '🌅 best in the morning',
    afternoon: '🌤️ best in the afternoon',
    evening: '🌙 best in the evening'
  };
  var DIFF_OPTS = [
    ['', 'Not set'],
    ['easy', '🟢 Easy'],
    ['medium', '🟡 Medium'],
    ['hard', '🔴 Hard']
  ];
  var DIFF_TAG = { easy: '🟢 easy', medium: '🟡 medium', hard: '🔴 hard' };

  /* ---------------- helpers ---------------- */

  function safeAccent(name) {
    return A.ui.ACCENT_NAMES.indexOf(name) >= 0 ? name : 'orange';
  }

  function findHabit(s, id) {
    var out = null;
    (s.habits || []).forEach(function (h) { if (h.id === id) out = h; });
    return out;
  }

  // Local ISO date from a Date (component construction, no UTC drift).
  function localISO(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  // Weekday index (Sun=0) for a local ISO date.
  function dowOf(iso) {
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).getDay();
  }

  function dayLetter(iso) {
    return A.ui.DAY_NAMES[dowOf(iso)].charAt(0);
  }

  function last7(todayIso) {
    var out = [];
    for (var i = 6; i >= 0; i--) out.push(A.ui.addDaysISO(todayIso, -i));
    return out;
  }

  function ticksLast30(h, todayIso) {
    var n = 0, day = todayIso;
    for (var i = 0; i < 30; i++) {
      if (h.log && h.log[day]) n++;
      day = A.ui.addDaysISO(day, -1);
    }
    return n;
  }

  // How many days (inclusive of today, capped at `cap`) this habit has existed.
  function ageDays(h, todayIso, cap) {
    var days = cap;
    if (h.createdAt) {
      var created = localISO(new Date(h.createdAt));
      var d = 0, cur = created;
      while (cur < todayIso && d < cap) { cur = A.ui.addDaysISO(cur, 1); d++; }
      days = Math.min(cap, d + 1);
    }
    return Math.max(1, days);
  }

  // 30-day completion rate 0..1 (young habits measured over their real age).
  function completionRate30(h, todayIso) {
    return Math.min(1, ticksLast30(h, todayIso) / ageDays(h, todayIso, 30));
  }

  // Tick counts for the last 8 weeks: 7-day windows ending today, oldest first.
  function weeklyCounts(h, todayIso) {
    var out = [];
    for (var w = 7; w >= 0; w--) {
      var n = 0;
      for (var d = 0; d < 7; d++) {
        var iso = A.ui.addDaysISO(todayIso, -(w * 7 + d));
        if (h.log && h.log[iso]) n++;
      }
      out.push(n);
    }
    return out;
  }

  /* ---------------- new / edit modal ---------------- */

  function openHabitModal(habitId) {
    var esc = A.ui.esc;
    var s = A.S.get();
    var habit = habitId ? findHabit(s, habitId) : null;
    var isNew = !habit;

    var vTitle = isNew ? '' : habit.title;
    var vEmoji = isNew ? EMOJIS[0] : (habit.emoji || EMOJIS[0]);
    var vTarget = isNew ? 7 : (habit.targetPerWeek || 7);
    var vAccent = isNew ? 'orange' : safeAccent(habit.accent);
    var vGoal = isNew ? '' : (habit.goalId || '');
    var vTime = isNew ? '' : (habit.preferredTime || '');
    var vDiff = isNew ? '' : (habit.difficulty || '');
    if (EMOJIS.indexOf(vEmoji) === -1) vEmoji = EMOJIS[0];

    var goals = (s.goals || []).filter(function (g) { return g.status === 'active'; });
    if (vGoal && !goals.some(function (g) { return g.id === vGoal; })) {
      (s.goals || []).forEach(function (g) { if (g.id === vGoal) goals.push(g); });
    }

    var targetOpts = '';
    for (var n = 1; n <= 7; n++) {
      targetOpts += '<option value="' + n + '"' + (n === vTarget ? ' selected' : '') + '>' +
        n + (n === 7 ? ' days a week (every day)' : n === 1 ? ' day a week' : ' days a week') + '</option>';
    }

    A.ui.modal({
      title: isNew ? '🌱 New habit' : '✏️ Edit habit',
      accent: vAccent,
      body:
        '<div class="field"><label>Habit</label>' +
          '<input id="hb-title" class="input" maxlength="60" placeholder="e.g. Read 20 pages" value="' + esc(vTitle) + '"></div>' +
        '<div class="field"><label>Emoji</label>' +
          '<div class="emoji-pick" id="hb-emoji">' +
            EMOJIS.map(function (e) {
              return '<button type="button" data-emoji="' + esc(e) + '"' + (e === vEmoji ? ' class="sel"' : '') +
                ' aria-label="Pick emoji ' + esc(e) + '">' + esc(e) + '</button>';
            }).join('') +
          '</div></div>' +
        '<div class="field"><label>Target per week</label>' +
          '<select id="hb-target" class="select">' + targetOpts + '</select></div>' +
        '<div class="field"><label>Linked goal (optional)</label>' +
          '<select id="hb-goal" class="select">' +
            '<option value="">No goal</option>' +
            goals.map(function (g) {
              return '<option value="' + esc(g.id) + '"' + (g.id === vGoal ? ' selected' : '') + '>' +
                esc(g.title) + (g.status === 'done' ? ' (done)' : '') + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="grid2">' +
          '<div class="field"><label>Preferred time</label>' +
            '<select id="hb-time" class="select">' +
              TIME_OPTS.map(function (o) {
                return '<option value="' + o[0] + '"' + (o[0] === vTime ? ' selected' : '') + '>' + o[1] + '</option>';
              }).join('') +
            '</select></div>' +
          '<div class="field"><label>Difficulty</label>' +
            '<select id="hb-diff" class="select">' +
              DIFF_OPTS.map(function (o) {
                return '<option value="' + o[0] + '"' + (o[0] === vDiff ? ' selected' : '') + '>' + o[1] + '</option>';
              }).join('') +
            '</select></div>' +
        '</div>' +
        '<div class="field"><label>Accent colour</label>' +
          '<div class="swatches" id="hb-acc">' +
            A.ui.ACCENT_NAMES.map(function (name) {
              return '<button type="button" class="acc-' + name + (name === vAccent ? ' sel' : '') +
                '" data-swatch="' + name + '" title="' + name + '" aria-label="Accent ' + name + '"></button>';
            }).join('') +
          '</div></div>',
      onOpen: function (m) {
        m.querySelectorAll('#hb-emoji button').forEach(function (b) {
          b.addEventListener('click', function () {
            m.querySelectorAll('#hb-emoji button').forEach(function (x) { x.classList.remove('sel'); });
            b.classList.add('sel');
          });
        });
        m.querySelectorAll('#hb-acc button').forEach(function (b) {
          b.addEventListener('click', function () {
            m.querySelectorAll('#hb-acc button').forEach(function (x) { x.classList.remove('sel'); });
            b.classList.add('sel');
          });
        });
      },
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        {
          label: isNew ? 'Start habit' : 'Save changes',
          cls: 'btn-primary',
          onClick: function (m) {
            var title = m.querySelector('#hb-title').value.trim();
            if (!title) { A.ui.toast('Give your habit a name first', '✍️'); return false; }
            var emBtn = m.querySelector('#hb-emoji button.sel');
            var emoji = emBtn ? emBtn.getAttribute('data-emoji') : EMOJIS[0];
            var target = +m.querySelector('#hb-target').value || 7;
            var swBtn = m.querySelector('#hb-acc button.sel');
            var accent = safeAccent(swBtn ? swBtn.getAttribute('data-swatch') : 'orange');
            var goalEl = m.querySelector('#hb-goal');
            var goalId = goalEl ? goalEl.value : '';
            var timeEl = m.querySelector('#hb-time');
            var pTime = timeEl ? timeEl.value : '';
            var diffEl = m.querySelector('#hb-diff');
            var diff = diffEl ? diffEl.value : '';
            A.S.update(function (st) {
              if (isNew) {
                st.habits.push({
                  id: A.ui.uid(), title: title, emoji: emoji, accent: accent,
                  targetPerWeek: target, log: {}, createdAt: Date.now(),
                  goalId: goalId || undefined,
                  preferredTime: pTime || undefined,
                  difficulty: diff || undefined
                });
              } else {
                for (var i = 0; i < st.habits.length; i++) {
                  if (st.habits[i].id === habitId) {
                    st.habits[i].title = title;
                    st.habits[i].emoji = emoji;
                    st.habits[i].accent = accent;
                    st.habits[i].targetPerWeek = target;
                    if (goalId) st.habits[i].goalId = goalId; else delete st.habits[i].goalId;
                    if (pTime) st.habits[i].preferredTime = pTime; else delete st.habits[i].preferredTime;
                    if (diff) st.habits[i].difficulty = diff; else delete st.habits[i].difficulty;
                    break;
                  }
                }
              }
            });
            if (isNew) A.ui.toast('Habit started — tick day one today!', '🌱');
            else A.ui.toast('Habit updated', '✏️');
          }
        }
      ]
    });
  }

  /* ---------------- "Why am I struggling?" ---------------- */

  function openWhyModal(habitId) {
    var esc = A.ui.esc;
    var s = A.S.get();
    var h = findHabit(s, habitId);
    if (!h) return;
    var t = A.ui.todayISO();
    var acc = safeAccent(h.accent);
    var tickedToday = !!(h.log && h.log[t]);
    var createdIso = h.createdAt ? localISO(new Date(h.createdAt)) : null;

    // Per-weekday totals & misses over the last 4 weeks (28 days).
    // Today only counts once it's ticked (the day isn't over yet), and days
    // before the habit existed don't count against it.
    var total = [0, 0, 0, 0, 0, 0, 0];
    var miss = [0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < 28; i++) {
      var iso = A.ui.addDaysISO(t, -i);
      if (createdIso && iso < createdIso) continue;
      var done = !!(h.log && h.log[iso]);
      if (iso === t && !done) continue;
      var dw = dowOf(iso);
      total[dw]++;
      if (!done) miss[dw]++;
    }

    // Worst weekday(s) by miss rate.
    var maxRate = 0;
    for (var d = 0; d < 7; d++) {
      if (total[d] && miss[d] / total[d] > maxRate) maxRate = miss[d] / total[d];
    }
    var worst = [];
    for (var d2 = 0; d2 < 7; d2++) {
      if (total[d2] && maxRate > 0 && miss[d2] / total[d2] >= maxRate - 0.001) worst.push(d2);
    }

    var callout;
    if (!worst.length) {
      callout = 'No clear weekday pattern in the last 4 weeks — the misses are spread out. A fixed daily anchor should tighten things up.';
    } else if (worst.indexOf(0) >= 0 && worst.indexOf(6) >= 0 && worst.length <= 3) {
      callout = 'You mostly miss this on weekends — try anchoring it to Saturday morning, before the day drifts.';
    } else if (worst.length === 1) {
      callout = 'You mostly miss this on ' + A.ui.DAY_NAMES[worst[0]] + 's — give it a specific slot that day and it stops slipping.';
    } else {
      var names = worst.map(function (w) { return A.ui.DAY_NAMES[w]; }).join(' & ');
      callout = names + ' are your trickiest days — a set time on those days would catch most of the misses.';
    }

    // Current gap.
    var gap = A.engine.daysSinceLastTick(h);
    var gapNote = tickedToday
      ? 'You’ve already ticked it today — momentum is on your side.'
      : (gap <= 0
        ? 'Your last tick was today or yesterday — the streak is very much alive.'
        : 'Current gap: ' + gap + (gap === 1 ? ' day' : ' days') + ' since your last tick. One tick today resets that to zero.');

    // Two concrete suggestions.
    var target = Math.max(1, h.targetPerWeek || 7);
    var shrink;
    if (h.difficulty === 'hard') {
      shrink = 'Shrink it: you marked this one 🔴 hard, so make the bad-day version laughably small (2 minutes counts). A tiny tick keeps the streak alive; ambition can come back later.';
    } else if (target >= 6) {
      shrink = 'Shrink it: drop the target from ' + target + ' to ' + Math.max(3, target - 2) + ' days a week for a fortnight. Hitting a smaller target rebuilds the identity — you can raise it again once it feels automatic.';
    } else {
      shrink = 'Shrink it: halve the habit until it’s impossible to skip — one page instead of twenty, one minute instead of ten. Consistency first, size later.';
    }

    var anchorC = null;
    (s.commitments || []).forEach(function (c) {
      if (!c || !c.title) return;
      var nDays = (c.days || []).length;
      if (!anchorC || nDays > (anchorC.days || []).length) anchorC = c;
    });
    var anchor;
    if (anchorC) {
      anchor = 'Stack it onto “' + esc(anchorC.title) + '” — right after it' +
        (anchorC.end ? ' ends at ' + esc(A.ui.fmtTime(anchorC.end)) : '') +
        ', do this habit while you’re already in motion. Riding an existing routine beats willpower.';
    } else {
      anchor = 'Tie it to something you already do every day — right after breakfast, or the moment you first sit at your desk. Habits stick when they ride on an existing routine.';
    }

    var DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun reads naturally
    var rowsHTML = DOW_ORDER.map(function (dw2) {
      var tot = total[dw2];
      var ms = miss[dw2];
      var pct = tot ? Math.round(100 * ms / tot) : 0;
      return '<div class="row" style="margin:6px 0">' +
        '<span class="small muted" style="width:34px;flex:none">' + A.ui.DAY_NAMES[dw2] + '</span>' +
        '<div class="bar" style="flex:1"><span class="bar-fill" style="width:' + pct + '%"></span></div>' +
        '<span class="small dim" style="width:86px;flex:none;text-align:right">' +
          (tot ? 'missed ' + ms + ' of ' + tot : 'no data') + '</span>' +
        '</div>';
    }).join('');

    A.ui.modal({
      title: '🤔 Why am I struggling?',
      accent: acc,
      body:
        '<div class="row" style="margin-bottom:8px"><span class="avatar sm">' + esc(h.emoji || '🌱') + '</span>' +
          '<span class="bold">' + esc(h.title) + '</span></div>' +
        '<p class="muted small">No judgement here — struggling habits are a scheduling problem, not a character flaw. Here’s what the last 4 weeks say:</p>' +
        '<div class="card-title" style="margin-top:12px">📅 Misses by weekday</div>' +
        rowsHTML +
        '<p class="small bold h-acc" style="margin-top:12px">💡 ' + callout + '</p>' +
        '<p class="muted small" style="margin-top:10px">' + gapNote + '</p>' +
        '<div class="card-title" style="margin-top:12px">🛠️ Two things to try</div>' +
        '<p class="small" style="margin-top:6px"><span class="bold">1.</span> ' + shrink + '</p>' +
        '<p class="small" style="margin-top:6px"><span class="bold">2.</span> ' + anchor + '</p>',
      actions: [
        { label: 'Got it', cls: 'btn-ghost' },
        {
          label: '✏️ Shrink this habit',
          cls: 'btn-primary',
          onClick: function () { openHabitModal(habitId); }
        }
      ]
    });
  }

  /* ---------------- HTML builders ---------------- */

  function headHTML() {
    var fade = A.engine.HABIT_FADE_DAYS || 14;
    return '<div class="screen-head"><div class="spread wrap">' +
      '<div><h1>Habits</h1>' +
      '<div class="sub">Repeated actions beat one-time heroics. Build your streaks.</div></div>' +
      '<button class="btn btn-primary" data-new="1">+ New habit</button>' +
      '</div>' +
      '<div class="muted small" style="margin-top:6px">Miss a habit and Acendri reminds you (check the 🔔 bell). ' +
      'Quiet for ' + fade + ' days and it fades to the archive.</div>' +
      '</div>';
  }

  function statsHTML(habits, t) {
    var best = 0, weekTicks = 0, ticks30 = 0;
    habits.forEach(function (h) {
      var st = A.engine.habitStreak(h);
      if (st > best) best = st;
      weekTicks += A.engine.habitWeekCount(h);
      ticks30 += ticksLast30(h, t);
    });
    var consistency = habits.length ? Math.round(100 * ticks30 / (habits.length * 30)) : 0;
    var perfect = habits.length > 0 && habits.every(function (h) { return !!(h.log && h.log[t]); });
    return '<div>' +
      '<div class="grid4">' +
      '<div class="card acc-orange"><div class="stat">' +
        '<div class="v">🔥 ' + best + (best === 1 ? ' day' : ' days') + '</div><div class="k">Best streak</div></div></div>' +
      '<div class="card acc-cyan"><div class="stat">' +
        '<div class="v">' + weekTicks + '</div><div class="k">Ticks this week</div></div></div>' +
      '<div class="card acc-green"><div class="stat">' +
        '<div class="v">' + habits.length + '</div><div class="k">Habit' + (habits.length === 1 ? '' : 's') + '</div></div></div>' +
      '<div class="card acc-purple"><div class="stat">' +
        '<div class="v h-acc">' + consistency + '%</div><div class="k">30-day consistency</div></div></div>' +
      '</div>' +
      (perfect
        ? '<div style="margin-top:10px;text-align:center"><span class="tag acc-yellow">🌟 All habits done today</span></div>'
        : '') +
      '</div>';
  }

  function weekGraphHTML(h, t) {
    var weeks = weeklyCounts(h, t);
    var cols = weeks.map(function (n, i) {
      var hpx = Math.max(3, Math.round(36 * n / 7));
      var weeksAgo = 7 - i;
      var label = (weeksAgo === 0 ? 'This week' : weeksAgo + (weeksAgo === 1 ? ' week ago' : ' weeks ago')) +
        ': ' + n + '/7';
      return '<div title="' + label + '" style="flex:1;max-width:22px;height:' + hpx +
        'px;background:var(--accB);border-radius:3px 3px 0 0;opacity:' + (n ? '1' : '.3') + '"></div>';
    }).join('');
    return '<div style="display:flex;align-items:flex-end;gap:4px;height:36px;margin-top:14px">' + cols + '</div>' +
      '<div class="small dim" style="margin-top:4px">8-week consistency</div>';
  }

  function habitCardHTML(h, t, goalById) {
    var esc = A.ui.esc;
    var acc = safeAccent(h.accent);
    var streak = A.engine.habitStreak(h);
    var weekCount = A.engine.habitWeekCount(h);
    var target = Math.max(1, h.targetPerWeek || 7);
    var pct = Math.min(100, Math.round(100 * weekCount / target));
    var hit = weekCount >= target;

    // Reminder / fade warning — clears naturally once today is ticked.
    var warnHTML = '';
    var tickedToday = !!(h.log && h.log[t]);
    var missed = A.engine.daysSinceLastTick(h);
    if (!tickedToday && missed >= 2) {
      if (missed >= 10) {
        var fade = A.engine.HABIT_FADE_DAYS || 14;
        var left = Math.max(1, fade - missed);
        warnHTML = '<div style="margin-top:10px"><span class="pill acc-red">🍂 fades in ' +
          left + (left === 1 ? ' day' : ' days') + '</span></div>';
      } else {
        warnHTML = '<div style="margin-top:10px"><span class="tag acc-yellow">⏰ missed ' +
          missed + ' days</span></div>';
      }
    }

    // Metadata: linked goal tag + difficulty tag + preferred-time sub note.
    var goal = h.goalId ? goalById[h.goalId] : null;
    var metaTags = '';
    if (goal) metaTags += '<span class="tag">🎯 ' + esc(goal.title) + '</span>';
    if (h.difficulty && DIFF_TAG[h.difficulty]) metaTags += '<span class="tag">' + DIFF_TAG[h.difficulty] + '</span>';
    var metaHTML = metaTags ? '<div class="row wrap" style="margin-top:10px;gap:6px">' + metaTags + '</div>' : '';
    var timeNote = (h.preferredTime && TIME_NOTE[h.preferredTime])
      ? '<div class="li-sub">' + TIME_NOTE[h.preferredTime] + '</div>'
      : '';

    var daysHTML = last7(t).map(function (iso) {
      var isToday = iso === t;
      var on = !!(h.log && h.log[iso]);
      return '<button class="habit-day' + (on ? ' on' : '') + (isToday ? ' today' : '') + '"' +
        (isToday
          ? ' data-tick="' + esc(h.id) + '" title="' + (on ? 'Untick today' : 'Tick off today') + '" aria-label="Toggle today"'
          : ' disabled title="' + esc(A.ui.fmtDate(iso)) + (on ? ' — done' : ' — missed') + '"') +
        '>' + dayLetter(iso) + '</button>';
    }).join('');

    // Struggle helper — only for habits old enough to have a real pattern.
    var struggling = ageDays(h, t, 30) >= 7 && completionRate30(h, t) < 0.6;
    var whyHTML = struggling
      ? '<div style="margin-top:12px"><button class="btn btn-sm btn-ghost" data-why="' + esc(h.id) +
        '" title="A kind look at the data">🤔 Why am I struggling?</button></div>'
      : '';

    return '<div class="card acc glow acc-' + acc + '">' +
      '<div class="spread">' +
        '<div class="row" style="min-width:0">' +
          '<span class="avatar">' + esc(h.emoji || '🌱') + '</span>' +
          '<div class="li-main">' +
            '<div class="li-title">' + esc(h.title) + '</div>' +
            '<div class="li-sub">🔥 ' + streak + ' day streak · target ' + target + '/week</div>' +
            timeNote +
          '</div>' +
        '</div>' +
        '<div class="row">' +
          '<button class="icon-btn" data-edit="' + esc(h.id) + '" title="Edit habit" aria-label="Edit habit">' + A.ui.icon('edit', 'sm') + '</button>' +
          '<button class="icon-btn danger" data-del="' + esc(h.id) + '" title="Delete habit" aria-label="Delete habit">' + A.ui.icon('trash', 'sm') + '</button>' +
        '</div>' +
      '</div>' +
      metaHTML +
      warnHTML +
      '<div class="small muted" style="margin:12px 0 6px">Last 7 days</div>' +
      '<div class="habit-days">' + daysHTML + '</div>' +
      '<div class="spread" style="margin-top:14px">' +
        '<span class="small muted">' + weekCount + ' of ' + target + ' this week</span>' +
        (hit ? '<span class="tag acc-' + acc + '">🎉 Weekly target hit!</span>' : '') +
      '</div>' +
      '<div class="bar" style="margin-top:6px"><span class="bar-fill" style="width:' + pct + '%"></span></div>' +
      weekGraphHTML(h, t) +
      whyHTML +
      '</div>';
  }

  function emptyHTML() {
    return '<div class="empty section-gap"><div class="e-emoji">🌱</div>' +
      '<p>Habits are how you become the person you want to be. Start with one tiny daily action.</p>' +
      '<button class="btn btn-acc acc-orange" data-new="1">+ New habit</button></div>';
  }

  function archiveHTML(archived) {
    var esc = A.ui.esc;
    if (!archived.length) return '';
    return '<div class="section-gap">' +
      '<div class="card-title">🍂 Faded away</div>' +
      '<div class="list">' +
      archived.map(function (h) {
        var acc = safeAccent(h.accent);
        return '<div class="list-item done">' +
          '<span class="avatar sm">' + esc(h.emoji || '🌱') + '</span>' +
          '<div class="li-main">' +
            '<div class="li-title">' + esc(h.title) + '</div>' +
            '<div class="li-sub">faded ' + esc(A.ui.timeAgo(h.archivedAt || h.createdAt || Date.now())) +
              ' · best data kept</div>' +
          '</div>' +
          '<button class="btn btn-sm btn-acc acc-' + acc + '" data-revive="' + esc(h.id) + '" ' +
            'title="Bring this habit back">Revive</button>' +
          '<button class="icon-btn danger" data-del="' + esc(h.id) + '" title="Delete forever" aria-label="Delete habit">' +
            A.ui.icon('trash', 'sm') + '</button>' +
        '</div>';
      }).join('') +
      '</div></div>';
  }

  /* ---------------- screen ---------------- */

  function renderHabits(el, ctx) {
    var s = A.S.get();
    var all = s.habits || [];
    var habits = all.filter(function (h) { return !h.archived; });   // active only
    var archived = all.filter(function (h) { return !!h.archived; });
    var t = A.ui.todayISO();

    var goalById = {};
    (s.goals || []).forEach(function (g) { goalById[g.id] = g; });

    var body;
    if (!habits.length) {
      body = emptyHTML();
    } else {
      body = '<div class="grid2 section-gap">' +
        habits.map(function (h) { return habitCardHTML(h, t, goalById); }).join('') +
        '</div>';
    }

    el.innerHTML = headHTML() + statsHTML(habits, t) + body + archiveHTML(archived);

    /* ---- listeners ---- */

    el.querySelectorAll('[data-new]').forEach(function (b) {
      b.addEventListener('click', function () { openHabitModal(null); });
    });

    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openHabitModal(b.getAttribute('data-edit')); });
    });

    el.querySelectorAll('[data-why]').forEach(function (b) {
      b.addEventListener('click', function () { openWhyModal(b.getAttribute('data-why')); });
    });

    el.querySelectorAll('[data-tick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-tick');
        var ticked = false, title = '', justHitTarget = false;
        A.S.update(function (st) {
          for (var i = 0; i < st.habits.length; i++) {
            var h = st.habits[i];
            if (h.id !== id) continue;
            title = h.title;
            if (!h.log) h.log = {};
            if (h.log[t]) {
              delete h.log[t];             // toggle off — just update
            } else {
              h.log[t] = true;
              ticked = true;
              var target = Math.max(1, h.targetPerWeek || 7);
              justHitTarget = A.engine.habitWeekCount(h) === target;
            }
            break;
          }
        });
        if (ticked) {
          A.S.addXp(5, 'Habit: ' + title);   // streak achievements fire from core
          if (justHitTarget) A.ui.toast('Weekly target hit for "' + title + '"!', '🎉');
        }
      });
    });

    el.querySelectorAll('[data-revive]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-revive');
        A.S.update(function (st) {
          for (var i = 0; i < st.habits.length; i++) {
            var h = st.habits[i];
            if (h.id !== id) continue;
            h.archived = false;
            delete h.archivedAt;
            if (!h.log) h.log = {};
            h.log[t] = true;   // tick today so it does not instantly re-fade
            break;
          }
        });
        A.ui.toast('Back from the ashes — streak restarts today 🔥');
      });
    });

    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-del');
        var habit = findHabit(A.S.get(), id);
        if (!habit) return;
        var streak = A.engine.habitStreak(habit);
        A.ui.confirm(
          'Delete "' + habit.title + '"? Your ' +
          (streak > 0 ? streak + '-day streak' : 'streak') +
          ' and all its history will be lost forever.',
          function () {
            A.S.update(function (st) {
              st.habits = st.habits.filter(function (h) { return h.id !== id; });
            });
            A.ui.toast('Habit deleted', '🗑️');
          },
          { title: 'Delete habit', yesLabel: 'Delete' }
        );
      });
    });
  }

  A.registerScreen('app/habits', {
    title: 'Habits',
    icon: 'flame',
    accent: 'orange',
    inShell: true,
    order: 5,
    render: renderHabits
  });
})();
