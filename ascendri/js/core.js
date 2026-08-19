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
    shield: '<path d="M12 2.5l8 3v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10v-6l8-3z"/><polyline points="8.7 12 11.2 14.5 15.5 9.5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
    pause: '<path d="M8 4.5v15M16 4.5v15"/>',
    play: '<polygon points="7 4 20 12 7 20"/>'
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
      reminders: [],             // { id, text, due:'YYYY-MM-DD'|null, done, createdAt }
      events: [],                // one-off dated blocks: { id, title, date:'YYYY-MM-DD', start, end, accent }
      learning: { subjects: [], exams: [] },  // subjects:[{id,title,emoji,accent}] exams:[{id,title,subjectId|null,date,planBuilt?}]
      focus: { sessions: 0, minutes: 0, log: [] },  // log: [{ts,taskId,title,minutes}]
      priorityOrder: [],         // manual ordering of today's priorities (task ids)
      perfectDays: {},           // 'YYYY-MM-DD': true — every priority + habit done
      flags: {},                 // one-shot markers (aiPlanBuilt, ...)
      lastWeekReview: null,      // written by settleTimetableWeek
      activityLog: [],           // { ts, text, emoji, xp }
      assistant: { history: [] },
      social: seedSocial(),
      settings: {
        wake: '07:00', sleep: '22:30', currency: '$', autoPost: true, notifications: true,
        autoReschedule: false,           // AI may move unfinished tasks without asking
        notifyStartSoon: true, notifyDaily: true, notifyReview: true,
        privacyProfile: 'friends', privacySocial: true
      }
    };
  }

  // Older saved states pick up any keys added since they were written.
  function migrate(s) {
    var fresh = initialState();
    ['events', 'priorityOrder', 'perfectDays', 'flags', 'reminders'].forEach(function (k) {
      if (s[k] == null) s[k] = fresh[k];
    });
    if (!s.learning || !s.learning.subjects) s.learning = fresh.learning;
    if (!s.focus || typeof s.focus.sessions !== 'number') s.focus = fresh.focus;
    if (s.lastWeekReview === undefined) s.lastWeekReview = null;
    Object.keys(fresh.settings).forEach(function (k) {
      if (s.settings[k] === undefined) s.settings[k] = fresh.settings[k];
    });
    return s;
  }

  /* ---------------- store ---------------- */

  var state = null;
  var renderScheduled = false;

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.version === 1) {
          state = migrate(s);
          maintainHabits(state);
          settleTimetableWeek(state);
          save();
          return;
        }
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
    syncMilestones(state);
    checkPerfectDay(state);
    settleTimetableWeek(state);
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
    { id: 'level-10', title: 'Ascendant', desc: 'Reach Level 10.', emoji: '🌌', accent: 'purple', xp: 0, test: function (s) { return levelFor(s.profile.xp) >= 10; } },
    { id: 'first-focus', title: 'Deep Work', desc: 'Finish your first Focus session.', emoji: '🎧', accent: 'cyan', xp: 20, test: function (s) { return (s.focus && s.focus.sessions) >= 1; } },
    { id: 'focus-10', title: 'In the Zone', desc: 'Finish 10 Focus sessions.', emoji: '🧘', accent: 'indigo', xp: 60, test: function (s) { return (s.focus && s.focus.sessions) >= 10; } },
    { id: 'first-review', title: 'Reflector', desc: 'Read your first Weekly Review.', emoji: '🪞', accent: 'purple', xp: 25, test: function (s) { return !!(s.lastWeekReview && s.lastWeekReview.seen); } },
    { id: 'perfect-day', title: 'Perfect Day', desc: 'Complete every priority and every habit in one day.', emoji: '🌟', accent: 'yellow', xp: 50, test: function (s) { return Object.keys(s.perfectDays || {}).length >= 1; } },
    { id: 'scholar', title: 'Scholar', desc: 'Build your first revision plan.', emoji: '📚', accent: 'blue', xp: 20, test: function (s) { return (s.learning.exams || []).some(function (e) { return e.planBuilt; }); } },
    { id: 'ai-architect', title: 'AI Architect', desc: 'Have Acendri build a full plan — goal, steps, habits and week in one go.', emoji: '🤖', accent: 'cyan', xp: 30, test: function (s) { return !!(s.flags && s.flags.aiPlanBuilt); } }
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

  function daysSinceLastTick(h) {
    var dates = Object.keys(h.log || {});
    var last = null;
    dates.forEach(function (d) { if (h.log[d] && (!last || d > last)) last = d; });
    if (!last) {
      var created = dateISO(new Date(h.createdAt || Date.now()));
      last = created;
    }
    var t = todayISO(); var days = 0; var cur = last;
    while (cur < t && days < 999) { cur = addDaysISO(cur, 1); days++; }
    return days;
  }

  var HABIT_FADE_DAYS = 14;   // untouched this long -> habit fades to the archive

  function maintainHabits(s) {
    s.habits.forEach(function (h) {
      if (h.archived) return;
      if (daysSinceLastTick(h) >= HABIT_FADE_DAYS) {
        h.archived = true;
        h.archivedAt = Date.now();
        logActivity('Habit faded away after ' + HABIT_FADE_DAYS + ' quiet days: ' + h.title, '🍂');
        pendingToasts.push({ msg: '"' + h.title + '" faded to the archive — restore it any time', emoji: '🍂' });
      }
    });
  }

  // XP for a planned week is earned by DOING it: when the week ends, award
  // XP for the task blocks that were completed. Nothing for planning alone.
  function settleTimetableWeek(s) {
    var tt = s.timetable;
    if (!tt || tt.settled || !tt.days) return;
    var isoList = Object.keys(tt.days).sort();
    if (!isoList.length || todayISO() <= isoList[isoList.length - 1]) return; // week still running
    var total = 0, done = 0;
    isoList.forEach(function (iso) {
      tt.days[iso].forEach(function (b) {
        if (b.type !== 'task') return;
        total++;
        if (b.done) done++;
      });
    });
    tt.settled = true;
    var snap = snapshotWeek(tt);
    if (snap) s.lastWeekPlan = snap;   // offered as "keep the same as last week"

    // the week's story, kept for the Weekly Review screen
    var wStart = tt.weekStart || isoList[0];
    var wEnd = isoList[isoList.length - 1];
    var p0 = wStart.split('-');
    var startTs = new Date(+p0[0], +p0[1] - 1, +p0[2]).getTime();
    var endTs = startTs + WEEK_DAYS * 86400000;
    var tasksDone = s.tasks.filter(function (t) { return t.done && t.doneAt >= startTs && t.doneAt < endTs; });
    var habitTicks = 0;
    s.habits.forEach(function (h) {
      Object.keys(h.log || {}).forEach(function (d) { if (h.log[d] && d >= wStart && d <= wEnd) habitTicks++; });
    });
    var xpEarned = 0;
    s.activityLog.forEach(function (a) { if (a.ts >= startTs && a.ts < endTs && a.xp) xpEarned += a.xp; });
    var achUnlocked = Object.keys(s.achievements).filter(function (id) {
      return s.achievements[id] >= startTs && s.achievements[id] < endTs;
    });
    var focusSessions = ((s.focus && s.focus.log) || []).filter(function (f) { return f.ts >= startTs && f.ts < endTs; }).length;
    var goalMoves = [];
    s.goals.forEach(function (g) {
      var moved = (g.milestones || []).some(function (m) { return m.done; }) &&
        s.tasks.some(function (t) { return t.goalId === g.id && t.done && t.doneAt >= startTs && t.doneAt < endTs; });
      if (moved || (g.completedAt && g.completedAt >= startTs && g.completedAt < endTs)) goalMoves.push(g.title);
    });
    s.lastWeekReview = {
      weekStart: wStart, weekEnd: wEnd, generatedAt: Date.now(), seen: false,
      blocksDone: done, blocksTotal: total,
      tasksDone: tasksDone.length, habitTicks: habitTicks, focusSessions: focusSessions,
      xpEarned: xpEarned, achievements: achUnlocked, goalsMoved: goalMoves,
      unfinished: s.tasks.filter(function (t) { return !t.done && t.createdAt < endTs; }).slice(0, 8).map(function (t) { return t.title; })
    };
    if (!total) return;
    var ratio = done / total;
    var xp = done * 4 + (ratio >= 0.8 ? 30 : 0);
    if (xp > 0) {
      s.profile.xp += xp;
      logActivity('Week complete: ' + done + '/' + total + ' planned blocks done', '🗓️');
      pendingToasts.push({ msg: 'Week wrapped: ' + done + '/' + total + ' blocks done — +' + xp + ' XP' + (ratio >= 0.8 ? ' (consistency bonus!)' : ''), emoji: '🗓️' });
    } else {
      logActivity('Week ended with no planned blocks completed', '🗓️');
      pendingToasts.push({ msg: 'Last week’s plan went unfinished — regenerate and try a lighter one', emoji: '🌱' });
    }
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
  var WEEK_DAYS = 7;

  function dayOfWeek(iso) {
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).getDay();
  }

  function bounds(s) {
    var wake = minutes(s.settings.wake), sleep = minutes(s.settings.sleep);
    if (sleep <= wake) sleep = wake + 8 * 60;
    return { wake: wake, sleep: sleep };
  }

  function planWindow(s) {
    var start = (s.timetable && s.timetable.weekStart) || todayISO();
    var list = [];
    for (var i = 0; i < WEEK_DAYS; i++) list.push(addDaysISO(start, i));
    return list;
  }

  // Open stretches of a day that new work can go into — never in the past,
  // never overlapping what is already on the grid.
  function freeGapsFor(s, iso, blocks) {
    var t = todayISO();
    if (iso < t) return [];
    var b = bounds(s);
    var cur = b.wake;
    if (iso === t) {
      var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      cur = Math.max(b.wake, Math.ceil(nowMin / 30) * 30);
    }
    var free = [];
    blocks.slice().sort(function (x, y) { return x.startMin - y.startMin; }).forEach(function (blk) {
      if (blk.startMin > cur) free.push([cur, Math.min(blk.startMin, b.sleep)]);
      cur = Math.max(cur, blk.endMin);
    });
    if (cur < b.sleep) free.push([cur, b.sleep]);
    return free.filter(function (f) { return f[1] - f[0] >= 20; });
  }

  function taskBlock(task, startMin, endMin) {
    return {
      id: uid(), refId: task.id, title: task.title, type: 'task',
      accent: task.priority === 3 ? 'red' : task.priority === 2 ? 'orange' : 'cyan',
      startMin: startMin, endMin: endMin, start: hhmm(startMin), end: hhmm(endMin)
    };
  }

  // Fits tasks into the free space of `days`. `prefer` optionally maps a task id
  // to { dow, startMin } — the slot it held last week, tried before anything else.
  function placeTasks(s, days, isoList, tasks, prefer) {
    var freeMap = {};
    isoList.forEach(function (iso) { freeMap[iso] = freeGapsFor(s, iso, days[iso] || []); });

    function consume(iso, gapIx, startMin, endMin) {
      var gaps = freeMap[iso], gap = gaps[gapIx];
      var rest = [];
      if (startMin - gap[0] >= 20) rest.push([gap[0], startMin]);
      if (gap[1] - endMin - 10 >= 20) rest.push([endMin + 10, gap[1]]);
      gaps.splice.apply(gaps, [gapIx, 1].concat(rest));
    }

    var sorted = tasks.slice().sort(function (a, b) {
      var da = a.due || '9999-12-31', db = b.due || '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;
      if ((a.priority || 1) !== (b.priority || 1)) return (b.priority || 1) - (a.priority || 1);
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    var unplaced = [];
    sorted.forEach(function (task) {
      var dur = Math.max(20, task.duration || 45);
      var placed = false;

      // 1. the slot this activity held last week, if it is still free
      var want = prefer && prefer[task.id];
      if (want) {
        for (var w = 0; w < isoList.length && !placed; w++) {
          var wIso = isoList[w];
          if (dayOfWeek(wIso) !== want.dow) continue;
          var wGaps = freeMap[wIso];
          for (var g = 0; g < wGaps.length; g++) {
            if (want.startMin >= wGaps[g][0] && want.startMin + dur <= wGaps[g][1]) {
              days[wIso].push(taskBlock(task, want.startMin, want.startMin + dur));
              consume(wIso, g, want.startMin, want.startMin + dur);
              placed = true; break;
            }
          }
        }
      }

      // 2. earliest gap before the due date, then anywhere in the window
      var lastIdx = isoList.length - 1;
      if (task.due && isoList.indexOf(task.due) >= 0) lastIdx = isoList.indexOf(task.due);
      for (var round = 0; round < 2 && !placed; round++) {
        var maxI = round === 0 ? lastIdx : isoList.length - 1;
        for (var i = 0; i <= maxI && !placed; i++) {
          var iso = isoList[i], gaps = freeMap[iso];
          for (var f = 0; f < gaps.length; f++) {
            if (gaps[f][1] - gaps[f][0] >= dur) {
              var st = gaps[f][0];
              days[iso].push(taskBlock(task, st, st + dur));
              consume(iso, f, st, st + dur);
              placed = true; break;
            }
          }
        }
      }
      if (!placed) unplaced.push(task.title);
    });

    isoList.forEach(function (iso) {
      (days[iso] || []).sort(function (a, b) { return a.startMin - b.startMin; });
    });
    return unplaced;
  }

  function commitmentDays(s, isoList) {
    var days = {};
    isoList.forEach(function (iso) {
      var dow = dayOfWeek(iso);
      var blocks = [];
      (s.commitments || []).forEach(function (c) {
        if ((c.days || []).indexOf(dow) === -1) return;
        var st = minutes(c.start), en = minutes(c.end);
        if (en <= st) return;
        blocks.push({ id: uid(), refId: c.id, title: c.title, type: 'commitment', accent: c.accent || 'indigo', startMin: st, endMin: en, start: hhmm(st), end: hhmm(en) });
      });
      (s.events || []).forEach(function (ev) {
        if (ev.date !== iso) return;
        var st = minutes(ev.start), en = minutes(ev.end);
        if (en <= st) return;
        blocks.push({ id: uid(), refId: ev.id, title: ev.title, type: 'event', accent: ev.accent || 'pink', startMin: st, endMin: en, start: hhmm(st), end: hhmm(en) });
      });
      blocks.sort(function (a, b) { return a.startMin - b.startMin; });
      days[iso] = blocks;
    });
    return days;
  }

  // A fresh plan for the week starting today. Locks for WEEK_DAYS days.
  function generateTimetable(s, prefer) {
    s = s || state;
    var t0 = todayISO();
    var isoList = [];
    for (var i = 0; i < WEEK_DAYS; i++) isoList.push(addDaysISO(t0, i));
    var days = commitmentDays(s, isoList);
    var open = (s.tasks || []).filter(function (t) { return !t.done; });
    var unplaced = placeTasks(s, days, isoList, open, prefer);
    s.timetable = {
      generatedAt: Date.now(), weekStart: t0, lockedUntil: addDaysISO(t0, WEEK_DAYS),
      settled: false, days: days, unplaced: unplaced
    };
    return s.timetable;
  }

  // Slots extra tasks into the plan already on the grid, leaving it otherwise intact.
  function addTasksToTimetable(s, taskIds) {
    s = s || state;
    var tt = s.timetable;
    if (!tt || !tt.days) return { placed: 0, unplaced: [] };
    var wanted = {};
    (taskIds || []).forEach(function (id) { wanted[id] = true; });
    var tasks = (s.tasks || []).filter(function (t) { return !t.done && wanted[t.id]; });
    var isoList = planWindow(s);
    isoList.forEach(function (iso) { if (!tt.days[iso]) tt.days[iso] = []; });
    var unplaced = placeTasks(s, tt.days, isoList, tasks);
    tt.unplaced = (tt.unplaced || []).concat(unplaced);
    tt.generatedAt = Date.now();
    return { placed: tasks.length - unplaced.length, unplaced: unplaced };
  }

  // Is this week's plan settled in? A locked plan cannot be regenerated over.
  function weekLock(s) {
    s = s || state;
    var tt = s.timetable;
    if (!tt || !tt.lockedUntil) return { locked: false, unlocksOn: null, daysLeft: 0 };
    var t = todayISO();
    if (t >= tt.lockedUntil) return { locked: false, unlocksOn: tt.lockedUntil, daysLeft: 0 };
    var days = 0, cur = t;
    while (cur < tt.lockedUntil && days < 60) { cur = addDaysISO(cur, 1); days++; }
    return { locked: true, unlocksOn: tt.lockedUntil, daysLeft: days };
  }

  // The shape of a finished week, kept so the next one can repeat it.
  function snapshotWeek(tt) {
    var items = [];
    Object.keys(tt.days || {}).forEach(function (iso) {
      tt.days[iso].forEach(function (b) {
        if (b.type !== 'task') return;
        items.push({
          title: String(b.title || '').replace(/\s*\(\d+\/\d+\)\s*$/, ''),
          dow: dayOfWeek(iso), startMin: b.startMin,
          duration: Math.max(20, b.endMin - b.startMin), accent: b.accent || 'cyan'
        });
      });
    });
    return items.length ? { weekStart: tt.weekStart || null, savedAt: Date.now(), items: items } : null;
  }

  // Re-places every unfinished task around the fixed blocks and everything
  // already completed. Done blocks stay exactly where they are; nothing is
  // duplicated; the week's start and lock are untouched.
  function rebuildWeek(s) {
    s = s || state;
    var tt = s.timetable;
    if (!tt || !tt.days) return null;
    var isoList = planWindow(s);
    var taskDone = {};
    (s.tasks || []).forEach(function (t) { if (t.done) taskDone[t.id] = true; });
    var fixed = commitmentDays(s, isoList);
    isoList.forEach(function (iso) {
      var keep = (tt.days[iso] || []).filter(function (b) {
        return b.type === 'task' && (b.done || taskDone[b.refId]);
      });
      tt.days[iso] = fixed[iso].concat(keep);
      tt.days[iso].sort(function (a, b) { return a.startMin - b.startMin; });
    });
    var open = (s.tasks || []).filter(function (t) { return !t.done; });
    tt.unplaced = placeTasks(s, tt.days, isoList, open);
    tt.generatedAt = Date.now();
    return tt;
  }

  // Rebuild this week from the shape of the last one — same activities, same slots.
  function repeatLastWeek(s) {
    s = s || state;
    var lw = s.lastWeekPlan;
    if (!lw || !lw.items || !lw.items.length) return null;
    var now = Date.now();
    var t0 = todayISO();
    var prefer = {};
    lw.items.forEach(function (item, ix) {
      var id = uid();
      var offset = (item.dow - dayOfWeek(t0) + 7) % 7;
      s.tasks.push({
        id: id, title: item.title, priority: 2, due: addDaysISO(t0, offset),
        duration: item.duration, done: false, createdAt: now + ix
      });
      prefer[id] = { dow: item.dow, startMin: item.startMin };
    });
    return generateTimetable(s, prefer);
  }

  /* ---------------- the connected day ---------------- */

  function startOfTodayTs() {
    var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }

  // Today's priorities: open tasks that matter today, in the user's own order
  // first (priorityOrder), then by urgency.
  function priorities(n) {
    var t = todayISO();
    var scheduledToday = {};
    if (state.timetable && state.timetable.days && state.timetable.days[t]) {
      state.timetable.days[t].forEach(function (b) { if (b.type === 'task') scheduledToday[b.refId] = true; });
    }
    var cand = state.tasks.filter(function (task) {
      if (task.done) return false;
      return (task.due && task.due <= t) || scheduledToday[task.id] || task.priority === 3;
    });
    cand.sort(function (a, b) {
      var oa = state.priorityOrder.indexOf(a.id), ob = state.priorityOrder.indexOf(b.id);
      if (oa !== -1 || ob !== -1) {
        if (oa === -1) return 1;
        if (ob === -1) return -1;
        return oa - ob;
      }
      var da = a.due || '9999', db = b.due || '9999';
      if (da !== db) return da < db ? -1 : 1;
      if ((a.priority || 1) !== (b.priority || 1)) return (b.priority || 1) - (a.priority || 1);
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    return cand.slice(0, n || 3);
  }

  function todayStats() {
    var t = todayISO();
    var t0 = startOfTodayTs();
    var pri = priorities(6);
    var doneToday = state.tasks.filter(function (x) { return x.done && (x.doneAt || 0) >= t0; }).length;
    var habits = state.habits.filter(function (h) { return !h.archived; });
    var habitsDone = habits.filter(function (h) { return h.log && h.log[t]; }).length;
    var xpToday = 0;
    state.activityLog.forEach(function (a) { if (a.ts >= t0 && a.xp) xpToday += a.xp; });
    var focusToday = (state.focus && state.focus.log || []).filter(function (f) { return f.ts >= t0; }).length;
    return {
      priorities: pri, tasksDone: doneToday, tasksOpen: pri.length,
      habitsDone: habitsDone, habitsTotal: habits.length,
      xpToday: xpToday, focusToday: focusToday
    };
  }

  // The current / next thing on today's timetable.
  function nextBlock() {
    var t = todayISO();
    if (!state.timetable || !state.timetable.days || !state.timetable.days[t]) return null;
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    var blocks = state.timetable.days[t].filter(function (b) { return !b.done && b.endMin > nowMin; });
    if (!blocks.length) return null;
    var b = blocks[0];
    return {
      block: b, iso: t,
      now: b.startMin <= nowMin,
      inMinutes: Math.max(0, b.startMin - nowMin)
    };
  }

  // Everything hanging off a goal: its tasks, habits and this week's sessions.
  function goalLinks(g) {
    var tasks = state.tasks.filter(function (t) { return t.goalId === g.id; });
    var habits = state.habits.filter(function (h) { return h.goalId === g.id && !h.archived; });
    var byId = {}; tasks.forEach(function (t) { byId[t.id] = true; });
    var sessions = [];
    if (state.timetable && state.timetable.days) {
      Object.keys(state.timetable.days).forEach(function (iso) {
        state.timetable.days[iso].forEach(function (b) {
          if (b.type === 'task' && byId[b.refId]) sessions.push({ iso: iso, block: b });
        });
      });
    }
    return { tasks: tasks, habits: habits, sessions: sessions };
  }

  // Milestones with linked tasks complete themselves when their last task does.
  function syncMilestones(s) {
    var byMilestone = {};
    s.tasks.forEach(function (t) {
      if (!t.milestoneId) return;
      (byMilestone[t.milestoneId] = byMilestone[t.milestoneId] || []).push(t);
    });
    s.goals.forEach(function (g) {
      if (g.status === 'done') return;
      (g.milestones || []).forEach(function (m) {
        if (m.done) return;
        var linked = byMilestone[m.id];
        if (!linked || !linked.length) return;
        if (linked.every(function (t) { return t.done; })) {
          m.done = true;
          // each milestone pays out exactly once, however many times it is re-ticked
          if (!m.xpAwarded) {
            m.xpAwarded = true;
            s.profile.xp += 25;
            logActivity('Milestone complete: ' + m.title + ' (' + g.title + ')', '🏁');
            pendingToasts.push({ msg: 'Milestone complete: ' + m.title + '  (+25 XP)', emoji: '🏁' });
          }
        }
      });
    });
  }

  // A perfect day = every priority ticked and every habit ticked.
  function checkPerfectDay(s) {
    var t = todayISO();
    if (s.perfectDays[t]) return;
    var habits = s.habits.filter(function (h) { return !h.archived; });
    if (!habits.length || !habits.every(function (h) { return h.log && h.log[t]; })) return;
    var due = s.tasks.filter(function (x) { return !x.done && x.due && x.due <= t; });
    var doneToday = s.tasks.filter(function (x) { return x.done && (x.doneAt || 0) >= startOfTodayTs(); }).length;
    if (due.length === 0 && doneToday > 0) {
      s.perfectDays[t] = true;
      logActivity('Perfect day — every priority and habit done', '🌟');
      pendingToasts.push({ msg: 'Perfect day! Everything that mattered got done 🌟', emoji: '🌟' });
    }
  }

  // Spread revision for an exam across the days before it — never one cram day.
  function buildRevisionPlan(s, examId) {
    var exam = (s.learning.exams || []).filter(function (e) { return e.id === examId; })[0];
    if (!exam || !exam.date) return null;
    var t = todayISO();
    if (exam.date <= t) return { created: 0, reason: 'past' };
    var daysUntil = 0; var cur = t;
    while (cur < exam.date && daysUntil < 30) { cur = addDaysISO(cur, 1); daysUntil++; }
    var sessions = Math.max(2, Math.min(6, daysUntil - 0));
    var subject = (s.learning.subjects || []).filter(function (x) { return x.id === exam.subjectId; })[0];
    var label = subject ? subject.title : exam.title;
    var goal = s.goals.filter(function (g) { return g.status === 'active' && g.category === 'Study'; })[0];
    var ids = [];
    var now = Date.now();
    for (var i = 0; i < sessions; i++) {
      // last session lands the day before the exam, the rest spread back from there
      var offset = Math.max(1, daysUntil - 1 - Math.floor(i * (daysUntil - 1) / sessions));
      var id = uid();
      ids.push(id);
      s.tasks.push({
        id: id, title: 'Revise ' + label + ' (' + (sessions - i) + '/' + sessions + ')',
        priority: i === 0 ? 3 : 2, due: addDaysISO(exam.date, -offset), duration: 45,
        done: false, goalId: goal ? goal.id : undefined, createdAt: now + i
      });
    }
    exam.planBuilt = true;
    s.reminders.push({ id: uid(), text: exam.title + ' — exam day! You’ve prepared for this', due: exam.date, done: false, createdAt: now });
    var placed = 0;
    if (s.timetable) placed = addTasksToTimetable(s, ids).placed;
    else { generateTimetable(s); placed = ids.length - (s.timetable.unplaced || []).length; }
    logActivity('Revision plan built for ' + exam.title, '📚');
    return { created: sessions, placed: placed, examDate: exam.date };
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
    (state.reminders || []).forEach(function (r) {
      if (r.done) return;
      if (r.due && r.due < t) out.push({ score: 95, emoji: '⏰', accent: 'red', screen: 'app/dashboard', text: 'Reminder overdue: ' + r.text });
      else if (r.due === t) out.push({ score: 85, emoji: '⏰', accent: 'yellow', screen: 'app/dashboard', text: 'Reminder for today: ' + r.text });
    });
    state.habits.forEach(function (h) {
      if (h.archived || h.log[t]) return;
      var st = habitStreak(h);
      if (st >= 3) { out.push({ score: 70 + Math.min(st, 20), emoji: '🔥', accent: 'orange', screen: 'app/habits', text: 'Don’t break your ' + st + '-day "' + h.title + '" streak — tick it today.' }); return; }
      var missed = daysSinceLastTick(h);
      if (missed >= HABIT_FADE_DAYS - 4) out.push({ score: 72, emoji: '🍂', accent: 'red', screen: 'app/habits', text: '"' + h.title + '" has been quiet for ' + missed + ' days — it fades away at ' + HABIT_FADE_DAYS + '. One tick saves it.' });
      else if (missed >= 2) out.push({ score: 58 + missed, emoji: '⏰', accent: 'yellow', screen: 'app/habits', text: 'You’ve missed "' + h.title + '" ' + missed + ' days running — get back on it today.' });
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
      // a plan you didn't make shouldn't lock you out of planning — demo weeks stay open
      s.timetable.lockedUntil = todayISO();
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
    if (def.inShell && !def.hideNav) navOrder.push(id);
  }

  /* ---------------- global search ---------------- */

  function searchAll(q) {
    q = q.toLowerCase().trim();
    if (q.length < 2) return [];
    var out = [];
    function hit(emoji, title, sub, screen) { out.push({ emoji: emoji, title: title, sub: sub, screen: screen }); }
    state.goals.forEach(function (g) {
      if (g.title.toLowerCase().indexOf(q) >= 0) hit('🎯', g.title, 'Goal · ' + (g.status === 'done' ? 'completed' : goalProgress(g) + '%'), 'app/goals');
      (g.milestones || []).forEach(function (m) { if (m.title.toLowerCase().indexOf(q) >= 0) hit('🏁', m.title, 'Milestone of “' + g.title + '”', 'app/goals'); });
    });
    state.tasks.forEach(function (t) {
      if (t.title.toLowerCase().indexOf(q) >= 0) hit(t.done ? '✅' : '📋', t.title, 'Task · ' + (t.done ? 'done' : t.due ? 'due ' + fmtDate(t.due) : 'no due date'), 'app/tasks');
    });
    state.habits.forEach(function (h) {
      if (h.title.toLowerCase().indexOf(q) >= 0) hit(h.emoji || '🌱', h.title, (h.archived ? 'Archived habit' : 'Habit · 🔥 ' + habitStreak(h) + ' day streak'), 'app/habits');
    });
    if (state.timetable && state.timetable.days) {
      var seen = {};
      Object.keys(state.timetable.days).sort().forEach(function (iso) {
        state.timetable.days[iso].forEach(function (b) {
          var key = b.title + iso;
          if (seen[key]) return;
          if (b.title.toLowerCase().indexOf(q) >= 0) { seen[key] = 1; hit('📅', b.title, fmtDate(iso) + ' · ' + fmtTime(b.start), 'app/schedule'); }
        });
      });
    }
    (state.learning.exams || []).forEach(function (e) {
      if (e.title.toLowerCase().indexOf(q) >= 0) hit('🎓', e.title, 'Exam · ' + fmtDate(e.date), 'app/learning');
    });
    ACHIEVEMENTS.forEach(function (a) {
      if (a.title.toLowerCase().indexOf(q) >= 0) hit(a.emoji, a.title, (state.achievements[a.id] ? 'Achievement · unlocked' : 'Achievement · locked'), 'app/achievements');
    });
    state.social.friends.forEach(function (f) {
      if (f.name.toLowerCase().indexOf(q) >= 0) hit(f.avatar, f.name, 'Friend · ' + (f.role || ''), 'app/social');
    });
    state.social.groups.forEach(function (g) {
      if (g.name.toLowerCase().indexOf(q) >= 0) hit(g.emoji, g.name, 'Group · ' + g.members + ' members', 'app/social');
    });
    state.social.paths.forEach(function (p) {
      if (p.title.toLowerCase().indexOf(q) >= 0) hit(p.emoji || '🧭', p.title, 'Path by ' + p.author, 'app/social');
    });
    (state.reminders || []).forEach(function (r) {
      if (!r.done && r.text.toLowerCase().indexOf(q) >= 0) hit('⏰', r.text, 'Reminder' + (r.due ? ' · ' + fmtDate(r.due) : ''), 'app/dashboard');
    });
    (state.assistant.history || []).forEach(function (msg) {
      if (msg.text && msg.text.toLowerCase().indexOf(q) >= 0) hit(msg.role === 'user' ? '💬' : '🤖', msg.text.slice(0, 70) + (msg.text.length > 70 ? '…' : ''), 'AI conversation', 'app/assistant');
    });
    return out.slice(0, 20);
  }

  function showSearch() {
    var m = modal({
      title: '🔍 Search Acendri', accent: 'cyan', wide: true,
      body:
        '<input class="input" id="gs-q" placeholder="Goals, tasks, habits, timetable, friends, chats…" autocomplete="off">' +
        '<div id="gs-results" class="list" style="margin-top:12px"><div class="dim small">Type at least two characters…</div></div>'
    });
    var input = m.el.querySelector('#gs-q');
    var box = m.el.querySelector('#gs-results');
    function draw() {
      var res = searchAll(input.value || '');
      if (!input.value || input.value.trim().length < 2) { box.innerHTML = '<div class="dim small">Type at least two characters…</div>'; return; }
      if (!res.length) { box.innerHTML = '<div class="empty" style="padding:18px"><div class="e-emoji">🕳️</div><p>Nothing matches “' + esc(input.value) + '” yet.</p></div>'; return; }
      box.innerHTML = res.map(function (r, i) {
        return '<div class="list-item" data-go="' + i + '" style="cursor:pointer">' +
          '<span style="font-size:1.1rem">' + esc(r.emoji) + '</span>' +
          '<div class="li-main"><div class="li-title" style="font-size:.92rem">' + esc(r.title) + '</div>' +
          '<div class="li-sub">' + esc(r.sub) + '</div></div>' + icon('arrow', 'sm') + '</div>';
      }).join('');
      box.querySelectorAll('[data-go]').forEach(function (row) {
        row.addEventListener('click', function () {
          var r = res[+row.getAttribute('data-go')];
          m.close(); nav(r.screen);
        });
      });
    }
    input.addEventListener('input', draw);
  }

  /* ---------------- quick actions (the + button) ---------------- */

  function quickCreate(kind, m) {
    var title = m.el.querySelector('#qa-title').value.trim();
    if (!title) { toast('Give it a name first', '✍️'); return; }
    if (kind === 'goal') {
      update(function (s) {
        s.goals.push({ id: uid(), title: title, category: 'Personal', accent: 'cyan', why: '', targetDate: null, status: 'active', milestones: [], createdAt: Date.now() });
      });
      toast('Goal created — open Goals to break it into steps', '🎯');
      m.close(); nav('app/goals');
    } else if (kind === 'task') {
      update(function (s) {
        s.tasks.push({ id: uid(), title: title, priority: 2, due: todayISO(), duration: 45, done: false, createdAt: Date.now() });
      });
      toast('Task added for today', '📋');
      m.close();
    } else if (kind === 'habit') {
      update(function (s) {
        s.habits.push({ id: uid(), title: title, emoji: '🌱', accent: 'green', targetPerWeek: 7, log: {}, createdAt: Date.now() });
      });
      toast('Habit started — first tick today?', '🌱');
      m.close(); nav('app/habits');
    }
  }

  function showQuickActions() {
    var opts = [
      { k: 'goal', emoji: '🎯', accent: 'blue', label: 'Create a goal' },
      { k: 'task', emoji: '📋', accent: 'green', label: 'Create a task' },
      { k: 'habit', emoji: '🌱', accent: 'orange', label: 'Create a habit' },
      { k: 'schedule', emoji: '📅', accent: 'purple', label: 'Schedule something' },
      { k: 'focus', emoji: '🎧', accent: 'cyan', label: 'Start Focus Mode' },
      { k: 'ai', emoji: '🤖', accent: 'pink', label: 'Ask Acendri' }
    ];
    var m = modal({
      title: '⚡ What do you want to do?', accent: 'cyan',
      body: '<div class="list">' + opts.map(function (o) {
        return '<div class="list-item acc-' + o.accent + '" data-qa="' + o.k + '" style="cursor:pointer">' +
          '<span class="icon-tile">' + o.emoji + '</span>' +
          '<div class="li-main"><div class="li-title">' + o.label + '</div></div>' + icon('arrow', 'sm') + '</div>';
      }).join('') + '</div>'
    });
    m.el.querySelectorAll('[data-qa]').forEach(function (row) {
      row.addEventListener('click', function () {
        var k = row.getAttribute('data-qa');
        if (k === 'schedule') { m.close(); nav('app/schedule'); return; }
        if (k === 'ai') { m.close(); nav('app/assistant'); return; }
        if (k === 'focus') {
          m.close();
          var pri = priorities(1);
          update(function (s) { s.focus.currentTaskId = pri.length ? pri[0].id : null; }, { silent: true });
          nav('app/focus');
          return;
        }
        // inline mini-form for goal/task/habit
        var label = k === 'goal' ? 'What do you want to achieve?' : k === 'task' ? 'What needs doing?' : 'What’s the habit?';
        m.el.querySelector('.modal-body').innerHTML =
          '<div class="field"><label>' + label + '</label><input class="input" id="qa-title" maxlength="90"></div>' +
          '<div class="row" style="justify-content:flex-end;gap:10px">' +
          '<button class="btn btn-ghost" id="qa-back">← Back</button>' +
          '<button class="btn btn-primary" id="qa-go">Create</button></div>';
        var inp = m.el.querySelector('#qa-title');
        inp.focus();
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') quickCreate(k, m); });
        m.el.querySelector('#qa-go').addEventListener('click', function () { quickCreate(k, m); });
        m.el.querySelector('#qa-back').addEventListener('click', function () { m.close(); showQuickActions(); });
      });
    });
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
      '<button class="icon-btn" data-search="1" aria-label="Search" title="Search everything">' + icon('search') + '</button>' +
      '<button class="icon-btn" data-bell="1" aria-label="Activity" title="Reminders & activity">' + icon('bell') + '</button>' +
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
    top.querySelector('[data-search]').addEventListener('click', showSearch);

    var fab = document.createElement('button');
    fab.className = 'fab';
    fab.setAttribute('aria-label', 'Quick actions');
    fab.title = 'Quick actions';
    fab.innerHTML = icon('plus', 'lg');
    fab.addEventListener('click', showQuickActions);
    shell.appendChild(fab);

    def.render(screenEl, ctx());
  }

  // Live notifications: every entry is computed from real state right now.
  function smartNotifications() {
    var out = [];
    if (!state.settings.notifications) return out;
    var t = todayISO();
    if (state.settings.notifyStartSoon) {
      var nb = nextBlock();
      if (nb && !nb.now && nb.inMinutes <= 60) out.push({ emoji: '⏱️', accent: 'purple', text: '“' + nb.block.title + '” starts in ' + nb.inMinutes + ' min (' + fmtTime(nb.block.start) + ')', screen: 'app/schedule' });
      if (nb && nb.now) out.push({ emoji: '▶️', accent: 'purple', text: 'Now on your timetable: ' + nb.block.title + ' — until ' + fmtTime(nb.block.end), screen: 'app/schedule' });
    }
    if (state.settings.notifyDaily) {
      var ts = todayStats();
      var totalPri = ts.priorities.length + ts.tasksDone;
      if (ts.tasksDone > 0 && ts.priorities.length > 0) out.push({ emoji: '📈', accent: 'green', text: 'You’ve completed ' + ts.tasksDone + '/' + totalPri + ' priorities today — keep rolling.', screen: 'app/dashboard' });
      state.habits.forEach(function (h) {
        if (h.archived || !h.log[t]) return;
        var st = habitStreak(h);
        if (st === 3 || st === 7 || st === 30) out.push({ emoji: '🔥', accent: 'orange', text: st + '-day streak on “' + h.title + '” — that’s how habits are built!', screen: 'app/habits' });
      });
      var weekAgo = Date.now() - 7 * 86400000;
      state.goals.forEach(function (g) {
        if (g.status !== 'active') return;
        var moved = state.tasks.some(function (x) { return x.goalId === g.id && x.done && (x.doneAt || 0) >= weekAgo; });
        if (!moved && (Date.now() - (g.createdAt || 0)) > 7 * 86400000) out.push({ emoji: '🎯', accent: 'blue', text: '“' + g.title + '” hasn’t progressed this week — one small task would change that.', screen: 'app/goals' });
      });
    }
    if (state.settings.notifyReview && state.lastWeekReview && !state.lastWeekReview.seen) {
      out.push({ emoji: '🪞', accent: 'purple', text: 'Your weekly review is ready — see how the week went.', screen: 'app/review' });
    }
    return out.slice(0, 6);
  }

  function showActivity() {
    var t = todayISO();
    var pending = (state.reminders || []).filter(function (r) { return !r.done; });
    var nudges = state.habits.filter(function (h) {
      return !h.archived && !h.log[t] && daysSinceLastTick(h) >= 2;
    });
    var smart = smartNotifications();
    var html = '';
    if (smart.length) {
      html += '<div class="list" style="margin-bottom:14px">' + smart.map(function (n, i) {
        return '<div class="list-item acc-' + n.accent + '" data-smart="' + i + '" style="cursor:pointer">' +
          '<span style="font-size:1.1rem">' + n.emoji + '</span>' +
          '<div class="li-main"><div class="li-title" style="font-weight:500;font-size:.88rem">' + esc(n.text) + '</div></div>' +
          icon('arrow', 'sm') + '</div>';
      }).join('') + '</div>';
    }
    if (pending.length || nudges.length) {
      html += '<div class="list" style="margin-bottom:14px">' +
        pending.map(function (r) {
          var dueTxt = r.due ? (r.due < t ? '<span class="neg">Overdue · ' + esc(fmtDate(r.due)) + '</span>' : esc(fmtDate(r.due))) : 'Any time';
          return '<div class="list-item acc-yellow"><span style="font-size:1.1rem">⏰</span>' +
            '<div class="li-main"><div class="li-title" style="font-size:.9rem">' + esc(r.text) + '</div>' +
            '<div class="li-sub">' + dueTxt + '</div></div>' +
            '<button class="btn btn-sm btn-acc acc-green" data-rdone="' + esc(r.id) + '">Done</button></div>';
        }).join('') +
        nudges.map(function (h) {
          var missed = daysSinceLastTick(h);
          var fading = missed >= HABIT_FADE_DAYS - 4;
          return '<div class="list-item ' + (fading ? 'acc-red' : 'acc-orange') + '"><span style="font-size:1.1rem">' + (fading ? '🍂' : '⏰') + '</span>' +
            '<div class="li-main"><div class="li-title" style="font-size:.9rem">' + esc(h.emoji + ' ' + h.title) + ' — missed ' + missed + ' days</div>' +
            '<div class="li-sub">' + (fading ? 'Fades away at ' + HABIT_FADE_DAYS + ' quiet days — one tick saves it' : 'Tick it today to restart your streak') + '</div></div></div>';
        }).join('') +
        '</div><hr class="sep">';
    }
    var items = state.activityLog.slice(0, 8);
    html += items.length
      ? '<div class="list">' + items.map(function (a) {
          return '<div class="list-item"><span style="font-size:1.1rem">' + esc(a.emoji) + '</span><div class="li-main"><div class="li-title" style="font-weight:500;font-size:.88rem">' + esc(a.text) + '</div><div class="li-sub">' + timeAgo(a.ts) + (a.xp ? ' · +' + a.xp + ' XP' : '') + '</div></div></div>';
        }).join('') + '</div>'
      : '<div class="empty"><div class="e-emoji">🌙</div><p>Nothing yet — everything you do in Acendri shows up here.</p></div>';
    var m = modal({ title: '🔔 Reminders & activity', accent: 'purple', body: html });
    m.el.querySelectorAll('[data-smart]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = smart[+b.getAttribute('data-smart')];
        m.close();
        if (n && n.screen) nav(n.screen);
      });
    });
    m.el.querySelectorAll('[data-rdone]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-rdone');
        update(function (s) {
          s.reminders.forEach(function (r) { if (r.id === id) { r.done = true; r.doneAt = Date.now(); } });
          logActivity('Reminder done', '⏰');
        });
        toast('Reminder ticked off', '⏰');
        m.close();
      });
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
    addTasksToTimetable: addTasksToTimetable,
    repeatLastWeek: repeatLastWeek,
    rebuildWeek: rebuildWeek,
    weekLock: weekLock,
    planWindow: planWindow,
    WEEK_DAYS: WEEK_DAYS,
    todayStats: todayStats,
    priorities: priorities,
    nextBlock: nextBlock,
    goalLinks: goalLinks,
    buildRevisionPlan: buildRevisionPlan,
    smartNotifications: smartNotifications,
    searchAll: searchAll,
    showSearch: function () { showSearch(); },
    showQuickActions: function () { showQuickActions(); },
    focusSuggestions: focusSuggestions,
    financeSummary: financeSummary,
    habitStreak: habitStreak,
    habitWeekCount: habitWeekCount,
    daysSinceLastTick: daysSinceLastTick,
    HABIT_FADE_DAYS: HABIT_FADE_DAYS,
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
      flushToasts();   // week settlement / habit-fade notices queued during load
    }
  };
})();
