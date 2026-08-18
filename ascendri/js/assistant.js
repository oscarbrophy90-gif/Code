/* ============================================================
   Acendri OS — AI Assistant: chat UI wired to the brain
   (js/brain.js). The brain classifies intent, answers from
   REAL state and may perform its own effects (create goals,
   reminders, timetables). No network — everything is local.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var CHIPS = [
    'What should I focus on today?',
    'Generate my timetable for basketball training',
    'Set me a goal for tennis',
    'Remind me to stretch tomorrow',
    'How is my spending?',
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

  function computeReply(text) {
    var B = A.brain;
    if (!B || typeof B.respond !== 'function') {
      A.ui.toast('Assistant brain not loaded', '🧠');
      return { text: 'My brain isn’t loaded (js/brain.js is missing) 🧠 Reload the app and I’ll be back to full power.' };
    }
    var out;
    try {
      out = B.respond(text);
    } catch (err) {
      out = null;
    }
    if (!out || typeof out.text !== 'string') {
      out = { text: 'Oof, I tripped over my own wires there 🤕 Ask me that again?' };
    }
    return out;
  }

  function sendMessage(text) {
    text = String(text == null ? '' : text).trim();
    if (!text || typingActive) return;
    if (text.length > 400) text = text.slice(0, 400);
    typingActive = true;
    draft = '';
    inputFocused = true;
    var gen = sendGen;

    // (a) store the user message (non-silent -> re-render shows it,
    //     and the "ai-curious" achievement check fires automatically)
    A.S.update(function (s) {
      ensureAssistant(s);
      s.assistant.history.push({ role: 'user', text: text, ts: Date.now() });
      capHistory(s);
    });

    // (b) instant typing indicator (re-render also re-adds it while typingActive)
    appendTypingNow();

    // (c) think, then answer. brain.respond may run its own A.S.update effects
    //     (create a goal/reminder, generate the timetable…) which re-render
    //     mid-flow — that's fine, because (d) pushes the ai message with a
    //     final non-silent update that re-renders everything cleanly.
    setTimeout(function () {
      if (gen !== sendGen) return; // conversation was cleared meanwhile
      var out = computeReply(text);
      typingActive = false;
      A.S.update(function (s) {
        ensureAssistant(s);
        var m = { role: 'ai', text: out.text, ts: Date.now() };
        if (out.actions && out.actions.length) m.actions = out.actions;
        s.assistant.history.push(m);
        capHistory(s);
      });
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
        esc('Hey ' + introName + ' 👋 I’m your Acendri assistant — and I don’t just talk. From this chat I can create goals with milestones, plan your whole week into a timetable and set reminders, plus keep an eye on your focus, money and streaks. Try a suggestion below.') +
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
