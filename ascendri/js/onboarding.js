/* ============================================================
   Acendri OS — onboarding wizard (3 steps, full-page, no shell)
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

  // wizard state lives at module level so it survives idempotent re-renders
  var step = 1;
  var draft = null;

  function seedDraft(p) {
    return {
      name: (p && p.name) || '',
      avatar: (p && p.avatar) || '🙂',
      focus: (p && p.focus) || '',
      goalTitle: '',
      goalCat: 'Study',
      demo: false
    };
  }

  A.registerScreen('onboarding', {
    title: 'Welcome',
    icon: 'sparkles',
    accent: 'cyan',
    inShell: false,
    order: 1,

    render: function (el, ctx) {
      var esc = A.ui.esc;
      var profile = ctx.S.get().profile || {};

      // A finished user re-entering the wizard starts fresh at step 1.
      if (!draft || profile.onboarded) {
        step = 1;
        draft = seedDraft(profile);
      }

      el.innerHTML = '<div class="onb"><div class="onb-card acc-cyan"></div></div>';
      var card = el.querySelector('.onb-card');

      function dots() {
        var h = '<div class="onb-dots">';
        for (var i = 1; i <= 3; i++) h += '<span class="' + (i <= step ? 'on' : '') + '"></span>';
        return h + '</div>';
      }

      function head(title, sub, grad) {
        return '<h2 class="' + (grad ? 'h-grad' : '') + '" style="font-size:1.5rem;text-align:center;line-height:1.25">' + title + '</h2>' +
          '<p class="muted" style="text-align:center;margin:8px 0 22px">' + sub + '</p>';
      }

      function goNext() { step = Math.min(3, step + 1); rerender(); }
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

      function finish() {
        var name = draft.name.trim();
        if (!name) { A.ui.toast('Tell us your name first', '✍️'); step = 1; rerender(); return; }
        if (!draft.focus) { A.ui.toast('Pick a focus to continue', '🎯'); step = 2; rerender(); return; }

        var avatar = draft.avatar || '🙂';
        var focus = draft.focus;
        var title = draft.goalTitle.trim();
        var cat = CATEGORIES.indexOf(draft.goalCat) >= 0 ? draft.goalCat : 'Personal';
        var wantDemo = draft.demo;

        A.S.update(function (s) {
          s.profile.name = name;
          s.profile.avatar = avatar;
          s.profile.focus = focus;
          s.profile.onboarded = true;
          if (title) {
            s.goals.push({
              id: A.ui.uid(),
              title: title,
              category: cat,
              why: '',
              accent: CAT_ACCENT[cat] || 'cyan',
              targetDate: null,
              status: 'active',
              milestones: [],
              createdAt: Date.now()
            });
          }
        });
        // outside the update, per contract: demo seed is its own update + toast
        if (wantDemo) A.S.loadDemo();
        ctx.nav('app/dashboard');
        A.ui.toast('Welcome aboard, ' + name + ' — let’s make things happen!', '🚀');
        // "welcome" achievement fires automatically from core’s checkAchievements
      }

      /* ---------- card dispatcher ---------- */

      function rerender() {
        if (step === 1) renderStep1();
        else if (step === 2) renderStep2();
        else renderStep3();
      }

      rerender();
    }
  });
})();
