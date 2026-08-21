/* VOID FISHING — persistence via localStorage.
   Defensive: a corrupt or partial save must never brick the game. */
(function (VF) {
  'use strict';

  const KEY = 'voidfishing.save.v1';
  const AUTOSAVE_INTERVAL = 8; // seconds
  let sinceSave = 0;
  let available = true;

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
      const payload = JSON.stringify(VF.state.data);
      st.setItem(KEY, payload);
      sinceSave = 0;
      VF.bus.emit('save:written');
      return true;
    } catch (e) {
      console.warn('[save] failed', e);
      return false;
    }
  }

  function load() {
    const st = storage();
    const fresh = VF.state.defaults();
    if (!st) { VF.state.data = fresh; return { loaded: false, reason: 'unavailable' }; }
    let raw = null;
    try { raw = st.getItem(KEY); } catch (e) { /* ignore */ }
    if (!raw) { VF.state.data = fresh; return { loaded: false, reason: 'empty' }; }
    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      console.warn('[save] corrupt save discarded');
      VF.state.data = fresh;
      return { loaded: false, reason: 'corrupt' };
    }
    VF.state.data = sanitise(merge(fresh, parsed));
    return { loaded: true };
  }

  function reset() {
    const st = storage();
    if (st) { try { st.removeItem(KEY); } catch (e) { /* ignore */ } }
    VF.state.data = VF.state.defaults();
    VF.bus.emit('save:reset');
  }

  function tick(dt) {
    sinceSave += dt;
    if (sinceSave >= AUTOSAVE_INTERVAL) save();
  }

  function exportString() {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(VF.state.data)))); }
    catch (e) { return null; }
  }

  VF.save = {
    save: save, load: load, reset: reset, tick: tick,
    exportString: exportString,
    isAvailable: function () { return available; }
  };

  /* Never lose progress on tab close. */
  window.addEventListener('beforeunload', function () { save(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') save();
  });
})(window.VF = window.VF || {});
