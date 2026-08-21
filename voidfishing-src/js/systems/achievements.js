/* VOID FISHING — achievement checks. Cheap enough to run on any state change. */
(function (VF) {
  'use strict';

  let queue = [];
  let cooldown = 0;

  function check() {
    const d = VF.state.data;
    const list = VF.achievementData.list;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (d.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.test(d); } catch (e) { ok = false; }
      if (!ok) continue;
      d.achievements[a.id] = Date.now();
      if (a.reward) VF.economy.earn(a.reward, 'achievement');
      queue.push(a);
    }
    if (queue.length) VF.save.save();
  }

  /* Trickle notifications out so a burst of unlocks doesn't stack up at once. */
  function tick(dt) {
    cooldown -= dt;
    if (cooldown <= 0 && queue.length) {
      const a = queue.shift();
      cooldown = 1.1;
      VF.audio.achievement();
      VF.bus.emit('achievement:unlocked', a);
    }
  }

  function unlockedCount() { return Object.keys(VF.state.data.achievements).length; }

  VF.achievements = { check: check, tick: tick, unlockedCount: unlockedCount };
})(window.VF = window.VF || {});
