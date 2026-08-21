/* VOID FISHING — cosmetics.
   None of these touch a single gameplay number. That is the deal: cases cost
   Brophys, cases contain only this, and nothing in here makes you fish better. */
(function (VF) {
  'use strict';

  const SLOTS = [
    { id: 'rodSkin',   name: 'rod finish' },
    { id: 'bobber',    name: 'bobber' },
    { id: 'line',      name: 'line' },
    { id: 'splash',    name: 'splash' },
    { id: 'cast',      name: 'cast trail' },
    { id: 'catchFx',   name: 'catch effect' },
    { id: 'theme',     name: 'interface' },
    { id: 'outfit',    name: 'outfit' }
  ];

  /* `c` fields are read by the renderers; every one is purely visual. */
  const LIST = [
    /* ---------------- rod finishes ---------------- */
    { id: 'rod_bone',   slot: 'rodSkin', name: 'Bonewhite', rarity: 'common',   c: { c1: '#e8e2d2', c2: '#a8a294', tip: '#ffffff' } },
    { id: 'rod_tar',    slot: 'rodSkin', name: 'Tarblack',  rarity: 'common',   c: { c1: '#2a2a30', c2: '#0e0e12', tip: '#6a6a78' } },
    { id: 'rod_verd',   slot: 'rodSkin', name: 'Verdigris', rarity: 'uncommon', c: { c1: '#4a8a78', c2: '#22463c', tip: '#9fe8d0' } },
    { id: 'rod_rose',   slot: 'rodSkin', name: 'Rosewood',  rarity: 'uncommon', c: { c1: '#8a4a48', c2: '#4a2422', tip: '#e0a090' } },
    { id: 'rod_ember',  slot: 'rodSkin', name: 'Ember',     rarity: 'rare',     c: { c1: '#8a3a18', c2: '#3a1206', tip: '#ffb066', glow: 0.5 } },
    { id: 'rod_frost',  slot: 'rodSkin', name: 'Hoarfrost', rarity: 'rare',     c: { c1: '#cfe8f5', c2: '#7fa8bc', tip: '#ffffff', glow: 0.4 } },
    { id: 'rod_orbit',  slot: 'rodSkin', name: 'Orbital',   rarity: 'epic',     c: { c1: '#3a4a8a', c2: '#141a38', tip: '#c8e0ff', glow: 0.8, style: 'celestial' } },
    { id: 'rod_null',   slot: 'rodSkin', name: 'Null',      rarity: 'legendary',c: { c1: '#0a0812', c2: '#000000', tip: '#b48aff', glow: 1, style: 'void' } },
    { id: 'rod_gilt',   slot: 'rodSkin', name: 'Gilt',      rarity: 'mythic',   c: { c1: '#e8b83a', c2: '#7a5a10', tip: '#fff0b0', glow: 0.9, style: 'lunar' } },

    /* ---------------- bobbers ---------------- */
    { id: 'bob_classic', slot: 'bobber', name: 'Classic Red', rarity: 'common',   c: { top: '#c8402f', bot: '#e8e4dc' } },
    { id: 'bob_slate',   slot: 'bobber', name: 'Slate',       rarity: 'common',   c: { top: '#5a6470', bot: '#c0c8d0' } },
    { id: 'bob_buoy',    slot: 'bobber', name: 'Harbour Buoy',rarity: 'uncommon', c: { top: '#e8a030', bot: '#204050' } },
    { id: 'bob_pearl',   slot: 'bobber', name: 'Pearl',       rarity: 'rare',     c: { top: '#f0ecf8', bot: '#c8c0e0', sheen: 1 } },
    { id: 'bob_lantern', slot: 'bobber', name: 'Little Lantern', rarity: 'rare',  c: { top: '#3a3020', bot: '#ffd884', lamp: 1 } },
    { id: 'bob_eye',     slot: 'bobber', name: 'It Blinks',   rarity: 'epic',     c: { top: '#e8e0d0', bot: '#c04030', eye: 1 } },
    { id: 'bob_star',    slot: 'bobber', name: 'Caught Star', rarity: 'legendary',c: { top: '#fff4c0', bot: '#ffd060', star: 1, glow: 1 } },
    { id: 'bob_void',    slot: 'bobber', name: 'Absence',     rarity: 'mythic',   c: { top: '#0a0612', bot: '#1a1030', hole: 1 } },

    /* ---------------- line ---------------- */
    { id: 'line_plain',  slot: 'line', name: 'Monofilament', rarity: 'common',   c: { col: '#ffffff', a: 0.4 } },
    { id: 'line_copper', slot: 'line', name: 'Copper Braid', rarity: 'uncommon', c: { col: '#e0a060', a: 0.55 } },
    { id: 'line_glow',   slot: 'line', name: 'Glowline',     rarity: 'rare',     c: { col: '#8ffbe0', a: 0.75, glow: 1 } },
    { id: 'line_pulse',  slot: 'line', name: 'Pulseline',    rarity: 'epic',     c: { col: '#b48aff', a: 0.8, pulse: 1 } },
    { id: 'line_thread', slot: 'line', name: 'Red Thread',   rarity: 'legendary',c: { col: '#ff5a6a', a: 0.9, glow: 1, pulse: 1 } },

    /* ---------------- splash ---------------- */
    { id: 'spl_plain',  slot: 'splash', name: 'Clean Entry',  rarity: 'common',   c: { col: [200, 228, 248] } },
    { id: 'spl_gold',   slot: 'splash', name: 'Gold Leaf',    rarity: 'uncommon', c: { col: [255, 216, 130] } },
    { id: 'spl_ink',    slot: 'splash', name: 'Ink',          rarity: 'rare',     c: { col: [90, 70, 140], n: 1.5 } },
    { id: 'spl_bloom',  slot: 'splash', name: 'Bloom',        rarity: 'epic',     c: { col: [150, 255, 220], n: 2, ring: 1 } },
    { id: 'spl_shatter',slot: 'splash', name: 'Shatter',      rarity: 'legendary',c: { col: [220, 240, 255], n: 3, ring: 2, shard: 1 } },

    /* ---------------- cast trail ---------------- */
    { id: 'cast_none',  slot: 'cast', name: 'Nothing At All', rarity: 'common',   c: {} },
    { id: 'cast_dust',  slot: 'cast', name: 'Dust',           rarity: 'uncommon', c: { col: [220, 210, 180], n: 1 } },
    { id: 'cast_spark', slot: 'cast', name: 'Sparks',         rarity: 'rare',     c: { col: [255, 190, 110], n: 2 } },
    { id: 'cast_comet', slot: 'cast', name: 'Comet',          rarity: 'epic',     c: { col: [180, 220, 255], n: 3, tail: 1 } },
    { id: 'cast_rift',  slot: 'cast', name: 'Rift',           rarity: 'mythic',   c: { col: [180, 130, 255], n: 4, tail: 1, warp: 1 } },

    /* ---------------- catch effect ---------------- */
    { id: 'catch_none', slot: 'catchFx', name: 'Restraint',   rarity: 'common',   c: {} },
    { id: 'catch_motes',slot: 'catchFx', name: 'Motes',       rarity: 'uncommon', c: { col: [220, 240, 255], n: 14 } },
    { id: 'catch_coin', slot: 'catchFx', name: 'Coinfall',    rarity: 'rare',     c: { col: [255, 210, 120], n: 22 } },
    { id: 'catch_halo', slot: 'catchFx', name: 'Halo',        rarity: 'epic',     c: { col: [200, 230, 255], n: 20, halo: 1 } },
    { id: 'catch_rift', slot: 'catchFx', name: 'Unmaking',    rarity: 'legendary',c: { col: [190, 140, 255], n: 30, halo: 1, warp: 1 } },

    /* ---------------- interface themes ---------------- */
    { id: 'ui_default', slot: 'theme', name: 'Default',       rarity: 'common',   c: {} },
    { id: 'ui_paper',   slot: 'theme', name: 'Ledger',        rarity: 'uncommon', c: { ink: '#e8e2d0', accent: '#c8a860' } },
    { id: 'ui_tide',    slot: 'theme', name: 'Tideglass',     rarity: 'rare',     c: { ink: '#dff2f8', accent: '#5fd0e0' } },
    { id: 'ui_ember',   slot: 'theme', name: 'Emberlight',    rarity: 'rare',     c: { ink: '#f8e8d8', accent: '#ff9a5a' } },
    { id: 'ui_void',    slot: 'theme', name: 'Voidwork',      rarity: 'epic',     c: { ink: '#e8dcff', accent: '#a86bff' } },
    { id: 'ui_wrong',   slot: 'theme', name: 'Incorrect',     rarity: 'mythic',   c: { ink: '#ffe8ec', accent: '#ff2d55', glitch: 1 } },

    /* ---------------- outfits ---------------- */
    { id: 'fit_coat',   slot: 'outfit', name: 'Oilskin',      rarity: 'common',   c: { body: '#0a0d14', rim: 0.16 } },
    { id: 'fit_hood',   slot: 'outfit', name: 'Deep Hood',    rarity: 'uncommon', c: { body: '#0d0a16', rim: 0.2, hood: 1.2 } },
    { id: 'fit_scarf',  slot: 'outfit', name: 'Long Scarf',   rarity: 'rare',     c: { body: '#0a0d14', rim: 0.18, scarf: 1 } },
    { id: 'fit_lamp',   slot: 'outfit', name: 'Lampbearer',   rarity: 'epic',     c: { body: '#0a0a12', rim: 0.24, lamp: 1 } },
    { id: 'fit_starlit',slot: 'outfit', name: 'Starlit',      rarity: 'legendary',c: { body: '#080a14', rim: 0.3, stars: 1 } },
    { id: 'fit_absent', slot: 'outfit', name: 'Not Quite There', rarity: 'mythic',c: { body: '#06060c', rim: 0.36, fade: 1 } }
  ];

  /* Some cosmetics never appear in a case — they only turn up in the water. */
  const SECRET = ['bob_void', 'rod_gilt', 'ui_wrong', 'fit_absent', 'cast_rift'];

  const BY_ID = VF.util.byId(LIST);
  const BY_SLOT = Object.create(null);
  for (let i = 0; i < LIST.length; i++) {
    LIST[i].secret = SECRET.indexOf(LIST[i].id) >= 0;
    (BY_SLOT[LIST[i].slot] || (BY_SLOT[LIST[i].slot] = [])).push(LIST[i]);
  }

  /* Defaults are owned from the start so every slot always has something in it. */
  const DEFAULTS = { rodSkin: null, bobber: 'bob_classic', line: 'line_plain',
                     splash: 'spl_plain', cast: 'cast_none', catchFx: 'catch_none',
                     theme: 'ui_default', outfit: 'fit_coat' };

  function owned(id) {
    const d = VF.state.data;
    return d.cosmetics.indexOf(id) >= 0 || isDefault(id);
  }
  function isDefault(id) {
    for (const k in DEFAULTS) if (DEFAULTS[k] === id) return true;
    return false;
  }

  function grant(id) {
    const d = VF.state.data;
    const c = BY_ID[id];
    if (!c) return false;
    if (d.cosmetics.indexOf(id) >= 0) return false;
    d.cosmetics.push(id);
    VF.bus.emit('cosmetic:found', c);
    return true;
  }

  function equip(id) {
    const c = BY_ID[id];
    if (!c || !owned(id)) return false;
    VF.state.data.equipped[c.slot] = id;
    VF.bus.emit('cosmetic:changed', c);
    return true;
  }
  function unequip(slot) {
    VF.state.data.equipped[slot] = DEFAULTS[slot] || null;
    VF.bus.emit('cosmetic:changed', null);
  }
  function equippedIn(slot) {
    const id = VF.state.data.equipped[slot];
    if (id && owned(id)) return BY_ID[id] || null;
    const dflt = DEFAULTS[slot];
    return dflt ? BY_ID[dflt] : null;
  }
  /* Convenience for the renderers: the config object, or an empty one. */
  function cfg(slot) {
    const c = equippedIn(slot);
    return c ? c.c : {};
  }

  function completion() {
    const d = VF.state.data;
    let have = 0;
    for (let i = 0; i < LIST.length; i++) if (owned(LIST[i].id)) have++;
    return { have: have, total: LIST.length, pct: have / LIST.length };
  }

  VF.cosmetics = {
    list: LIST, slots: SLOTS, DEFAULTS: DEFAULTS,
    get: function (id) { return BY_ID[id] || null; },
    inSlot: function (slot) { return BY_SLOT[slot] || []; },
    owned: owned, grant: grant, equip: equip, unequip: unequip,
    equippedIn: equippedIn, cfg: cfg, completion: completion,
    caseable: LIST.filter(function (c) { return !c.secret && !isDefault(c.id); })
  };
})(window.VF = window.VF || {});
