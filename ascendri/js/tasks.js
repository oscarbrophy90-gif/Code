/* ============================================================
   Acendri OS — Tasks: the small-actions engine.
   Summary chips, filters, a sorted task list with priority
   accents, a new/edit modal and a bridge to the timetable.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  /* module-level filter state (survives re-renders) */
  var FILTER = 'all';       // 'all' | 'today' | 'upcoming' | 'done'
  var PRIO = 0;             // 0 = any, 1 low, 2 medium, 3 high

  var PRIO_NAME = { 1: 'Low', 2: 'Medium', 3: 'High' };
  var PRIO_ACC = { 1: 'cyan', 2: 'orange', 3: 'red' };
  var DURATIONS = [20, 30, 45, 60, 90, 120];

  /* ---------------- helpers ---------------- */

  function sortTasks(list) {
    var t = A.ui.todayISO();
    return list.slice().sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      if (a.done && b.done) return (b.doneAt || 0) - (a.doneAt || 0);
      var ao = a.due && a.due < t, bo = b.due && b.due < t;
      if (!!ao !== !!bo) return ao ? -1 : 1;                    // overdue first
      var da = a.due || '9999-12-31', db = b.due || '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;                   // due asc, nulls last
      if ((a.priority || 1) !== (b.priority || 1)) return (b.priority || 1) - (a.priority || 1);
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function matchesFilter(task) {
    var t = A.ui.todayISO();
    if (FILTER === 'today' && (task.done || !task.due || task.due > t)) return false;
    if (FILTER === 'upcoming' && (task.done || (task.due && task.due <= t))) return false;
    if (FILTER === 'done' && !task.done) return false;
    if (PRIO && (task.priority || 1) !== PRIO) return false;
    return true;
  }

  /* ---------------- new / edit modal ---------------- */

  function openTaskModal(taskId) {
    var esc = A.ui.esc;
    var s = A.S.get();
    var task = null;
    (s.tasks || []).forEach(function (t) { if (t.id === taskId) task = t; });
    var isNew = !task;

    var vTitle = isNew ? '' : task.title;
    var vDue = isNew ? A.ui.todayISO() : (task.due || '');
    var vDur = isNew ? 45 : (task.duration || 45);
    var vPrio = isNew ? 2 : (task.priority || 2);
    var vGoal = isNew ? '' : (task.goalId || '');

    var goals = (s.goals || []).filter(function (g) { return g.status === 'active'; });
    if (vGoal && !goals.some(function (g) { return g.id === vGoal; })) {
      (s.goals || []).forEach(function (g) { if (g.id === vGoal) goals.push(g); });
    }

    A.ui.modal({
      title: (isNew ? '📥 New task' : '✏️ Edit task'),
      accent: 'green',
      body:
        '<div class="field"><label>What needs doing?</label>' +
          '<input id="tk-title" class="input" maxlength="90" placeholder="e.g. Maths practice paper #4" value="' + esc(vTitle) + '"></div>' +
        '<div class="grid2">' +
          '<div class="field"><label>Due date</label>' +
            '<input id="tk-due" class="input" type="date" value="' + esc(vDue) + '"></div>' +
          '<div class="field"><label>Duration</label>' +
            '<select id="tk-dur" class="select">' +
              (DURATIONS.indexOf(vDur) === -1
                ? DURATIONS.concat([vDur]).sort(function (a, b) { return a - b; })
                : DURATIONS
              ).map(function (d) {
                return '<option value="' + d + '"' + (d === vDur ? ' selected' : '') + '>' + d + ' min</option>';
              }).join('') +
            '</select></div>' +
        '</div>' +
        '<div class="grid2">' +
          '<div class="field"><label>Priority</label>' +
            '<select id="tk-prio" class="select">' +
              [1, 2, 3].map(function (p) {
                return '<option value="' + p + '"' + (p === vPrio ? ' selected' : '') + '>' + PRIO_NAME[p] + '</option>';
              }).join('') +
            '</select></div>' +
          '<div class="field"><label>Linked goal</label>' +
            '<select id="tk-goal" class="select">' +
              '<option value="">No goal</option>' +
              goals.map(function (g) {
                return '<option value="' + esc(g.id) + '"' + (g.id === vGoal ? ' selected' : '') + '>' +
                  esc(g.title) + (g.status === 'done' ? ' (done)' : '') + '</option>';
              }).join('') +
            '</select></div>' +
        '</div>',
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        {
          label: isNew ? 'Add task' : 'Save changes',
          cls: 'btn-primary',
          onClick: function (m) {
            var title = m.querySelector('#tk-title').value.trim();
            if (!title) { A.ui.toast('Give your task a title first', '✍️'); return false; }
            var due = m.querySelector('#tk-due').value || null;
            var dur = +m.querySelector('#tk-dur').value || 45;
            var prio = +m.querySelector('#tk-prio').value || 2;
            var goalId = m.querySelector('#tk-goal').value || null;
            A.S.update(function (st) {
              if (isNew) {
                st.tasks.push({
                  id: A.ui.uid(), title: title, priority: prio, due: due,
                  duration: dur, done: false, goalId: goalId || undefined, createdAt: Date.now()
                });
              } else {
                for (var i = 0; i < st.tasks.length; i++) {
                  if (st.tasks[i].id === taskId) {
                    st.tasks[i].title = title;
                    st.tasks[i].due = due;
                    st.tasks[i].duration = dur;
                    st.tasks[i].priority = prio;
                    if (goalId) st.tasks[i].goalId = goalId; else delete st.tasks[i].goalId;
                    break;
                  }
                }
              }
            });
            if (isNew) A.ui.toast('Task added — it’ll be planned into your week', '🗓️');
            else A.ui.toast('Task updated', '✏️');
          }
        }
      ]
    });
  }

  /* ---------------- Ask Acendri (brain) flow ---------------- */

  function brainOrToast() {
    var B = window.Ascendri.brain;
    if (!B || typeof B.tasksFromText !== 'function') {
      A.ui.toast('Acendri’s brain isn’t loaded yet — use + New task for now', '🤖');
      return null;
    }
    return B;
  }

  /* normalise whatever the brain returns into a safe task draft */
  function cleanDraft(d) {
    d = d || {};
    var p = +d.priority;
    if (p !== 1 && p !== 2 && p !== 3) p = 2;
    return {
      title: String(d.title || 'Untitled task').slice(0, 90),
      priority: p,
      due: (typeof d.due === 'string' && d.due) ? d.due : null,
      duration: +d.duration || 45
    };
  }

  function openAskModal(prefill) {
    var esc = A.ui.esc;
    A.ui.modal({
      title: '🤖 What do you need to get done?',
      accent: 'cyan',
      wide: true,
      body:
        '<div class="field"><label>Tell Acendri in your own words</label>' +
          '<textarea id="ask-text" class="textarea" rows="4" maxlength="400" ' +
            'placeholder="I have a maths exam Friday and basketball training twice this week, plus I need to fix my bike">' +
            esc(prefill || '') + '</textarea></div>' +
        '<div class="small muted">💡 Acendri will split this into bite-size tasks spread over the week — ' +
          'and the timetable engine plans them around your weekly commitments.</div>',
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        {
          label: '✨ Generate tasks',
          cls: 'btn-acc',
          onClick: function (m) {
            var text = m.querySelector('#ask-text').value.trim();
            if (!text) { A.ui.toast('Tell Acendri what’s on your plate first', '✍️'); return false; }
            var B = brainOrToast();
            if (!B) return false;
            var drafts;
            try { drafts = (B.tasksFromText(text) || []).map(cleanDraft); }
            catch (e) { drafts = []; }
            if (!drafts.length) {
              A.ui.toast('Couldn’t draft tasks from that — try adding a bit more detail', '🤖');
              return false;
            }
            openPreviewModal(text, drafts);
          }
        }
      ]
    });
  }

  function openPreviewModal(text, drafts) {
    var esc = A.ui.esc;
    var rowsHTML = drafts.map(function (d, i) {
      var meta = 'P' + d.priority + ' · ' + d.duration + ' min · ' +
        (d.due ? esc(A.ui.fmtDate(d.due)) : 'No due date');
      return '<div class="list-item">' +
        '<label class="checkbox" title="Include this task">' +
          '<input type="checkbox" data-keep="' + i + '" checked aria-label="Include this task"></label>' +
        '<div class="li-main">' +
          '<input class="input" data-dtitle="' + i + '" maxlength="90" value="' + esc(d.title) + '" aria-label="Task title">' +
          '<div class="li-sub" style="margin-top:4px">' + meta + '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    A.ui.modal({
      title: '🤖 Here’s your plan',
      accent: 'cyan',
      wide: true,
      body:
        '<div class="small muted" style="margin-bottom:10px">Untick anything you don’t need and tweak the titles — then add them to your list.</div>' +
        '<div class="list">' + rowsHTML + '</div>',
      actions: [
        {
          label: '🔁 Rewrite',
          cls: 'btn-ghost',
          onClick: function () { openAskModal(text); }
        },
        {
          label: '📋 Add ' + drafts.length + ' task' + (drafts.length === 1 ? '' : 's'),
          cls: 'btn-acc',
          onClick: function (m) {
            var picked = [], missingTitle = false;
            drafts.forEach(function (d, i) {
              var cb = m.querySelector('input[data-keep="' + i + '"]');
              if (!cb || !cb.checked) return;
              var inp = m.querySelector('input[data-dtitle="' + i + '"]');
              var title = (inp ? inp.value : d.title).trim();
              if (!title) { missingTitle = true; return; }
              picked.push({ title: title, priority: d.priority, due: d.due, duration: d.duration });
            });
            if (missingTitle) { A.ui.toast('Give every ticked task a title — or untick it', '✍️'); return false; }
            if (!picked.length) { A.ui.toast('Tick at least one task to add', '☑️'); return false; }
            var now = Date.now();
            A.S.update(function (st) {
              st.tasks = st.tasks || [];
              picked.forEach(function (p) {
                st.tasks.push({
                  id: A.ui.uid(), title: p.title, priority: p.priority, due: p.due,
                  duration: p.duration, done: false, createdAt: now
                });
              });
            });
            A.S.log('Acendri drafted ' + picked.length + ' task' + (picked.length === 1 ? '' : 's') + ' from your brief', '🤖');
            A.ui.toast(picked.length + ' task' + (picked.length === 1 ? '' : 's') +
              ' added — generate your week to slot them in', '🤖');
          }
        }
      ],
      onOpen: function (m) {
        var acts = m.querySelectorAll('.modal-actions [data-act]');
        var addBtn = acts[acts.length - 1];
        function syncLabel() {
          var n = m.querySelectorAll('input[data-keep]:checked').length;
          if (addBtn) addBtn.textContent = '📋 Add ' + n + ' task' + (n === 1 ? '' : 's');
        }
        m.querySelectorAll('input[data-keep]').forEach(function (cb) {
          cb.addEventListener('change', syncLabel);
        });
        syncLabel();
      }
    });
  }

  /* ---------------- HTML builders ---------------- */

  function headHTML() {
    return '<div class="screen-head"><div class="spread wrap">' +
      '<div><h1>Tasks</h1>' +
      '<div class="sub">Small actions, ticked off. This is where goals become real.</div></div>' +
      '<div class="row wrap">' +
        '<button class="btn btn-acc acc-cyan" data-ask="1">🤖 Ask Acendri</button>' +
        '<button class="btn btn-primary" data-new="1">+ New task</button>' +
      '</div>' +
      '</div></div>';
  }

  function chipsHTML(s) {
    var t = A.ui.todayISO();
    var tasks = s.tasks || [];
    var open = 0, dueToday = 0, overdue = 0, done = 0;
    tasks.forEach(function (task) {
      if (task.done) { done++; return; }
      open++;
      if (task.due === t) dueToday++;
      if (task.due && task.due < t) overdue++;
    });
    return '<div class="row wrap">' +
      '<span class="tag acc-green"><span class="badge-dot"></span> Open ' + open + '</span>' +
      '<span class="tag acc-orange"><span class="badge-dot"></span> Due today ' + dueToday + '</span>' +
      '<span class="tag acc-red"><span class="badge-dot"></span> ' +
        (overdue > 0 ? '<span class="neg">Overdue ' + overdue + '</span>' : 'Overdue 0') + '</span>' +
      '<span class="tag acc-cyan"><span class="badge-dot"></span> Done ' + done + '</span>' +
      '</div>';
  }

  function filterBarHTML() {
    var btns = [['all', 'All'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['done', 'Done']];
    return '<div class="row wrap section-gap">' +
      btns.map(function (b) {
        var active = FILTER === b[0];
        return '<button class="btn btn-sm' + (active ? ' btn-acc acc-green' : ' btn-ghost') + '" data-filter="' + b[0] + '">' + b[1] + '</button>';
      }).join('') +
      '<div style="flex:1"></div>' +
      '<select id="prio-filter" class="select" style="width:auto;min-width:150px" aria-label="Filter by priority">' +
        '<option value="0"' + (PRIO === 0 ? ' selected' : '') + '>Any priority</option>' +
        [3, 2, 1].map(function (p) {
          return '<option value="' + p + '"' + (PRIO === p ? ' selected' : '') + '>' + PRIO_NAME[p] + '</option>';
        }).join('') +
      '</select>' +
      '</div>';
  }

  function emptyHTML(s, filteredOut) {
    if (filteredOut) {
      return '<div class="empty section-gap"><div class="e-emoji">🔍</div>' +
        '<p>No tasks match this priority filter.</p>' +
        '<button class="btn btn-acc acc-green" data-clearprio="1">Clear priority filter</button></div>';
    }
    if (FILTER === 'done') {
      return '<div class="empty section-gap"><div class="e-emoji">🌱</div>' +
        '<p>Nothing done yet — tick your first task!</p>' +
        '<button class="btn btn-acc acc-green" data-filter="all">Show open tasks</button></div>';
    }
    if (FILTER === 'today') {
      return '<div class="empty section-gap"><div class="e-emoji">🌞</div>' +
        '<p>Nothing due today — you’re on top of things.</p>' +
        '<button class="btn btn-acc acc-green" data-filter="upcoming">See what’s upcoming</button></div>';
    }
    if (FILTER === 'upcoming') {
      return '<div class="empty section-gap"><div class="e-emoji">🗓️</div>' +
        '<p>Nothing on the horizon — add a task for later this week.</p>' +
        '<button class="btn btn-acc acc-green" data-new="1">+ New task</button></div>';
    }
    return '<div class="empty section-gap"><div class="e-emoji">📝</div>' +
      '<p>No tasks yet — describe your week to Acendri, or add your first small action yourself.</p>' +
      '<div class="row wrap" style="justify-content:center">' +
        '<button class="btn btn-acc acc-cyan" data-ask="1">🤖 Ask Acendri</button>' +
        '<button class="btn btn-acc acc-green" data-new="1">+ New task</button>' +
      '</div></div>';
  }

  function taskItemHTML(task, goalById) {
    var esc = A.ui.esc;
    var t = A.ui.todayISO();
    var prio = task.priority || 1;
    var acc = PRIO_ACC[prio] || 'cyan';
    var overdue = !task.done && task.due && task.due < t;

    var sub = [];
    if (task.done) {
      sub.push('✔ Done ' + esc(A.ui.timeAgo(task.doneAt || task.createdAt || Date.now())));
    } else if (task.due) {
      sub.push(overdue
        ? '<span class="neg">Overdue · ' + esc(A.ui.fmtDate(task.due)) + '</span>'
        : esc(A.ui.fmtDate(task.due)));
    } else {
      sub.push('No due date');
    }
    sub.push(esc(String(task.duration || 45)) + ' min');
    var goal = task.goalId && goalById[task.goalId];
    var goalTag = goal ? ' <span class="tag">🎯 ' + esc(goal.title) + '</span>' : '';

    return '<div class="list-item' + (task.done ? ' done' : '') + '">' +
      '<button class="check acc-' + acc + (task.done ? ' on' : '') + '" data-check="' + esc(task.id) + '"' +
        ' title="' + (task.done ? 'Mark as not done' : 'Mark done') + '" aria-label="Toggle task done">' +
        A.ui.icon('check', 'sm') + '</button>' +
      '<div class="li-main">' +
        '<div class="li-title">' + esc(task.title) + '</div>' +
        '<div class="li-sub">' + sub.join(' · ') + goalTag + '</div>' +
      '</div>' +
      '<span class="pill acc-' + acc + '">' + PRIO_NAME[prio] + '</span>' +
      '<button class="icon-btn" data-edit="' + esc(task.id) + '" title="Edit task" aria-label="Edit task">' + A.ui.icon('edit', 'sm') + '</button>' +
      '<button class="icon-btn danger" data-del="' + esc(task.id) + '" title="Delete task" aria-label="Delete task">' + A.ui.icon('trash', 'sm') + '</button>' +
      '</div>';
  }

  function footerHTML(s) {
    var doneCount = (s.tasks || []).filter(function (t) { return t.done; }).length;
    var html = '';
    if (doneCount > 0) {
      html += '<div class="row section-gap">' +
        '<button class="btn btn-ghost btn-sm" data-cleardone="1">🧹 Clear completed (' + doneCount + ')</button>' +
        '</div>';
    }
    html += '<div class="card acc acc-purple section-gap"><div class="spread wrap">' +
      '<div class="row"><span style="font-size:1.35rem">⚡</span>' +
        '<div><div class="bold">Let Acendri place these into your week automatically</div>' +
        '<div class="small muted">The timetable engine fits open tasks around your fixed commitments.</div></div></div>' +
      '<button class="btn btn-acc" data-nav="app/schedule">Open timetable</button>' +
      '</div></div>';
    return html;
  }

  /* ---------------- screen ---------------- */

  function renderTasks(el, ctx) {
    var s = A.S.get();
    var tasks = s.tasks || [];
    var goalById = {};
    (s.goals || []).forEach(function (g) { goalById[g.id] = g; });

    var visible = sortTasks(tasks).filter(matchesFilter);

    var listHTML;
    if (!visible.length) {
      // distinguish "nothing here" from "priority filter hides everything"
      var savedPrio = PRIO;
      PRIO = 0;
      var wouldShow = tasks.filter(matchesFilter).length;
      PRIO = savedPrio;
      listHTML = emptyHTML(s, PRIO !== 0 && wouldShow > 0);
    } else {
      listHTML = '<div class="list" style="margin-top:16px">' +
        visible.map(function (task) { return taskItemHTML(task, goalById); }).join('') +
        '</div>';
    }

    el.innerHTML = headHTML() + chipsHTML(s) + filterBarHTML() + listHTML + footerHTML(s);

    /* ---- listeners ---- */

    el.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () { ctx.nav(b.getAttribute('data-nav')); });
    });

    el.querySelectorAll('[data-new]').forEach(function (b) {
      b.addEventListener('click', function () { openTaskModal(null); });
    });

    el.querySelectorAll('[data-ask]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!brainOrToast()) return; // no brain module -> graceful toast, no dead modal
        openAskModal('');
      });
    });

    el.querySelectorAll('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () {
        FILTER = b.getAttribute('data-filter');
        renderTasks(el, ctx);
      });
    });

    var prioSel = el.querySelector('#prio-filter');
    if (prioSel) {
      prioSel.addEventListener('change', function () {
        PRIO = +prioSel.value || 0;
        renderTasks(el, ctx);
      });
    }

    el.querySelectorAll('[data-clearprio]').forEach(function (b) {
      b.addEventListener('click', function () { PRIO = 0; renderTasks(el, ctx); });
    });

    el.querySelectorAll('[data-check]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-check');
        var completed = false, unticked = false, prio = 1, title = '';
        A.S.update(function (st) {
          for (var i = 0; i < st.tasks.length; i++) {
            var task = st.tasks[i];
            if (task.id !== id) continue;
            title = task.title;
            prio = task.priority || 1;
            if (task.done) {
              task.done = false;
              delete task.doneAt;
              unticked = true;
            } else {
              task.done = true;
              task.doneAt = Date.now();
              completed = true;
            }
            break;
          }
        });
        if (completed) A.S.addXp(prio === 3 ? 15 : 10, 'Task completed: ' + title);
        else if (unticked) A.ui.toast('Moved "' + title + '" back to open', '↩️');
      });
    });

    el.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openTaskModal(b.getAttribute('data-edit')); });
    });

    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-del');
        var task = null;
        (A.S.get().tasks || []).forEach(function (t) { if (t.id === id) task = t; });
        if (!task) return;
        A.ui.confirm('Delete "' + task.title + '"? This can’t be undone.', function () {
          A.S.update(function (st) {
            st.tasks = st.tasks.filter(function (t) { return t.id !== id; });
          });
          A.ui.toast('Task deleted', '🗑️');
        }, { title: 'Delete task', yesLabel: 'Delete' });
      });
    });

    el.querySelectorAll('[data-cleardone]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = (A.S.get().tasks || []).filter(function (t) { return t.done; }).length;
        if (!n) return;
        A.ui.confirm('Remove ' + n + ' completed task' + (n === 1 ? '' : 's') + ' from the list? Your XP stays yours.', function () {
          A.S.update(function (st) {
            st.tasks = st.tasks.filter(function (t) { return !t.done; });
          });
          A.ui.toast('Cleared ' + n + ' completed task' + (n === 1 ? '' : 's'), '🧹');
        }, { title: 'Clear completed', yesLabel: 'Clear them' });
      });
    });
  }

  A.registerScreen('app/tasks', {
    title: 'Tasks',
    icon: 'checksq',
    accent: 'green',
    inShell: true,
    order: 3,
    render: renderTasks
  });
})();
