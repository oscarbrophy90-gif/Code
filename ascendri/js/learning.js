/* ============================================================
   Acendri OS — Learning: subjects, exams & tests, and one-tap
   revision plans. Tell Acendri about a test and it spreads
   revision sessions across the days before it — never one
   cram day — then places them on the timetable.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var SUBJECT_EMOJIS = ['📐', '🧪', '📖', '🌍', '🎨', '🎵', '💻', '🏛️'];

  /* ---------------- helpers ---------------- */

  function safeAccent(name, fallback) {
    return A.ui.ACCENT_NAMES.indexOf(name) >= 0 ? name : (fallback || 'blue');
  }

  // Old saves are migrated by core, but stay defensive anyway.
  function learningOf(s) {
    var l = (s && s.learning) || {};
    return {
      subjects: l.subjects || [],
      exams: l.exams || []
    };
  }

  function ensureLearning(st) {
    if (!st.learning) st.learning = { subjects: [], exams: [] };
    if (!st.learning.subjects) st.learning.subjects = [];
    if (!st.learning.exams) st.learning.exams = [];
    return st.learning;
  }

  function findSubject(s, id) {
    var out = null;
    learningOf(s).subjects.forEach(function (x) { if (x.id === id) out = x; });
    return out;
  }

  function findExam(s, id) {
    var out = null;
    learningOf(s).exams.forEach(function (x) { if (x.id === id) out = x; });
    return out;
  }

  function daysUntil(iso) {
    var t = A.ui.todayISO();
    if (!iso || iso <= t) return 0;
    var days = 0, cur = t;
    while (cur < iso && days < 400) { cur = A.ui.addDaysISO(cur, 1); days++; }
    return days;
  }

  function countdownTagHTML(dateIso) {
    var t = A.ui.todayISO();
    if (!dateIso) return '';
    if (dateIso < t) return '<span class="tag dim">done</span>';
    if (dateIso === t) return '<span class="tag acc-red">today!</span>';
    var n = daysUntil(dateIso);
    return '<span class="tag acc-' + (n <= 3 ? 'orange' : 'blue') + '">in ' + n +
      (n === 1 ? ' day' : ' days') + '</span>';
  }

  /* ---------------- subject modal ---------------- */

  function openSubjectModal() {
    var esc = A.ui.esc;
    A.ui.modal({
      title: '📚 New subject',
      accent: 'blue',
      body:
        '<div class="field"><label>Subject</label>' +
          '<input id="sub-title" class="input" maxlength="40" placeholder="e.g. Mathematics"></div>' +
        '<div class="field"><label>Emoji</label>' +
          '<div class="emoji-pick" id="sub-emoji">' +
            SUBJECT_EMOJIS.map(function (e, i) {
              return '<button type="button" data-emoji="' + esc(e) + '"' + (i === 0 ? ' class="sel"' : '') +
                ' aria-label="Pick emoji ' + esc(e) + '">' + esc(e) + '</button>';
            }).join('') +
          '</div></div>' +
        '<div class="field"><label>Accent colour</label>' +
          '<div class="swatches" id="sub-acc">' +
            A.ui.ACCENT_NAMES.map(function (name) {
              return '<button type="button" class="acc-' + name + (name === 'blue' ? ' sel' : '') +
                '" data-swatch="' + name + '" title="' + name + '" aria-label="Accent ' + name + '"></button>';
            }).join('') +
          '</div></div>',
      onOpen: function (m) {
        m.querySelectorAll('#sub-emoji button').forEach(function (b) {
          b.addEventListener('click', function () {
            m.querySelectorAll('#sub-emoji button').forEach(function (x) { x.classList.remove('sel'); });
            b.classList.add('sel');
          });
        });
        m.querySelectorAll('#sub-acc button').forEach(function (b) {
          b.addEventListener('click', function () {
            m.querySelectorAll('#sub-acc button').forEach(function (x) { x.classList.remove('sel'); });
            b.classList.add('sel');
          });
        });
      },
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        {
          label: 'Add subject',
          cls: 'btn-primary',
          onClick: function (m) {
            var title = m.querySelector('#sub-title').value.trim();
            if (!title) { A.ui.toast('Give the subject a name first', '✍️'); return false; }
            var emBtn = m.querySelector('#sub-emoji button.sel');
            var emoji = emBtn ? emBtn.getAttribute('data-emoji') : SUBJECT_EMOJIS[0];
            var swBtn = m.querySelector('#sub-acc button.sel');
            var accent = safeAccent(swBtn ? swBtn.getAttribute('data-swatch') : 'blue');
            A.S.update(function (st) {
              ensureLearning(st).subjects.push({ id: A.ui.uid(), title: title, emoji: emoji, accent: accent });
            });
            A.ui.toast('Subject added: ' + title, emoji);
          }
        }
      ]
    });
  }

  /* ---------------- exam modal ---------------- */

  function openExamModal() {
    var esc = A.ui.esc;
    var s = A.S.get();
    var subjects = learningOf(s).subjects;
    var minDate = A.ui.addDaysISO(A.ui.todayISO(), 1);

    var subjectField = '';
    if (subjects.length) {
      subjectField =
        '<div class="field"><label>Subject (optional)</label>' +
          '<select id="ex-subject" class="select">' +
            '<option value="">No subject</option>' +
            subjects.map(function (sub) {
              return '<option value="' + esc(sub.id) + '">' + esc((sub.emoji || '📚') + ' ' + sub.title) + '</option>';
            }).join('') +
          '</select></div>';
    } else {
      subjectField = '<p class="small dim">Tip: add subjects first and your exams get colour-coded automatically.</p>';
    }

    A.ui.modal({
      title: '🎓 New exam or test',
      accent: 'purple',
      body:
        '<div class="field"><label>What is it?</label>' +
          '<input id="ex-title" class="input" maxlength="60" placeholder="e.g. Maths test"></div>' +
        subjectField +
        '<div class="field"><label>Exam date</label>' +
          '<input id="ex-date" class="input" type="date" min="' + esc(minDate) + '"></div>' +
        '<p class="small muted">Once it’s in, one tap builds a revision plan spread across the days before it.</p>',
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        {
          label: 'Add exam',
          cls: 'btn-primary',
          onClick: function (m) {
            var title = m.querySelector('#ex-title').value.trim();
            if (!title) { A.ui.toast('Give the exam a name first', '✍️'); return false; }
            var date = m.querySelector('#ex-date').value;
            if (!date) { A.ui.toast('Pick the exam date', '📅'); return false; }
            if (date <= A.ui.todayISO()) { A.ui.toast('The exam date needs to be in the future', '📅'); return false; }
            var subEl = m.querySelector('#ex-subject');
            var subjectId = subEl && subEl.value ? subEl.value : null;
            A.S.update(function (st) {
              ensureLearning(st).exams.push({
                id: A.ui.uid(), title: title, subjectId: subjectId, date: date, planBuilt: false
              });
            });
            A.ui.toast('Exam added — build a revision plan when you’re ready', '🎓');
          }
        }
      ]
    });
  }

  /* ---------------- actions ---------------- */

  function buildPlan(examId) {
    var s = A.S.get();
    var exam = findExam(s, examId);
    if (!exam) return;
    if (exam.planBuilt) { A.ui.toast('A revision plan is already built for this exam', '📚'); return; }
    var t = A.ui.todayISO();
    if (!exam.date || exam.date <= t) {
      A.ui.toast(exam.date === t
        ? 'The exam is today — no days left to spread revision. You’ve got this! 🍀'
        : 'That exam has already happened — add an upcoming one to build a plan', '📚');
      return;
    }
    var res = null;
    A.S.update(function (st) {
      res = A.engine.buildRevisionPlan(st, examId);
    });
    if (!res || !res.created) {
      A.ui.toast('Couldn’t build a plan — check the exam date is in the future', '📚');
      return;
    }
    A.S.addXp(10, 'Revision plan built');   // scholar achievement fires from core
    A.ui.toast(res.created + ' revision sessions spread before the exam — ' +
      (res.placed || 0) + ' placed on your timetable', '📚');
  }

  function deleteSubject(subjectId) {
    var subject = findSubject(A.S.get(), subjectId);
    if (!subject) return;
    A.ui.confirm(
      'Delete "' + subject.title + '"? Its exams stay, but they’ll lose their subject label.',
      function () {
        A.S.update(function (st) {
          var l = ensureLearning(st);
          l.subjects = l.subjects.filter(function (x) { return x.id !== subjectId; });
          l.exams.forEach(function (e) { if (e.subjectId === subjectId) e.subjectId = null; });
        });
        A.ui.toast('Subject deleted', '🗑️');
      },
      { title: 'Delete subject', yesLabel: 'Delete' }
    );
  }

  function deleteExam(examId) {
    var exam = findExam(A.S.get(), examId);
    if (!exam) return;
    A.ui.confirm(
      'Delete "' + exam.title + '"? Revision tasks already created for it are NOT deleted — they stay on your task list and timetable.',
      function () {
        A.S.update(function (st) {
          var l = ensureLearning(st);
          l.exams = l.exams.filter(function (x) { return x.id !== examId; });
        });
        A.ui.toast('Exam deleted', '🗑️');
      },
      { title: 'Delete exam', yesLabel: 'Delete' }
    );
  }

  /* ---------------- HTML builders ---------------- */

  function headHTML() {
    return '<div class="screen-head"><div class="spread wrap">' +
      '<div><h1>Learning</h1>' +
      '<div class="sub">Subjects, exams and revision plans that build themselves.</div></div>' +
      '<button class="btn btn-primary" data-new-exam="1">＋ Exam</button>' +
      '</div></div>';
  }

  function subjectsHTML(subjects) {
    var esc = A.ui.esc;
    var inner;
    if (!subjects.length) {
      inner = '<div class="empty"><div class="e-emoji">🎒</div>' +
        '<p>Add the subjects you’re studying — exams and revision get colour-coded by subject.</p>' +
        '<button class="btn btn-acc acc-blue" data-new-subject="1">＋ Add your first subject</button></div>';
    } else {
      inner = '<div class="row wrap" style="gap:8px">' +
        subjects.map(function (sub) {
          var acc = safeAccent(sub.accent);
          return '<span class="tag acc-' + acc + '" style="font-size:.85rem;padding:5px 5px 5px 12px;gap:7px">' +
            '<span>' + esc(sub.emoji || '📚') + '</span>' +
            '<span>' + esc(sub.title) + '</span>' +
            '<button class="icon-btn danger" data-del-subject="' + esc(sub.id) + '" ' +
              'style="width:22px;height:22px;flex:0 0 22px;border-radius:8px" ' +
              'title="Delete subject" aria-label="Delete subject ' + esc(sub.title) + '">' +
              A.ui.icon('x', 'sm') + '</button>' +
            '</span>';
        }).join('') +
        '</div>';
    }
    return '<div class="card acc acc-blue section-gap">' +
      '<div class="spread wrap" style="margin-bottom:12px">' +
        '<div class="card-title" style="margin-bottom:0">' + A.ui.icon('book') + ' Subjects</div>' +
        '<button class="btn btn-sm btn-acc acc-blue" data-new-subject="1">＋ Subject</button>' +
      '</div>' + inner + '</div>';
  }

  function examRowHTML(e, subjectById, t) {
    var esc = A.ui.esc;
    var subject = e.subjectId ? subjectById[e.subjectId] : null;
    var past = !!e.date && e.date < t;
    var acc = subject ? safeAccent(subject.accent, 'purple') : 'purple';

    var tags = '';
    if (subject) {
      tags += '<span class="tag acc-' + acc + '">' + esc((subject.emoji || '📚') + ' ' + subject.title) + '</span>';
    }
    tags += '<span class="small muted">📅 ' + esc(A.ui.fmtDate(e.date)) + '</span>';
    tags += countdownTagHTML(e.date);

    var action;
    if (e.planBuilt) {
      action = '<span class="tag acc-green">✅ Plan built</span>';
    } else {
      action = '<button class="btn btn-sm btn-acc acc-' + acc + '" data-build="' + esc(e.id) + '" ' +
        'title="Spread revision sessions across the days before the exam">📚 Build revision plan</button>';
    }

    return '<div class="list-item acc-' + acc + (past ? ' done' : '') + '">' +
      '<span class="icon-tile">' + esc(subject ? (subject.emoji || '📚') : '📝') + '</span>' +
      '<div class="li-main">' +
        '<div class="li-title bold">' + esc(e.title) + '</div>' +
        '<div class="row wrap" style="gap:8px;margin-top:5px">' + tags + '</div>' +
      '</div>' +
      action +
      '<button class="icon-btn danger" data-del-exam="' + esc(e.id) + '" ' +
        'title="Delete exam" aria-label="Delete exam ' + esc(e.title) + '">' +
        A.ui.icon('trash', 'sm') + '</button>' +
      '</div>';
  }

  function examsHTML(exams, subjectById, t) {
    var inner;
    if (!exams.length) {
      inner = '<div class="empty"><div class="e-emoji">📝</div>' +
        '<p>No exams on the radar. Add one and Acendri spreads revision across the days before it — never one cram day.</p>' +
        '<button class="btn btn-acc acc-purple" data-new-exam="1">＋ Add an exam</button></div>';
    } else {
      var upcoming = exams.filter(function (e) { return !e.date || e.date >= t; })
        .sort(function (a, b) { return (a.date || '9999') < (b.date || '9999') ? -1 : 1; });
      var past = exams.filter(function (e) { return e.date && e.date < t; })
        .sort(function (a, b) { return a.date > b.date ? -1 : 1; });
      inner = '<div class="list">' +
        upcoming.concat(past).map(function (e) { return examRowHTML(e, subjectById, t); }).join('') +
        '</div>';
    }
    return '<div class="card acc acc-purple section-gap">' +
      '<div class="card-title">' + A.ui.icon('grad') + ' Exams & tests</div>' + inner + '</div>';
  }

  function howItWorksHTML() {
    var lines = [
      ['💬', 'Tell Acendri about a test in chat — “I have a maths test next Friday” — and it builds the plan automatically.'],
      ['📆', 'Revision spreads across the days before the exam — never one giant cram day.'],
      ['🗓️', 'Sessions land in your timetable around your commitments, with a reminder on exam day.']
    ];
    return '<div class="card acc acc-cyan section-gap">' +
      '<div class="card-title">' + A.ui.icon('bulb') + ' How it works</div>' +
      lines.map(function (l) {
        return '<div class="row" style="gap:10px;align-items:flex-start;margin-top:8px">' +
          '<span style="font-size:1.05rem">' + l[0] + '</span>' +
          '<span class="small muted">' + l[1] + '</span></div>';
      }).join('') +
      '<div style="margin-top:14px"><button class="btn btn-acc acc-cyan" data-ask="1">🤖 Ask Acendri</button></div>' +
      '</div>';
  }

  /* ---------------- screen ---------------- */

  function renderLearning(el, ctx) {
    var s = A.S.get();
    var l = learningOf(s);
    var t = A.ui.todayISO();

    var subjectById = {};
    l.subjects.forEach(function (sub) { subjectById[sub.id] = sub; });

    el.innerHTML =
      headHTML() +
      subjectsHTML(l.subjects) +
      examsHTML(l.exams, subjectById, t) +
      howItWorksHTML();

    /* ---- listeners ---- */

    el.querySelectorAll('[data-new-subject]').forEach(function (b) {
      b.addEventListener('click', function () { openSubjectModal(); });
    });

    el.querySelectorAll('[data-new-exam]').forEach(function (b) {
      b.addEventListener('click', function () { openExamModal(); });
    });

    el.querySelectorAll('[data-del-subject]').forEach(function (b) {
      b.addEventListener('click', function () { deleteSubject(b.getAttribute('data-del-subject')); });
    });

    el.querySelectorAll('[data-del-exam]').forEach(function (b) {
      b.addEventListener('click', function () { deleteExam(b.getAttribute('data-del-exam')); });
    });

    el.querySelectorAll('[data-build]').forEach(function (b) {
      b.addEventListener('click', function () { buildPlan(b.getAttribute('data-build')); });
    });

    el.querySelectorAll('[data-ask]').forEach(function (b) {
      b.addEventListener('click', function () { ctx.nav('app/assistant'); });
    });
  }

  A.registerScreen('app/learning', {
    title: 'Learning',
    icon: 'grad',
    accent: 'blue',
    inShell: true,
    order: 6,
    render: renderLearning
  });
})();
