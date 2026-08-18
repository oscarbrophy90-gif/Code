/* ============================================================
   Acendri OS — core: state store, router, app shell, UI kit,
   achievements engine, timetable engine, focus engine.
   Everything is local — data lives in this browser only.
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'ascendri-os-state-v1';

  /* ---------------- helpers ---------------- */

  function uid() { return 'id' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function dateISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayISO() { return dateISO(new Date()); }
  function addDaysISO(iso, n) {
    var p = iso.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n); return dateISO(d);
  }
  function monthISO() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var t = todayISO();
    if (iso === t) return 'Today';
    if (iso === addDaysISO(t, 1)) return 'Tomorrow';
    if (iso === addDaysISO(t, -1)) return 'Yesterday';
    return DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  function fmtMoney(n) {
    var cur = (state && state.settings && state.settings.currency) || '$';
    var neg = n < 0; n = Math.abs(n);
    var s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '-' : '') + cur + s;
  }

  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
    return Math.floor(d / 7) + 'w ago';
  }

  function minutes(hhmm) { var p = hhmm.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function hhmm(min) { min = Math.round(min); return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function fmtTime(t) { // "14:30" -> "2:30pm"
    var m = minutes(t); var h = Math.floor(m / 60); var mm = m % 60;
    var ap = h >= 12 ? 'pm' : 'am'; h = h % 12; if (h === 0) h = 12;
    return h + (mm ? ':' + pad(mm) : '') + ap;
  }

  /* ---------------- icons (inline SVG) ---------------- */

  var IC = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    checksq: '<rect x="3" y="3" width="18" height="18" rx="4"/><polyline points="8 12 11 15 16 9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    dollar: '<path d="M12 2v20"/><path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3"/>',
    pulse: '<polyline points="2 12 6.5 12 9.5 4 14.5 20 17.5 12 22 12"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2"/><circle cx="17.3" cy="9.3" r="2.6"/><path d="M17.5 13.9c2.4.4 4 2.5 4 5.1"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    bolt: '<polygon points="13 2 4 14 11 14 10 22 20 10 13 10"/>',
    flame: '<path d="M12 3c1 3.5-2.5 5-2.5 8a4.5 4.5 0 009 0c0-1.1-.4-2.1-1-3 2.7 1.5 4.5 4 4.5 6.8A8 8 0 014 14.5C4 9.5 9.5 7.5 12 3z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 5H5v1.5A3.5 3.5 0 008.5 10M16 5h3v1.5A3.5 3.5 0 0115.5 10"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
    bulb: '<path d="M12 3a6 6 0 00-3.9 10.6c.8.7 1.1 1.5 1.1 2.4h5.6c0-.9.3-1.7 1.1-2.4A6 6 0 0012 3z"/><path d="M9.5 19h5M10.5 21.5h3"/>',
    route: '<circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8.2 19H14a4 4 0 004-4V7.2"/>',
    chat: '<path d="M21 11.5a8.5 8.5 0 01-8.5 8.5H3.5l2.4-3A8.5 8.5 0 1121 11.5z"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>',
    bell: '<path d="M6 9.5a6 6 0 0112 0c0 4.6 1.8 5.8 1.8 5.8H4.2S6 14.1 6 9.5z"/><path d="M10 19.5a2.1 2.1 0 004 0"/>',
    star: '<polygon points="12 2.5 14.9 8.6 21.5 9.4 16.7 14 17.9 20.6 12 17.4 6.1 20.6 7.3 14 2.5 9.4 9.1 8.6"/>',
    wallet: '<rect x="2.5" y="6" width="19" height="14" rx="2.5"/><path d="M17 4H6a3.5 3.5 0 00-3.5 3.5"/><circle cx="16.8" cy="13" r="1.3" fill="currentColor"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    trend: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14.5 7 21 7 21 13.5"/>',
    edit: '<path d="M4 20l4.5-1L20 7.5 16.5 4 5 15.5 4 20z"/><path d="M14 6.5l3.5 3.5"/>',
    trash: '<path d="M4 7h16M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13.5h9L17.5 7"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 20h16"/>',
    heart: '<path d="M12 20.5S3.5 15 3.5 9.2a4.7 4.7 0 018.5-2.7A4.7 4.7 0 0120.5 9.2C20.5 15 12 20.5 12 20.5z"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    grad: '<path d="M12 3L2 8.2 12 13.5 22 8.2 12 3z"/><path d="M6 10.5v4.7c0 1.7 2.7 3.1 6 3.1s6-1.4 6-3.1v-4.7"/>',
    book: '<path d="M4 4.5h12.5A3.5 3.5 0 0120 8v11.5H7.5A3.5 3.5 0 014 16V4.5z"/><path d="M4 16a3.5 3.5 0 013.5-3.5H20"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M19.2 4.8l-1.4 1.4M6.2 17.8l-1.4 1.4"/>',
    moon: '<path d="M20.5 14.5A8.5 8.5 0 019.5 3.5a8.5 8.5 0 1011 11z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4.5c4-2.5 7 2 12 0v9c-5 2-8-2.5-12 0"/>',
    eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
    shield: '<path d="M12 2.5l8 3v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10v-6l8-3z"/><polyline points="8.7 12 11.2 14.5 15.5 9.5"/>'
  };

  function icon(name, cls) {
    var body = IC[name] || IC.sparkles;
    return '<svg class="svgi ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  var ACCENT_NAMES = ['cyan', 'blue', 'orange', 'green', 'purple', 'pink', 'teal', 'indigo', 'red', 'yellow'];
  var ACCENTS = {
    cyan:   { c: '#22d3ee', b: '#06b6d4' }, blue:  { c: '#60a5fa', b: '#3b82f6' },
    orange: { c: '#fb923c', b: '#f97316' }, green: { c: '#4ade80', b: '#22c55e' },
    purple: { c: '#c084fc', b: '#a855f7' }, pink:  { c: '#f472b6', b: '#ec4899' },
    teal:   { c: '#2dd4bf', b: '#14b8a6' }, indigo:{ c: '#818cf8', b: '#6366f1' },
    red:    { c: '#f87171', b: '#ef4444' }, yellow:{ c: '#facc15', b: '#eab308' }
  };

  /* ---------------- levels ---------------- */

  var LEVEL_TITLES = ['Newcomer', 'Starter', 'Riser', 'Builder', 'Climber', 'Achiever', 'Performer', 'Elite', 'Visionary', 'Ascendant'];
  function xpNeed(level) { return 50 * level * (level - 1); } // cumulative xp to REACH level
  function levelFor(xp) { var l = 1; while (xpNeed(l + 1) <= xp) l++; return l; }
  function levelTitle(l) { return LEVEL_TITLES[Math.min(l, LEVEL_TITLES.length) - 1] + (l > LEVEL_TITLES.length ? ' ' + (l - LEVEL_TITLES.length + 1) : ''); }
  function levelProgress(xp) {
    var l = levelFor(xp); var lo = xpNeed(l); var hi = xpNeed(l + 1);
    return { level: l, into: xp - lo, span: hi - lo, pct: Math.min(100, Math.round(100 * (xp - lo) / (hi - lo))) };
  }

  /* ---------------- seed / initial state ---------------- */

  function seedSocial() {
    var now = Date.now();
    return {
      friends: [
        { id: 'f1', name: 'Sarah Chen', avatar: '👩‍⚕️', role: 'Medical Student', level: 7, streak: 21, online: true },
        { id: 'f2', name: 'Marcus Johnson', avatar: '🏃', role: 'Professional Athlete', level: 9, streak: 64, online: true },
        { id: 'f3', name: 'Emily Rodriguez', avatar: '💼', role: 'Entrepreneur', level: 8, streak: 12, online: false },
        { id: 'f4', name: 'David Kim', avatar: '🎓', role: 'College Student', level: 5, streak: 33, online: false },
        { id: 'f5', name: 'Alex Patel', avatar: '💻', role: 'Software Engineer', level: 6, streak: 9, online: true }
      ],
      requests: [
        { id: 'r1', name: 'Jessica Taylor', avatar: '💪', role: 'Fitness Coach' },
        { id: 'r2', name: 'Liam O’Brien', avatar: '🎸', role: 'Music Student' }
      ],
      suggestions: [
        { id: 's1', name: 'Mia Nguyen', avatar: '🎨', role: 'Design Student' },
        { id: 's2', name: 'Tom Becker', avatar: '⚽', role: 'Football Player' },
        { id: 's3', name: 'Ava Rossi', avatar: '📚', role: 'Law Student' }
      ],
      feed: [
        { id: 'p1', author: 'Marcus Johnson', avatar: '🏃', accent: 'green', kind: 'pr', time: now - 35 * 60000, text: 'New PR! 🏋️ Squatted 140kg this morning. The 5am grind is paying off.', likes: 12, liked: false, comments: [{ author: 'Sarah Chen', avatar: '👩‍⚕️', text: 'Machine!! 🔥' }] },
        { id: 'p2', author: 'Sarah Chen', avatar: '👩‍⚕️', accent: 'cyan', kind: 'streak', time: now - 2 * 3600000, text: 'Hit a 21-day study streak 📚 Three more weeks until exams — locked in.', likes: 18, liked: false, comments: [] },
        { id: 'p3', author: 'Emily Rodriguez', avatar: '💼', accent: 'purple', kind: 'goal', time: now - 5 * 3600000, text: 'Milestone unlocked: my side business just crossed $5k revenue 🎉 Acendri broke the goal into 23 steps and I just ticked #15.', likes: 25, liked: false, comments: [{ author: 'Alex Patel', avatar: '💻', text: 'Congrats!! What step is next?' }, { author: 'Emily Rodriguez', avatar: '💼', text: 'Registering the trademark 😅' }] },
        { id: 'p4', author: 'David Kim', avatar: '🎓', accent: 'yellow', kind: 'achievement', time: now - 9 * 3600000, text: 'Earned the "Consistency" badge — 30 days of habits without missing once ✅', likes: 9, liked: false, comments: [] },
        { id: 'p5', author: 'Alex Patel', avatar: '💻', accent: 'blue', kind: 'path', time: now - 26 * 3600000, text: 'Just published my Path: "Zero to first dev job in 9 months". 41 steps, everything I actually did. Follow it if you’re starting out!', likes: 31, liked: false, comments: [{ author: 'Mia Nguyen', avatar: '🎨', text: 'Following! 🙌' }] },
        { id: 'p6', author: 'Sarah Chen', avatar: '👩‍⚕️', accent: 'pink', kind: 'goal', time: now - 2 * 86400000, text: 'Saved $500 of my $2,000 emergency fund goal 💰 Auto-budgeting means I don’t even feel it.', likes: 14, liked: false, comments: [] }
      ],
      groups: [
        { id: 'g1', name: 'Study Squad', emoji: '📚', accent: 'blue', members: 128, joined: false, desc: 'Daily study sessions, exam countdowns and shared focus streaks.', leaderboard: [{ name: 'Sarah Chen', avatar: '👩‍⚕️', xp: 940 }, { name: 'David Kim', avatar: '🎓', xp: 815 }, { name: 'Ava Rossi', avatar: '📚', xp: 640 }] },
        { id: 'g2', name: 'Morning Grinders', emoji: '🌅', accent: 'orange', members: 342, joined: false, desc: '5am club. Post your sunrise workout or morning routine wins.', leaderboard: [{ name: 'Marcus Johnson', avatar: '🏃', xp: 1210 }, { name: 'Tom Becker', avatar: '⚽', xp: 890 }, { name: 'Jessica Taylor', avatar: '💪', xp: 860 }] },
        { id: 'g3', name: 'Tennis Club', emoji: '🎾', accent: 'green', members: 57, joined: false, desc: 'Training plans, match schedules and friendly ladder rankings.', leaderboard: [{ name: 'Tom Becker', avatar: '⚽', xp: 720 }, { name: 'Marcus Johnson', avatar: '🏃', xp: 700 }, { name: 'Liam O’Brien', avatar: '🎸', xp: 430 }] },
        { id: 'g4', name: 'Savings Circle', emoji: '💰', accent: 'yellow', members: 203, joined: false, desc: 'No-spend challenges, budget tips and savings goal accountability.', leaderboard: [{ name: 'Emily Rodriguez', avatar: '💼', xp: 1020 }, { name: 'Sarah Chen', avatar: '👩‍⚕️', xp: 780 }, { name: 'Alex Patel', avatar: '💻', xp: 615 }] }
      ],
      paths: [
        { id: 'pa1', title: 'How I improved my grades from C to A', author: 'David Kim', avatar: '🎓', accent: 'blue', emoji: '📈', followers: 412, following: false, done: {}, steps: ['Audit one week of how you actually spend your time', 'Set a fixed study block for every school day', 'Turn each subject into a goal with weekly milestones', 'Do practice papers under real exam timing', 'Review mistakes the same evening — never skip', 'Sleep 8+ hours the week before exams'] },
        { id: 'pa2', title: 'How I saved my first $1,000', author: 'Emily Rodriguez', avatar: '💼', accent: 'yellow', emoji: '💰', followers: 655, following: false, done: {}, steps: ['Track every expense for 2 weeks — no judging, just data', 'Cancel 3 subscriptions you forgot about', 'Set an auto-transfer of $25 every payday', 'Cook at home 5 nights a week', 'Sell 5 things you no longer use', 'Celebrate at $500 — then double the transfer'] },
        { id: 'pa3', title: 'Couch to 5K in 8 weeks', author: 'Marcus Johnson', avatar: '🏃', accent: 'green', emoji: '🏃', followers: 1240, following: false, done: {}, steps: ['Walk 20 minutes a day for one week', 'Alternate 1 min jog / 2 min walk × 8', 'Build to 5 min jog intervals', 'First non-stop 2km — slow is fine', 'Add one longer weekend run', '3km non-stop', '4km with negative splits', 'Race day: 5K 🎉'] },
        { id: 'pa4', title: 'Building a morning routine that sticks', author: 'Jessica Taylor', avatar: '💪', accent: 'pink', emoji: '🌅', followers: 890, following: false, done: {}, steps: ['Set a fixed wake time — even weekends', 'No phone for the first 30 minutes', 'Drink water + 5 minutes of stretching', 'Write down your top 3 for the day', 'Add 10 minutes of reading', 'Protect the routine for 21 days straight'] }
      ]
    };
  }

  function initialState() {
    return {
      version: 1,
      profile: { name: '', avatar: '🙂', focus: '', onboarded: false, createdAt: Date.now(), xp: 0 },
      goals: [],
      tasks: [],
      commitments: [],
      habits: [],
      finance: { transactions: [], budgets: {}, savingsGoals: [] },
      timetable: null,
      achievements: {},          // id -> unlocked at (ts)
      activityLog: [],           // { ts, text, emoji, xp }
      assistant: { history: [] },
      social: seedSocial(),
      settings: { wake: '07:00', sleep: '22:30', currency: '$', autoPost: true, notifications: true }
    };
  }

  /* ---------------- store ---------------- */

  var state = null;
  var renderScheduled = false;

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.version === 1) { state = s; return; }
      }
    } catch (e) { /* corrupted -> fresh */ }
    state = initialState();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  }

  var pendingToasts = [];

  // Keep timetable blocks in lock-step with their tasks, wherever the task
  // was completed or re-opened from (tasks screen, dashboard, schedule).
  function syncTimetableDone(s) {
    if (!s.timetable || !s.timetable.days) return;
    var byId = {};
    s.tasks.forEach(function (t) { byId[t.id] = t; });
    Object.keys(s.timetable.days).forEach(function (iso) {
      s.timetable.days[iso].forEach(function (b) {
        if (b.type === 'task' && byId[b.refId]) b.done = !!byId[b.refId].done;
      });
    });
  }

  function update(fn, opts) {
    fn(state);
    syncTimetableDone(state);
    checkAchievements();
    save();
    if (!(opts && opts.silent)) scheduleRender();
    flushToasts();
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(function () { renderScheduled = false; render(); });
  }

  function addXp(n, reason) {
    var before = levelFor(state.profile.xp);
    update(function (s) {
      s.profile.xp += n;
      s.activityLog.unshift({ ts: Date.now(), text: reason || 'XP earned', emoji: '⚡', xp: n });
      if (s.activityLog.length > 120) s.activityLog.length = 120;
    });
    var after = levelFor(state.profile.xp);
    toast('+' + n + ' XP — ' + (reason || 'nice work'), '⚡');
    if (after > before) {
      toast('Level up! You reached Level ' + after + ' — ' + levelTitle(after), '🚀');
      confetti();
    }
  }

  function logActivity(text, emoji) {
    state.activityLog.unshift({ ts: Date.now(), text: text, emoji: emoji || '✨', xp: 0 });
    if (state.activityLog.length > 120) state.activityLog.length = 120;
  }

  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importJSON(txt) {
    var s = JSON.parse(txt);
    if (!s || s.version !== 1 || !s.profile) throw new Error('Not a valid Acendri OS backup file');
    state = s; save(); render();
  }

  function resetAll() { state = initialState(); save(); location.hash = '#/landing'; render(); }

  /* ---------------- achievements ---------------- */

  var ACHIEVEMENTS = [
    { id: 'welcome', title: 'Welcome to Acendri', desc: 'Create your profile and start your journey.', emoji: '🚀', accent: 'cyan', xp: 25, test: function (s) { return s.profile.onboarded; } },
    { id: 'goal-starter', title: 'Goal Starter', desc: 'Create your first goal.', emoji: '🎯', accent: 'blue', xp: 20, test: function (s) { return s.goals.length >= 1; } },
    { id: 'milestone', title: 'Milestone', desc: 'Complete your first goal milestone.', emoji: '🏁', accent: 'teal', xp: 25, test: function (s) { return s.goals.some(function (g) { return g.milestones.some(function (m) { return m.done; }); }); } },
    { id: 'goal-crusher', title: 'Goal Crusher', desc: 'Complete a major goal.', emoji: '🏆', accent: 'yellow', xp: 100, test: function (s) { return s.goals.some(function (g) { return g.status === 'done'; }); } },
    { id: 'first-task', title: 'First Step', desc: 'Complete your first task.', emoji: '✅', accent: 'green', xp: 10, test: function (s) { return s.tasks.some(function (t) { return t.done; }); } },
    { id: 'task-10', title: 'Momentum', desc: 'Complete 10 tasks.', emoji: '⚙️', accent: 'blue', xp: 40, test: function (s) { return s.tasks.filter(function (t) { return t.done; }).length >= 10; } },
    { id: 'task-50', title: 'Unstoppable', desc: 'Complete 50 tasks.', emoji: '🔥', accent: 'orange', xp: 120, test: function (s) { return s.tasks.filter(function (t) { return t.done; }).length >= 50; } },
    { id: 'focused', title: 'Focused', desc: 'Complete 5 high-priority tasks.', emoji: '🧠', accent: 'purple', xp: 50, test: function (s) { return s.tasks.filter(function (t) { return t.done && t.priority === 3; }).length >= 5; } },
    { id: 'habit-first', title: 'Routine Builder', desc: 'Create your first habit.', emoji: '🌱', accent: 'green', xp: 15, test: function (s) { return s.habits.length >= 1; } },
    { id: 'streak-3', title: 'Warming Up', desc: 'Reach a 3-day habit streak.', emoji: '✨', accent: 'cyan', xp: 20, test: function (s) { return s.habits.some(function (h) { return habitStreak(h) >= 3; }); } },
    { id: 'streak-7', title: 'Consistency', desc: 'Reach a 7-day habit streak.', emoji: '🔥', accent: 'orange', xp: 50, test: function (s) { return s.habits.some(function (h) { return habitStreak(h) >= 7; }); } },
    { id: 'streak-30', title: 'Iron Will', desc: 'Reach a 30-day habit streak.', emoji: '💎', accent: 'indigo', xp: 200, test: function (s) { return s.habits.some(function (h) { return habitStreak(h) >= 30; }); } },
    { id: 'first-money', title: 'Money Mapper', desc: 'Log your first transaction.', emoji: '💵', accent: 'green', xp: 10, test: function (s) { return s.finance.transactions.length >= 1; } },
    { id: 'budget-boss', title: 'Budget Boss', desc: 'Set your first budget.', emoji: '📊', accent: 'orange', xp: 20, test: function (s) { return Object.keys(s.finance.budgets).length >= 1; } },
    { id: 'saver', title: 'Future Saver', desc: 'Create a savings goal.', emoji: '🏦', accent: 'yellow', xp: 20, test: function (s) { return s.finance.savingsGoals.length >= 1; } },
    { id: 'save-500', title: 'Compound Interest', desc: 'Save $500 across your savings goals.', emoji: '💰', accent: 'yellow', xp: 60, test: function (s) { return s.finance.savingsGoals.reduce(function (a, g) { return a + g.saved; }, 0) >= 500; } },
    { id: 'planner', title: 'Time Lord', desc: 'Generate your first automatic timetable.', emoji: '📅', accent: 'purple', xp: 30, test: function (s) { return !!s.timetable; } },
    { id: 'social-butterfly', title: 'Social Butterfly', desc: 'Add your first friend.', emoji: '🦋', accent: 'pink', xp: 15, test: function (s) { return s.social.friends.length >= 6; } },
    { id: 'grouped', title: 'Team Player', desc: 'Join a group.', emoji: '👥', accent: 'teal', xp: 15, test: function (s) { return s.social.groups.some(function (g) { return g.joined; }); } },
    { id: 'pathfinder', title: 'Pathfinder', desc: 'Follow your first Path.', emoji: '🧭', accent: 'indigo', xp: 15, test: function (s) { return s.social.paths.some(function (p) { return p.following; }); } },
    { id: 'ai-curious', title: 'Ask Acendri', desc: 'Have your first chat with the AI assistant.', emoji: '🤖', accent: 'cyan', xp: 10, test: function (s) { return s.assistant.history.some(function (m) { return m.role === 'user'; }); } },
    { id: 'level-5', title: 'Climber', desc: 'Reach Level 5.', emoji: '⛰️', accent: 'blue', xp: 0, test: function (s) { return levelFor(s.profile.xp) >= 5; } },
    { id: 'level-10', title: 'Ascendant', desc: 'Reach Level 10.', emoji: '🌌', accent: 'purple', xp: 0, test: function (s) { return levelFor(s.profile.xp) >= 10; } }
  ];

  function checkAchievements() {
    for (var pass = 0; pass < 2; pass++) {
      var got = false;
      ACHIEVEMENTS.forEach(function (a) {
        if (state.achievements[a.id]) return;
        var ok = false;
        try { ok = a.test(state); } catch (e) { ok = false; }
        if (!ok) return;
        got = true;
        state.achievements[a.id] = Date.now();
        state.profile.xp += a.xp;
        logActivity('Achievement unlocked: ' + a.title, a.emoji);
        if (state.settings.autoPost && state.profile.onboarded) {
          state.social.feed.unshift({
            id: uid(), author: state.profile.name || 'You', avatar: state.profile.avatar, me: true,
            accent: a.accent, kind: 'achievement', time: Date.now(),
            text: 'Achievement unlocked: ' + a.emoji + ' "' + a.title + '" — ' + a.desc,
            likes: 0, liked: false, comments: []
          });
        }
        pendingToasts.push({ msg: 'Achievement: ' + a.title + (a.xp ? '  (+' + a.xp + ' XP)' : ''), emoji: a.emoji });
      });
      if (!got) break;
    }
  }

  function flushToasts() {
    while (pendingToasts.length) { var t = pendingToasts.shift(); toast(t.msg, t.emoji); }
  }

  /* ---------------- engines ---------------- */

  function habitStreak(h) {
    var streak = 0;
    var day = todayISO();
    if (!h.log[day]) day = addDaysISO(day, -1); // today not ticked yet doesn't break it
    while (h.log[day]) { streak++; day = addDaysISO(day, -1); }
    return streak;
  }

  function habitWeekCount(h) {
    var n = 0; var day = todayISO();
    for (var i = 0; i < 7; i++) { if (h.log[day]) n++; day = addDaysISO(day, -1); }
    return n;
  }

  function goalProgress(g) {
    if (g.status === 'done') return 100;
    if (!g.milestones.length) return 0;
    var d = g.milestones.filter(function (m) { return m.done; }).length;
    return Math.round(100 * d / g.milestones.length);
  }

  function financeSummary(ym) {
    ym = ym || monthISO();
    var inc = 0, exp = 0, byCat = {};
    state.finance.transactions.forEach(function (t) {
      if (t.date.slice(0, 7) !== ym) return;
      if (t.type === 'income') inc += t.amount;
      else { exp += t.amount; byCat[t.category] = (byCat[t.category] || 0) + t.amount; }
    });
    var savings = state.finance.savingsGoals.reduce(function (a, g) { return a + g.saved; }, 0);
    var over = [];
    Object.keys(state.finance.budgets).forEach(function (cat) {
      var lim = state.finance.budgets[cat];
      if (lim > 0 && (byCat[cat] || 0) > lim) over.push({ cat: cat, spent: byCat[cat] || 0, limit: lim });
    });
    return { month: ym, income: inc, expenses: exp, net: inc - exp, byCat: byCat, savings: savings, overBudget: over };
  }

  // Automatic timetable: fits open tasks around fixed commitments for the next 7 days.
  function generateTimetable(s) {
    s = s || state;
    var wake = minutes(s.settings.wake), sleep = minutes(s.settings.sleep);
    if (sleep <= wake) sleep = wake + 8 * 60;
    var days = {}, freeMap = {}, isoList = [];
    var t0 = todayISO();
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();

    for (var i = 0; i < 7; i++) {
      var iso = addDaysISO(t0, i);
      isoList.push(iso);
      days[iso] = [];
      var p = iso.split('-');
      var dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
      var blocks = [];
      s.commitments.forEach(function (c) {
        if (c.days.indexOf(dow) === -1) return;
        var st = minutes(c.start), en = minutes(c.end);
        if (en <= st) return;
        blocks.push({ id: uid(), refId: c.id, title: c.title, type: 'commitment', accent: c.accent || 'indigo', startMin: st, endMin: en, start: hhmm(st), end: hhmm(en) });
      });
      blocks.sort(function (a, b) { return a.startMin - b.startMin; });
      days[iso] = blocks;
      // free intervals
      var free = []; var cur = (i === 0 ? Math.max(wake, Math.ceil(nowMin / 30) * 30) : wake);
      blocks.forEach(function (b) {
        if (b.startMin > cur) free.push([cur, Math.min(b.startMin, sleep)]);
        cur = Math.max(cur, b.endMin);
      });
      if (cur < sleep) free.push([cur, sleep]);
      freeMap[iso] = free.filter(function (f) { return f[1] - f[0] >= 20; });
    }

    var open = s.tasks.filter(function (t) { return !t.done; }).slice();
    open.sort(function (a, b) {
      var da = a.due || '9999-12-31', db = b.due || '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });

    var unplaced = [];
    open.forEach(function (task) {
      var dur = Math.max(20, task.duration || 45);
      var placed = false;
      var lastIdx = isoList.length - 1;
      if (task.due) {
        var di = isoList.indexOf(task.due);
        if (di >= 0) lastIdx = di;
      }
      for (var round = 0; round < 2 && !placed; round++) {
        var maxI = round === 0 ? lastIdx : isoList.length - 1; // try before due first, then anywhere
        for (var i2 = 0; i2 <= maxI && !placed; i2++) {
          var iso2 = isoList[i2];
          var free2 = freeMap[iso2];
          for (var f2 = 0; f2 < free2.length; f2++) {
            var gap = free2[f2];
            if (gap[1] - gap[0] >= dur) {
              var st2 = gap[0], en2 = st2 + dur;
              days[iso2].push({ id: uid(), refId: task.id, title: task.title, type: 'task', accent: task.priority === 3 ? 'red' : task.priority === 2 ? 'orange' : 'cyan', startMin: st2, endMin: en2, start: hhmm(st2), end: hhmm(en2) });
              if (gap[1] - en2 - 10 >= 20) free2[f2] = [en2 + 10, gap[1]];
              else free2.splice(f2, 1);
              placed = true; break;
            }
          }
        }
      }
      if (!placed) unplaced.push(task.title);
    });

    isoList.forEach(function (iso3) { days[iso3].sort(function (a, b) { return a.startMin - b.startMin; }); });
    s.timetable = { generatedAt: Date.now(), days: days, unplaced: unplaced };
    return s.timetable;
  }

  // "What matters most right now?" — ranked focus items for dashboard + assistant.
  function focusSuggestions(n) {
    var out = [];
    var t = todayISO();
    state.tasks.forEach(function (task) {
      if (task.done || !task.due) return;
      if (task.due < t) out.push({ score: 100 + task.priority * 5, emoji: '⚠️', accent: 'red', screen: 'app/tasks', text: '"' + task.title + '" is overdue (' + fmtDate(task.due) + ') — knock it out first.' });
      else if (task.due === t) out.push({ score: 80 + task.priority * 5, emoji: '📌', accent: 'orange', screen: 'app/tasks', text: '"' + task.title + '" is due today' + (task.priority === 3 ? ' and it’s high priority.' : '.') });
      else if (task.due === addDaysISO(t, 1) && task.priority === 3) out.push({ score: 55, emoji: '⏳', accent: 'yellow', screen: 'app/tasks', text: 'High-priority "' + task.title + '" is due tomorrow — get ahead of it.' });
    });
    if (state.timetable && state.timetable.days[t]) {
      var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      var next = state.timetable.days[t].filter(function (b) { return b.endMin > nowMin && !b.done; })[0];
      if (next) out.push({ score: 74, emoji: '🗓️', accent: 'purple', screen: 'app/schedule', text: (next.startMin <= nowMin ? 'Now on your timetable: ' : 'Next up at ' + fmtTime(next.start) + ': ') + next.title });
    }
    state.habits.forEach(function (h) {
      if (h.log[t]) return;
      var st = habitStreak(h);
      if (st >= 3) out.push({ score: 70 + Math.min(st, 20), emoji: '🔥', accent: 'orange', screen: 'app/habits', text: 'Don’t break your ' + st + '-day "' + h.title + '" streak — tick it today.' });
    });
    var fin = financeSummary();
    fin.overBudget.forEach(function (o) {
      out.push({ score: 65, emoji: '💸', accent: 'red', screen: 'app/finance', text: 'You’re over your ' + o.cat + ' budget (' + fmtMoney(o.spent) + ' of ' + fmtMoney(o.limit) + ') — ease off this week.' });
    });
    state.goals.forEach(function (g) {
      if (g.status === 'done') return;
      var next = g.milestones.filter(function (m) { return !m.done; })[0];
      if (next) out.push({ score: 50 + goalProgress(g) / 10, emoji: '🎯', accent: g.accent || 'blue', screen: 'app/goals', text: 'Next milestone for "' + g.title + '": ' + next.title });
    });
    if (!out.length) {
      if (!state.goals.length) out.push({ score: 40, emoji: '🎯', accent: 'cyan', screen: 'app/goals', text: 'Set your first goal — Acendri will break it into steps for you.' });
      out.push({ score: 30, emoji: '🌱', accent: 'green', screen: 'app/habits', text: 'All clear! A good moment to build a new habit or plan tomorrow.' });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, n || 5);
  }

  /* ---------------- demo data ---------------- */

  // Demo data is ADDITIVE: it never replaces anything the user already created.
  function loadDemo() {
    if (state.demoLoaded) { toast('Demo data is already loaded', '🧪'); return; }
    var t = todayISO();
    update(function (s) {
      s.demoLoaded = true;
      var g1m = ['Research training programs', 'Book weekly coaching sessions', 'Enter a local tournament', 'Film and review my technique', 'Reach top 4 in club ladder'].map(function (x, i) { return { id: uid(), title: x, done: i < 2 }; });
      var g2m = ['Set up a savings account', 'Auto-transfer $50 each week', 'Reach $500', 'Reach $1,000', 'Reach $2,000'].map(function (x, i) { return { id: uid(), title: x, done: i < 3 }; });
      var g3m = ['Pick study technique per subject', 'Weekly practice paper', 'Study group every Wednesday', 'Finish revision notes'].map(function (x, i) { return { id: uid(), title: x, done: i < 1 }; });
      s.goals = s.goals.concat([
        { id: uid(), title: 'Make the state tennis team', category: 'Sport', accent: 'green', why: 'I want to compete at the highest level I can.', targetDate: addDaysISO(t, 120), milestones: g1m, status: 'active', createdAt: Date.now() - 21 * 86400000 },
        { id: uid(), title: 'Save $2,000 emergency fund', category: 'Finance', accent: 'yellow', why: 'Freedom to handle surprises without stress.', targetDate: addDaysISO(t, 180), milestones: g2m, status: 'active', createdAt: Date.now() - 40 * 86400000 },
        { id: uid(), title: 'Get an A in Mathematics', category: 'Study', accent: 'blue', why: 'Keep my options open for university.', targetDate: addDaysISO(t, 90), milestones: g3m, status: 'active', createdAt: Date.now() - 10 * 86400000 }
      ]);
      s.tasks = s.tasks.concat([
        { id: uid(), title: 'Maths practice paper #4', priority: 3, due: t, duration: 60, done: false, createdAt: Date.now() - 3 * 86400000 },
        { id: uid(), title: 'Restring racquet', priority: 1, due: addDaysISO(t, 2), duration: 30, done: false, createdAt: Date.now() - 2 * 86400000 },
        { id: uid(), title: 'English essay draft', priority: 2, due: addDaysISO(t, 1), duration: 90, done: false, createdAt: Date.now() - 86400000 },
        { id: uid(), title: 'Review coach feedback video', priority: 2, due: addDaysISO(t, 3), duration: 40, done: false, createdAt: Date.now() - 86400000 },
        { id: uid(), title: 'Transfer $50 to savings', priority: 2, due: addDaysISO(t, 4), duration: 20, done: false, createdAt: Date.now() },
        { id: uid(), title: 'Science homework Ch. 7', priority: 3, due: addDaysISO(t, 2), duration: 45, done: false, createdAt: Date.now() },
        { id: uid(), title: 'Pack gym bag for tomorrow', priority: 1, due: t, duration: 20, done: true, doneAt: Date.now() - 3600000, createdAt: Date.now() - 86400000 },
        { id: uid(), title: 'Flashcards: French vocab', priority: 1, due: addDaysISO(t, 5), duration: 30, done: true, doneAt: Date.now() - 26 * 3600000, createdAt: Date.now() - 2 * 86400000 }
      ]);
      s.commitments = s.commitments.concat([
        { id: uid(), title: 'School', days: [1, 2, 3, 4, 5], start: '08:30', end: '15:10', accent: 'indigo' },
        { id: uid(), title: 'Tennis training', days: [2, 4], start: '16:30', end: '18:30', accent: 'green' },
        { id: uid(), title: 'Gym session', days: [1, 6], start: '07:00', end: '08:00', accent: 'orange' },
        { id: uid(), title: 'Family dinner', days: [0], start: '18:00', end: '19:30', accent: 'pink' }
      ]);
      var mkLog = function (rate, days) { var log = {}; for (var i = 1; i <= days; i++) { if (Math.random() < rate) log[addDaysISO(t, -i)] = true; } return log; };
      var solid = function (days) { var log = {}; for (var i = 1; i <= days; i++) log[addDaysISO(t, -i)] = true; return log; };
      s.habits = s.habits.concat([
        { id: uid(), title: 'Study 1 hour', emoji: '📚', accent: 'blue', targetPerWeek: 6, log: solid(9), createdAt: Date.now() - 30 * 86400000 },
        { id: uid(), title: 'Morning stretch', emoji: '🤸', accent: 'orange', targetPerWeek: 7, log: solid(4), createdAt: Date.now() - 20 * 86400000 },
        { id: uid(), title: 'Read 20 pages', emoji: '📖', accent: 'purple', targetPerWeek: 5, log: mkLog(0.6, 28), createdAt: Date.now() - 28 * 86400000 },
        { id: uid(), title: 'No sugary drinks', emoji: '🥤', accent: 'teal', targetPerWeek: 7, log: mkLog(0.8, 28), createdAt: Date.now() - 28 * 86400000 }
      ]);
      var ym = t.slice(0, 7);
      var lastMonth = addDaysISO(t, -32).slice(0, 7);
      s.finance.transactions = s.finance.transactions.concat([
          { id: uid(), type: 'income', amount: 220, category: 'Job', note: 'Part-time wages', date: addDaysISO(t, -2) },
          { id: uid(), type: 'income', amount: 40, category: 'Other', note: 'Sold old headset', date: addDaysISO(t, -5) },
          { id: uid(), type: 'expense', amount: 18.5, category: 'Food', note: 'Lunch out', date: addDaysISO(t, -1) },
          { id: uid(), type: 'expense', amount: 32, category: 'Sport', note: 'Tennis balls + grip', date: addDaysISO(t, -3) },
          { id: uid(), type: 'expense', amount: 12.99, category: 'Subscriptions', note: 'Music streaming', date: addDaysISO(t, -6) },
          { id: uid(), type: 'expense', amount: 45, category: 'Transport', note: 'Bus card top-up', date: addDaysISO(t, -8) },
          { id: uid(), type: 'expense', amount: 26, category: 'Fun', note: 'Movies with friends', date: addDaysISO(t, -9) },
          { id: uid(), type: 'income', amount: 220, category: 'Job', note: 'Part-time wages', date: lastMonth + '-15' },
          { id: uid(), type: 'expense', amount: 60, category: 'Food', note: 'Groceries', date: lastMonth + '-18' }
        ]);
      var demoBudgets = { Food: 120, Fun: 60, Subscriptions: 20, Sport: 80, Transport: 60 };
      Object.keys(demoBudgets).forEach(function (cat) {
        if (!(cat in s.finance.budgets)) s.finance.budgets[cat] = demoBudgets[cat];
      });
      s.finance.savingsGoals = s.finance.savingsGoals.concat([
        { id: uid(), title: 'Emergency fund', emoji: '🛟', target: 2000, saved: 620, accent: 'yellow' },
        { id: uid(), title: 'New racquet', emoji: '🎾', target: 350, saved: 180, accent: 'green' }
      ]);
      s.profile.xp = Math.max(s.profile.xp, 430);
      logActivity('Demo data loaded — explore every screen', '🧪');
      generateTimetable(s);
    });
    toast('Demo data loaded — Acendri is alive!', '🧪');
  }

  /* ---------------- toasts / modal / confetti ---------------- */

  var toastWrap = null;
  function toast(msg, emoji) {
    if (!toastWrap) { toastWrap = document.createElement('div'); toastWrap.className = 'toast-wrap'; document.body.appendChild(toastWrap); }
    var el = document.createElement('div');
    el.className = 'toast acc-cyan';
    el.innerHTML = '<span>' + esc(emoji || '✨') + '</span><span>' + esc(msg) + '</span>';
    toastWrap.appendChild(el);
    while (toastWrap.children.length > 3) toastWrap.removeChild(toastWrap.firstChild);
    setTimeout(function () { el.classList.add('leaving'); setTimeout(function () { el.remove(); }, 350); }, 2600);
  }

  var openModals = [];
  function modal(opts) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    var m = document.createElement('div');
    m.className = 'modal ' + (opts.accent ? 'acc-' + opts.accent : 'acc-cyan') + (opts.wide ? ' wide' : '');
    var actionsHTML = '';
    if (opts.actions && opts.actions.length) {
      actionsHTML = '<div class="modal-actions">' + opts.actions.map(function (a, i) {
        return '<button class="btn ' + (a.cls || '') + '" data-act="' + i + '">' + a.label + '</button>';
      }).join('') + '</div>';
    }
    m.innerHTML =
      '<div class="modal-head"><h3>' + (opts.title || '') + '</h3>' +
      '<button class="icon-btn" data-close="1" aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' + actionsHTML;
    back.appendChild(m);
    document.body.appendChild(back);
    function close() {
      back.remove();
      var ix = openModals.indexOf(handle); if (ix >= 0) openModals.splice(ix, 1);
      if (opts.onClose) opts.onClose();
    }
    var handle = { close: close, el: m };
    openModals.push(handle);
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    m.querySelector('[data-close]').addEventListener('click', close);
    if (opts.actions) {
      m.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var a = opts.actions[+btn.getAttribute('data-act')];
          var keep = a.onClick ? a.onClick(m) : undefined;
          if (keep !== false) close(); // return false from onClick to keep modal open (e.g. validation)
        });
      });
    }
    if (opts.onOpen) opts.onOpen(m, close);
    var f = m.querySelector('input, textarea, select');
    if (f) setTimeout(function () { f.focus(); }, 60);
    return handle;
  }

  function confirmDlg(msg, onYes, opts) {
    opts = opts || {};
    modal({
      title: opts.title || 'Are you sure?', accent: opts.accent || 'red',
      body: '<p class="muted">' + esc(msg) + '</p>',
      actions: [
        { label: opts.cancelLabel || 'Cancel', cls: 'btn-ghost' },
        { label: opts.yesLabel || 'Yes, do it', cls: opts.danger === false ? 'btn-primary' : 'btn-danger', onClick: function () { onYes(); } }
      ]
    });
  }

  function confetti() {
    var colors = ['#22d3ee', '#c084fc', '#60a5fa', '#4ade80', '#fb923c', '#f472b6', '#facc15'];
    for (var i = 0; i < 90; i++) {
      var b = document.createElement('div');
      b.className = 'confetti-bit';
      var sz = 5 + Math.random() * 6;
      b.style.cssText = 'left:' + (Math.random() * 100) + 'vw;width:' + sz + 'px;height:' + (sz * 0.6) + 'px;background:' +
        colors[i % colors.length] + ';animation-duration:' + (1.6 + Math.random() * 1.6) + 's;animation-delay:' + (Math.random() * 0.5) + 's;';
      document.body.appendChild(b);
      (function (bit) { setTimeout(function () { bit.remove(); }, 4000); })(b);
    }
  }

  /* ---------------- router & shell ---------------- */

  var screens = {};   // id -> def
  var navOrder = [];

  function registerScreen(id, def) {
    screens[id] = def;
    if (def.inShell) navOrder.push(id);
  }

  function currentRoute() {
    var h = location.hash.replace(/^#\/?/, '');
    if (!h) return state.profile.onboarded ? 'app/dashboard' : 'landing';
    if (!screens[h]) return state.profile.onboarded ? 'app/dashboard' : 'landing';
    if (h.indexOf('app/') === 0 && !state.profile.onboarded) return 'landing';
    return h;
  }

  function nav(path) {
    var target = '#/' + path;
    if (location.hash === target) render();
    else location.hash = target;
  }

  var root = null;
  var sidebarOpen = false;

  function render() {
    if (!root) return;
    openModals.slice().forEach(function (m) { /* keep modals open across re-render */ });
    var id = currentRoute();
    var def = screens[id];
    if (!def) { root.innerHTML = '<div class="screen"><div class="empty">Screen not found.</div></div>'; return; }

    if (!def.inShell) {
      root.innerHTML = '';
      var host = document.createElement('div');
      root.appendChild(host);
      def.render(host, ctx());
      window.scrollTo(0, 0);
      return;
    }

    // app shell
    root.innerHTML = '';
    var shell = document.createElement('div');
    shell.className = 'app-shell';

    var lp = levelProgress(state.profile.xp);
    var side = document.createElement('aside');
    side.className = 'sidebar' + (sidebarOpen ? ' open' : '');
    side.innerHTML =
      '<button class="logo h-grad" data-nav="app/dashboard">Acendri OS</button>' +
      navOrder.map(function (sid) {
        var d = screens[sid];
        return '<button class="nav-item acc-' + d.accent + (sid === id ? ' active' : '') + '" data-nav="' + sid + '">' +
          icon(d.icon) + '<span>' + esc(d.title) + '</span></button>';
      }).join('') +
      '<div class="side-foot">Your life, connected.<br>All data stays in this browser.</div>';

    var main = document.createElement('div');
    main.className = 'main';
    var top = document.createElement('div');
    top.className = 'topbar';
    top.innerHTML =
      '<button class="icon-btn hamburger" data-burger="1" aria-label="Menu">' + icon('menu') + '</button>' +
      '<div class="tb-title">' + esc(def.title) + '</div>' +
      '<div class="tb-spacer"></div>' +
      '<button class="icon-btn" data-bell="1" aria-label="Activity" title="Recent activity">' + icon('bell') + '</button>' +
      '<button class="xp-chip acc-cyan" data-nav="app/achievements" title="' + state.profile.xp + ' XP — ' + esc(levelTitle(lp.level)) + '">' +
      '<span class="lvl">LV ' + lp.level + '</span>' +
      '<span class="bar"><span class="bar-fill" style="width:' + lp.pct + '%"></span></span>' +
      '<span class="muted">' + state.profile.xp + ' XP</span></button>';

    var screenEl = document.createElement('div');
    screenEl.className = 'screen';

    main.appendChild(top);
    main.appendChild(screenEl);
    shell.appendChild(side);
    shell.appendChild(main);
    root.appendChild(shell);

    if (sidebarOpen) {
      var bd = document.createElement('div');
      bd.className = 'sidebar-backdrop';
      bd.addEventListener('click', function () { sidebarOpen = false; render(); });
      shell.appendChild(bd);
    }

    shell.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () { sidebarOpen = false; nav(b.getAttribute('data-nav')); });
    });
    top.querySelector('[data-burger]').addEventListener('click', function () { sidebarOpen = !sidebarOpen; render(); });
    top.querySelector('[data-bell]').addEventListener('click', showActivity);

    def.render(screenEl, ctx());
  }

  function showActivity() {
    var items = state.activityLog.slice(0, 10);
    modal({
      title: '🔔 Recent activity', accent: 'purple',
      body: items.length
        ? '<div class="list">' + items.map(function (a) {
            return '<div class="list-item"><span style="font-size:1.1rem">' + esc(a.emoji) + '</span><div class="li-main"><div class="li-title" style="font-weight:500;font-size:.88rem">' + esc(a.text) + '</div><div class="li-sub">' + timeAgo(a.ts) + (a.xp ? ' · +' + a.xp + ' XP' : '') + '</div></div></div>';
          }).join('') + '</div>'
        : '<div class="empty"><div class="e-emoji">🌙</div><p>Nothing yet — everything you do in Acendri shows up here.</p></div>'
    });
  }

  function ctx() {
    return { nav: nav, S: S, ui: UI, engine: ENGINE };
  }

  /* ---------------- public API ---------------- */

  var S = {
    get: function () { return state; },
    update: update,
    addXp: addXp,
    log: function (text, emoji) { update(function () { logActivity(text, emoji); }, { silent: true }); },
    loadDemo: loadDemo,
    reset: resetAll,
    exportJSON: exportJSON,
    importJSON: importJSON
  };

  var UI = {
    esc: esc, uid: uid, icon: icon,
    todayISO: todayISO, addDaysISO: addDaysISO, dateISO: dateISO, monthISO: monthISO,
    fmtDate: fmtDate, fmtMoney: fmtMoney, fmtTime: fmtTime, timeAgo: timeAgo,
    minutes: minutes, hhmm: hhmm,
    DAY_NAMES: DAY_NAMES, MONTHS: MONTHS,
    ACCENTS: ACCENTS, ACCENT_NAMES: ACCENT_NAMES,
    toast: toast, modal: modal, confirm: confirmDlg, confetti: confetti,
    levelFor: levelFor, levelTitle: levelTitle, levelProgress: levelProgress
  };

  var ENGINE = {
    generateTimetable: generateTimetable,
    focusSuggestions: focusSuggestions,
    financeSummary: financeSummary,
    habitStreak: habitStreak,
    habitWeekCount: habitWeekCount,
    goalProgress: goalProgress,
    ACHIEVEMENTS: ACHIEVEMENTS
  };

  window.Ascendri = {
    registerScreen: registerScreen,
    nav: nav,
    S: S,
    ui: UI,
    engine: ENGINE,
    boot: function () {
      load();
      root = document.getElementById('root');
      window.addEventListener('hashchange', render);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && openModals.length) openModals[openModals.length - 1].close();
      });
      render();
    }
  };
})();
