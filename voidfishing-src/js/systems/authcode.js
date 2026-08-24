/* VOID FISHING — the four-digit code on the admin door.

   This file is the ONE definition of what the current code is. The game reads
   it to check what was typed; tools/build-authenticator.js inlines this exact
   file into the little authenticator page that tells you the code. Neither
   has its own copy of the maths, so the two can never drift apart and leave
   you locked out of your own game.

   What it actually is: the same idea as the six digits on a 2FA app. There is
   no message and nothing is stored — the code is *derived* from the clock, so
   two programs that agree on the time and the salt agree on the code without
   ever speaking to each other. It rolls every thirty minutes.

   What it is honestly worth: this is a game running from a file on your
   machine, so the salt below is in the file, and anybody who opens the
   developer console can read it, or simply call the unlock directly. This is
   a lock on a door, not a lock on a vault: it stops a friend poking at your
   laptop, and it does not stop somebody who really wants in. */
(function (VF) {
  'use strict';

  /* Change this and every code changes with it. If you ever do, rebuild the
     authenticator too — `node tools/build-authenticator.js` — or the two will
     disagree and nothing you type will work.

     Deliberately opaque. An earlier draft had the owner's email address in
     here, which put a real person's school address into a public repository
     for no benefit at all: the salt is not a place to keep anything, since it
     ships in the file either way. */
  const SALT = 'void-fishing/admin/7f3a9c21/v1';

  const WINDOW_MS = 30 * 60 * 1000;   // thirty minutes, as asked

  /* The code either side of the current one is honoured too. This is not
     politeness, it is the difference between working and not: you will read
     the code on your phone and type it on the laptop, and those are two
     clocks. Whichever is ahead, the other computes a different window — so
     accepting only the current one fails for however long the drift is, out
     of every half hour, with nothing on screen to explain why.

     One window either side absorbs half an hour of disagreement in either
     direction. A new code still appears every thirty minutes; the cost is
     that any given one is honoured across a ninety-minute band, and that a
     guess is right 3 times in 10000 rather than 1. Against five guesses per
     half hour that is nothing, and being locked out of your own game is not. */
  const NEIGHBOURS = 1;

  /* xmur3. Small, no dependencies, and it avalanches properly — the point is
     that consecutive window numbers give completely unrelated codes, so
     watching one code tells you nothing about the next. */
  function hash32(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h ^= h >>> 16; h = Math.imul(h, 2246822507);
    h ^= h >>> 13; h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /* Date.now() is milliseconds since the epoch in UTC, so this is the same
     number on both sides of the world at the same moment. No timezone, no
     daylight saving, nothing to get wrong. */
  function windowAt(t) { return Math.floor(t / WINDOW_MS); }

  /* Four digits, always four — 7 is '0007', not '7'.
     (10000 does not divide 2^32 exactly, so a handful of codes are about
     0.002% likelier than the rest. At four digits that is not a weakness
     anybody can use; it is noted so the next person does not wonder.) */
  function codeForWindow(w) {
    const n = hash32(SALT + ':' + w) % 10000;
    return ('000' + n).slice(-4);
  }

  function current(now) { return codeForWindow(windowAt(now === undefined ? Date.now() : now)); }

  /* Milliseconds until this code is replaced. */
  function remaining(now) {
    now = now === undefined ? Date.now() : now;
    return WINDOW_MS - (now % WINDOW_MS);
  }

  /* Is this what is written on the door right now, or was it one window ago,
     or will it be one window from now? Nothing else, ever. */
  function accepts(entered, now) {
    now = now === undefined ? Date.now() : now;
    const s = String(entered === undefined || entered === null ? '' : entered).trim();
    if (!/^\d{4}$/.test(s)) return false;
    const w = windowAt(now);
    for (let i = -NEIGHBOURS; i <= NEIGHBOURS; i++) {
      if (s === codeForWindow(w + i)) return true;
    }
    return false;
  }

  VF.authcode = {
    current: current,
    accepts: accepts,
    remaining: remaining,
    codeForWindow: codeForWindow,
    windowAt: windowAt,
    WINDOW_MS: WINDOW_MS,
    NEIGHBOURS: NEIGHBOURS
  };
})(window.VF = window.VF || {});
