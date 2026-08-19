/* ============================================================
   Acendri OS — Focus Mode: one task, one timer, zero noise.
   A full-screen distraction-free stage (no sidebar entry —
   reached via ▶ Do-It-Now buttons, the + quick actions or AI
   command actions, which set focus.currentTaskId first).
   The session pays out exactly once: sessions/minutes/log,
   task completion and XP are guarded by a module-level flag.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  /* ---------------- session machine (survives re-renders) ---------------- */

  var phase = 'idle';        // 'idle' (pick/ready) | 'running' | 'paused' | 'done'
  var endTs = 0;             // absolute end time (Date.now() based) while running
  var remainMs = 0;          // remaining ms while ready/paused
  var totalMs = 0;           // planned session length in ms
  var intervalId = null;     // the one ticking interval (cleared on every re-render)
  var sessionTaskId = null;  // task this session is locked to
  var sessionTitle = '';     // captured at start — survives task deletion
  var startedAt = 0;         // first Start press (informational)
  var finished = false;      // HARD GUARD — finish fires exactly once per session
  var lastSession = null;    // { title, minutes, completedNow, taskXp } for the DONE view

  var PRIO_NAME = { 1: 'Low', 2: 'Medium', 3: 'High' };
  var PRIO_EMOJI = { 1: '🌱', 2: '📌', 3: '🔥' };

  function clearTick() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  function resetMachine() {
    clearTick();
    phase = 'idle'; endTs = 0; remainMs = 0; totalMs = 0;
    sessionTaskId = null; sessionTitle = ''; startedAt = 0; finished = false;
  }

  function clampMins(d) {
    d = parseInt(d, 10);
    if (!d || isNaN(d) || d < 1) d = 45;
    return Math.max(10, Math.min(120, d));
  }

  function findTask(s, id) {
    if (!id) return null;
    var out = null;
    ((s && s.tasks) || []).forEach(function (t) { if (t.id === id) out = t; });
    return out;
  }

  function fmtMs(ms) {
    var totalSec = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (sec < 10 ? '0' + sec : '' + sec);
  }

  function currentRemaining() {
    if (phase === 'running') return Math.max(0, endTs - Date.now());
    return Math.max(0, remainMs);
  }

  function elapsedPct() {
    if (!totalMs) return 0;
    return Math.min(100, Math.max(0, Math.round(((totalMs - currentRemaining()) / totalMs) * 100)));
  }

  function beginSession(task) {
    resetMachine();
    sessionTaskId = task.id;
    sessionTitle = task.title || 'Untitled task';
    totalMs = clampMins(task.duration) * 60000;
    remainMs = totalMs;
    lastSession = null;
  }

  function setCurrentTaskId(id) {
    A.S.update(function (st) {
      if (!st.focus || typeof st.focus.sessions !== 'number') st.focus = { sessions: 0, minutes: 0, log: [] };
      st.focus.currentTaskId = id || null;
    }, { silent: true });
  }

  /* ---------------- finish (EXACTLY once per session) ---------------- */

  function finishSession() {
    if (finished) return;               // double-fire guard (auto 00:00 + click, etc.)
    finished = true;
    clearTick();

    var elapsedMs = Math.max(0, totalMs - currentRemaining());
    var minutes = Math.max(1, Math.floor(elapsedMs / 60000));
    var taskId = sessionTaskId;

    var s0 = A.S.get();
    var t0 = findTask(s0, taskId);
    var title = t0 ? (t0.title || sessionTitle) : sessionTitle;
    var completedNow = !!(t0 && !t0.done);   // this session completes the task
    var taskXp = (t0 && t0.priority === 3) ? 15 : 10;

    lastSession = { title: title, minutes: minutes, completedNow: completedNow, taskXp: taskXp };
    phase = 'done';
    endTs = 0; remainMs = 0;

    // One data update: session stats + log + task completion + clear the target.
    A.S.update(function (s) {
      if (!s.focus || typeof s.focus.sessions !== 'number') s.focus = { sessions: 0, minutes: 0, log: [] };
      if (!s.focus.log) s.focus.log = [];
      s.focus.sessions += 1;
      s.focus.minutes += minutes;
      s.focus.log.push({ ts: Date.now(), taskId: taskId, title: title, minutes: minutes });
      var tk = findTask(s, taskId);
      if (tk && !tk.done) { tk.done = true; tk.doneAt = Date.now(); }
      s.focus.currentTaskId = null;
    });
    // XP after the data update (first-focus / focus-10 achievements fire from core).
    A.S.addXp(20, 'Focus session finished');
    if (completedNow) A.S.addXp(taskXp, 'Task done: ' + title);
  }

  /* ---------------- shared bits ---------------- */

  function stageOpen() {
    return '<div class="focus-stage acc-cyan">' +
      '<span class="pill acc-cyan">🎧 Focus Mode</span>';
  }

  function actionRow(inner) {
    return '<div class="row" style="gap:10px;margin-top:24px;justify-content:center;flex-wrap:wrap">' + inner + '</div>';
  }

  function bindExitQuiet(el, ctx) {
    // Exit with nothing at stake (pick / ready / done) — no confirm needed.
    var b = el.querySelector('#fx-exit');
    if (!b) return;
    b.addEventListener('click', function () {
      resetMachine();
      setCurrentTaskId(null);
      ctx.nav('app/dashboard');
    });
  }

  function bindExitConfirm(el, ctx) {
    // Exit mid-session — the session is discarded, so confirm first.
    var b = el.querySelector('#fx-exit');
    if (!b) return;
    b.addEventListener('click', function () {
      A.ui.confirm('Leave focus? This session won’t be counted.', function () {
        resetMachine();
        setCurrentTaskId(null);
        ctx.nav('app/dashboard');
      }, { title: 'Leave Focus Mode?', yesLabel: 'Leave session' });
    });
  }

  /* ---------------- views ---------------- */

  function renderPick(el, ctx, s) {
    var esc = A.ui.esc, icon = A.ui.icon;
    var list = A.engine.priorities(8) || [];
    if (!list.length) {
      // Fall back to every open task, most urgent first.
      list = ((s.tasks) || []).filter(function (t) { return !t.done; }).slice();
      list.sort(function (a, b) {
        var da = a.due || '9999-12-31', db = b.due || '9999-12-31';
        if (da !== db) return da < db ? -1 : 1;
        if ((a.priority || 1) !== (b.priority || 1)) return (b.priority || 1) - (a.priority || 1);
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
    }

    var html = stageOpen() +
      '<h1 class="h-grad" style="margin:14px 0 4px">What are we focusing on?</h1>' +
      '<p class="muted" style="margin:0">Pick one thing. Everything else can wait.</p>';

    if (!list.length) {
      html +=
        '<div class="empty" style="margin-top:22px;width:min(460px,100%)">' +
          '<div class="e-emoji">🧘</div>' +
          '<p>Nothing to focus on yet — add a task and come back.</p>' +
          '<button class="btn btn-primary" id="fx-addtask">' + icon('plus', 'sm') + '<span>Create a task</span></button>' +
        '</div>' +
        actionRow('<button class="btn btn-ghost" id="fx-exit">Exit</button>');
    } else {
      html +=
        '<div class="card acc-cyan" style="width:min(560px,100%);text-align:left;margin-top:20px">' +
          '<div class="list">' +
          list.map(function (t) {
            var bits = [];
            bits.push(PRIO_NAME[t.priority || 1] || 'Low');
            bits.push(t.due ? 'due ' + A.ui.fmtDate(t.due) : 'no due date');
            bits.push('~' + clampMins(t.duration) + ' min');
            return '<div class="list-item" data-pick="' + esc(t.id) + '" style="cursor:pointer">' +
              '<span class="icon-tile">' + (PRIO_EMOJI[t.priority || 1] || '🌱') + '</span>' +
              '<div class="li-main">' +
                '<div class="li-title">' + esc(t.title || 'Untitled task') + '</div>' +
                '<div class="li-sub">' + esc(bits.join(' · ')) + '</div>' +
              '</div>' + icon('play', 'sm') +
            '</div>';
          }).join('') +
          '</div>' +
        '</div>' +
        actionRow('<button class="btn btn-ghost" id="fx-exit">Exit</button>');
    }
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('[data-pick]').forEach(function (row) {
      row.addEventListener('click', function () {
        var id = row.getAttribute('data-pick');
        var task = findTask(A.S.get(), id);
        if (!task || task.done) { A.ui.toast('That task isn’t open any more', '🤔'); render(el, ctx); return; }
        setCurrentTaskId(id);
        beginSession(task);
        render(el, ctx);
      });
    });
    var add = el.querySelector('#fx-addtask');
    if (add) add.addEventListener('click', function () { ctx.nav('app/tasks'); });
    bindExitQuiet(el, ctx);
  }

  function renderReady(el, ctx) {
    var esc = A.ui.esc, icon = A.ui.icon;
    el.innerHTML = stageOpen() +
      '<div class="focus-task" style="margin-top:16px">' + esc(sessionTitle) + '</div>' +
      '<div class="focus-timer h-grad">' + fmtMs(totalMs) + '</div>' +
      '<div class="dim small">' + Math.round(totalMs / 60000) + ' focused minutes — finishing marks the task done</div>' +
      actionRow(
        '<button class="btn btn-primary btn-lg" id="fx-start">' + icon('play', 'sm') + '<span>Start</span></button>' +
        '<button class="btn btn-ghost" id="fx-change">Change task</button>' +
        '<button class="btn btn-ghost" id="fx-exit">Exit</button>'
      ) +
      '</div>';

    el.querySelector('#fx-start').addEventListener('click', function () {
      phase = 'running';
      endTs = Date.now() + remainMs;
      if (!startedAt) startedAt = Date.now();
      render(el, ctx);
    });
    el.querySelector('#fx-change').addEventListener('click', function () {
      resetMachine();
      setCurrentTaskId(null);
      render(el, ctx);   // → picker
    });
    bindExitQuiet(el, ctx);
  }

  function renderRunning(el, ctx) {
    var esc = A.ui.esc, icon = A.ui.icon;
    el.innerHTML = stageOpen() +
      '<div class="focus-task" style="margin-top:16px">' + esc(sessionTitle) + '</div>' +
      '<div class="focus-timer h-grad" id="fx-timer">' + fmtMs(currentRemaining()) + '</div>' +
      '<div class="focus-ring acc-cyan"><div class="bar lg"><div class="bar-fill" id="fx-fill" style="width:' + elapsedPct() + '%"></div></div></div>' +
      actionRow(
        '<button class="btn" id="fx-pause">' + icon('pause', 'sm') + '<span>Pause</span></button>' +
        '<button class="btn btn-primary" id="fx-finish">' + icon('check', 'sm') + '<span>Finish</span></button>' +
        '<button class="btn btn-ghost" id="fx-exit">Exit</button>'
      ) +
      '<div class="dim small" style="margin-top:16px">Phone away. One tab. You’ve got this.</div>' +
      '</div>';

    var timerEl = el.querySelector('#fx-timer');
    var fillEl = el.querySelector('#fx-fill');

    // The one ticking interval — cleared at the top of every render, so it can
    // never stack. It writes textContent directly (no re-render per tick) and
    // self-destructs if the stage leaves the document (sidebar navigation).
    clearTick();
    intervalId = setInterval(function () {
      if (!document.body.contains(timerEl)) { clearTick(); return; }
      if (phase !== 'running') { clearTick(); return; }
      var rem = Math.max(0, endTs - Date.now());
      timerEl.textContent = fmtMs(rem);
      if (totalMs) fillEl.style.width = Math.min(100, Math.round(((totalMs - rem) / totalMs) * 100)) + '%';
      if (rem <= 0) finishSession();   // 00:00 auto-finish (guarded, clears interval)
    }, 1000);

    el.querySelector('#fx-pause').addEventListener('click', function () {
      clearTick();
      remainMs = Math.max(0, endTs - Date.now());
      endTs = 0;
      phase = 'paused';
      render(el, ctx);
    });
    el.querySelector('#fx-finish').addEventListener('click', function () { finishSession(); });
    bindExitConfirm(el, ctx);
  }

  function renderPaused(el, ctx) {
    var esc = A.ui.esc, icon = A.ui.icon;
    el.innerHTML = stageOpen() +
      '<div class="focus-task" style="margin-top:16px">' + esc(sessionTitle) + '</div>' +
      '<div class="focus-timer h-grad" style="opacity:.4">' + fmtMs(remainMs) + '</div>' +
      '<div class="focus-ring acc-cyan"><div class="bar lg"><div class="bar-fill" style="width:' + elapsedPct() + '%"></div></div></div>' +
      '<div class="dim small" style="margin-top:10px">Paused — the clock is stopped</div>' +
      actionRow(
        '<button class="btn btn-primary btn-lg" id="fx-resume">' + icon('play', 'sm') + '<span>Resume</span></button>' +
        '<button class="btn" id="fx-finish">' + icon('check', 'sm') + '<span>Finish</span></button>' +
        '<button class="btn btn-ghost" id="fx-exit">Exit</button>'
      ) +
      '</div>';

    el.querySelector('#fx-resume').addEventListener('click', function () {
      endTs = Date.now() + Math.max(0, remainMs);
      phase = 'running';
      render(el, ctx);
    });
    el.querySelector('#fx-finish').addEventListener('click', function () { finishSession(); });
    bindExitConfirm(el, ctx);
  }

  function renderDone(el, ctx) {
    var esc = A.ui.esc, icon = A.ui.icon;
    var ls = lastSession || { title: sessionTitle || 'Focus session', minutes: 1, completedNow: false, taskXp: 10 };
    var xpNote = '+20 XP focus bonus' + (ls.completedNow ? ' · +' + ls.taskXp + ' XP task complete' : '');

    el.innerHTML = stageOpen() +
      '<h1 class="h-grad" style="margin:16px 0 4px">✓ Session complete</h1>' +
      '<div class="focus-task">' + esc(ls.title) + '</div>' +
      '<p class="muted" style="margin:10px 0 0">' + ls.minutes + ' focused minute' + (ls.minutes === 1 ? '' : 's') + ' · ' + esc(xpNote) + '</p>' +
      '<p class="bold" style="margin:22px 0 0">What should we do next?</p>' +
      actionRow(
        '<button class="btn btn-primary btn-lg" id="fx-next">' + icon('play', 'sm') + '<span>Next task</span></button>' +
        '<button class="btn" id="fx-break">🌿 Take a break</button>' +
        '<button class="btn btn-ghost" id="fx-today">View today</button>'
      ) +
      '</div>';

    el.querySelector('#fx-next').addEventListener('click', function () {
      var pri = A.engine.priorities(1) || [];
      if (!pri.length) {
        A.ui.toast('No open priorities left — you’re clear for today', '🎉');
        resetMachine();
        ctx.nav('app/dashboard');
        return;
      }
      setCurrentTaskId(pri[0].id);
      beginSession(pri[0]);
      render(el, ctx);   // → ready
    });
    el.querySelector('#fx-break').addEventListener('click', function () {
      resetMachine();
      A.ui.toast('Breaks are training too', '🌿');
      ctx.nav('app/dashboard');
    });
    el.querySelector('#fx-today').addEventListener('click', function () {
      resetMachine();
      ctx.nav('app/dashboard');
    });
  }

  /* ---------------- root render ---------------- */

  function render(el, ctx) {
    // Never leak a ticking interval across re-renders or into other screens.
    clearTick();

    var s = A.S.get();
    var f = (s && s.focus) || {};
    var cur = findTask(s, f.currentTaskId);
    if (cur && cur.done) cur = null;

    // A new target picked elsewhere (▶ button, quick action, AI) while an old
    // session lingers → the old session is stale; start over on the new task.
    if (phase !== 'idle' && cur && cur.id !== sessionTaskId) resetMachine();

    if (phase === 'running') {
      if (currentRemaining() <= 0) { finishSession(); return; }   // expired while away
      renderRunning(el, ctx);
    } else if (phase === 'paused') {
      renderPaused(el, ctx);
    } else if (phase === 'done') {
      renderDone(el, ctx);
    } else if (cur) {
      beginSession(cur);          // idempotent in READY — the clock hasn't started
      renderReady(el, ctx);
    } else {
      resetMachine();
      renderPick(el, ctx, s);
    }
  }

  A.registerScreen('app/focus', {
    title: 'Focus',
    icon: 'clock',
    accent: 'cyan',
    inShell: true,
    hideNav: true,
    order: 99,
    render: render
  });
})();
