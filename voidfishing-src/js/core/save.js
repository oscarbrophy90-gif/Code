/* VOID FISHING — persistence via localStorage.
   Defensive: a corrupt or partial save must never brick the game. */
(function (VF) {
  'use strict';

  /* Four games, not one. `KEY` is where the single save used to live and is
     read once, on the first boot after this change, so nobody's game is left
     behind in it. */
  const KEY = 'voidfishing.save.v1';
  const SLOT_KEY = 'voidfishing.save.v1.s';
  const ACTIVE_KEY = 'voidfishing.slot';
  const SLOTS = 4;

  const AUTOSAVE_INTERVAL = 8; // seconds
  let sinceSave = 0;
  let available = true;
  let active = 0;

  function slotKey(i) { return SLOT_KEY + (i | 0); }
  function clampSlot(i) { return Math.max(0, Math.min(SLOTS - 1, i | 0)); }

  function storage() {
    try {
      const s = window.localStorage;
      s.setItem('__vf_probe', '1'); s.removeItem('__vf_probe');
      return s;
    } catch (e) { available = false; return null; }
  }

  /* Merge a loaded object onto fresh defaults so new fields added in later
     versions appear automatically and unknown fields are dropped. */
  function merge(target, src) {
    if (!src || typeof src !== 'object') return target;
    for (const k in target) {
      if (!Object.prototype.hasOwnProperty.call(target, k)) continue;
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      const tv = target[k], sv = src[k];
      if (sv === null || sv === undefined) continue;
      if (Array.isArray(tv)) {
        if (Array.isArray(sv)) target[k] = sv;
      } else if (tv && typeof tv === 'object' && sv && typeof sv === 'object') {
        // free-form maps (fishdex, baitCounts, achievements, flags) copy wholesale
        if (k === 'fishdex' || k === 'baitCounts' || k === 'achievements' || k === 'flags' ||
            k === 'mutations' || k === 'traits' || k === 'traitsSeen' || k === 'treasures' ||
            k === 'secrets' || k === 'npcs' || k === 'equipped' || k === 'cases' ||
            k === 'quests') {
          target[k] = sv;
        } else {
          merge(tv, sv);
        }
      } else if (typeof sv === typeof tv) {
        target[k] = sv;
      } else if (typeof tv === 'number' && typeof sv === 'string' && isFinite(+sv)) {
        target[k] = +sv;
      }
    }
    return target;
  }

  function sanitise(d) {
    const U = VF.util;
    d.money = Math.max(0, isFinite(d.money) ? d.money : 0);
    d.level = U.clamp(Math.floor(d.level) || 1, 1, 999);
    d.xp = Math.max(0, isFinite(d.xp) ? d.xp : 0);
    if (!Array.isArray(d.ownedRods) || !d.ownedRods.length) d.ownedRods = ['wood'];
    if (d.ownedRods.indexOf('wood') < 0) d.ownedRods.unshift('wood');
    if (d.ownedRods.indexOf(d.rod) < 0) d.rod = d.ownedRods[d.ownedRods.length - 1];
    if (!Array.isArray(d.unlockedLocations) || !d.unlockedLocations.length) d.unlockedLocations = ['shore'];
    if (d.unlockedLocations.indexOf(d.location) < 0) d.location = 'shore';
    if (!Array.isArray(d.seenLocations)) d.seenLocations = d.unlockedLocations.slice();
    if (!d.fishdex || typeof d.fishdex !== 'object') d.fishdex = {};
    if (!Array.isArray(d.kept)) d.kept = [];
    if (d.kept.length > 400) d.kept = d.kept.slice(-400);
    if (!d.baitCounts || typeof d.baitCounts !== 'object') d.baitCounts = {};
    if (!Array.isArray(d.charms)) d.charms = [];
    d.charms = d.charms.filter(function (id) { return !!VF.charms.get(id); });
    if (!Array.isArray(d.charmSlots)) d.charmSlots = [null, null, null, null, null];
    d.charmSlots.length = 5;
    for (let i = 0; i < 5; i++) {
      if (d.charmSlots[i] && d.charms.indexOf(d.charmSlots[i]) < 0) d.charmSlots[i] = null;
      if (d.charmSlots[i] === undefined) d.charmSlots[i] = null;
    }
    if (!d.merchant || typeof d.merchant !== 'object' || Array.isArray(d.merchant)) {
      d.merchant = { until: 0, next: 0, stock: [], sold: [], visits: 0 };
    }
    if (!Array.isArray(d.merchant.stock)) d.merchant.stock = [];
    if (!Array.isArray(d.merchant.sold)) d.merchant.sold = [];
    d.merchant.stock = d.merchant.stock.filter(function (id) {
      const r = VF.rods.get(id);
      return r && r.id === id;
    });
    if (!d.quests || typeof d.quests !== 'object' || Array.isArray(d.quests)) d.quests = {};
    for (const qid in d.quests) {
      const q = d.quests[qid];
      if (!q || typeof q !== 'object') { delete d.quests[qid]; continue; }
      q.step = Math.max(0, Math.floor(q.step) || 0);
      if (!q.flags || typeof q.flags !== 'object') q.flags = {};
      if (!q.counts || typeof q.counts !== 'object') q.counts = {};
    }
    if (!Array.isArray(d.cosmetics)) d.cosmetics = [];
    if (!Array.isArray(d.journal)) d.journal = [];
    if (d.journal.length > 300) d.journal = d.journal.slice(-300);
    if (!d.equipped || typeof d.equipped !== 'object') d.equipped = {};
    d.caseTokens = Math.max(0, Math.floor(d.caseTokens) || 0);

    /* Schema 1 stored one mutation per catch; traits are a list. */
    for (const id in d.fishdex) {
      const e = d.fishdex[id];
      if (!e || typeof e !== 'object') { delete d.fishdex[id]; continue; }
      if (!e.traits) {
        e.traits = {};
        if (e.mutations) for (const m in e.mutations) e.traits[m] = e.mutations[m];
      }
      if (e.record && e.record.mutation && !e.record.traits) e.record.traits = [e.record.mutation];
      if (e.record && !e.record.traits) e.record.traits = [];
    }
    for (let i = 0; i < d.kept.length; i++) {
      const k = d.kept[i];
      if (k && !k.traits) k.traits = k.mutation ? [k.mutation] : [];
    }
    for (const k in d.baitCounts) {
      const n = Math.floor(d.baitCounts[k]);
      if (!isFinite(n) || n <= 0) delete d.baitCounts[k];
      else d.baitCounts[k] = Math.min(n, 99999);
    }
    const s = d.settings;
    s.master = U.clamp(+s.master || 0, 0, 1);
    s.music = U.clamp(+s.music || 0, 0, 1);
    s.sfx = U.clamp(+s.sfx || 0, 0, 1);
    if (['low', 'medium', 'high'].indexOf(s.quality) < 0) s.quality = 'high';
    return d;
  }

  function save() {
    const st = storage();
    if (!st) return false;
    try {
      st.setItem(slotKey(active), JSON.stringify(VF.state.data));
      st.setItem(ACTIVE_KEY, String(active));
      sinceSave = 0;
      VF.bus.emit('save:written');
      return true;
    } catch (e) {
      console.warn('[save] failed', e);
      return false;
    }
  }

  /* Whatever is in a slot, as game state, or null. Nothing here touches the
     game that is running — the panel asks this four times to draw the list. */
  function readSlot(i) {
    const st = storage();
    if (!st) return null;
    let raw = null;
    try { raw = st.getItem(slotKey(i)); } catch (e) { return null; }
    if (!raw) return null;
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) {
      console.warn('[save] slot ' + i + ' is corrupt');
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    return sanitise(merge(VF.state.defaults(), parsed));
  }

  /* The one line the slot list draws per row. */
  function summary(i) {
    const d = readSlot(i);
    if (!d) return { slot: i, empty: true };
    return {
      slot: i, empty: false,
      level: d.level, fathoms: d.fathoms | 0,
      money: d.money, species: Object.keys(d.fishdex).length,
      playSeconds: d.stats.playSeconds | 0,
      location: d.location,
      created: d.created || 0
    };
  }
  function slots() {
    const out = [];
    for (let i = 0; i < SLOTS; i++) out.push(summary(i));
    return out;
  }

  /* Anything left in the old single-save key belongs to whoever was playing
     it, so it becomes slot one the first time this build opens. */
  function migrate(st) {
    let legacy = null;
    try { legacy = st.getItem(KEY); } catch (e) { return; }
    if (!legacy) return;
    try {
      if (!st.getItem(slotKey(0))) st.setItem(slotKey(0), legacy);
      st.removeItem(KEY);
    } catch (e) { /* a full disk is not worth breaking the boot over */ }
  }

  function load() {
    const st = storage();
    const fresh = VF.state.defaults();
    if (!st) { VF.state.data = fresh; return { loaded: false, reason: 'unavailable' }; }
    migrate(st);
    let want = 0;
    try { want = clampSlot(parseInt(st.getItem(ACTIVE_KEY), 10) || 0); } catch (e) { want = 0; }
    active = want;
    const d = readSlot(active);
    if (!d) { VF.state.data = fresh; return { loaded: false, reason: 'empty', slot: active }; }
    VF.state.data = d;
    return { loaded: true, slot: active };
  }

  /* Put the running game down and pick another one up. The game being left is
     written first, or switching away from it loses up to eight seconds. */
  function use(i) {
    i = clampSlot(i);
    save();
    active = i;
    const st = storage();
    if (st) { try { st.setItem(ACTIVE_KEY, String(active)); } catch (e) { /* ignore */ } }
    const d = readSlot(active);
    const startedFresh = !d;
    VF.state.data = d || VF.state.defaults();
    if (startedFresh) save();
    VF.bus.emit('save:slot', { slot: active, fresh: startedFresh });
    return { slot: active, fresh: startedFresh };
  }

  /* Empty a slot. Emptying the one being played leaves a new game in it,
     because there has to be a game. */
  function erase(i) {
    i = clampSlot(i);
    const st = storage();
    if (st) { try { st.removeItem(slotKey(i)); } catch (e) { /* ignore */ } }
    if (i === active) {
      VF.state.data = VF.state.defaults();
      VF.bus.emit('save:reset');
    }
    VF.bus.emit('save:slot', { slot: active, fresh: i === active });
    return i === active;
  }

  function reset() { erase(active); }

  function tick(dt) {
    sinceSave += dt;
    if (sinceSave >= AUTOSAVE_INTERVAL) save();
  }

  VF.save = {
    save: save, load: load, reset: reset, tick: tick,
    SLOTS: SLOTS,
    slots: slots, summary: summary, use: use, erase: erase,
    slot: function () { return active; },
    isAvailable: function () { return available; }
  };

  /* Never lose progress on tab close. */
  window.addEventListener('beforeunload', function () { save(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') save();
  });
})(window.VF = window.VF || {});
