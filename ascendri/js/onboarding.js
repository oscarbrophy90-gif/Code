/* ============================================================
   Acendri OS — onboarding wizard (4 steps + plan reveal,
   full-page, no shell). Steps: who you are → your focus →
   shape your day → first goal → "YOUR ACENDRI PLAN".
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var AVATARS = ['🙂', '😎', '🧑‍🚀', '👩‍🎓', '🏆', '🎾', '📚', '💪', '🎨', '🎸', '🥇', '🌟'];

  var FOCUSES = [
    { id: 'Student',         emoji: '🎓', accent: 'blue',   label: 'Student',         desc: 'School, study and exams' },
    { id: 'Athlete',         emoji: '🏆', accent: 'green',  label: 'Athlete',         desc: 'Training, competition and recovery' },
    { id: 'Entrepreneur',    emoji: '💼', accent: 'purple', label: 'Entrepreneur',    desc: 'Projects, business and money' },
    { id: 'Professional',    emoji: '👔', accent: 'indigo', label: 'Professional',    desc: 'Career and personal development' },
    { id: 'Personal growth', emoji: '🌱', accent: 'teal',   label: 'Personal growth', desc: 'Habits, health and balance' }
  ];

  var CATEGORIES = ['Study', 'Sport', 'Finance', 'Career', 'Health', 'Personal'];
  var CAT_ACCENT = { Study: 'blue', Sport: 'green', Finance: 'yellow', Career: 'purple', Health: 'orange', Personal: 'cyan' };

  // Three "do this week" starter tasks per goal domain — same spirit as the
  // goals screen's category templates, phrased as concrete first actions.
  var STARTER_TASKS = {
    Study: [
      'Break the syllabus into weekly topics',
      'Set a fixed daily study block',
      'Finish one practice paper'
    ],
    Sport: [
      'Build a weekly training schedule',
      'Set one measurable performance target',
      'Complete your first training session'
    ],
    Finance: [
      'Work out the exact amount and deadline',
      'Open a separate account for it',
      'Set an automatic weekly transfer'
    ],
    Career: [
      'Define what success looks like in 12 months',
      'Update your resume and portfolio',
      'Reach out to someone already doing it'
    ],
    Health: [
      'Book a check-up and get a baseline',
      'Plan meals for the week ahead',
      'Do one 30-minute workout'
    ],
    Personal: [
      'Write down why this matters to you',
      'Break it into monthly mini-goals',
      'Block weekly time for it'
    ]
  };

  // One supporting habit per goal domain (mirrors the goals screen's seeds).
  var STARTER_HABIT = {
    Study:    { emoji: '📚', title: '25-minute study sprint' },
    Sport:    { emoji: '🏃', title: 'Daily training touch' },
    Finance:  { emoji: '💰', title: 'Log every expense' },
    Career:   { emoji: '💼', title: 'One career move a day' },
    Health:   { emoji: '🥗', title: 'One healthy choice today' },
    Personal: { emoji: '🌱', title: '15 minutes on my goal' }
  };

  var TOTAL_STEPS = 4;

  // wizard state lives at module level so it survives idempotent re-renders
  var step = 1;
  var draft = null;
  var reveal = null;   // plan-reveal payload set by finish() when a goal was created

  function seedDraft(p, set) {
    set = set || {};
    return {
      name: (p && p.name) || '',
      avatar: (p && p.avatar) || '🙂',
      focus: (p && p.focus) || '',
      wake: set.wake || '07:00',
      sleep: set.sleep || '22:30',
      hasBlock: false,
      blockStart: '08:30',
      blockEnd: '15:30',
      autoReschedule: true,
      goalTitle: '',
      goalCat: 'Study',
      demo: false
    };
  }

  function blockTitleFor(focus) {
    return (focus === 'Professional' || focus === 'Entrepreneur') ? 'Work' : 'School';
  }

  A.registerScreen('onboarding', {
    title: 'Welcome',
    icon: 'sparkles',
    accent: 'cyan',
    inShell: false,
    order: 1,

    render: function (el, ctx) {
      var esc = A.ui.esc;
      var state = ctx.S.get() || {};
      var profile = state.profile || {};

      // A finished user re-entering the wizard starts fresh at step 1
      // (unless the plan reveal is still waiting to be shown).
      if (!reveal && (!draft || profile.onboarded)) {
        step = 1;
        draft = seedDraft(profile, state.settings);
      }

      el.innerHTML = '<div class="onb"><div class="onb-card acc-cyan"></div></div>';
      var card = el.querySelector('.onb-card');

      function dots(allOn) {
        var h = '<div class="onb-dots">';
        for (var i = 1; i <= TOTAL_STEPS; i++) h += '<span class="' + (allOn || i <= step ? 'on' : '') + '"></span>';
        return h + '</div>';
      }

      function head(title, sub, grad) {
        return '<h2 class="' + (grad ? 'h-grad' : '') + '" style="font-size:1.5rem;text-align:center;line-height:1.25">' + title + '</h2>' +
          '<p class="muted" style="text-align:center;margin:8px 0 22px">' + sub + '</p>';
      }

      function goNext() { step = Math.min(TOTAL_STEPS, step + 1); rerender(); }
      function goBack() { step = Math.max(1, step - 1); rerender(); }

      /* ---------- step renderers ---------- */

      function renderStep1() {
        card.innerHTML =
          dots() +
          head('Welcome to Acendri OS', 'Let’s set you up in under a minute. Your life, connected.', true) +
          '<div class="field"><label>What should we call you?</label>' +
          '<input class="input" id="onb-name" type="text" maxlength="40" placeholder="Your name" value="' + esc(draft.name) + '"></div>' +
          '<div class="field"><label>Pick an avatar</label><div class="emoji-pick">' +
          AVATARS.map(function (e, i) {
            return '<button type="button" data-avatar="' + i + '" class="' + (e === draft.avatar ? 'sel' : '') + '" title="Use ' + esc(e) + ' as your avatar">' + esc(e) + '</button>';
          }).join('') +
          '</div></div>' +
          '<button type="button" class="btn btn-primary btn-lg" data-next="1" style="width:100%;margin-top:6px">Continue ' + A.ui.icon('arrow') + '</button>';

        var nameInput = card.querySelector('#onb-name');
        nameInput.addEventListener('input', function () { draft.name = nameInput.value; });
        nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryContinue(); });
        setTimeout(function () { nameInput.focus(); }, 60);

        card.querySelectorAll('[data-avatar]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            draft.avatar = AVATARS[+btn.getAttribute('data-avatar')];
            rerender();
          });
        });

        function tryContinue() {
          if (!draft.name.trim()) { A.ui.toast('Tell us your name first', '✍️'); nameInput.focus(); return; }
          goNext();
        }
        card.querySelector('[data-next]').addEventListener('click', tryContinue);
      }

      function renderStep2() {
        card.innerHTML =
          dots() +
          head('What’s your main focus right now?', 'Acendri tunes your dashboard and suggestions around it.', false) +
          '<div class="col" style="margin-bottom:22px">' +
          FOCUSES.map(function (f, i) {
            return '<button type="button" class="focus-opt acc-' + f.accent + (draft.focus === f.id ? ' sel' : '') + '" data-focus="' + i + '">' +
              '<span style="font-size:1.5rem">' + esc(f.emoji) + '</span>' +
              '<span><span class="bold">' + esc(f.label) + '</span><br><span class="muted small">' + esc(f.desc) + '</span></span>' +
              '</button>';
          }).join('') +
          '</div>' +
          '<div class="row">' +
          '<button type="button" class="btn btn-ghost" data-back="1">Back</button>' +
          '<button type="button" class="btn btn-primary" data-next="1" style="flex:1">Continue ' + A.ui.icon('arrow') + '</button>' +
          '</div>';

        card.querySelectorAll('[data-focus]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            draft.focus = FOCUSES[+btn.getAttribute('data-focus')].id;
            rerender();
          });
        });
        card.querySelector('[data-back]').addEventListener('click', goBack);
        card.querySelector('[data-next]').addEventListener('click', function () {
          if (!draft.focus) { A.ui.toast('Pick a focus to continue', '🎯'); return; }
          goNext();
        });
      }

      function renderStep3() {
        var bTitle = blockTitleFor(draft.focus);
        card.innerHTML =
          dots() +
          head('Shape your day', 'Acendri plans around your real life — tell it the basics.', false) +
          '<div class="row" style="gap:12px">' +
          '<div class="field" style="flex:1"><label>I wake up</label>' +
          '<input class="input" id="onb-wake" type="time" value="' + esc(draft.wake) + '"></div>' +
          '<div class="field" style="flex:1"><label>Lights out</label>' +
          '<input class="input" id="onb-sleep" type="time" value="' + esc(draft.sleep) + '"></div>' +
          '</div>' +
          '<label class="checkbox" style="margin:2px 0 14px"><input type="checkbox" id="onb-block"' + (draft.hasBlock ? ' checked' : '') + '><span>I have school/work on weekdays</span></label>' +
          (draft.hasBlock ?
            '<div class="row" style="gap:12px">' +
            '<div class="field" style="flex:1"><label>' + esc(bTitle) + ' starts</label>' +
            '<input class="input" id="onb-bstart" type="time" value="' + esc(draft.blockStart) + '"></div>' +
            '<div class="field" style="flex:1"><label>' + esc(bTitle) + ' ends</label>' +
            '<input class="input" id="onb-bend" type="time" value="' + esc(draft.blockEnd) + '"></div>' +
            '</div>' : '') +
          '<div class="field"><label>Planning style</label><div class="col">' +
          '<button type="button" class="focus-opt acc-cyan' + (draft.autoReschedule ? ' sel' : '') + '" data-plan="auto">' +
          '<span style="font-size:1.5rem">🤖</span>' +
          '<span><span class="bold">Plan for me automatically</span><br><span class="muted small">Acendri fills your week and adjusts when life happens</span></span>' +
          '</button>' +
          '<button type="button" class="focus-opt acc-purple' + (!draft.autoReschedule ? ' sel' : '') + '" data-plan="ask">' +
          '<span style="font-size:1.5rem">🙋</span>' +
          '<span><span class="bold">Ask before moving things</span><br><span class="muted small">You approve every change to your plan</span></span>' +
          '</button>' +
          '</div></div>' +
          '<div class="row">' +
          '<button type="button" class="btn btn-ghost" data-back="1">Back</button>' +
          '<button type="button" class="btn btn-primary" data-next="1" style="flex:1">Continue ' + A.ui.icon('arrow') + '</button>' +
          '</div>';

        function bindTime(id, key) {
          var inp = card.querySelector(id);
          if (!inp) return;
          ['input', 'change'].forEach(function (ev) {
            inp.addEventListener(ev, function () { draft[key] = inp.value; });
          });
        }
        bindTime('#onb-wake', 'wake');
        bindTime('#onb-sleep', 'sleep');
        bindTime('#onb-bstart', 'blockStart');
        bindTime('#onb-bend', 'blockEnd');

        card.querySelector('#onb-block').addEventListener('change', function (e) {
          draft.hasBlock = !!e.target.checked;
          rerender();
        });
        card.querySelectorAll('[data-plan]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            draft.autoReschedule = btn.getAttribute('data-plan') === 'auto';
            rerender();
          });
        });
        card.querySelector('[data-back]').addEventListener('click', goBack);
        card.querySelector('[data-next]').addEventListener('click', function () {
          if (!draft.wake) draft.wake = '07:00';
          if (!draft.sleep) draft.sleep = '22:30';
          if (draft.hasBlock) {
            if (!draft.blockStart) draft.blockStart = '08:30';
            if (!draft.blockEnd) draft.blockEnd = '15:30';
            if (A.ui.minutes(draft.blockEnd) <= A.ui.minutes(draft.blockStart)) {
              A.ui.toast(bTitle + ' has to end after it starts', '⏰');
              return;
            }
          }
          goNext();
        });
      }

      function renderStep4() {
        card.innerHTML =
          dots() +
          head('Give Acendri something to work with', 'Add a first goal — or jump straight in. You can change everything later.', false) +
          '<div class="field"><label>Your first goal (optional)</label>' +
          '<input class="input" id="onb-goal" type="text" maxlength="80" placeholder="Become a professional tennis player" value="' + esc(draft.goalTitle) + '"></div>' +
          '<div class="field"><label>Category</label><select class="select" id="onb-cat">' +
          CATEGORIES.map(function (c) {
            return '<option value="' + esc(c) + '"' + (draft.goalCat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
          }).join('') +
          '</select></div>' +
          '<div class="row" style="gap:12px;margin:2px 0 4px"><hr class="sep" style="flex:1;margin:0"><span class="dim small bold">OR</span><hr class="sep" style="flex:1;margin:0"></div>' +
          '<label class="checkbox" style="margin:14px 0 22px"><input type="checkbox" id="onb-demo"' + (draft.demo ? ' checked' : '') + '><span>Load demo data so I can explore a living app</span></label>' +
          '<div class="row">' +
          '<button type="button" class="btn btn-ghost" data-back="1">Back</button>' +
          '<button type="button" class="btn btn-primary" data-finish="1" style="flex:1">Enter Acendri OS ' + A.ui.icon('arrow') + '</button>' +
          '</div>';

        var goalInput = card.querySelector('#onb-goal');
        goalInput.addEventListener('input', function () { draft.goalTitle = goalInput.value; });
        goalInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') finish(); });
        card.querySelector('#onb-cat').addEventListener('change', function (e) { draft.goalCat = e.target.value; });
        card.querySelector('#onb-demo').addEventListener('change', function (e) { draft.demo = !!e.target.checked; });
        card.querySelector('[data-back]').addEventListener('click', goBack);
        card.querySelector('[data-finish]').addEventListener('click', finish);
      }

      /* ---------- the plan reveal (full card, not a modal) ---------- */

      function renderReveal() {
        var r = reveal;
        var acc = r.accent || 'cyan';
        card.innerHTML =
          dots(true) +
          head('YOUR ACENDRI PLAN ✨', 'Acendri turned your goal into a week you can actually do.', true) +
          '<div class="card acc-' + acc + '" style="margin-bottom:14px"><div class="row">' +
          '<span class="icon-tile">🎯</span>' +
          '<div class="li-main" style="flex:1"><div class="bold">' + esc(r.goalTitle) + '</div></div>' +
          '<span class="tag">' + esc(r.goalCat) + '</span>' +
          '</div></div>' +
          '<p class="small bold" style="margin:0 0 6px">This week:</p>' +
          '<div class="list" style="margin-bottom:14px">' +
          r.tasks.map(function (tk) {
            return '<div class="list-item"><span style="font-size:1.05rem">📋</span>' +
              '<div class="li-main"><div class="li-title" style="font-size:.92rem">' + esc(tk.title) + '</div>' +
              '<div class="li-sub">' + esc(A.ui.fmtDate(tk.due)) + ' · 45 min</div></div></div>';
          }).join('') +
          '</div>' +
          '<p class="small bold" style="margin:0 0 6px">Habits:</p>' +
          '<div class="list">' +
          '<div class="list-item"><span style="font-size:1.05rem">' + esc(r.habit.emoji) + '</span>' +
          '<div class="li-main"><div class="li-title" style="font-size:.92rem">' + esc(r.habit.title) + '</div>' +
          '<div class="li-sub">5× a week · linked to your goal</div></div></div>' +
          '</div>' +
          '<button type="button" class="btn btn-primary btn-lg" data-go="1" style="width:100%;margin-top:18px">🚀 Go to my dashboard</button>';

        card.querySelector('[data-go]').addEventListener('click', function () {
          var name = r.name;
          reveal = null;
          draft = null;
          step = 1;
          ctx.nav('app/dashboard');
          A.ui.toast('Welcome aboard, ' + name + ' — let’s make things happen!', '🚀');
        });
      }

      /* ---------- finish ---------- */

      function finish() {
        var name = draft.name.trim();
        if (!name) { A.ui.toast('Tell us your name first', '✍️'); step = 1; rerender(); return; }
        if (!draft.focus) { A.ui.toast('Pick a focus to continue', '🎯'); step = 2; rerender(); return; }

        var avatar = draft.avatar || '🙂';
        var focus = draft.focus;
        var title = draft.goalTitle.trim();
        var cat = CATEGORIES.indexOf(draft.goalCat) >= 0 ? draft.goalCat : 'Personal';
        var wantDemo = draft.demo;
        var wake = draft.wake || '07:00';
        var sleep = draft.sleep || '22:30';
        var hasBlock = !!draft.hasBlock;
        var bStart = draft.blockStart || '08:30';
        var bEnd = draft.blockEnd || '15:30';
        var bTitle = blockTitleFor(focus);
        var auto = !!draft.autoReschedule;
        if (hasBlock && A.ui.minutes(bEnd) <= A.ui.minutes(bStart)) {
          A.ui.toast(bTitle + ' has to end after it starts', '⏰'); step = 3; rerender(); return;
        }

        var revealData = null;
        var today = A.ui.todayISO();

        A.S.update(function (s) {
          s.profile.name = name;
          s.profile.avatar = avatar;
          s.profile.focus = focus;
          s.profile.onboarded = true;

          s.settings = s.settings || {};
          s.settings.wake = wake;
          s.settings.sleep = sleep;
          s.settings.autoReschedule = auto;

          if (hasBlock) {
            s.commitments = s.commitments || [];
            s.commitments.push({
              id: A.ui.uid(), title: bTitle, days: [1, 2, 3, 4, 5],
              start: bStart, end: bEnd, accent: 'indigo'
            });
          }

          if (title) {
            var goalId = A.ui.uid();
            var accent = CAT_ACCENT[cat] || 'cyan';
            var now = Date.now();
            s.goals = s.goals || [];
            s.goals.push({
              id: goalId, title: title, category: cat, why: '', accent: accent,
              targetDate: null, status: 'active', milestones: [], createdAt: now
            });

            // 3 starter tasks for the goal, spread over the next 4 days
            var titles = (STARTER_TASKS[cat] || STARTER_TASKS.Personal).slice(0, 3);
            var offsets = [0, 2, 3];
            var taskInfos = [];
            s.tasks = s.tasks || [];
            titles.forEach(function (tt, i) {
              var due = A.ui.addDaysISO(today, offsets[i] != null ? offsets[i] : i);
              s.tasks.push({
                id: A.ui.uid(), title: tt, priority: 2, due: due, duration: 45,
                done: false, goalId: goalId, createdAt: now + i
              });
              taskInfos.push({ title: tt, due: due });
            });

            // 1 starter habit linked to the goal
            var hb = STARTER_HABIT[cat] || STARTER_HABIT.Personal;
            s.habits = s.habits || [];
            s.habits.push({
              id: A.ui.uid(), title: hb.title, emoji: hb.emoji, accent: accent,
              targetPerWeek: 5, log: {}, goalId: goalId, createdAt: now
            });

            revealData = {
              name: name, goalTitle: title, goalCat: cat, accent: accent,
              tasks: taskInfos, habit: { emoji: hb.emoji, title: hb.title }
            };
          }
        });
        // outside the update, per contract: demo seed is its own update + toast
        if (wantDemo) A.S.loadDemo();

        if (revealData) {
          // stay on this screen and show the plan — the update above already
          // scheduled a re-render, which lands on renderReveal()
          reveal = revealData;
          rerender();
        } else {
          ctx.nav('app/dashboard');
          A.ui.toast('Welcome aboard, ' + name + ' — let’s make things happen!', '🚀');
        }
        // "welcome" (and goal/habit) achievements fire automatically from core
      }

      /* ---------- card dispatcher ---------- */

      function rerender() {
        if (reveal) { renderReveal(); return; }
        if (step === 1) renderStep1();
        else if (step === 2) renderStep2();
        else if (step === 3) renderStep3();
        else renderStep4();
      }

      rerender();
    }
  });
})();
