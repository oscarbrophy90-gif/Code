/* ============================================================
   Acendri OS — settings & privacy screen
   Profile, planner preferences, data ownership, about.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;
  var esc = A.ui.esc;
  var icon = A.ui.icon;

  var AVATARS = ['🙂', '😎', '🧑‍🚀', '👩‍🎓', '🏆', '🎾', '📚', '💪', '🎨', '🎸', '🥇', '🌟'];
  var FOCUSES = ['Student', 'Athlete', 'Entrepreneur', 'Professional', 'Personal growth'];
  var CURRENCIES = ['$', '€', '£', 'A$', '¥'];

  function settingsOf(s) {
    // guard: settings may be absent on old/imported states
    return s.settings || { wake: '07:00', sleep: '22:30', currency: '$', autoPost: true, notifications: true };
  }

  function profileCard(s) {
    var p = s.profile || {};
    return '' +
      '<div class="card acc glow acc-cyan">' +
        '<div class="card-title">' + icon('users') + 'Profile</div>' +
        '<div class="field"><label>Avatar</label><div class="emoji-pick" id="set-avatars">' +
          AVATARS.map(function (e) {
            return '<button type="button" data-emoji="' + esc(e) + '" class="' + (p.avatar === e ? 'sel' : '') + '" title="Pick avatar">' + esc(e) + '</button>';
          }).join('') +
        '</div></div>' +
        '<div class="field"><label>Your name</label>' +
          '<input class="input" id="set-name" maxlength="40" placeholder="What should we call you?" value="' + esc(p.name || '') + '"></div>' +
        '<div class="field"><label>Main focus</label>' +
          '<select class="select" id="set-focus">' +
            (FOCUSES.indexOf(p.focus) === -1 ? '<option value="" ' + (p.focus ? '' : 'selected') + '>Choose your focus…</option>' : '') +
            FOCUSES.map(function (f) {
              return '<option value="' + esc(f) + '"' + (p.focus === f ? ' selected' : '') + '>' + esc(f) + '</option>';
            }).join('') +
          '</select></div>' +
        '<button class="btn btn-primary" data-act="save-profile">' + icon('check', 'sm') + 'Save profile</button>' +
      '</div>';
  }

  function prefsCard(s) {
    var st = settingsOf(s);
    return '' +
      '<div class="card acc glow acc-purple">' +
        '<div class="card-title">' + icon('clock') + 'Day shape</div>' +
        '<div class="grid2">' +
          '<div class="field"><label>Wake time</label>' +
            '<input class="input" type="time" id="set-wake" value="' + esc(st.wake || '07:00') + '"></div>' +
          '<div class="field"><label>Sleep time</label>' +
            '<input class="input" type="time" id="set-sleep" value="' + esc(st.sleep || '22:30') + '"></div>' +
        '</div>' +
        '<div class="field"><label>Currency</label>' +
          '<select class="select" id="set-currency">' +
            CURRENCIES.map(function (c) {
              return '<option value="' + esc(c) + '"' + (st.currency === c ? ' selected' : '') + '>' + esc(c) + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="field">' +
          '<label class="checkbox"><input type="checkbox" id="set-autopost"' + (st.autoPost ? ' checked' : '') + '> Auto-share my achievements to the feed</label>' +
        '</div>' +
        '<div class="field">' +
          '<label class="checkbox"><input type="checkbox" id="set-notif"' + (st.notifications ? ' checked' : '') + '> Motivational nudges</label>' +
        '</div>' +
        '<button class="btn btn-primary" data-act="save-prefs">' + icon('check', 'sm') + 'Save preferences</button>' +
        '<p class="muted small" style="margin-top:10px">Wake/sleep shape your automatic timetable.</p>' +
      '</div>';
  }

  function dataCard(s) {
    var counts = {
      goals: (s.goals || []).length,
      tasks: (s.tasks || []).length,
      habits: (s.habits || []).length,
      tx: ((s.finance || {}).transactions || []).length
    };
    var total = counts.goals + counts.tasks + counts.habits + counts.tx;
    var kb = Math.max(1, Math.round(A.S.exportJSON().length / 1024));

    var inventory;
    if (total === 0) {
      inventory =
        '<div class="empty"><div class="e-emoji">🌱</div>' +
        '<p>Nothing stored yet — Acendri is a blank canvas waiting for your first goal.</p>' +
        '<button class="btn btn-acc" data-act="demo">' + icon('sparkles', 'sm') + 'Load demo data</button></div>';
    } else {
      inventory =
        '<div class="grid4" style="margin-bottom:14px">' +
          '<div class="stat"><span class="v h-acc">' + counts.goals + '</span><span class="k">goals</span></div>' +
          '<div class="stat"><span class="v h-acc">' + counts.tasks + '</span><span class="k">tasks</span></div>' +
          '<div class="stat"><span class="v h-acc">' + counts.habits + '</span><span class="k">habits</span></div>' +
          '<div class="stat"><span class="v h-acc">' + counts.tx + '</span><span class="k">transactions</span></div>' +
        '</div>';
    }

    return '' +
      '<div class="card acc glow acc-teal section-gap">' +
        '<div class="card-title">' + icon('shield') + 'Your data, yours</div>' +
        '<p class="muted" style="margin-bottom:14px">Everything Acendri knows lives in THIS browser’s local storage. Nothing is uploaded, tracked or shared. Export it, move it, wipe it — you’re in control.</p>' +
        inventory +
        '<p class="dim small" style="margin-bottom:12px">Currently using about ' + kb + ' KB of local storage.</p>' +
        '<div class="row wrap">' +
          '<button class="btn" data-act="export">' + icon('download', 'sm') + 'Export my data</button>' +
          '<button class="btn" data-act="import">' + icon('upload', 'sm') + 'Import data</button>' +
          '<button class="btn btn-acc" data-act="demo">' + icon('sparkles', 'sm') + 'Load demo data</button>' +
          '<button class="btn btn-danger" data-act="reset">' + icon('trash', 'sm') + 'Reset everything</button>' +
        '</div>' +
        '<input type="file" id="set-import-file" accept=".json,application/json" style="display:none">' +
      '</div>';
  }

  function aboutCard() {
    return '' +
      '<div class="card acc acc-indigo section-gap">' +
        '<div class="card-title">' + icon('sparkles') + 'About Acendri OS</div>' +
        '<p class="bold">Acendri OS · prototype v1.0</p>' +
        '<p class="h-acc small" style="margin:6px 0">Plan → Act → Track → Learn → Improve → Plan again.</p>' +
        '<p class="muted small" style="margin-bottom:14px">One connected operating system for your goals, time, habits and money — so ambitious people can spend less energy organising life and more energy living it.</p>' +
        '<div class="row wrap">' +
          '<button class="btn" data-act="landing">' + icon('eye', 'sm') + 'View landing page</button>' +
          '<button class="btn btn-ghost" data-act="assistant">' + icon('chat', 'sm') + 'Meet the assistant</button>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- actions ---------------- */

  function saveProfile(el) {
    var name = el.querySelector('#set-name').value.trim();
    var focus = el.querySelector('#set-focus').value;
    var selBtn = el.querySelector('#set-avatars button.sel');
    var avatar = selBtn ? selBtn.getAttribute('data-emoji') : '🙂';
    if (!name) { A.ui.toast('Tell us your name first', '✍️'); el.querySelector('#set-name').focus(); return; }
    A.S.update(function (s) {
      s.profile.name = name;
      s.profile.avatar = avatar;
      if (focus) s.profile.focus = focus;
    });
    A.S.log('Updated profile', '👤');
    A.ui.toast('Profile saved', '✅');
  }

  function savePrefs(el) {
    var wake = el.querySelector('#set-wake').value;
    var sleep = el.querySelector('#set-sleep').value;
    var currency = el.querySelector('#set-currency').value;
    var autoPost = el.querySelector('#set-autopost').checked;
    var notifications = el.querySelector('#set-notif').checked;
    if (!wake || !sleep) { A.ui.toast('Set both a wake and a sleep time', '⏰'); return; }
    if (A.ui.minutes(sleep) <= A.ui.minutes(wake)) { A.ui.toast('Sleep time must be after wake time', '🌙'); return; }
    A.S.update(function (s) {
      if (!s.settings) s.settings = {};
      s.settings.wake = wake;
      s.settings.sleep = sleep;
      s.settings.currency = currency;
      s.settings.autoPost = autoPost;
      s.settings.notifications = notifications;
      if (s.timetable) A.engine.generateTimetable(s); // keep the timetable in step with the new day shape
    });
    A.S.log('Updated planner preferences', '⚙️');
    A.ui.toast('Preferences saved', '✅');
  }

  function exportData() {
    var blob = new Blob([A.S.exportJSON()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'acendri-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    A.ui.toast('Backup downloaded', '💾');
  }

  function importData(el) {
    var input = el.querySelector('#set-import-file');
    input.value = '';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          A.S.importJSON(String(reader.result));
          A.ui.toast('Data restored', '🎉');
        } catch (e) {
          A.ui.toast(e && e.message ? e.message : 'That file could not be read', '⚠️');
        }
      };
      reader.onerror = function () { A.ui.toast('Could not read that file', '⚠️'); };
      reader.readAsText(file);
    };
    input.click();
  }

  function loadDemo() {
    A.ui.confirm(
      'This adds demo goals, tasks, habits and finances on top of your data. Continue?',
      function () { A.S.loadDemo(); },
      { title: 'Load demo data?', yesLabel: 'Load demo', danger: false, accent: 'teal' }
    );
  }

  function resetAll() {
    A.ui.confirm(
      'This permanently erases ALL your Acendri data — goals, tasks, habits, finances, XP, achievements and settings. There is no backup and this cannot be undone.',
      function () { A.S.reset(); A.ui.toast('Everything wiped — fresh start', '🧹'); },
      { title: 'Reset everything?', yesLabel: 'Erase it all' }
    );
  }

  /* ---------------- screen ---------------- */

  A.registerScreen('app/settings', {
    title: 'Settings',
    icon: 'gear',
    accent: 'teal',
    inShell: true,
    order: 12,
    render: function (el, ctx) {
      var s = ctx.S.get();
      el.innerHTML =
        '<div class="screen-head"><h1>Settings <span class="h-grad">&amp; privacy</span></h1>' +
        '<div class="sub">Tune Acendri to your life — and keep every byte of your data in your hands.</div></div>' +
        '<div class="grid2">' + profileCard(s) + prefsCard(s) + '</div>' +
        dataCard(s) +
        aboutCard();

      // avatar picker: highlight locally, saved on "Save profile"
      el.querySelectorAll('#set-avatars button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          el.querySelectorAll('#set-avatars button').forEach(function (b) { b.classList.remove('sel'); });
          btn.classList.add('sel');
        });
      });

      el.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.getAttribute('data-act');
          if (act === 'save-profile') saveProfile(el);
          else if (act === 'save-prefs') savePrefs(el);
          else if (act === 'export') exportData();
          else if (act === 'import') importData(el);
          else if (act === 'demo') loadDemo();
          else if (act === 'reset') resetAll();
          else if (act === 'landing') ctx.nav('landing');
          else if (act === 'assistant') ctx.nav('app/assistant');
        });
      });
    }
  });
})();
