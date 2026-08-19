/* ============================================================
   Acendri OS — Timetable screen
   Fixed commitments + open tasks -> one auto-planned week.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var PX_PER_MIN = 0.9;
  var DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sunday = 0

  /* ---------------- lookups ---------------- */

  function findCommitment(s, id) {
    return (s.commitments || []).filter(function (c) { return c.id === id; })[0] || null;
  }

  function findTask(s, id) {
    return (s.tasks || []).filter(function (t) { return t.id === id; })[0] || null;
  }

  function findEvent(s, id) {
    return (s.events || []).filter(function (e) { return e.id === id; })[0] || null;
  }

  function findBlock(s, iso, blockId) {
    if (!s.timetable || !s.timetable.days || !s.timetable.days[iso]) return null;
    return s.timetable.days[iso].filter(function (b) { return b.id === blockId; })[0] || null;
  }

  function safeAccent(name, fallback) {
    return A.ui.ACCENT_NAMES.indexOf(name) >= 0 ? name : fallback;
  }

  function wakeSleep(s) {
    var wake = A.ui.minutes((s.settings && s.settings.wake) || '07:00');
    var sleep = A.ui.minutes((s.settings && s.settings.sleep) || '22:30');
    if (sleep <= wake) sleep = wake + 8 * 60;
    return { wake: wake, sleep: sleep };
  }

  function fmtDays(days) {
    var d = (days || []).slice().sort(function (a, b) { return a - b; });
    if (d.length === 7) return 'Every day';
    return d.map(function (i) { return A.ui.DAY_NAMES[i]; }).join(' ') || '—';
  }

  function taskBlockProgress(s, tt) {
    var total = 0, done = 0;
    if (tt && tt.days) {
      Object.keys(tt.days).forEach(function (iso) {
        tt.days[iso].forEach(function (b) {
          if (b.type !== 'task') return;
          total++;
          var t = findTask(s, b.refId);
          if (b.done || (t && t.done)) done++;
        });
      });
    }
    return { total: total, done: done };
  }

  /* ---------------- actions ---------------- */

  function unplacedToast(tt) {
    if (tt && tt.unplaced && tt.unplaced.length) {
      A.ui.toast('Couldn’t fit ' + tt.unplaced.length + ' task' + (tt.unplaced.length === 1 ? '' : 's') + ' — see the note below', '⚠️');
    }
  }

  /* ---------------- planning the week ---------------- */

  // The Generate button only opens this — planning is always an explicit choice,
  // never a silent rebuild of the week you just cleared.
  function openPlanChooser() {
    var esc = A.ui.esc;
    var s = A.S.get();
    var openTasks = (s.tasks || []).filter(function (t) { return !t.done; }).length;
    var commitments = (s.commitments || []).length;
    var lw = s.lastWeekPlan;
    var lock = A.engine.weekLock(s);

    if (lock.locked) { explainLock(); return; }

    var opts = [];
    if (lw && lw.items && lw.items.length) {
      opts.push({
        key: 'repeat', accent: 'green', emoji: '♻️',
        title: 'Keep the same as last week',
        sub: lw.items.length + ' session' + (lw.items.length === 1 ? '' : 's') + ' — same days, same times'
      });
    }
    opts.push({
      key: 'ask', accent: 'cyan', emoji: '🤖',
      title: 'Tell Acendri about your week',
      sub: 'Describe it in plain words and Acendri builds it'
    });
    if (openTasks || commitments) {
      opts.push({
        key: 'auto', accent: 'purple', emoji: '⚡',
        title: 'Auto-plan from what I already have',
        sub: openTasks + ' open task' + (openTasks === 1 ? '' : 's') +
          (commitments ? ' around ' + commitments + ' commitment' + (commitments === 1 ? '' : 's') : '')
      });
    }

    A.ui.modal({
      title: '📅 Plan your week',
      accent: 'purple',
      wide: true,
      body:
        '<p class="muted small" style="margin-bottom:12px">Once your week is planned it stays put for ' +
        A.engine.WEEK_DAYS + ' days — use 🤖 Ask Acendri to add to it, and plan afresh when the new week opens.</p>' +
        '<div class="list">' +
        opts.map(function (o) {
          return '<div class="list-item acc-' + o.accent + '" data-choice="' + o.key + '" style="cursor:pointer">' +
            '<span class="icon-tile">' + o.emoji + '</span>' +
            '<div class="li-main"><div class="li-title">' + esc(o.title) + '</div>' +
            '<div class="li-sub">' + esc(o.sub) + '</div></div>' +
            A.ui.icon('arrow', 'sm') +
            '</div>';
        }).join('') +
        '</div>' +
        (!openTasks && !commitments && !(lw && lw.items && lw.items.length)
          ? '<p class="dim small" style="margin-top:10px">Nothing on file yet — Acendri can create the tasks for you from a sentence or two.</p>'
          : ''),
      actions: [{ label: 'Cancel', cls: 'btn-ghost' }],
      onOpen: function (m, close) {
        m.querySelectorAll('[data-choice]').forEach(function (row) {
          row.addEventListener('click', function () {
            var k = row.getAttribute('data-choice');
            close();
            if (k === 'repeat') keepSameAsLastWeek();
            else if (k === 'ask') openAskModal('');
            else autoPlanFromTasks();
          });
        });
      }
    });
  }

  function explainLock() {
    var lock = A.engine.weekLock(A.S.get());
    A.ui.modal({
      title: '🔒 This week is planned',
      accent: 'purple',
      body:
        '<p class="muted">Your plan is locked in until <strong>' + A.ui.esc(A.ui.fmtDate(lock.unlocksOn)) + '</strong>' +
        (lock.daysLeft ? ' — ' + lock.daysLeft + ' day' + (lock.daysLeft === 1 ? '' : 's') + ' to go' : '') +
        '. Sticking to one plan is what makes it work.</p>' +
        '<p class="muted small" style="margin-top:10px">Something new came up? Use <strong>🤖 Ask Acendri</strong> to slot it into the week you already have. Want to start over completely? <strong>Clear plan</strong> below the grid wipes it.</p>',
      actions: [
        { label: 'Got it', cls: 'btn-ghost' },
        { label: '🤖 Add something', cls: 'btn-acc', onClick: function () { openAskModal(''); } }
      ]
    });
  }

  function autoPlanFromTasks() {
    var pre = A.S.get();
    var openTasks = (pre.tasks || []).filter(function (t) { return !t.done; }).length;

    // No XP for planning — core settles the week when it ends and pays per completed block.
    A.S.update(function (s) { A.engine.generateTimetable(s); });
    var after = A.S.get();
    var tt = after.timetable;
    if (!tt) return;
    if (!openTasks) {
      A.ui.toast('Planned your commitments — add tasks for Acendri to slot in around them', '🗓️');
    } else {
      var n = taskBlockProgress(after, tt).total;
      A.ui.toast('Planned ' + n + ' task block' + (n === 1 ? '' : 's') + ' this week', '🗓️');
    }
    unplacedToast(tt);
  }

  function keepSameAsLastWeek() {
    var built = null;
    A.S.update(function (s) { built = A.engine.repeatLastWeek(s); });
    if (!built) { A.ui.toast('No previous week to copy — planning fresh instead', '🤔'); openPlanChooser(); return; }
    var after = A.S.get();
    var n = taskBlockProgress(after, after.timetable).total;
    A.ui.toast('Same shape as last week — ' + n + ' block' + (n === 1 ? '' : 's') + ' back on the grid', '♻️');
    unplacedToast(after.timetable);
    A.S.log('Repeated last week’s plan', '♻️');
  }

  function clearPlan() {
    A.ui.confirm(
      'Clear this week’s plan? Your tasks and commitments stay, but the layout and the memory of it go — the next plan starts from a blank page.',
      function () {
        A.S.update(function (s) {
          s.timetable = null;
          s.lastWeekPlan = null;   // a cleared week is not offered back as "same as last week"
        });
        A.ui.toast('Cleared — your next plan starts fresh', '🧹');
      },
      { title: 'Clear plan', yesLabel: 'Clear it all' }
    );
  }

  // Rearranges the planned week: every open task is re-placed around commitments,
  // events and everything already done. Works even while the week is locked —
  // it rearranges what's there, it never regenerates. The engine guarantees no
  // duplicates and never moves done blocks.
  function rebuildWeekNow() {
    if (!A.S.get().timetable) {
      A.ui.toast('No week on the grid yet — build it first', '🤔');
      return;
    }
    A.S.update(function (s) { A.engine.rebuildWeek(s); });
    var after = A.S.get();
    var prog = taskBlockProgress(after, after.timetable);
    var open = Math.max(0, prog.total - prog.done);
    A.ui.toast('Rearranged ' + open + ' open task block' + (open === 1 ? '' : 's') + ' — done blocks didn’t move', '🔁');
    unplacedToast(after.timetable);
    A.S.log('Rebuilt the week around what’s fixed', '🔁');
  }

  function deleteCommitment(id) {
    var c = findCommitment(A.S.get(), id);
    if (!c) return;
    A.ui.confirm('Delete "' + c.title + '"? Its blocks come off the timetable too.', function () {
      var hadTT = !!A.S.get().timetable;
      A.S.update(function (s) {
        s.commitments = s.commitments.filter(function (x) { return x.id !== id; });
        if (s.timetable && s.timetable.days) {
          Object.keys(s.timetable.days).forEach(function (iso) {
            s.timetable.days[iso] = s.timetable.days[iso].filter(function (b) {
              return !(b.type === 'commitment' && b.refId === id);
            });
          });
        }
      });
      A.ui.toast(hadTT ? 'Commitment deleted — 🔁 Rebuild week reclaims the time' : 'Commitment deleted', '🗑️');
    }, { yesLabel: 'Delete it' });
  }

  function removeBlock(iso, blockId) {
    A.S.update(function (s) {
      if (s.timetable && s.timetable.days && s.timetable.days[iso]) {
        s.timetable.days[iso] = s.timetable.days[iso].filter(function (b) { return b.id !== blockId; });
      }
    });
    A.ui.toast('Removed from this week’s plan', '🗓️');
  }

  function markTaskDone(iso, blockId) {
    var xp = 0, title = '', already = false, found = false;
    A.S.update(function (s) {
      var b = findBlock(s, iso, blockId);
      if (!b) return;
      found = true;
      title = b.title;
      var t = findTask(s, b.refId);
      if (t && !t.done) {
        t.done = true;
        t.doneAt = Date.now();
        xp = t.priority === 3 ? 15 : 10;
        title = t.title;
      } else if (t) {
        already = true;
        title = t.title;
      }
      // tick every block that points at this task
      Object.keys(s.timetable.days).forEach(function (d) {
        s.timetable.days[d].forEach(function (bb) {
          if (bb.type === 'task' && bb.refId === b.refId) bb.done = true;
        });
      });
    });
    if (!found) return;
    if (xp) A.S.addXp(xp, 'Task done: ' + title);
    else A.ui.toast(already ? '“' + title + '” was already done — block ticked off' : 'Block ticked off', '✅');
  }

  /* ---------------- Ask Acendri (plan from plain words) ---------------- */

  var ASK_EXAMPLES = [
    'Basketball training 3 times this week, one hour each',
    'Study for my science test on Thursday',
    'Gym twice and one long run on Saturday',
    'Practise guitar 4 times, 30 minutes each'
  ];

  function openAskModal(prefill) {
    var esc = A.ui.esc;
    if (!window.Ascendri.brain) {
      A.ui.toast('Acendri’s brain isn’t loaded — add tasks and commitments by hand instead', '🤖');
      return;
    }

    function submit(m) {
      var B = window.Ascendri.brain;
      var field = m.querySelector('#ask-text');
      var text = field ? field.value.trim() : '';
      if (!text) { A.ui.toast('Tell Acendri at least one thing about your week', '✍️'); return false; }
      if (!B) { A.ui.toast('Acendri’s brain isn’t loaded — add tasks and commitments by hand instead', '🤖'); return true; }
      var plan = B.planFromText(text);
      if (!plan || !plan.sessions || !plan.sessions.length) {
        A.ui.toast('Acendri couldn’t find anything to plan in that — try naming an activity', '🤔');
        return false;
      }
      openPlanConfirmModal(text, plan);
      return true; // close this modal, the confirm view takes over
    }

    var hasPlan = !!A.S.get().timetable;
    A.ui.modal({
      title: hasPlan ? '🤖 Add to your week' : '🤖 Tell Acendri about your week',
      accent: 'cyan',
      wide: true,
      body:
        '<div class="field"><label>' + (hasPlan ? 'What else needs a slot?' : 'What’s on this week?') + '</label>' +
        '<textarea class="textarea" id="ask-text" rows="4" placeholder="Basketball training 3 times this week, one hour each. Study for my science test on Thursday. Keep Sunday free.">' + esc(prefill || '') + '</textarea></div>' +
        '<p class="muted small">' +
        (hasPlan
          ? 'Acendri fits these into the gaps around the week you already have — nothing already on the grid moves. Tap an example to start:'
          : 'Plain words are fine — Acendri picks out the activities, how often and how long, then plans them around your commitments. Tap an example to start:') +
        '</p>' +
        '<div class="chips">' +
        ASK_EXAMPLES.map(function (ex, i) {
          return '<button type="button" class="chip" data-ex="' + i + '">' + esc(ex) + '</button>';
        }).join('') +
        '</div>',
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        { label: hasPlan ? '➕ Add to my week' : '⚡ Plan my week', cls: 'btn-primary', onClick: function (m) { return submit(m); } }
      ],
      onOpen: function (m) {
        var field = m.querySelector('#ask-text');
        m.querySelectorAll('[data-ex]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var ex = ASK_EXAMPLES[+btn.getAttribute('data-ex')] || '';
            var cur = field.value.trim();
            field.value = cur ? cur.replace(/[.\s]*$/, '') + '. ' + ex : ex;
            field.focus();
          });
        });
        if (field) field.focus();
      }
    });
  }

  function openPlanConfirmModal(text, plan) {
    var esc = A.ui.esc;
    var sessions = (plan.sessions || []).map(function (se) {
      return {
        title: String(se.title || 'Session'),
        count: Math.max(1, Math.min(7, Math.round(se.count) || 1)),
        duration: Math.max(15, Math.min(240, Math.round(se.duration) || 45)),
        accent: safeAccent(se.accent, 'cyan')
      };
    });
    var totalTasks = sessions.reduce(function (a, se) { return a + se.count; }, 0);
    var hasPlan = !!A.S.get().timetable;

    A.ui.modal({
      title: '🤖 Here’s what Acendri heard',
      accent: 'cyan',
      wide: true,
      body:
        (plan.summary ? '<p class="muted small" style="margin-bottom:10px">' + esc(plan.summary) + '</p>' : '') +
        '<div class="list">' +
        sessions.map(function (se) {
          return '<div class="list-item">' +
            '<span class="badge-dot acc-' + se.accent + '"></span>' +
            '<div class="li-main">' +
            '<div class="li-title">' + esc(se.title) + ' ×' + se.count + '</div>' +
            '<div class="li-sub">' + se.duration + ' min each</div>' +
            '</div></div>';
        }).join('') +
        '</div>' +
        '<p class="dim small" style="margin-top:10px">' + totalTasks + ' task' + (totalTasks === 1 ? '' : 's') +
        (hasPlan
          ? ' will be slotted into the free gaps of your existing week — nothing already planned moves.'
          : ' will be added, spread over the coming days, then the week is planned around your commitments.') +
        '</p>',
      actions: [
        { label: '← Edit', cls: 'btn-ghost', onClick: function () { openAskModal(text); } },
        { label: hasPlan ? '➕ Add to my week' : '⚡ Build my week', cls: 'btn-primary', onClick: function () { addSessions(sessions); } }
      ]
    });
  }

  // Adds the sessions to the week that already exists; builds one if there is none.
  function addSessions(sessions) {
    var now = Date.now();
    var t0 = A.ui.todayISO();
    var hadPlan = !!A.S.get().timetable;
    var newIds = [];
    var result = null;

    A.S.update(function (s) {
      if (!s.tasks) s.tasks = [];
      // days still ahead inside the current plan (or the coming week when planning fresh)
      var window = hadPlan ? A.engine.planWindow(s).filter(function (iso) { return iso >= t0; }) : null;
      if (!window || !window.length) window = [t0, A.ui.addDaysISO(t0, 1), A.ui.addDaysISO(t0, 2), A.ui.addDaysISO(t0, 3), A.ui.addDaysISO(t0, 4), A.ui.addDaysISO(t0, 5), A.ui.addDaysISO(t0, 6)];

      sessions.forEach(function (se, si) {
        for (var i = 0; i < se.count; i++) {
          var id = A.ui.uid();
          newIds.push(id);
          var slot = window.length === 1 ? 0 : Math.min(window.length - 1, Math.round(i * (window.length - 1) / Math.max(1, se.count - 1)));
          s.tasks.push({
            id: id,
            title: se.title + (se.count > 1 ? ' (' + (i + 1) + '/' + se.count + ')' : ''),
            priority: 2,
            due: window[slot],
            duration: se.duration,
            done: false,
            createdAt: now + si * 10 + i
          });
        }
      });

      if (hadPlan) result = A.engine.addTasksToTimetable(s, newIds);
      else A.engine.generateTimetable(s);
    });

    var after = A.S.get();
    var tt = after.timetable;
    if (hadPlan) {
      var placed = result ? result.placed : 0;
      A.ui.toast(placed
        ? 'Added ' + placed + ' block' + (placed === 1 ? '' : 's') + ' to your week — nothing else moved'
        : 'Your week is full — the new tasks are waiting on your task list', '🤖');
    } else {
      var n = taskBlockProgress(after, tt).total;
      A.ui.toast('Acendri placed ' + n + ' block' + (n === 1 ? '' : 's') + ' into your week', '🤖');
    }
    unplacedToast(tt);
    A.S.log(hadPlan ? 'Acendri added to the week' : 'Acendri planned the week from a description', '🤖');
  }

  /* ---------------- commitment modal ---------------- */

  function openCommitmentModal(commitmentId) {
    var esc = A.ui.esc;
    var src = commitmentId ? findCommitment(A.S.get(), commitmentId) : null;
    var isEdit = !!src;
    var draft = {
      title: src ? src.title : '',
      days: src ? (src.days || []).slice() : [],
      start: src ? src.start : '09:00',
      end: src ? src.end : '10:00',
      accent: src ? safeAccent(src.accent, 'indigo') : 'indigo'
    };

    function syncDraft(m) {
      var f;
      f = m.querySelector('#cm-title'); if (f) draft.title = f.value;
      f = m.querySelector('#cm-start'); if (f) draft.start = f.value;
      f = m.querySelector('#cm-end'); if (f) draft.end = f.value;
    }

    function renderForm(m) {
      var body = m.querySelector('#cm-form');
      body.innerHTML =
        '<div class="field"><label>What is it?</label>' +
        '<input class="input" id="cm-title" maxlength="60" placeholder="e.g. School, Training, Work shift" value="' + esc(draft.title) + '"></div>' +
        '<div class="field"><label>Days</label><div class="row wrap">' +
        DAY_LETTERS.map(function (L, i) {
          var on = draft.days.indexOf(i) >= 0;
          return '<button type="button" class="btn btn-sm' + (on ? ' btn-acc acc-indigo' : '') + '" data-day="' + i + '" title="' + A.ui.DAY_NAMES[i] + '">' + L + '</button>';
        }).join('') +
        '</div></div>' +
        '<div class="grid2">' +
        '<div class="field"><label>Starts</label><input class="input" id="cm-start" type="time" value="' + esc(draft.start) + '"></div>' +
        '<div class="field"><label>Ends</label><input class="input" id="cm-end" type="time" value="' + esc(draft.end) + '"></div>' +
        '</div>' +
        '<div class="field"><label>Colour</label><div class="swatches">' +
        A.ui.ACCENT_NAMES.map(function (n) {
          return '<button type="button" data-swatch="' + n + '" class="' + (draft.accent === n ? 'sel' : '') + '"' +
            ' style="background:' + A.ui.ACCENTS[n].b + '" title="' + n + '"></button>';
        }).join('') +
        '</div></div>';

      body.querySelectorAll('[data-day]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          syncDraft(m);
          var d = +btn.getAttribute('data-day');
          var ix = draft.days.indexOf(d);
          if (ix >= 0) draft.days.splice(ix, 1); else draft.days.push(d);
          renderForm(m);
        });
      });
      body.querySelectorAll('[data-swatch]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          syncDraft(m);
          draft.accent = btn.getAttribute('data-swatch');
          A.ui.ACCENT_NAMES.forEach(function (n) { m.classList.remove('acc-' + n); });
          m.classList.add('acc-' + draft.accent);
          renderForm(m);
        });
      });
    }

    function save(m) {
      syncDraft(m);
      var title = draft.title.trim();
      if (!title) { A.ui.toast('Name the commitment first', '✍️'); return false; }
      if (!draft.days.length) { A.ui.toast('Pick at least one day', '📆'); return false; }
      if (!draft.start || !draft.end || A.ui.minutes(draft.end) <= A.ui.minutes(draft.start)) {
        A.ui.toast('The end time must be after the start', '⏰'); return false;
      }
      var days = draft.days.slice().sort(function (a, b) { return a - b; });
      var accent = safeAccent(draft.accent, 'indigo');
      var hadPlan = !!A.S.get().timetable;

      if (isEdit) {
        var found = false;
        A.S.update(function (s) {
          var c = findCommitment(s, commitmentId);
          if (!c) return;
          found = true;
          c.title = title; c.days = days; c.start = draft.start; c.end = draft.end; c.accent = accent;
        });
        if (!found) { A.ui.toast('That commitment no longer exists', '🤔'); return true; }
        A.ui.toast(hadPlan ? 'Commitment updated — hit 🔁 Rebuild week to replan around it' : 'Commitment updated', '✏️');
      } else {
        A.S.update(function (s) {
          s.commitments.push({ id: A.ui.uid(), title: title, days: days, start: draft.start, end: draft.end, accent: accent });
        });
        A.ui.toast(hadPlan ? 'Commitment added — hit 🔁 Rebuild week to weave it in' : 'Commitment added', '📌');
      }
      return true;
    }

    A.ui.modal({
      title: isEdit ? '✏️ Edit commitment' : '🕰️ New commitment',
      accent: draft.accent,
      body: '<div id="cm-form"></div>',
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        { label: isEdit ? 'Save changes' : 'Add commitment', cls: 'btn-primary', onClick: function (m) { return save(m); } }
      ],
      onOpen: function (m) { renderForm(m); }
    });
  }

  /* ---------------- one-off events ---------------- */

  function openEventModal(eventId) {
    var esc = A.ui.esc;
    var t0 = A.ui.todayISO();
    var src = eventId ? findEvent(A.S.get(), eventId) : null;
    var isEdit = !!src;
    var draft = {
      title: src ? String(src.title || '') : '',
      date: (src && src.date) || t0,
      start: (src && src.start) || '18:00',
      end: (src && src.end) || '19:30',
      accent: src ? safeAccent(src.accent, 'pink') : 'pink'
    };

    function syncDraft(m) {
      var f;
      f = m.querySelector('#ev-title'); if (f) draft.title = f.value;
      f = m.querySelector('#ev-date'); if (f) draft.date = f.value;
      f = m.querySelector('#ev-start'); if (f) draft.start = f.value;
      f = m.querySelector('#ev-end'); if (f) draft.end = f.value;
    }

    function renderForm(m) {
      var body = m.querySelector('#ev-form');
      body.innerHTML =
        '<div class="field"><label>What’s happening?</label>' +
        '<input class="input" id="ev-title" maxlength="60" placeholder="e.g. Dentist, Match day, Sam’s party" value="' + esc(draft.title) + '"></div>' +
        '<div class="field"><label>Date</label>' +
        '<input class="input" id="ev-date" type="date" min="' + t0 + '" value="' + esc(draft.date) + '"></div>' +
        '<div class="grid2">' +
        '<div class="field"><label>Starts</label><input class="input" id="ev-start" type="time" value="' + esc(draft.start) + '"></div>' +
        '<div class="field"><label>Ends</label><input class="input" id="ev-end" type="time" value="' + esc(draft.end) + '"></div>' +
        '</div>' +
        '<div class="field"><label>Colour</label><div class="swatches">' +
        A.ui.ACCENT_NAMES.map(function (n) {
          return '<button type="button" data-swatch="' + n + '" class="' + (draft.accent === n ? 'sel' : '') + '"' +
            ' style="background:' + A.ui.ACCENTS[n].b + '" title="' + n + '"></button>';
        }).join('') +
        '</div></div>';

      body.querySelectorAll('[data-swatch]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          syncDraft(m);
          draft.accent = btn.getAttribute('data-swatch');
          A.ui.ACCENT_NAMES.forEach(function (n) { m.classList.remove('acc-' + n); });
          m.classList.add('acc-' + draft.accent);
          renderForm(m);
        });
      });
    }

    function save(m) {
      syncDraft(m);
      var title = draft.title.trim();
      if (!title) { A.ui.toast('Name the event first', '✍️'); return false; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date || '')) { A.ui.toast('Pick a date for it', '📆'); return false; }
      if (draft.date < t0) { A.ui.toast('Events go on today or a later day', '📆'); return false; }
      if (!draft.start || !draft.end || A.ui.minutes(draft.end) <= A.ui.minutes(draft.start)) {
        A.ui.toast('The end time must be after the start', '⏰'); return false;
      }
      var accent = safeAccent(draft.accent, 'pink');
      var pre = A.S.get();
      var hadTT = !!pre.timetable;
      var windowIsos = hadTT ? A.engine.planWindow(pre) : [];
      var oldDate = (isEdit && src && src.date) || null;
      // Only rebuild when the event actually touches the planned week — either
      // it lands inside it, or it is being moved out of it.
      var inWindowNew = hadTT && windowIsos.indexOf(draft.date) >= 0;
      var inWindowOld = hadTT && !!oldDate && windowIsos.indexOf(oldDate) >= 0;
      var touchesGrid = inWindowNew || inWindowOld;
      var missing = false;

      A.S.update(function (s) {
        if (!s.events) s.events = [];
        if (isEdit) {
          var ev = findEvent(s, eventId);
          if (!ev) { missing = true; return; }
          ev.title = title; ev.date = draft.date; ev.start = draft.start; ev.end = draft.end; ev.accent = accent;
        } else {
          s.events.push({ id: A.ui.uid(), title: title, date: draft.date, start: draft.start, end: draft.end, accent: accent });
        }
        // Same update: the planned week absorbs the change straight away — the
        // rebuild re-places open tasks around it and never moves done blocks.
        if (s.timetable && touchesGrid) A.engine.rebuildWeek(s);
      });

      if (missing) { A.ui.toast('That event no longer exists', '🤔'); return true; }
      if (inWindowNew) {
        A.ui.toast((isEdit ? 'Event updated' : 'Event added') + ' — the week rearranged itself so it’s on the grid', '🎉');
        unplacedToast(A.S.get().timetable);
      } else if (touchesGrid) {
        A.ui.toast('Event moved beyond this plan — the week rearranged around the gap it left', '🎉');
        unplacedToast(A.S.get().timetable);
      } else if (hadTT) {
        A.ui.toast((isEdit ? 'Event updated' : 'Event added') + ' — it’s after this plan ends, so it’ll be placed when that week is built', '🎉');
      } else {
        A.ui.toast((isEdit ? 'Event updated' : 'Event added') + ' — build your week to see it on the grid', '🎉');
      }
      A.S.log((isEdit ? 'Updated event: ' : 'Added event: ') + title, '🎉');
      return true;
    }

    A.ui.modal({
      title: isEdit ? '✏️ Edit event' : '🎉 New event',
      accent: draft.accent,
      body: '<div id="ev-form"></div>',
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        { label: isEdit ? 'Save changes' : 'Add event', cls: 'btn-primary', onClick: function (m) { return save(m); } }
      ],
      onOpen: function (m) { renderForm(m); }
    });
  }

  function deleteEvent(id) {
    var ev = findEvent(A.S.get(), id);
    if (!ev) return;
    A.ui.confirm('Delete "' + ev.title + '"? Its block comes off the timetable too.', function () {
      var hadTT = !!A.S.get().timetable;
      A.S.update(function (s) {
        s.events = (s.events || []).filter(function (x) { return x.id !== id; });
        if (s.timetable && s.timetable.days) {
          Object.keys(s.timetable.days).forEach(function (iso) {
            s.timetable.days[iso] = s.timetable.days[iso].filter(function (b) {
              return !(b.type === 'event' && b.refId === id);
            });
          });
        }
      });
      A.ui.toast(hadTT ? 'Event deleted — 🔁 Rebuild week reclaims the time' : 'Event deleted', '🗑️');
    }, { yesLabel: 'Delete it' });
  }

  /* ---------------- block detail modal ---------------- */

  function openBlockModal(iso, blockId) {
    var esc = A.ui.esc;
    var s = A.S.get();
    var b = findBlock(s, iso, blockId);
    if (!b) { A.ui.toast('That block is gone — regenerate for a fresh plan', '🤔'); return; }

    var isTask = b.type === 'task';
    var isEvent = b.type === 'event';
    var task = isTask ? findTask(s, b.refId) : null;
    var ev = isEvent ? findEvent(s, b.refId) : null;
    var commitment = (!isTask && !isEvent) ? findCommitment(s, b.refId) : null;
    var done = !!(b.done || (task && task.done));
    var mins = Math.max(0, b.endMin - b.startMin);

    var rows =
      '<div class="row wrap" style="margin-bottom:10px">' +
      '<span class="pill">' + (isTask ? '📋 Task' : isEvent ? '🎉 Event' : '📌 Commitment') + '</span>' +
      (done ? '<span class="tag">✅ done</span>' : '') +
      (task && task.priority === 3 ? '<span class="tag" style="color:#f87171;border-color:#7f1d1d">high priority</span>' : '') +
      '</div>' +
      '<div class="col" style="gap:6px">' +
      '<div class="row muted small">' + A.ui.icon('calendar', 'sm') + '<span>' + A.ui.fmtDate(iso) + '</span></div>' +
      '<div class="row muted small">' + A.ui.icon('clock', 'sm') + '<span>' + A.ui.fmtTime(b.start) + '–' + A.ui.fmtTime(b.end) + ' · ' + mins + ' min</span></div>' +
      (task && task.due ? '<div class="row muted small">' + A.ui.icon('flag', 'sm') + '<span>Due ' + A.ui.fmtDate(task.due) + '</span></div>' : '') +
      (commitment ? '<div class="row muted small">' + A.ui.icon('calendar', 'sm') + '<span>Repeats: ' + esc(fmtDays(commitment.days)) + '</span></div>' : '') +
      '</div>' +
      (!isTask && !isEvent && !commitment ? '<p class="dim small" style="margin-top:10px">This commitment was deleted — regenerate to tidy the week.</p>' : '') +
      (isTask && !task ? '<p class="dim small" style="margin-top:10px">The task behind this block was deleted — you can remove the block.</p>' : '') +
      (isEvent && ev ? '<p class="dim small" style="margin-top:10px">One-off event — Acendri plans your tasks around it.</p>' : '') +
      (isEvent && !ev ? '<p class="dim small" style="margin-top:10px">This event was deleted — you can take the block off the grid.</p>' : '') +
      (!isTask && commitment ? '<p class="dim small" style="margin-top:10px">Fixed block — Acendri plans your tasks around it.</p>' : '');

    var actions = [{ label: 'Close', cls: 'btn-ghost' }];
    if (isTask) {
      actions.push({ label: 'Remove from plan', cls: 'btn-ghost', onClick: function () { removeBlock(iso, blockId); } });
      if (!done && task) {
        actions.push({ label: '✅ Mark task done', cls: 'btn-primary', onClick: function () { markTaskDone(iso, blockId); } });
      } else if (!task) {
        // task deleted; only removal makes sense (button above)
      }
    } else if (isEvent) {
      if (ev) {
        actions.push({ label: '✏️ Edit event', cls: 'btn-acc', onClick: function () { openEventModal(ev.id); } });
      } else {
        actions.push({ label: 'Remove from plan', cls: 'btn-danger', onClick: function () { removeBlock(iso, blockId); } });
      }
    } else if (commitment) {
      actions.push({ label: '✏️ Edit commitment', cls: 'btn-acc', onClick: function () { openCommitmentModal(commitment.id); } });
    } else {
      actions.push({ label: 'Remove from plan', cls: 'btn-danger', onClick: function () { removeBlock(iso, blockId); } });
    }

    A.ui.modal({
      title: esc(b.title),
      accent: safeAccent(b.accent, isTask ? 'cyan' : isEvent ? 'pink' : 'indigo'),
      body: rows,
      actions: actions
    });
  }

  /* ---------------- HTML builders ---------------- */

  function commitmentsCardHTML(s) {
    var esc = A.ui.esc;
    var list = s.commitments || [];
    var inner;
    if (!list.length) {
      inner =
        '<div class="empty" style="padding:22px 14px">' +
        '<div class="e-emoji">🕰️</div>' +
        '<p>Add school, training, work — the fixed blocks of your week.</p>' +
        '<button type="button" class="btn btn-acc btn-sm" data-add-commitment>＋ Add commitment</button>' +
        '</div>';
    } else {
      inner = '<div class="list">' + list.map(function (c) {
        var acc = safeAccent(c.accent, 'indigo');
        return '<div class="list-item">' +
          '<span class="badge-dot acc-' + acc + '"></span>' +
          '<div class="li-main">' +
          '<div class="li-title">' + esc(c.title) + '</div>' +
          '<div class="li-sub">' + esc(fmtDays(c.days)) + ' · ' + A.ui.fmtTime(c.start) + '–' + A.ui.fmtTime(c.end) + '</div>' +
          '</div>' +
          '<button type="button" class="icon-btn" data-edit-cm="' + c.id + '" title="Edit commitment">' + A.ui.icon('edit') + '</button>' +
          '<button type="button" class="icon-btn danger" data-del-cm="' + c.id + '" title="Delete commitment">' + A.ui.icon('trash') + '</button>' +
          '</div>';
      }).join('') + '</div>';
    }
    return '<div class="card acc acc-indigo section-gap">' +
      '<div class="card-title">' + A.ui.icon('clock') + 'Weekly commitments</div>' +
      inner + '</div>';
  }

  function eventsCardHTML(s) {
    var esc = A.ui.esc;
    var t0 = A.ui.todayISO();
    var list = (s.events || [])
      .filter(function (ev) { return ev && ev.date && ev.date >= t0; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return A.ui.minutes(a.start || '00:00') - A.ui.minutes(b.start || '00:00');
      });
    var inner;
    if (!list.length) {
      inner =
        '<div class="empty" style="padding:22px 14px">' +
        '<div class="e-emoji">🎉</div>' +
        '<p>One-off things — a match, a party, an appointment. Acendri plans your week around them.</p>' +
        '<button type="button" class="btn btn-acc btn-sm" data-add-event>＋ Add event</button>' +
        '</div>';
    } else {
      inner = '<div class="list">' + list.map(function (ev) {
        var acc = safeAccent(ev.accent, 'pink');
        return '<div class="list-item">' +
          '<span class="badge-dot acc-' + acc + '"></span>' +
          '<div class="li-main">' +
          '<div class="li-title">' + esc(ev.title) + '</div>' +
          '<div class="li-sub">' + esc(A.ui.fmtDate(ev.date)) + ' · ' + A.ui.fmtTime(ev.start || '00:00') + '–' + A.ui.fmtTime(ev.end || '00:00') + '</div>' +
          '</div>' +
          '<button type="button" class="icon-btn" data-edit-ev="' + ev.id + '" title="Edit event">' + A.ui.icon('edit') + '</button>' +
          '<button type="button" class="icon-btn danger" data-del-ev="' + ev.id + '" title="Delete event">' + A.ui.icon('trash') + '</button>' +
          '</div>';
      }).join('') + '</div>';
    }
    return '<div class="card acc acc-pink section-gap">' +
      '<div class="card-title">' + A.ui.icon('flag') + 'Upcoming events</div>' +
      inner + '</div>';
  }

  function unplacedCardHTML(tt) {
    var esc = A.ui.esc;
    if (!tt || !tt.unplaced || !tt.unplaced.length) return '';
    var titles = tt.unplaced.map(function (t) { return '“' + esc(t) + '”'; }).join(', ');
    return '<div class="card acc acc-orange section-gap">' +
      '<div class="card-title">⚠️ Couldn’t fit: ' + titles + '</div>' +
      '<p class="muted small" style="margin-bottom:10px">Your week is packed. Shorten these tasks, trim a commitment, or stretch your day — then hit 🔁 Rebuild week to retry them.</p>' +
      '<div class="row wrap">' +
      '<button type="button" class="btn btn-acc btn-sm" data-rebuild>🔁 Rebuild week</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-goto-settings>⚙️ Adjust wake / sleep</button>' +
      '</div>' +
      '</div>';
  }

  function weekGridHTML(s) {
    var esc = A.ui.esc;
    var ws = wakeSleep(s);
    var colH = Math.round((ws.sleep - ws.wake) * PX_PER_MIN);
    var t0 = A.ui.todayISO();
    var isoList = A.engine.planWindow(s);   // the week this plan covers, not a rolling 7 days

    var html = '<div class="tt-scroll section-gap"><div class="tt-grid">';

    // row 1: empty corner + 7 day labels
    html += '<div></div>';
    isoList.forEach(function (iso) {
      var p = iso.split('-');
      var dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
      html += '<div class="tt-daylabel' + (iso === t0 ? ' today' : '') + '">' +
        A.ui.DAY_NAMES[dow] + ' ' + (+p[2]) + '</div>';
    });

    // row 2: hour label column
    var hours = '';
    for (var h = Math.ceil(ws.wake / 60); h * 60 <= ws.sleep; h++) {
      var top = ((h * 60 - ws.wake) * PX_PER_MIN).toFixed(1);
      hours += '<div class="tt-hourlabel" style="position:absolute;left:0;right:0;top:' + top + 'px;transform:translateY(-50%)">' +
        A.ui.fmtTime(A.ui.hhmm(h * 60)) + '</div>';
    }
    html += '<div style="position:relative;height:' + colH + 'px">' + hours + '</div>';

    // row 2: 7 day columns
    isoList.forEach(function (iso) {
      var blocks = (s.timetable.days && s.timetable.days[iso]) || [];
      var inner = blocks.map(function (b) {
        var st = Math.max(b.startMin, ws.wake);
        var en = Math.min(b.endMin, ws.sleep);
        if (en <= st) return '';
        var top = ((st - ws.wake) * PX_PER_MIN).toFixed(1);
        var hgt = Math.max(16, (en - st) * PX_PER_MIN).toFixed(1);
        var task = b.type === 'task' ? findTask(s, b.refId) : null;
        var done = !!(b.done || (task && task.done));
        var acc = safeAccent(b.accent, b.type === 'task' ? 'cyan' : b.type === 'event' ? 'pink' : 'indigo');
        return '<div class="tt-block acc-' + acc + (done ? ' done' : '') + '"' +
          ' data-block="' + b.id + '" data-iso="' + iso + '"' +
          ' style="top:' + top + 'px;height:' + hgt + 'px" title="' + esc(b.title) + '">' +
          '<div class="tt-time">' + A.ui.fmtTime(b.start) + '–' + A.ui.fmtTime(b.end) + '</div>' +
          '<div>' + esc(b.title) + '</div>' +
          '</div>';
      }).join('');
      html += '<div class="tt-col" style="height:' + colH + 'px">' + inner + '</div>';
    });

    html += '</div></div>';

    // week progress — core settles the XP when the week ends (4/block +30 at 80%)
    var prog = taskBlockProgress(s, s.timetable);
    var pct = prog.total ? Math.round(100 * prog.done / prog.total) : 0;
    html += '<div class="acc-purple" style="margin-top:12px">' +
      '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="muted small" style="margin-top:6px">' + prog.done + ' of ' + prog.total +
      ' planned block' + (prog.total === 1 ? '' : 's') + ' done — XP settles when the week ends</div>' +
      '</div>';

    // unplaced tasks: a quiet pointer at the Rebuild button
    var unCount = (s.timetable.unplaced || []).length;
    if (unCount) {
      html += '<div class="muted small" style="margin-top:6px">⚠️ ' + unCount + ' task' + (unCount === 1 ? '' : 's') +
        ' couldn’t fit — free some time, then 🔁 Rebuild week tries them again.</div>';
    }

    // where this plan is up to + how to change it
    var lock = A.engine.weekLock(s);
    html += '<div class="row wrap" style="margin-top:10px">' +
      '<span class="muted small">Planned ' + A.ui.timeAgo(s.timetable.generatedAt) + '. ' +
      (lock.locked
        ? 'This week is locked in until ' + esc(A.ui.fmtDate(lock.unlocksOn)) + ' — use 🤖 Ask Acendri to add to it.'
        : 'A new week is open — plan it fresh or keep the same shape as last week.') +
      '</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-clear-plan>Clear plan</button>' +
      '</div>';

    return html;
  }

  function noPlanHTML(s) {
    var openTasks = (s.tasks || []).filter(function (t) { return !t.done; }).length;
    var commitments = (s.commitments || []).length;
    if (!openTasks && !commitments) {
      return '<div class="empty section-gap">' +
        '<div class="e-emoji">🌱</div>' +
        '<p>Nothing to plan yet — tell Acendri about your week in plain words and it will build the tasks and the timetable for you.</p>' +
        '<div class="row wrap" style="justify-content:center">' +
        '<button type="button" class="btn btn-acc acc-cyan" data-ask-acendri>🤖 Ask Acendri</button>' +
        '<button type="button" class="btn" data-goto-tasks>📋 Add tasks myself</button>' +
        '<button type="button" class="btn" data-add-commitment>＋ Add a commitment</button>' +
        '</div></div>';
    }
    var lw = s.lastWeekPlan;
    return '<div class="empty section-gap">' +
      '<div class="e-emoji">📅</div>' +
      '<p>' + (lw && lw.items && lw.items.length
        ? 'A new week is open. Repeat last week’s shape, describe what’s changed, or let Acendri plan around your commitments.'
        : 'One click and Acendri builds your week around your commitments, priorities and due dates.') + '</p>' +
      '<div class="row wrap" style="justify-content:center">' +
      '<button type="button" class="btn btn-primary" data-generate>⚡ Build my week</button>' +
      '<button type="button" class="btn btn-acc acc-cyan" data-ask-acendri>🤖 Ask Acendri</button>' +
      '</div></div>';
  }

  /* ---------------- screen ---------------- */

  A.registerScreen('app/schedule', {
    title: 'Timetable',
    icon: 'calendar',
    accent: 'purple',
    inShell: true,
    order: 4,

    render: function (el, ctx) {
      var s = ctx.S.get();
      var tt = s.timetable;

      var lock = A.engine.weekLock(s);

      var html =
        '<div class="screen-head"><div class="spread wrap">' +
        '<div><h1>Timetable</h1><div class="sub">' +
        (lock.locked
          ? 'Your week is set — Ask Acendri to add to it, and plan again when it opens.'
          : 'Tell Acendri your commitments — it plans your tasks around them.') +
        '</div></div>' +
        '<div class="row wrap">' +
        '<button type="button" class="btn btn-acc acc-cyan" data-ask-acendri>🤖 Ask Acendri</button>' +
        (lock.locked
          ? '<button type="button" class="btn btn-ghost acc-purple" data-explain-lock title="Why can’t I regenerate?">🔒 Locked ' +
            lock.daysLeft + ' more day' + (lock.daysLeft === 1 ? '' : 's') + '</button>'
          : '<button type="button" class="btn btn-primary" data-generate>⚡ Build my week</button>') +
        (tt ? '<button type="button" class="btn" data-rebuild title="Re-place open task blocks around commitments, events and what’s done">🔁 Rebuild week</button>' : '') +
        '<button type="button" class="btn" data-add-event>＋ Event</button>' +
        '<button type="button" class="btn" data-add-commitment>＋ Commitment</button>' +
        '</div>' +
        '</div></div>';

      html += commitmentsCardHTML(s);
      html += eventsCardHTML(s);
      html += unplacedCardHTML(tt);
      html += tt ? weekGridHTML(s) : noPlanHTML(s);

      el.innerHTML = html;

      /* ---- wiring ---- */

      el.querySelectorAll('[data-generate]').forEach(function (b) {
        b.addEventListener('click', openPlanChooser);
      });
      el.querySelectorAll('[data-explain-lock]').forEach(function (b) {
        b.addEventListener('click', explainLock);
      });
      el.querySelectorAll('[data-ask-acendri]').forEach(function (b) {
        b.addEventListener('click', function () { openAskModal(''); });
      });
      el.querySelectorAll('[data-rebuild]').forEach(function (b) {
        b.addEventListener('click', rebuildWeekNow);
      });
      el.querySelectorAll('[data-add-commitment]').forEach(function (b) {
        b.addEventListener('click', function () { openCommitmentModal(null); });
      });
      el.querySelectorAll('[data-add-event]').forEach(function (b) {
        b.addEventListener('click', function () { openEventModal(null); });
      });
      el.querySelectorAll('[data-edit-ev]').forEach(function (b) {
        b.addEventListener('click', function () { openEventModal(b.getAttribute('data-edit-ev')); });
      });
      el.querySelectorAll('[data-del-ev]').forEach(function (b) {
        b.addEventListener('click', function () { deleteEvent(b.getAttribute('data-del-ev')); });
      });
      el.querySelectorAll('[data-edit-cm]').forEach(function (b) {
        b.addEventListener('click', function () { openCommitmentModal(b.getAttribute('data-edit-cm')); });
      });
      el.querySelectorAll('[data-del-cm]').forEach(function (b) {
        b.addEventListener('click', function () { deleteCommitment(b.getAttribute('data-del-cm')); });
      });
      el.querySelectorAll('[data-block]').forEach(function (b) {
        b.addEventListener('click', function () {
          openBlockModal(b.getAttribute('data-iso'), b.getAttribute('data-block'));
        });
      });
      el.querySelectorAll('[data-clear-plan]').forEach(function (b) {
        b.addEventListener('click', clearPlan);
      });
      el.querySelectorAll('[data-goto-tasks]').forEach(function (b) {
        b.addEventListener('click', function () { ctx.nav('app/tasks'); });
      });
      el.querySelectorAll('[data-goto-settings]').forEach(function (b) {
        b.addEventListener('click', function () { ctx.nav('app/settings'); });
      });
    }
  });
})();
