/* VOID FISHING — the admin console.

   Not in the game. There is no button for it and nothing links to it: three
   hashes in a row knock on the door, and then the door asks for a four-digit
   code that rolls every thirty minutes (js/systems/authcode.js works out what
   it is; tools/build-authenticator.js builds the page that tells you).

   Everything it does past the door is
   something the game already knows how to do — granting a rod goes through
   the same rod:granted the shop uses, and setting money writes the same field
   an economy payout does — so nothing here is a second way of being wrong. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const LOG_MAX = 60;

  let log = [];          // { text, kind } — survives closing the panel
  let unlocked = false;  // has the code been given correctly this session
  let knocked = false;   // has the door been knocked on at all this session

  /* Who the code belongs to, shown on the gate. Left blank on purpose.

     It was a real address, and it is decoration — nothing is posted anywhere
     (see RELAY below), so the door works identically without it. What it did
     do was put a named person's school address into a public repository, in
     plaintext, for as long as the repository exists. Put yours back here if
     you want it; it will then be in every copy of the game you send anybody. */
  const EMAIL = '';

  /* A URL that accepts a POST and sends an email, if you ever stand one up.
     Left empty on purpose and shipping that way: putting a live third-party
     key in here would put it in every copy of the game you ever send anybody,
     for them to read and use to post mail to that address as often as they
     liked. Empty means nothing is sent and the panel says nothing was sent
     rather than pretending otherwise.

     Worth being straight about what it would buy if you did set it: the code
     is worked out by this file, so it is already here before any mail goes
     anywhere. Emailing it is a convenience — the code on your phone instead
     of in another tab — and not a second lock. */
  const RELAY = '';

  const MAX_TRIES = 5;   // per code, so guessing all ten thousand is not a plan
  let tries = 0, triesWindow = -1, sentWindow = -1, sentState = '';

  /* ------------------------------------------------------------- commands */

  /* `/set brophys(500)`, `/set brophys 500`, `/set brophys = 500` and
     `/set brophys 1.2m` are all the same instruction typed by the same
     person in a hurry. */
  function number(raw) {
    if (!raw) return null;
    const s = raw.replace(/[(),=\s]/g, '').toLowerCase();
    const m = /^(-?\d+(?:\.\d+)?)([kmbtq]|qa)?$/.exec(s);
    if (!m) return null;
    const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12, q: 1e15 }[m[2]] || 1;
    const n = parseFloat(m[1]) * mult;
    return isFinite(n) ? n : null;
  }

  function grant(rod) {
    const d = VF.state.data;
    if (d.ownedRods.indexOf(rod.id) < 0) d.ownedRods.push(rod.id);
    return rod;
  }

  const COMMANDS = [
    {
      match: /^\/give\s+admin\s*rod$/,
      run: function () {
        const name = VF.rods.admin();
        if (!name) return { kind: 'bad', text: 'the admin rod is not in this build.' };
        VF.fx.shake(5, 4);
        return { kind: 'good', text: 'granted ' + name + ', and equipped it.' };
      }
    },
    {
      match: /^\/give\s+heavens\s*rod$/,
      run: function () {
        const rod = VF.rods.get('heavens');
        if (!rod) return { kind: 'bad', text: 'no such rod.' };
        const d = VF.state.data;
        grant(rod);
        d.rod = rod.id;
        VF.bus.emit('rod:granted', rod);
        VF.bus.emit('gear:changed');
        VF.save.save();
        return { kind: 'good', text: 'granted ' + rod.name + ', and equipped it.' };
      }
    },
    {
      match: /^\/give\s+every\s*rod$/,
      run: function () {
        const d = VF.state.data;
        const before = d.ownedRods.length;
        VF.rods.list.forEach(grant);
        VF.bus.emit('gear:changed');
        VF.save.save();
        const added = d.ownedRods.length - before;
        return {
          kind: 'good',
          text: added
            ? 'granted ' + added + ' rod' + (added === 1 ? '' : 's') +
              '. all ' + d.ownedRods.length + ' of them are in the bag.'
            : 'you already had all ' + d.ownedRods.length + ' of them.'
        };
      }
    },
    {
      match: /^\/set\s+brophys\s*(.*)$/,
      run: function (m) {
        const n = number(m[1]);
        if (n === null) return { kind: 'bad', text: 'that is not a number. try /set brophys(500).' };
        const d = VF.state.data;
        d.money = Math.max(0, Math.floor(n));
        VF.bus.emit('money:changed');
        VF.save.save();
        return { kind: 'good', text: 'brophys set to ' + U.money(d.money) + '.' };
      }
    },
    /* Undocumented on purpose. Nothing offers it — not the placeholder, not
       the opening line, not the error a wrong command gets, and it is not in
       its own listing. It only exists for somebody who already knows. */
    {
      match: /^\/help$/,
      run: function () {
        return { kind: 'note', text: HELP.join('\n') };
      }
    }
  ];

  const HELP = [
    '/give admin rod      the one that is not in the game',
    '/give heavens rod    the one at the end of the long thread',
    '/give every rod      all of them, the wanderer\'s included',
    '/set brophys(500)    500, or 1.2m, or 4b'
  ];

  /* Runs one line and returns what to print. Exposed so it can be driven
     without the panel — the tests do exactly that. */
  function run(line) {
    const text = String(line || '').trim().replace(/\s+/g, ' ');
    if (!text) return null;
    for (let i = 0; i < COMMANDS.length; i++) {
      const m = COMMANDS[i].match.exec(text.toLowerCase());
      if (m) {
        try { return COMMANDS[i].run(m); }
        catch (e) { return { kind: 'bad', text: 'that went wrong: ' + e.message }; }
      }
    }
    return { kind: 'bad', text: 'no such command.' };
  }

  function push(text, kind) {
    log.push({ text: text, kind: kind || 'note' });
    if (log.length > LOG_MAX) log = log.slice(-LOG_MAX);
  }

  /* ---------------------------------------------------------------- panel */

  function submit(input, out) {
    const line = input.value;
    if (!line.trim()) return;
    push(line.trim(), 'echo');
    const res = run(line);
    if (res) push(res.text, res.kind);
    input.value = '';
    draw(out);
  }

  function draw(out) {
    U.clear(out);
    log.forEach(function (l) {
      const row = U.el('div', 'con-line con-' + l.kind);
      row.textContent = (l.kind === 'echo' ? '> ' : '') + l.text;
      out.appendChild(row);
    });
    out.scrollTop = out.scrollHeight;
  }

  /* ----------------------------------------------------------------- door */

  /* Attempts belong to a code, not to a session: when the code rolls, the
     count starts again. Five guesses every thirty minutes against four digits
     is roughly two years of guessing, which is enough. */
  function triesLeft() {
    const w = VF.authcode.windowAt(Date.now());
    if (w !== triesWindow) { triesWindow = w; tries = 0; }
    return Math.max(0, MAX_TRIES - tries);
  }

  /* Posts the code, if and only if somewhere to post it has been configured.
     Once per code — knocking five times should not send five emails. */
  function deliver(onState) {
    const w = VF.authcode.windowAt(Date.now());
    if (!RELAY) { sentState = 'norelay'; onState(sentState); return; }
    if (w === sentWindow) { onState(sentState); return; }
    sentWindow = w;
    sentState = 'sending';
    onState(sentState);
    const body = JSON.stringify({
      to: EMAIL,   // set EMAIL above, or there is nobody to send it to
      subject: 'void fishing · admin code',
      text: 'The code is ' + VF.authcode.current() + '. It is good for the next ' +
            Math.ceil(VF.authcode.remaining() / 60000) + ' minutes.'
    });
    // no-cors would hide the failure, so the failure is allowed to be visible
    fetch(RELAY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (r) { sentState = r.ok ? 'sent' : 'failed'; onState(sentState); })
      .catch(function () { sentState = 'failed'; onState(sentState); });
  }

  function statusLine(state) {
    const who = EMAIL || 'the owner';
    if (state === 'sending') return 'sending a code to ' + who + '…';
    if (state === 'sent') return 'code sent to ' + who + '.';
    if (state === 'failed') return 'could not reach the relay — nothing was sent to ' + who + '.';
    /* The honest one. No relay is configured, so no mail left this machine and
       the panel is not going to stand here claiming it did. */
    return 'for ' + who + ' only · nothing was sent from here · the code is in your authenticator';
  }

  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  /* The locked half of the panel. Nothing behind it is built until the code is
     right, so there is no console in the DOM to go looking through. */
  function buildGate(shell, body) {
    const p = shell('admin', 'locked · four digits, and they change every thirty minutes');
    const b = body();

    const status = U.el('div', 'gate-status');
    b.appendChild(status);

    const form = U.el('form', 'gate-form');
    const label = U.el('label', 'gate-label', 'give the code');
    label.setAttribute('for', 'gateCode');
    form.appendChild(label);

    const input = U.el('input', 'gate-input');
    input.id = 'gateCode';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 4;
    input.placeholder = '····';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    form.appendChild(input);
    b.appendChild(form);

    const msg = U.el('div', 'gate-msg');
    b.appendChild(msg);

    const foot = U.el('div', 'gate-foot');
    b.appendChild(foot);

    let state = sentState;
    function paint() {
      const left = triesLeft();
      status.textContent = statusLine(state);
      foot.textContent = left
        ? 'this code expires in ' + clock(VF.authcode.remaining()) + ' · ' +
          left + ' attempt' + (left === 1 ? '' : 's') + ' left'
        : 'too many wrong guesses · the next code, in ' +
          clock(VF.authcode.remaining()) + ', will be listened to';
      /* Coming back from a burnt-out lockout: the red 'that was the last try'
         has to go with it, and the field has to take the keyboard again — it
         could not be focused while it was disabled, so nothing typed would
         have appeared and the gate would look broken at the exact moment it
         started working again. */
      const was = input.disabled;
      input.disabled = !left;
      if (was && left) {
        msg.textContent = '';
        msg.className = 'gate-msg';
        input.value = '';
        input.focus();
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!triesLeft()) return;
      const given = input.value.trim();
      if (!/^\d{4}$/.test(given)) {
        msg.textContent = 'four digits.';
        msg.className = 'gate-msg bad';
        return;
      }
      if (VF.authcode.accepts(given)) {
        unlocked = true;
        tries = 0;
        VF.audio.stinger('void', 4);
        VF.fx.pulse(0.4);
        VF.fx.shake(3, 1.6);
        // the console is built for the first time only now
        VF.panels.refresh();
        return;
      }
      tries++;
      input.value = '';
      const left = triesLeft();
      /* Two in a row is usually a typo. Three is usually the other thing, and
         the other thing is invisible: the authenticator is on a phone whose
         clock disagrees with this machine's by more than half an hour, and
         every code it shows will be refused with nothing on screen to say so. */
      msg.textContent = !left ? 'that is not the code. that was the last try.'
        : tries >= 3 ? 'that is not the code. if your authenticator is on another device, check the two clocks agree.'
        : 'that is not the code.';
      msg.className = 'gate-msg bad';
      VF.audio.back();
      VF.fx.shake(2, 1.2);
      paint();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); VF.panels.close(); }
    });

    deliver(function (st) { state = st; paint(); });
    paint();
    // the countdown has to keep counting; panels.js drops the node on close
    const timer = setInterval(function () {
      if (!p.isConnected) { clearInterval(timer); return; }
      paint();
    }, 1000);

    p.appendChild(b);
    setTimeout(function () { input.focus(); }, 30);
    return p;
  }

  /* Built by panels.js like any other panel, so it inherits the shell, the
     close button, the overlay and the fact that the world pauses behind it. */
  function build(shell, body) {
    if (!unlocked) return buildGate(shell, body);
    const p = shell('admin', 'not in the game · nothing here is meant to be here');
    const b = body();

    const out = U.el('div', 'con-out');
    b.appendChild(out);

    const form = U.el('form', 'con-form');
    const input = U.el('input', 'con-input');
    input.type = 'text';
    input.placeholder = 'type a command';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    form.appendChild(input);
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(input, out); });
    // the global key handler stands down inside an input, so escape needs saying
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); VF.panels.close(); }
    });
    b.appendChild(form);
    p.appendChild(b);

    if (!log.length) { push('admin console.', 'note'); }
    draw(out);
    setTimeout(function () { input.focus(); }, 30);
    return p;
  }

  /* Three hashes land here. All this does is knock — what opens is the gate,
     unless the code has already been given once this session. */
  function open() {
    if (!knocked) { knocked = true; VF.audio.stinger('void', 3); }
    VF.fx.pulse(0.25);
    VF.panels.open('admin');
  }

  VF.adminConsole = {
    open: open, run: run, build: build,
    help: HELP,
    isUnlocked: function () { return unlocked; },
    /* The door locks itself again on reload — nothing about it is written to
       the save, so a save file carries no way in. */
    lock: function () { unlocked = false; tries = 0; triesWindow = -1; },
    /* what the panel is showing, for anything that wants to check */
    lines: function () { return log.slice(); },
    clear: function () { log = []; }
  };
})(window.VF = window.VF || {});
