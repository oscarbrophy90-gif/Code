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

  function generateWeek() {
    var pre = A.S.get();
    var openTasks = (pre.tasks || []).filter(function (t) { return !t.done; }).length;
    var hasCommitments = (pre.commitments || []).length > 0;

    if (!openTasks && !hasCommitments) {
      // Nothing to build a week from — an empty grid would just look broken.
      A.ui.toast('Nothing to plan yet — tell Acendri about your week', '🌱');
      openAskModal('');
      return;
    }

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

  function clearPlan() {
    A.ui.confirm('Clear the generated plan? Your tasks and commitments stay — only this week’s layout goes.', function () {
      A.S.update(function (s) { s.timetable = null; });
      A.ui.toast('Plan cleared — generate again any time', '🧹');
    }, { title: 'Clear plan', yesLabel: 'Clear plan' });
  }

  function deleteCommitment(id) {
    var c = findCommitment(A.S.get(), id);
    if (!c) return;
    A.ui.confirm('Delete "' + c.title + '"? Its blocks come off the timetable too.', function () {
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
      A.ui.toast('Commitment deleted — regenerate to reclaim the time', '🗑️');
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

    A.ui.modal({
      title: '🤖 Tell Acendri about your week',
      accent: 'cyan',
      wide: true,
      body:
        '<div class="field"><label>What’s on this week?</label>' +
        '<textarea class="textarea" id="ask-text" rows="4" placeholder="Basketball training 3 times this week, one hour each. Study for my science test on Thursday. Keep Sunday free.">' + esc(prefill || '') + '</textarea></div>' +
        '<p class="muted small">Plain words are fine — Acendri picks out the activities, how often and how long, then plans them around your commitments. Tap an example to start:</p>' +
        '<div class="chips">' +
        ASK_EXAMPLES.map(function (ex, i) {
          return '<button type="button" class="chip" data-ex="' + i + '">' + esc(ex) + '</button>';
        }).join('') +
        '</div>',
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        { label: '⚡ Plan my week', cls: 'btn-primary', onClick: function (m) { return submit(m); } }
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
        ' will be added, spread over the next 6 days, then the week regenerates around your commitments.</p>',
      actions: [
        { label: '← Edit', cls: 'btn-ghost', onClick: function () { openAskModal(text); } },
        { label: 'Add & generate', cls: 'btn-primary', onClick: function () { addSessionsAndGenerate(sessions); } }
      ]
    });
  }

  function addSessionsAndGenerate(sessions) {
    var now = Date.now();
    var t0 = A.ui.todayISO();
    A.S.update(function (s) {
      if (!s.tasks) s.tasks = [];
      sessions.forEach(function (se, si) {
        for (var i = 0; i < se.count; i++) {
          s.tasks.push({
            id: A.ui.uid(),
            title: se.title + (se.count > 1 ? ' (' + (i + 1) + '/' + se.count + ')' : ''),
            priority: 2,
            due: A.ui.addDaysISO(t0, 1 + Math.floor(i * 6 / se.count)),
            duration: se.duration,
            done: false,
            createdAt: now + si * 10 + i
          });
        }
      });
      A.engine.generateTimetable(s);
    });
    var after = A.S.get();
    var tt = after.timetable;
    var placed = taskBlockProgress(after, tt).total;
    A.ui.toast('Acendri placed ' + placed + ' block' + (placed === 1 ? '' : 's') + ' into your week', '🤖');
    unplacedToast(tt);
    A.S.log('Acendri planned the week from a description', '🤖');
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
        A.ui.toast(hadPlan ? 'Commitment updated — regenerate to replan' : 'Commitment updated', '✏️');
      } else {
        A.S.update(function (s) {
          s.commitments.push({ id: A.ui.uid(), title: title, days: days, start: draft.start, end: draft.end, accent: accent });
        });
        A.ui.toast(hadPlan ? 'Commitment added — regenerate to weave it in' : 'Commitment added', '📌');
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

  /* ---------------- block detail modal ---------------- */

  function openBlockModal(iso, blockId) {
    var esc = A.ui.esc;
    var s = A.S.get();
    var b = findBlock(s, iso, blockId);
    if (!b) { A.ui.toast('That block is gone — regenerate for a fresh plan', '🤔'); return; }

    var isTask = b.type === 'task';
    var task = isTask ? findTask(s, b.refId) : null;
    var commitment = !isTask ? findCommitment(s, b.refId) : null;
    var done = !!(b.done || (task && task.done));
    var mins = Math.max(0, b.endMin - b.startMin);

    var rows =
      '<div class="row wrap" style="margin-bottom:10px">' +
      '<span class="pill">' + (isTask ? '📋 Task' : '📌 Commitment') + '</span>' +
      (done ? '<span class="tag">✅ done</span>' : '') +
      (task && task.priority === 3 ? '<span class="tag" style="color:#f87171;border-color:#7f1d1d">high priority</span>' : '') +
      '</div>' +
      '<div class="col" style="gap:6px">' +
      '<div class="row muted small">' + A.ui.icon('calendar', 'sm') + '<span>' + A.ui.fmtDate(iso) + '</span></div>' +
      '<div class="row muted small">' + A.ui.icon('clock', 'sm') + '<span>' + A.ui.fmtTime(b.start) + '–' + A.ui.fmtTime(b.end) + ' · ' + mins + ' min</span></div>' +
      (task && task.due ? '<div class="row muted small">' + A.ui.icon('flag', 'sm') + '<span>Due ' + A.ui.fmtDate(task.due) + '</span></div>' : '') +
      (commitment ? '<div class="row muted small">' + A.ui.icon('calendar', 'sm') + '<span>Repeats: ' + esc(fmtDays(commitment.days)) + '</span></div>' : '') +
      '</div>' +
      (!isTask && !commitment ? '<p class="dim small" style="margin-top:10px">This commitment was deleted — regenerate to tidy the week.</p>' : '') +
      (isTask && !task ? '<p class="dim small" style="margin-top:10px">The task behind this block was deleted — you can remove the block.</p>' : '') +
      (!isTask && commitment ? '<p class="dim small" style="margin-top:10px">Fixed block — Acendri plans your tasks around it.</p>' : '');

    var actions = [{ label: 'Close', cls: 'btn-ghost' }];
    if (isTask) {
      actions.push({ label: 'Remove from plan', cls: 'btn-ghost', onClick: function () { removeBlock(iso, blockId); } });
      if (!done && task) {
        actions.push({ label: '✅ Mark task done', cls: 'btn-primary', onClick: function () { markTaskDone(iso, blockId); } });
      } else if (!task) {
        // task deleted; only removal makes sense (button above)
      }
    } else if (commitment) {
      actions.push({ label: '✏️ Edit commitment', cls: 'btn-acc', onClick: function () { openCommitmentModal(commitment.id); } });
    } else {
      actions.push({ label: 'Remove from plan', cls: 'btn-danger', onClick: function () { removeBlock(iso, blockId); } });
    }

    A.ui.modal({
      title: esc(b.title),
      accent: safeAccent(b.accent, isTask ? 'cyan' : 'indigo'),
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

  function unplacedCardHTML(tt) {
    var esc = A.ui.esc;
    if (!tt || !tt.unplaced || !tt.unplaced.length) return '';
    var titles = tt.unplaced.map(function (t) { return '“' + esc(t) + '”'; }).join(', ');
    return '<div class="card acc acc-orange section-gap">' +
      '<div class="card-title">⚠️ Couldn’t fit: ' + titles + '</div>' +
      '<p class="muted small" style="margin-bottom:10px">Your week is packed. Shorten these tasks, trim a commitment, or stretch your day — then regenerate.</p>' +
      '<button type="button" class="btn btn-acc btn-sm" data-goto-settings>⚙️ Adjust wake / sleep</button>' +
      '</div>';
  }

  function weekGridHTML(s) {
    var esc = A.ui.esc;
    var ws = wakeSleep(s);
    var colH = Math.round((ws.sleep - ws.wake) * PX_PER_MIN);
    var t0 = A.ui.todayISO();
    var isoList = [];
    for (var i = 0; i < 7; i++) isoList.push(A.ui.addDaysISO(t0, i));

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
        var acc = safeAccent(b.accent, b.type === 'task' ? 'cyan' : 'indigo');
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

    // stale note + clear
    html += '<div class="row wrap" style="margin-top:10px">' +
      '<span class="muted small">Generated ' + A.ui.timeAgo(s.timetable.generatedAt) +
      '. Life changed? Regenerate any time — Acendri replans around what’s left.</span>' +
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
    return '<div class="empty section-gap">' +
      '<div class="e-emoji">📅</div>' +
      '<p>One click and Acendri builds your week around your commitments, priorities and due dates.</p>' +
      '<div class="row wrap" style="justify-content:center">' +
      '<button type="button" class="btn btn-primary" data-generate>⚡ Generate my week</button>' +
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

      var html =
        '<div class="screen-head"><div class="spread wrap">' +
        '<div><h1>Timetable</h1><div class="sub">Tell Acendri your commitments — it plans your tasks around them.</div></div>' +
        '<div class="row wrap">' +
        '<button type="button" class="btn btn-acc acc-cyan" data-ask-acendri>🤖 Ask Acendri</button>' +
        '<button type="button" class="btn btn-primary" data-generate>⚡ Generate my week</button>' +
        '<button type="button" class="btn" data-add-commitment>＋ Commitment</button>' +
        '</div>' +
        '</div></div>';

      html += commitmentsCardHTML(s);
      html += unplacedCardHTML(tt);
      html += tt ? weekGridHTML(s) : noPlanHTML(s);

      el.innerHTML = html;

      /* ---- wiring ---- */

      el.querySelectorAll('[data-generate]').forEach(function (b) {
        b.addEventListener('click', generateWeek);
      });
      el.querySelectorAll('[data-ask-acendri]').forEach(function (b) {
        b.addEventListener('click', function () { openAskModal(''); });
      });
      el.querySelectorAll('[data-add-commitment]').forEach(function (b) {
        b.addEventListener('click', function () { openCommitmentModal(null); });
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
