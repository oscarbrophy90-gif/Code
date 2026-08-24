/* VOID FISHING — the admin console.

   Not in the game. There is no button for it and nothing links to it: three
   slashes in a row open it and that is the only door. Everything it does is
   something the game already knows how to do — granting a rod goes through
   the same rod:granted the shop uses, and setting money writes the same field
   an economy payout does — so nothing here is a second way of being wrong. */
(function (VF) {
  'use strict';

  const U = VF.util;
  const LOG_MAX = 60;

  let log = [];          // { text, kind } — survives closing the panel
  let unlocked = false;  // has the door been opened this session

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
    '/set brophys(500)    500, or 1.2m, or 4b',
    '/help                this'
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
    return { kind: 'bad', text: 'no such command. /help lists them.' };
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

  /* Built by panels.js like any other panel, so it inherits the shell, the
     close button, the overlay and the fact that the world pauses behind it. */
  function build(shell, body) {
    const p = shell('admin', 'not in the game · nothing here is meant to be here');
    const b = body();

    const out = U.el('div', 'con-out');
    b.appendChild(out);

    const form = U.el('form', 'con-form');
    const input = U.el('input', 'con-input');
    input.type = 'text';
    input.placeholder = 'type a command · /help';
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

    if (!log.length) { push('admin console. /help lists what it takes.', 'note'); }
    draw(out);
    setTimeout(function () { input.focus(); }, 30);
    return p;
  }

  function open() {
    if (!unlocked) {
      unlocked = true;
      VF.audio.stinger('void', 4);
    }
    VF.fx.pulse(0.25);
    VF.panels.open('admin');
  }

  VF.adminConsole = {
    open: open, run: run, build: build,
    help: HELP,
    /* what the panel is showing, for anything that wants to check */
    lines: function () { return log.slice(); },
    clear: function () { log = []; }
  };
})(window.VF = window.VF || {});
