/* ============================================================
   Acendri OS — AI Assistant: a local, rule-based chat that
   reasons over the user's REAL goals, tasks, timetable, money
   and habits. No network — all answers come from state.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var CHIPS = [
    'What should I focus on today?',
    'Am I on track with my goals?',
    'How’s my spending?',
    'Plan my week',
    'Motivate me'
  ];

  var typingActive = false;   // true while the "…" indicator is up (blocks double-sends)
  var sendGen = 0;            // bumped on clear so a pending reply can bail out
  var draft = '';             // preserves half-typed input across re-renders
  var inputFocused = false;   // restore focus after re-render
  var logEl = null;           // current .chat-log element

  /* ---------------- state helpers ---------------- */

  function ensureAssistant(s) {
    if (!s.assistant) s.assistant = { history: [] };
    if (!s.assistant.history) s.assistant.history = [];
  }

  function historyOf(s) {
    return (s.assistant && s.assistant.history) ? s.assistant.history : [];
  }

  function capHistory(s) {
    while (s.assistant.history.length > 50) s.assistant.history.shift();
  }

  function userName(s) {
    return (s.profile && s.profile.name) ? s.profile.name : '';
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  /* ---------------- reply engine ---------------- */

  function focusReply() {
    var sugg = A.engine.focusSuggestions(4);
    var lines = ['Here’s what matters most right now:'];
    sugg.forEach(function (sg, i) {
      lines.push((i + 1) + '. ' + sg.emoji + ' ' + sg.text);
    });
    return {
      text: lines.join('\n'),
      actions: [
        { label: 'Open tasks', screen: 'app/tasks' },
        { label: 'See timetable', screen: 'app/schedule' }
      ]
    };
  }

  function goalsReply(s) {
    var goals = s.goals || [];
    if (!goals.length) {
      return {
        text: 'You haven’t set any goals yet 🎯 That’s where I really shine — give me one big ambition and Acendri will break it into milestones and keep score for you.',
        actions: [{ label: 'Create a goal', screen: 'app/goals' }]
      };
    }
    var active = goals.filter(function (g) { return g.status !== 'done'; });
    var doneCount = goals.length - active.length;
    if (!active.length) {
      return {
        text: 'All ' + plural(doneCount, 'goal') + ' completed 🏆 Nothing active right now — sounds like it’s time to aim at something new.',
        actions: [{ label: 'Open goals', screen: 'app/goals' }]
      };
    }
    var lines = [];
    var sum = 0;
    active.forEach(function (g) {
      var pct = A.engine.goalProgress(g);
      sum += pct;
      var ms = g.milestones || [];
      var doneMs = ms.filter(function (m) { return m.done; }).length;
      var next = null;
      ms.forEach(function (m) { if (!next && !m.done) next = m; });
      var line = '🎯 ' + g.title + ' — ' + pct + '% (' + doneMs + '/' + ms.length + ' steps)';
      if (next) line += '. Next: ' + next.title;
      else if (ms.length) line += '. Every step is ticked — go mark it complete!';
      else line += '. No milestones yet — add a few so I can track it.';
      lines.push(line);
    });
    var avg = Math.round(sum / active.length);
    var verdict = avg > 50
      ? 'Overall you’re averaging ' + avg + '% across ' + plural(active.length, 'active goal') + ' — genuinely on track. Keep this pace and they’re yours. 💪'
      : 'Overall average is ' + avg + '% across ' + plural(active.length, 'active goal') + ' — early days. Pick ONE next milestone and knock it over this week.';
    if (doneCount) verdict += ' (' + plural(doneCount, 'goal') + ' already completed 🏆)';
    lines.push(verdict);
    return { text: lines.join('\n'), actions: [{ label: 'Open goals', screen: 'app/goals' }] };
  }

  function moneyReply(s) {
    var fin = A.engine.financeSummary();
    var txAll = (s.finance && s.finance.transactions) || [];
    var sgs = (s.finance && s.finance.savingsGoals) || [];
    if (!txAll.length && !sgs.length) {
      return {
        text: 'I can’t see any money activity yet 💸 Log your income and expenses and I’ll watch your budgets, spot leaks and cheer your savings on.',
        actions: [{ label: 'Open finance', screen: 'app/finance' }]
      };
    }
    var p = fin.month.split('-');
    var mLabel = A.ui.MONTHS[(+p[1]) - 1] + ' ' + p[0];
    var lines = [];
    lines.push('💼 ' + mLabel + ' so far: income ' + A.ui.fmtMoney(fin.income) +
      ', expenses ' + A.ui.fmtMoney(fin.expenses) +
      ' → net ' + A.ui.fmtMoney(fin.net) + (fin.net >= 0 ? ' ✅' : ' 🔻'));
    var topCat = null, topAmt = 0;
    Object.keys(fin.byCat).forEach(function (c) {
      if (fin.byCat[c] > topAmt) { topAmt = fin.byCat[c]; topCat = c; }
    });
    if (topCat) lines.push('📊 Biggest expense category: ' + topCat + ' at ' + A.ui.fmtMoney(topAmt) + '.');
    if (fin.overBudget.length) {
      fin.overBudget.forEach(function (o) {
        lines.push('⚠️ Over budget on ' + o.cat + ' — ' + A.ui.fmtMoney(o.spent) + ' spent of a ' + A.ui.fmtMoney(o.limit) + ' limit.');
      });
    } else if (Object.keys((s.finance && s.finance.budgets) || {}).length) {
      lines.push('✅ Every budget is under its limit this month — quiet flex.');
    }
    if (sgs.length) {
      var target = 0;
      sgs.forEach(function (g) { target += (g.target || 0); });
      var pct = target > 0 ? Math.round(100 * fin.savings / target) : 0;
      lines.push('💰 Savings: ' + A.ui.fmtMoney(fin.savings) + ' of ' + A.ui.fmtMoney(target) +
        ' across ' + plural(sgs.length, 'savings goal') + ' (' + pct + '%).');
    }
    return { text: lines.join('\n'), actions: [{ label: 'Open finance', screen: 'app/finance' }] };
  }

  function planReply() {
    A.S.update(function (s) { A.engine.generateTimetable(s); });
    var s2 = A.S.get();
    var tt = s2.timetable;
    var taskBlocks = 0, commitBlocks = 0;
    if (tt && tt.days) {
      Object.keys(tt.days).forEach(function (d) {
        tt.days[d].forEach(function (b) {
          if (b.type === 'task') taskBlocks++; else commitBlocks++;
        });
      });
    }
    var lines = ['🗓️ Done — I’ve replanned your next 7 days!'];
    lines.push('• ' + plural(taskBlocks, 'task block') + ' scheduled around ' + plural(commitBlocks, 'commitment block') + '.');
    if (tt && tt.unplaced && tt.unplaced.length) {
      lines.push('⚠️ Couldn’t fit: ' + tt.unplaced.join(', ') + ' — try shortening or splitting these.');
    } else {
      lines.push('Every open task found a slot ✅');
    }
    return {
      text: lines.join('\n'),
      actions: [{ label: 'Open timetable', screen: 'app/schedule' }],
      xp: { n: 5, reason: 'Planned the week' }
    };
  }

  function habitsReply(s) {
    var habits = s.habits || [];
    if (!habits.length) {
      return {
        text: 'No habits yet 🌱 Tiny daily actions are how big goals actually happen — create one and I’ll guard the streak with you.',
        actions: [{ label: 'Open habits', screen: 'app/habits' }]
      };
    }
    var t = A.ui.todayISO();
    var lines = [];
    var best = null, bestStreak = -1;
    var unticked = [];
    habits.forEach(function (h) {
      var st = A.engine.habitStreak(h);
      var ticked = !!(h.log && h.log[t]);
      if (st > bestStreak) { bestStreak = st; best = h; }
      if (!ticked) unticked.push(h.title);
      lines.push((h.emoji || '🌱') + ' ' + h.title + ' — ' + st + '-day streak, ' + (ticked ? 'ticked today ✅' : 'not ticked yet today ⬜'));
    });
    if (best && bestStreak > 0) lines.push('🏆 Best streak: "' + best.title + '" at ' + plural(bestStreak, 'day') + ' — protect it.');
    if (unticked.length) lines.push('Still to tick today: ' + unticked.join(', ') + '. Each one is a 30-second win.');
    else lines.push('Everything ticked today — a perfect day 🌟');
    return { text: lines.join('\n'), actions: [{ label: 'Open habits', screen: 'app/habits' }] };
  }

  function motivateReply(s) {
    var name = userName(s) || 'friend';
    var doneTasks = (s.tasks || []).filter(function (t) { return t.done; }).length;
    var best = null, bestStreak = 0;
    (s.habits || []).forEach(function (h) {
      var st = A.engine.habitStreak(h);
      if (st > bestStreak) { bestStreak = st; best = h; }
    });
    var ach = s.achievements || {};
    var latestId = null, latestTs = 0;
    Object.keys(ach).forEach(function (id) {
      if (ach[id] > latestTs) { latestTs = ach[id]; latestId = id; }
    });
    var latest = null;
    if (latestId) {
      A.engine.ACHIEVEMENTS.forEach(function (a) { if (a.id === latestId) latest = a; });
    }
    var streakBit = (bestStreak > 0 && best)
      ? 'a ' + bestStreak + '-day streak on "' + best.title + '"'
      : 'a fresh start ahead of you';
    var achBit = latest ? latest.emoji + ' "' + latest.title + '"' : null;
    var idx = historyOf(s).length % 3;
    var text;
    if (idx === 0) {
      text = name + ', look at the receipts 🧾 ' + plural(doneTasks, 'task') + ' completed, ' + streakBit +
        (achBit ? ', and your latest badge is ' + achBit : '') +
        '. You don’t need motivation — you need to remember you’re already moving. Do one small thing in the next 10 minutes. 🚀';
    } else if (idx === 1) {
      text = 'Feeling stuck is data, not destiny, ' + name + ' 💡 You’ve already finished ' + plural(doneTasks, 'task') +
        ' and you’re carrying ' + streakBit + (achBit ? ' — plus you earned ' + achBit : '') +
        '. Shrink the next step until it feels stupid-easy, then do just that. Momentum handles the rest. 💪';
    } else {
      text = 'Zoom out with me, ' + name + ' 🔭 ' + plural(doneTasks, 'task') + ' done' +
        (bestStreak > 0 && best ? ', best streak ' + plural(bestStreak, 'day') + ' on "' + best.title + '"' : '') +
        (achBit ? ', latest achievement ' + achBit : '') +
        '. Future-you is built by the next 25 focused minutes. Pick one thing, start now — I’ll be right here. 🔥';
    }
    return {
      text: text,
      actions: [
        { label: 'See achievements', screen: 'app/achievements' },
        { label: 'Open tasks', screen: 'app/tasks' }
      ]
    };
  }

  function helloReply(s) {
    var name = userName(s) || 'there';
    return {
      text: 'Hey ' + name + ' 👋 Always good to see you. I know your goals, tasks, timetable, money and habits — so I can:\n' +
        '• Tell you what to focus on right now\n' +
        '• Check your goal progress\n' +
        '• Watch your spending and budgets\n' +
        '• Auto-plan your week\n' +
        '• Keep your streaks alive\n' +
        'Ask away, or tap a chip below.'
    };
  }

  function fallbackReply() {
    return {
      text: 'Hmm, that one’s outside my lane 😅 I’m best at these — try one:\n' +
        '• What should I focus on today?\n' +
        '• Am I on track with my goals?\n' +
        '• How’s my spending?\n' +
        '• Plan my week\n' +
        '• Motivate me'
    };
  }

  function computeReply(raw) {
    var s = A.S.get();
    var low = String(raw).toLowerCase();
    function has(words) {
      for (var i = 0; i < words.length; i++) {
        if (low.indexOf(words[i]) >= 0) return true;
      }
      return false;
    }
    if (has(['focus', 'today', 'do next', 'priorit'])) return focusReply();
    if (has(['goal', 'progress', 'on track'])) return goalsReply(s);
    if (has(['money', 'spend', 'budget', 'saving', 'finance'])) return moneyReply(s);
    if (has(['plan', 'week', 'timetable', 'schedule'])) return planReply();
    if (has(['habit', 'streak'])) return habitsReply(s);
    if (has(['motivat', 'tired', 'stuck', 'help me'])) return motivateReply(s);
    if (/\b(hello|hey|hi|yo|howdy)\b/.test(low)) return helloReply(s);
    return fallbackReply();
  }

  /* ---------------- send flow ---------------- */

  function typingHTML() {
    return '<div class="msg ai typing" data-typing="1"><i></i><i></i><i></i></div>';
  }

  function appendTypingNow() {
    if (!logEl || logEl.isConnected === false) return;
    if (logEl.querySelector('[data-typing]')) return;
    var holder = document.createElement('div');
    holder.innerHTML = typingHTML();
    logEl.appendChild(holder.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function sendMessage(text) {
    text = String(text == null ? '' : text).trim();
    if (!text || typingActive) return;
    if (text.length > 400) text = text.slice(0, 400);
    typingActive = true;
    draft = '';
    inputFocused = true;
    var gen = sendGen;

    // 1) store the user message (non-silent -> re-render shows it,
    //    and the "ai-curious" achievement check fires automatically)
    A.S.update(function (s) {
      ensureAssistant(s);
      s.assistant.history.push({ role: 'user', text: text, ts: Date.now() });
      capHistory(s);
    });

    // 2) instant typing indicator (re-render also re-adds it while typingActive)
    appendTypingNow();

    // 3) think, then answer
    setTimeout(function () {
      if (gen !== sendGen) return; // conversation was cleared meanwhile
      var reply;
      try {
        reply = computeReply(text);
      } catch (err) {
        reply = { text: 'Oof, I tripped over my own wires there 🤕 Ask me that again?' };
      }
      typingActive = false;
      A.S.update(function (s) {
        ensureAssistant(s);
        var m = { role: 'ai', text: reply.text, ts: Date.now() };
        if (reply.actions && reply.actions.length) m.actions = reply.actions;
        s.assistant.history.push(m);
        capHistory(s);
      });
      if (reply.xp) A.S.addXp(reply.xp.n, reply.xp.reason);
    }, 700);
  }

  /* ---------------- render ---------------- */

  function render(el, ctx) {
    var s = A.S.get();
    var esc = A.ui.esc;
    var history = historyOf(s);

    // remember focus before the DOM is torn down
    var ae = document.activeElement;
    if (ae && ae.hasAttribute && ae.hasAttribute('data-as-input')) inputFocused = true;

    var msgsHTML = '';
    if (!history.length) {
      var introName = userName(s) || 'there';
      msgsHTML += '<div class="msg ai">' +
        esc('Hey ' + introName + ' 👋 I’m your Acendri assistant. I can tell you what to focus on, check your goal progress, watch your money and plan your week. Try a suggestion below.') +
        '</div>';
    }
    history.forEach(function (m) {
      var when = m.ts ? esc(A.ui.timeAgo(m.ts)) : '';
      if (m.role === 'user') {
        msgsHTML += '<div class="msg me" title="' + when + '">' + esc(m.text) + '</div>';
      } else {
        var actionsHTML = '';
        if (m.actions && m.actions.length) {
          actionsHTML = '<div class="msg-actions">' + m.actions.map(function (a) {
            return '<button class="btn btn-sm btn-acc acc-cyan" data-goto="' + esc(a.screen) + '">' + esc(a.label) + '</button>';
          }).join('') + '</div>';
        }
        msgsHTML += '<div class="msg ai" title="' + when + '">' + esc(m.text) + actionsHTML + '</div>';
      }
    });
    if (typingActive) msgsHTML += typingHTML();

    var chipsHTML = '<div class="chips">' + CHIPS.map(function (c) {
      return '<button class="chip" data-chip="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('') + '</div>';

    el.innerHTML =
      '<div class="screen-head spread">' +
        '<div>' +
          '<h1 class="h-grad">Acendri AI</h1>' +
          '<div class="sub">It knows your goals, timetable, money and habits — ask away.</div>' +
        '</div>' +
        '<button class="icon-btn danger" data-clear aria-label="Clear conversation" title="Clear conversation">' + A.ui.icon('trash') + '</button>' +
      '</div>' +
      '<div class="chat-wrap acc-cyan">' +
        '<div class="chat-log">' + msgsHTML + '</div>' +
        chipsHTML +
        '<div class="row">' +
          '<input class="input" data-as-input maxlength="400" placeholder="Ask Acendri anything…" value="' + esc(draft) + '">' +
          '<button class="btn btn-primary" data-send aria-label="Send message" title="Send"' + (typingActive ? ' disabled' : '') + '>' + A.ui.icon('send') + '</button>' +
        '</div>' +
      '</div>';

    logEl = el.querySelector('.chat-log');
    logEl.scrollTop = logEl.scrollHeight;

    // clear conversation
    el.querySelector('[data-clear]').addEventListener('click', function () {
      if (!historyOf(A.S.get()).length) {
        A.ui.toast('Nothing to clear yet — say hi first!', '🤖');
        return;
      }
      A.ui.confirm(
        'Delete your entire conversation with Acendri? Your goals, tasks and data stay untouched — only the chat is cleared.',
        function () {
          sendGen++;
          typingActive = false;
          A.S.update(function (st) { ensureAssistant(st); st.assistant.history = []; });
          A.ui.toast('Conversation cleared', '🧹');
        },
        { title: 'Clear conversation', yesLabel: 'Clear it' }
      );
    });

    // suggestion chips
    el.querySelectorAll('[data-chip]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (typingActive) { A.ui.toast('One sec — I’m still typing…', '🤖'); return; }
        sendMessage(b.getAttribute('data-chip'));
      });
    });

    // input + send
    var input = el.querySelector('[data-as-input]');
    function trySend() {
      if (typingActive) { A.ui.toast('One sec — I’m still typing…', '🤖'); return; }
      sendMessage(input.value);
    }
    input.addEventListener('input', function () { draft = input.value; });
    input.addEventListener('focus', function () { inputFocused = true; });
    input.addEventListener('blur', function () { inputFocused = false; });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); trySend(); }
    });
    el.querySelector('[data-send]').addEventListener('click', trySend);
    if (inputFocused) { try { input.focus(); } catch (e2) { /* noop */ } }

    // action buttons inside ai messages
    el.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () {
        ctx.nav(b.getAttribute('data-goto'));
      });
    });
  }

  /* ---------------- register ---------------- */

  A.registerScreen('app/assistant', {
    title: 'AI Assistant',
    icon: 'chat',
    accent: 'cyan',
    inShell: true,
    order: 10,
    render: render
  });
})();
