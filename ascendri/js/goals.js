/* ============================================================
   Acendri OS — Goals screen
   Big ambitions, broken into milestones you can act on today.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var CATEGORIES = ['Study', 'Sport', 'Finance', 'Career', 'Health', 'Personal'];

  var TEMPLATES = {
    Study: [
      'Break the syllabus into weekly topics',
      'Set a fixed daily study block',
      'Finish one practice paper per week',
      'Review mistakes the same evening',
      'Do a full mock under real exam timing'
    ],
    Sport: [
      'Build a weekly training schedule',
      'Set one measurable performance target',
      'Train at least 4 sessions per week',
      'Film and review technique monthly',
      'Enter a competition or trial'
    ],
    Finance: [
      'Work out the exact amount and deadline',
      'Open a separate account for it',
      'Set an automatic weekly transfer',
      'Cut one recurring expense',
      'Review progress at the halfway mark'
    ],
    Career: [
      'Define what success looks like in 12 months',
      'Update resume and portfolio',
      'Learn one high-value skill',
      'Talk to 3 people already doing it',
      'Apply, pitch or ship — take the shot'
    ],
    Health: [
      'Book a check-up and get a baseline',
      'Plan meals for the week ahead',
      'Move 30 minutes every day',
      'Fix a consistent sleep schedule',
      'Re-measure after 4 weeks'
    ],
    Personal: [
      'Write down why this matters to you',
      'Break it into monthly mini-goals',
      'Block weekly time for it',
      'Tell someone who will keep you honest',
      'Review and adjust each month'
    ]
  };
  var GENERIC_STEPS = [
    'Define what "done" looks like',
    'Break it into 3-5 smaller steps',
    'Schedule the first step this week',
    'Set a mid-point check-in',
    'Finish and celebrate'
  ];

  function templateFor(cat) { return TEMPLATES[cat] || GENERIC_STEPS; }

  function findGoal(s, id) {
    return s.goals.filter(function (g) { return g.id === id; })[0] || null;
  }

  function daysUntil(iso) {
    var p = iso.split('-'), q = A.ui.todayISO().split('-');
    var a = new Date(+p[0], +p[1] - 1, +p[2]);
    var b = new Date(+q[0], +q[1] - 1, +q[2]);
    return Math.round((a - b) / 86400000);
  }

  function dueTagHTML(iso) {
    var d = daysUntil(iso);
    if (d < 0) return '<span class="tag" style="color:#f87171;border-color:#7f1d1d">' + (-d) + 'd overdue</span>';
    if (d === 0) return '<span class="tag" style="color:#fb923c;border-color:#7c2d12">due today</span>';
    return '<span class="tag">' + d + 'd left</span>';
  }

  /* ---------------- state mutations ---------------- */

  function toggleMilestone(goalId, msId) {
    var becameDone = false, msTitle = '', allDone = false;
    A.S.update(function (s) {
      var g = findGoal(s, goalId);
      if (!g) return;
      var m = g.milestones.filter(function (x) { return x.id === msId; })[0];
      if (!m) return;
      m.done = !m.done;
      if (m.done) { becameDone = true; msTitle = m.title; }
      allDone = g.status === 'active' && g.milestones.length > 0 &&
        g.milestones.every(function (x) { return x.done; });
    });
    if (becameDone) A.S.addXp(25, 'Milestone: ' + msTitle);
    if (becameDone && allDone) A.ui.toast('Every step ticked — mark the goal complete!', '🎉');
  }

  function addMilestone(goalId, title) {
    var t = String(title || '').trim();
    if (!t) { A.ui.toast('Type a step first', '✍️'); return false; }
    A.S.update(function (s) {
      var g = findGoal(s, goalId);
      if (g) g.milestones.push({ id: A.ui.uid(), title: t, done: false });
    });
    // refocus the inline input after the idempotent re-render
    setTimeout(function () {
      var inp = document.querySelector('[data-ms-input][data-goal="' + goalId + '"]');
      if (inp) inp.focus();
    }, 90);
    return true;
  }

  function suggestForGoal(goalId) {
    A.S.update(function (s) {
      var g = findGoal(s, goalId);
      if (!g || g.milestones.length) return;
      templateFor(g.category).forEach(function (t) {
        g.milestones.push({ id: A.ui.uid(), title: t, done: false });
      });
    });
    A.ui.toast('Steps suggested — make them yours', '✨');
  }

  function milestoneToTask(goalId, msId) {
    var made = false, title = '';
    A.S.update(function (s) {
      var g = findGoal(s, goalId);
      if (!g) return;
      var m = g.milestones.filter(function (x) { return x.id === msId; })[0];
      if (!m) return;
      s.tasks.push({
        id: A.ui.uid(),
        title: m.title,
        priority: 2,
        due: A.ui.addDaysISO(A.ui.todayISO(), 3),
        duration: 45,
        done: false,
        goalId: goalId,
        createdAt: Date.now()
      });
      made = true; title = m.title;
    });
    if (made) A.ui.toast('Added to your tasks', '📋');
  }

  function completeGoal(goalId) {
    var g = findGoal(A.S.get(), goalId);
    if (!g || g.status === 'done') return;
    var doComplete = function () {
      var title = '', xp = false;
      A.S.update(function (s) {
        var gg = findGoal(s, goalId);
        if (!gg || gg.status === 'done') return;
        gg.status = 'done';
        gg.completedAt = Date.now();
        title = gg.title;
        xp = true;
        var n = gg.milestones.filter(function (m) { return m.done; }).length;
        if (s.settings && s.settings.autoPost) {
          s.social.feed.unshift({
            id: A.ui.uid(),
            author: s.profile.name || 'You',
            avatar: s.profile.avatar || '🙂',
            me: true,
            accent: gg.accent || 'blue',
            kind: 'goal',
            time: Date.now(),
            text: 'Goal completed 🏆 “' + gg.title + '” — ' + n + ' steps done. On to the next one!',
            likes: 0, liked: false, comments: []
          });
        }
      });
      if (!xp) return;
      A.S.addXp(100, 'Goal completed: ' + title);
      A.ui.confetti();
    };
    if (A.engine.goalProgress(g) < 100) {
      A.ui.confirm('Not every step is ticked — complete anyway?', doComplete,
        { title: 'Complete goal', yesLabel: '🏆 Complete it', danger: false, accent: g.accent || 'blue' });
    } else {
      doComplete();
    }
  }

  function reactivateGoal(goalId) {
    A.S.update(function (s) {
      var g = findGoal(s, goalId);
      if (!g) return;
      g.status = 'active';
      delete g.completedAt;
    });
    A.ui.toast('Goal reactivated — back on it!', '🎯');
  }

  function deleteGoal(goalId) {
    var g = findGoal(A.S.get(), goalId);
    if (!g) return;
    A.ui.confirm('Delete "' + g.title + '"? Its milestones go with it — this can’t be undone.', function () {
      A.S.update(function (s) {
        s.goals = s.goals.filter(function (x) { return x.id !== goalId; });
      });
      A.ui.toast('Goal deleted', '🗑️');
    }, { yesLabel: 'Delete goal' });
  }

  /* ---------------- new / edit modal ---------------- */

  function openGoalModal(goalId) {
    var esc = A.ui.esc;
    var src = goalId ? findGoal(A.S.get(), goalId) : null;
    var isEdit = !!src;
    var draft = {
      title: src ? src.title : '',
      category: src ? src.category : 'Study',
      why: src ? (src.why || '') : '',
      targetDate: src ? (src.targetDate || '') : '',
      accent: src ? (src.accent || 'blue') : 'blue',
      milestones: src ? src.milestones.map(function (m) {
        return { id: m.id, title: m.title, done: !!m.done };
      }) : []
    };

    function syncDraft(m) {
      var f;
      f = m.querySelector('#g-title'); if (f) draft.title = f.value;
      f = m.querySelector('#g-cat'); if (f) draft.category = f.value;
      f = m.querySelector('#g-why'); if (f) draft.why = f.value;
      f = m.querySelector('#g-date'); if (f) draft.targetDate = f.value;
      m.querySelectorAll('[data-ms-line]').forEach(function (inp) {
        var i = +inp.getAttribute('data-ms-line');
        if (draft.milestones[i]) draft.milestones[i].title = inp.value;
      });
    }

    function renderForm(m) {
      var body = m.querySelector('#goal-form');
      var stepsHTML = draft.milestones.length
        ? draft.milestones.map(function (ms, i) {
            return '<div class="row">' +
              '<input class="input" data-ms-line="' + i + '" maxlength="90" placeholder="Step ' + (i + 1) + '" value="' + esc(ms.title) + '">' +
              (ms.done ? '<span class="tag" title="Already done">✓ done</span>' : '') +
              '<button type="button" class="icon-btn danger" data-ms-del="' + i + '" title="Remove step">' + A.ui.icon('x', 'sm') + '</button>' +
              '</div>';
          }).join('')
        : '<div class="dim small">No steps yet — add your own or let Acendri suggest some.</div>';

      body.innerHTML =
        '<div class="field"><label>Goal title</label>' +
        '<input class="input" id="g-title" maxlength="90" placeholder="e.g. Run a half marathon" value="' + esc(draft.title) + '"></div>' +
        '<div class="grid2">' +
        '<div class="field"><label>Category</label><select class="select" id="g-cat">' +
        CATEGORIES.map(function (c) {
          return '<option value="' + esc(c) + '"' + (draft.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
        }).join('') +
        '</select></div>' +
        '<div class="field"><label>Target date (optional)</label>' +
        '<input class="input" id="g-date" type="date" value="' + esc(draft.targetDate) + '"></div>' +
        '</div>' +
        '<div class="field"><label>Why this goal?</label>' +
        '<textarea class="textarea" id="g-why" maxlength="240" placeholder="Why does this matter to you?">' + esc(draft.why) + '</textarea></div>' +
        '<div class="field"><label>Accent</label><div class="swatches">' +
        A.ui.ACCENT_NAMES.map(function (n) {
          return '<button type="button" data-swatch="' + n + '" class="' + (draft.accent === n ? 'sel' : '') + '"' +
            ' style="background:' + A.ui.ACCENTS[n].b + '" title="' + n + '"></button>';
        }).join('') +
        '</div></div>' +
        '<div class="field"><label>Steps (milestones)</label>' +
        '<div class="col">' + stepsHTML + '</div>' +
        '<div class="row" style="margin-top:8px">' +
        '<button type="button" class="btn btn-sm" data-add-step>+ Add step</button>' +
        '<button type="button" class="btn btn-sm btn-acc" data-suggest-form>✨ Suggest steps</button>' +
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
      body.querySelectorAll('[data-ms-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          syncDraft(m);
          draft.milestones.splice(+btn.getAttribute('data-ms-del'), 1);
          renderForm(m);
        });
      });
      body.querySelector('[data-add-step]').addEventListener('click', function () {
        syncDraft(m);
        draft.milestones.push({ id: null, title: '', done: false });
        renderForm(m);
        var lines = m.querySelectorAll('[data-ms-line]');
        if (lines.length) lines[lines.length - 1].focus();
      });
      body.querySelector('[data-suggest-form]').addEventListener('click', function () {
        syncDraft(m);
        var have = {};
        draft.milestones.forEach(function (ms) { have[ms.title.trim().toLowerCase()] = true; });
        var added = 0;
        templateFor(draft.category).forEach(function (t) {
          if (have[t.toLowerCase()]) return;
          draft.milestones.push({ id: null, title: t, done: false });
          added++;
        });
        renderForm(m);
        A.ui.toast(added ? 'Suggested ' + added + ' steps for ' + draft.category : 'Those steps are already in', '✨');
      });
    }

    function save(m) {
      syncDraft(m);
      var title = draft.title.trim();
      if (!title) { A.ui.toast('Give your goal a title first', '✍️'); return false; }
      var ms = [];
      draft.milestones.forEach(function (line) {
        var t = line.title.trim();
        if (!t) return;
        ms.push({ id: line.id || A.ui.uid(), title: t, done: !!line.done });
      });
      var cat = CATEGORIES.indexOf(draft.category) >= 0 ? draft.category : 'Personal';
      var accent = A.ui.ACCENT_NAMES.indexOf(draft.accent) >= 0 ? draft.accent : 'blue';
      var why = draft.why.trim();
      var date = draft.targetDate || null;

      if (isEdit) {
        var found = false;
        A.S.update(function (s) {
          var g = findGoal(s, goalId);
          if (!g) return;
          found = true;
          g.title = title; g.category = cat; g.why = why;
          g.accent = accent; g.targetDate = date; g.milestones = ms;
        });
        A.ui.toast(found ? 'Goal updated' : 'That goal no longer exists', found ? '✏️' : '🤔');
      } else {
        A.S.update(function (s) {
          s.goals.push({
            id: A.ui.uid(), title: title, category: cat, why: why, accent: accent,
            targetDate: date, status: 'active', milestones: ms, createdAt: Date.now()
          });
        });
        A.ui.toast('Goal created — break it down and go 🎯', '🚀');
      }
      return true;
    }

    A.ui.modal({
      title: isEdit ? '✏️ Edit goal' : '🎯 New goal',
      accent: draft.accent,
      wide: true,
      body: '<div id="goal-form"></div>',
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        { label: isEdit ? 'Save changes' : 'Create goal', cls: 'btn-primary', onClick: function (m) { return save(m); } }
      ],
      onOpen: function (m) { renderForm(m); }
    });
  }

  /* ---------------- Ask Acendri (brain) modal ---------------- */

  var ASK_EXAMPLES = [
    'Become a professional tennis player',
    'Save $2,000 for a car',
    'Get an A in maths this term'
  ];

  function openAskModal() {
    var esc = A.ui.esc;
    var B = window.Ascendri.brain;
    if (!B || typeof B.goalFromText !== 'function') {
      A.ui.toast('Acendri’s brain isn’t available right now — try + New goal instead', '🤖');
      return;
    }

    var notes = '';
    var draft = null; // { title, category, accent, why, milestones:[str] }
    var closeFn = null;

    function syncNotes(m) {
      var t = m.querySelector('#ga-notes');
      if (t) notes = t.value;
    }

    function syncPreview(m) {
      var f = m.querySelector('#ga-title');
      if (f) draft.title = f.value;
      m.querySelectorAll('[data-ga-ms]').forEach(function (inp) {
        var i = +inp.getAttribute('data-ga-ms');
        if (i >= 0 && i < draft.milestones.length) draft.milestones[i] = inp.value;
      });
    }

    function renderNotes(m) {
      var body = m.querySelector('#ga-wrap');
      body.innerHTML =
        '<div class="field"><label>Your goal, in your own words</label>' +
        '<textarea class="textarea" id="ga-notes" rows="4" maxlength="500" ' +
        'placeholder="I want to make the state basketball team by next season. I can train after school and my jump shot needs the most work.">' +
        esc(notes) + '</textarea></div>' +
        '<div class="muted small">Mention what you’re aiming for, by when, and what needs the most work — Acendri drafts the goal and its steps for you.</div>' +
        '<div class="chips">' +
        ASK_EXAMPLES.map(function (x, i) {
          return '<button type="button" class="chip" data-ga-ex="' + i + '">' + esc(x) + '</button>';
        }).join('') +
        '</div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-ghost" data-ga-cancel>Cancel</button>' +
        '<button type="button" class="btn btn-acc" data-ga-gen>✨ Generate my goal</button>' +
        '</div>';

      body.querySelectorAll('[data-ga-ex]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var t = m.querySelector('#ga-notes');
          if (!t) return;
          t.value = ASK_EXAMPLES[+btn.getAttribute('data-ga-ex')] || '';
          notes = t.value;
          t.focus();
        });
      });
      body.querySelector('[data-ga-cancel]').addEventListener('click', function () {
        if (closeFn) closeFn();
      });
      body.querySelector('[data-ga-gen]').addEventListener('click', function () {
        syncNotes(m);
        var text = notes.trim();
        if (!text) { A.ui.toast('Tell Acendri a little about your goal first', '✍️'); return; }
        var d = null;
        try { d = B.goalFromText(text); } catch (e) { d = null; }
        if (!d) { A.ui.toast('Acendri couldn’t draft that one — try + New goal instead', '🤖'); return; }
        draft = {
          title: String(d.title || '').trim() || text.slice(0, 90),
          category: String(d.category || '').trim() || 'Personal',
          accent: A.ui.ACCENT_NAMES.indexOf(d.accent) >= 0 ? d.accent : 'cyan',
          why: String(d.why || '').trim(),
          milestones: (d.milestones || []).map(function (x) {
            return String(x == null ? '' : x).trim();
          }).filter(function (x) { return !!x; })
        };
        renderPreview(m);
      });
      var ta = m.querySelector('#ga-notes');
      if (ta) setTimeout(function () { ta.focus(); }, 60);
    }

    function renderPreview(m) {
      var body = m.querySelector('#ga-wrap');
      var accCol = (A.ui.ACCENTS[draft.accent] || A.ui.ACCENTS.cyan).c;
      var stepsHTML = draft.milestones.length
        ? draft.milestones.map(function (t, i) {
            return '<div class="row">' +
              '<input class="input" data-ga-ms="' + i + '" maxlength="90" placeholder="Step ' + (i + 1) + '" value="' + esc(t) + '">' +
              '<button type="button" class="icon-btn danger" data-ga-del="' + i + '" title="Remove step">' + A.ui.icon('x', 'sm') + '</button>' +
              '</div>';
          }).join('')
        : '<div class="dim small">No steps yet — add at least one so the goal has a first move.</div>';

      body.innerHTML =
        '<div class="muted small" style="margin-bottom:10px">Here’s Acendri’s draft — tweak anything, then create it.</div>' +
        '<div class="field"><label>Goal title</label>' +
        '<input class="input" id="ga-title" maxlength="90" placeholder="Goal title" value="' + esc(draft.title) + '"></div>' +
        '<div class="row wrap" style="gap:8px;margin-bottom:10px">' +
        '<span class="tag">' + esc(draft.category) + '</span>' +
        '<span class="tag" style="color:' + accCol + ';border-color:' + accCol + '">● ' + esc(draft.accent) + '</span>' +
        '</div>' +
        (draft.why ? '<div class="muted small" style="margin-bottom:10px">💡 ' + esc(draft.why) + '</div>' : '') +
        '<div class="field"><label>Steps (milestones)</label>' +
        '<div class="col">' + stepsHTML + '</div>' +
        '<div class="row" style="margin-top:8px">' +
        '<button type="button" class="btn btn-sm" data-ga-add>+ Add step</button>' +
        '</div></div>' +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-ghost" data-ga-back>🔁 Rewrite</button>' +
        '<button type="button" class="btn btn-primary" data-ga-create>🎯 Create goal</button>' +
        '</div>';

      body.querySelectorAll('[data-ga-del]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          syncPreview(m);
          draft.milestones.splice(+btn.getAttribute('data-ga-del'), 1);
          renderPreview(m);
        });
      });
      body.querySelector('[data-ga-add]').addEventListener('click', function () {
        syncPreview(m);
        draft.milestones.push('');
        renderPreview(m);
        var lines = m.querySelectorAll('[data-ga-ms]');
        if (lines.length) lines[lines.length - 1].focus();
      });
      body.querySelector('[data-ga-back]').addEventListener('click', function () {
        renderNotes(m);
      });
      body.querySelector('[data-ga-create]').addEventListener('click', function () {
        syncPreview(m);
        var title = draft.title.trim();
        if (!title) { A.ui.toast('Give your goal a title first', '✍️'); return; }
        var ms = [];
        draft.milestones.forEach(function (t) {
          var tt = String(t).trim();
          if (tt) ms.push({ id: A.ui.uid(), title: tt, done: false });
        });
        var cat = draft.category.trim() || 'Personal';
        var accent = A.ui.ACCENT_NAMES.indexOf(draft.accent) >= 0 ? draft.accent : 'cyan';
        var why = draft.why.trim();
        A.S.update(function (s) {
          s.goals.push({
            id: A.ui.uid(), title: title, category: cat, accent: accent, why: why,
            targetDate: null, status: 'active', milestones: ms, createdAt: Date.now()
          });
        });
        A.ui.toast('Goal created from your notes 🤖', '🎯');
        if (closeFn) closeFn();
      });
    }

    A.ui.modal({
      title: '🤖 Tell Acendri about your goal',
      accent: 'cyan',
      wide: true,
      body: '<div id="ga-wrap"></div>',
      onOpen: function (m, close) {
        closeFn = close;
        renderNotes(m);
      }
    });
  }

  /* ---------------- screen HTML builders ---------------- */

  function goalCardHTML(g) {
    var esc = A.ui.esc;
    var pct = A.engine.goalProgress(g);
    var total = g.milestones.length;
    var done = g.milestones.filter(function (m) { return m.done; }).length;

    var head =
      '<div class="spread" style="align-items:flex-start">' +
      '<div class="row wrap" style="gap:8px;min-width:0">' +
      '<span class="bold" style="font-size:1.1rem">' + esc(g.title) + '</span>' +
      '<span class="tag">' + esc(g.category) + '</span>' +
      '</div>' +
      '<div class="row" style="gap:2px;flex:0 0 auto">' +
      '<button type="button" class="icon-btn" data-edit="' + g.id + '" title="Edit goal">' + A.ui.icon('edit') + '</button>' +
      '<button type="button" class="icon-btn danger" data-del="' + g.id + '" title="Delete goal">' + A.ui.icon('trash') + '</button>' +
      '</div></div>';

    var why = g.why
      ? '<div class="muted small">' + esc(g.why) + '</div>'
      : '';

    var date = g.targetDate
      ? '<div class="row small muted" style="gap:6px">' + A.ui.icon('calendar', 'sm') +
        '<span>Target: ' + A.ui.fmtDate(g.targetDate) + '</span>' + dueTagHTML(g.targetDate) + '</div>'
      : '';

    var bar =
      '<div>' +
      '<div class="bar lg"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="small muted" style="margin-top:6px">' + pct + '% · ' + done + '/' + total + ' milestones</div>' +
      '</div>';

    var steps;
    if (!total) {
      steps =
        '<div class="empty" style="padding:18px 14px">' +
        '<div class="e-emoji">🪜</div>' +
        '<p>No steps yet — big goals get done one step at a time.</p>' +
        '<button type="button" class="btn btn-acc btn-sm" data-suggest="' + g.id + '">✨ Suggest steps</button>' +
        '</div>';
    } else {
      steps = '<div class="list">' + g.milestones.map(function (m) {
        return '<div class="list-item' + (m.done ? ' done' : '') + '">' +
          '<button type="button" class="check' + (m.done ? ' on' : '') + '" data-ms-toggle data-goal="' + g.id + '" data-ms="' + m.id + '" title="' + (m.done ? 'Mark as not done' : 'Mark as done') + '">' + A.ui.icon('check', 'sm') + '</button>' +
          '<div class="li-main"><div class="li-title">' + esc(m.title) + '</div></div>' +
          '<button type="button" class="icon-btn" data-ms-task data-goal="' + g.id + '" data-ms="' + m.id + '" title="Create task from milestone">' + A.ui.icon('arrow', 'sm') + '</button>' +
          '</div>';
      }).join('') + '</div>';
    }

    var addRow =
      '<div class="row">' +
      '<input class="input" data-ms-input data-goal="' + g.id + '" maxlength="90" placeholder="Add a step…">' +
      '<button type="button" class="btn btn-sm" data-ms-add data-goal="' + g.id + '">Add</button>' +
      '</div>';

    var footer =
      '<button type="button" class="btn btn-acc" data-complete="' + g.id + '" style="width:100%">🏆 Mark goal complete</button>';

    return '<div class="card acc glow col acc-' + esc(g.accent || 'blue') + '">' +
      head + why + date + bar + steps + addRow + footer + '</div>';
  }

  function completedRowHTML(g) {
    var esc = A.ui.esc;
    var total = g.milestones.length;
    var done = g.milestones.filter(function (m) { return m.done; }).length;
    var when = g.completedAt
      ? A.ui.fmtDate(A.ui.dateISO(new Date(g.completedAt)))
      : '—';
    return '<div class="list-item done acc-' + esc(g.accent || 'blue') + '">' +
      '<span style="font-size:1.2rem">🏆</span>' +
      '<div class="li-main">' +
      '<div class="li-title">' + esc(g.title) + '</div>' +
      '<div class="li-sub">' + esc(g.category) + ' · completed ' + when + ' · ' + done + '/' + total + ' steps</div>' +
      '</div>' +
      '<button type="button" class="icon-btn" data-restore="' + g.id + '" title="Reactivate">' + A.ui.icon('arrow') + '</button>' +
      '<button type="button" class="icon-btn danger" data-del="' + g.id + '" title="Delete goal">' + A.ui.icon('trash') + '</button>' +
      '</div>';
  }

  /* ---------------- screen ---------------- */

  A.registerScreen('app/goals', {
    title: 'Goals',
    icon: 'target',
    accent: 'blue',
    inShell: true,
    order: 2,

    render: function (el, ctx) {
      var s = ctx.S.get();
      var goals = s.goals || [];
      var active = goals.filter(function (g) { return g.status !== 'done'; });
      var completed = goals.filter(function (g) { return g.status === 'done'; });

      var milestonesDone = 0;
      goals.forEach(function (g) {
        milestonesDone += g.milestones.filter(function (m) { return m.done; }).length;
      });
      var progressPool = active.length ? active : goals;
      var avg = progressPool.length
        ? Math.round(progressPool.reduce(function (a, g) { return a + A.engine.goalProgress(g); }, 0) / progressPool.length)
        : 0;

      var html =
        '<div class="screen-head"><div class="spread wrap">' +
        '<div><h1>Goals</h1><div class="sub">Big ambitions, broken into steps you can do today.</div></div>' +
        '<div class="row wrap" style="gap:10px">' +
        '<button type="button" class="btn btn-acc acc-cyan" data-ask>🤖 Ask Acendri</button>' +
        '<button type="button" class="btn btn-primary" data-new>+ New goal</button>' +
        '</div>' +
        '</div></div>';

      if (!goals.length) {
        html +=
          '<div class="empty section-gap">' +
          '<div class="e-emoji">🎯</div>' +
          '<p>A goal without a plan is just a wish. Create one and Acendri breaks it into steps.</p>' +
          '<div class="row wrap" style="gap:10px;justify-content:center">' +
          '<button type="button" class="btn btn-primary" data-new>+ Create your first goal</button>' +
          '<button type="button" class="btn btn-acc acc-cyan" data-ask>🤖 Ask Acendri</button>' +
          '</div>' +
          '</div>';
      } else {
        html +=
          '<div class="grid4">' +
          '<div class="card stat acc-blue"><span class="v h-acc">' + active.length + '</span><span class="k">Active goals</span></div>' +
          '<div class="card stat acc-green"><span class="v h-acc">' + completed.length + '</span><span class="k">Completed goals</span></div>' +
          '<div class="card stat acc-purple"><span class="v h-acc">' + milestonesDone + '</span><span class="k">Milestones done</span></div>' +
          '<div class="card stat acc-cyan"><span class="v h-acc">' + avg + '%</span><span class="k">Average progress</span></div>' +
          '</div>';

        if (active.length) {
          html += '<div class="grid2 section-gap">' + active.map(goalCardHTML).join('') + '</div>';
        } else {
          html +=
            '<div class="empty section-gap">' +
            '<div class="e-emoji">🌟</div>' +
            '<p>Every goal is complete — time to dream bigger.</p>' +
            '<button type="button" class="btn btn-primary" data-new>+ New goal</button>' +
            '</div>';
        }

        if (completed.length) {
          html +=
            '<div class="section-gap">' +
            '<h2 class="muted" style="font-size:.95rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Completed</h2>' +
            '<div class="list">' + completed.map(completedRowHTML).join('') + '</div>' +
            '</div>';
        }
      }

      el.innerHTML = html;

      /* ---- wiring ---- */

      el.querySelectorAll('[data-new]').forEach(function (b) {
        b.addEventListener('click', function () { openGoalModal(null); });
      });
      el.querySelectorAll('[data-ask]').forEach(function (b) {
        b.addEventListener('click', function () { openAskModal(); });
      });
      el.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () { openGoalModal(b.getAttribute('data-edit')); });
      });
      el.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () { deleteGoal(b.getAttribute('data-del')); });
      });
      el.querySelectorAll('[data-ms-toggle]').forEach(function (b) {
        b.addEventListener('click', function () {
          toggleMilestone(b.getAttribute('data-goal'), b.getAttribute('data-ms'));
        });
      });
      el.querySelectorAll('[data-ms-task]').forEach(function (b) {
        b.addEventListener('click', function () {
          milestoneToTask(b.getAttribute('data-goal'), b.getAttribute('data-ms'));
        });
      });
      el.querySelectorAll('[data-ms-add]').forEach(function (b) {
        b.addEventListener('click', function () {
          var gid = b.getAttribute('data-goal');
          var inp = el.querySelector('[data-ms-input][data-goal="' + gid + '"]');
          if (inp) addMilestone(gid, inp.value);
        });
      });
      el.querySelectorAll('[data-ms-input]').forEach(function (inp) {
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') addMilestone(inp.getAttribute('data-goal'), inp.value);
        });
      });
      el.querySelectorAll('[data-suggest]').forEach(function (b) {
        b.addEventListener('click', function () { suggestForGoal(b.getAttribute('data-suggest')); });
      });
      el.querySelectorAll('[data-complete]').forEach(function (b) {
        b.addEventListener('click', function () { completeGoal(b.getAttribute('data-complete')); });
      });
      el.querySelectorAll('[data-restore]').forEach(function (b) {
        b.addEventListener('click', function () { reactivateGoal(b.getAttribute('data-restore')); });
      });
    }
  });
})();
