/* ============================================================
   Acendri OS — Habits: streak-powered daily actions.
   Stats row, glowing habit cards with a 7-day tick strip,
   weekly progress bars and a new/edit modal.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var EMOJIS = ['📚', '🏃', '🤸', '💪', '🥗', '💧', '😴', '🧹', '🎸', '🧠', '📖', '☀️'];

  /* ---------------- helpers ---------------- */

  function safeAccent(name) {
    return A.ui.ACCENT_NAMES.indexOf(name) >= 0 ? name : 'orange';
  }

  function findHabit(s, id) {
    var out = null;
    (s.habits || []).forEach(function (h) { if (h.id === id) out = h; });
    return out;
  }

  // Weekday initial for a local ISO date (component construction, not string parsing).
  function dayLetter(iso) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return A.ui.DAY_NAMES[d.getDay()].charAt(0);
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
    if (EMOJIS.indexOf(vEmoji) === -1) vEmoji = EMOJIS[0];

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
            A.S.update(function (st) {
              if (isNew) {
                st.habits.push({
                  id: A.ui.uid(), title: title, emoji: emoji, accent: accent,
                  targetPerWeek: target, log: {}, createdAt: Date.now()
                });
              } else {
                for (var i = 0; i < st.habits.length; i++) {
                  if (st.habits[i].id === habitId) {
                    st.habits[i].title = title;
                    st.habits[i].emoji = emoji;
                    st.habits[i].accent = accent;
                    st.habits[i].targetPerWeek = target;
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
    return '<div class="grid4">' +
      '<div class="card acc-orange"><div class="stat">' +
        '<div class="v">🔥 ' + best + (best === 1 ? ' day' : ' days') + '</div><div class="k">Best streak</div></div></div>' +
      '<div class="card acc-cyan"><div class="stat">' +
        '<div class="v">' + weekTicks + '</div><div class="k">Ticks this week</div></div></div>' +
      '<div class="card acc-green"><div class="stat">' +
        '<div class="v">' + habits.length + '</div><div class="k">Habit' + (habits.length === 1 ? '' : 's') + '</div></div></div>' +
      '<div class="card acc-purple"><div class="stat">' +
        '<div class="v h-acc">' + consistency + '%</div><div class="k">30-day consistency</div></div></div>' +
      '</div>';
  }

  function habitCardHTML(h, t) {
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

    var daysHTML = last7(t).map(function (iso) {
      var isToday = iso === t;
      var on = !!(h.log && h.log[iso]);
      return '<button class="habit-day' + (on ? ' on' : '') + (isToday ? ' today' : '') + '"' +
        (isToday
          ? ' data-tick="' + esc(h.id) + '" title="' + (on ? 'Untick today' : 'Tick off today') + '" aria-label="Toggle today"'
          : ' disabled title="' + esc(A.ui.fmtDate(iso)) + (on ? ' — done' : ' — missed') + '"') +
        '>' + dayLetter(iso) + '</button>';
    }).join('');

    return '<div class="card acc glow acc-' + acc + '">' +
      '<div class="spread">' +
        '<div class="row" style="min-width:0">' +
          '<span class="avatar">' + esc(h.emoji || '🌱') + '</span>' +
          '<div class="li-main">' +
            '<div class="li-title">' + esc(h.title) + '</div>' +
            '<div class="li-sub">🔥 ' + streak + ' day streak · target ' + target + '/week</div>' +
          '</div>' +
        '</div>' +
        '<div class="row">' +
          '<button class="icon-btn" data-edit="' + esc(h.id) + '" title="Edit habit" aria-label="Edit habit">' + A.ui.icon('edit', 'sm') + '</button>' +
          '<button class="icon-btn danger" data-del="' + esc(h.id) + '" title="Delete habit" aria-label="Delete habit">' + A.ui.icon('trash', 'sm') + '</button>' +
        '</div>' +
      '</div>' +
      warnHTML +
      '<div class="small muted" style="margin:12px 0 6px">Last 7 days</div>' +
      '<div class="habit-days">' + daysHTML + '</div>' +
      '<div class="spread" style="margin-top:14px">' +
        '<span class="small muted">' + weekCount + ' of ' + target + ' this week</span>' +
        (hit ? '<span class="tag acc-' + acc + '">🎉 Weekly target hit!</span>' : '') +
      '</div>' +
      '<div class="bar" style="margin-top:6px"><span class="bar-fill" style="width:' + pct + '%"></span></div>' +
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

    var body;
    if (!habits.length) {
      body = emptyHTML();
    } else {
      body = '<div class="grid2 section-gap">' +
        habits.map(function (h) { return habitCardHTML(h, t); }).join('') +
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
