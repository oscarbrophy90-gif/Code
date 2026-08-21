/* VOID FISHING — running the long threads.

   The engine knows nothing about any particular quest. It keeps a record per
   quest, offers a quest when its `start` test passes, and walks the chapters:
   a chapter with `talk` waits for that conversation, a chapter with `done`
   waits for the water. Chapters do their own thinking through `onCatch`,
   `onEnter` and `onDone`, so adding a quest means adding data, not code.

   Everything it touches is inside d.quests[id], which is a free-form map in
   the save — an old save simply has none, and the first tick builds it. */
(function (VF) {
  'use strict';

  function rec(id) {
    const d = VF.state.data;
    if (!d.quests[id]) d.quests[id] = { started: 0, step: 0, done: 0, flags: {}, counts: {} };
    const q = d.quests[id];
    if (!q.flags) q.flags = {};
    if (!q.counts) q.counts = {};
    return q;
  }

  /* Read-only: asking about a quest must not start one. */
  function peek(id) { return VF.state.data.quests[id] || null; }

  function started(id) { const q = peek(id); return !!(q && q.started); }
  function complete(id) { const q = peek(id); return !!(q && q.done); }
  function step(id) { const q = peek(id); return q ? q.step : -1; }

  /* Monotone, which is what the NPC stage tests need: once the quest has been
     this far it has always been this far, so a stage never becomes unavailable
     again and the conversation order cannot go backwards. */
  function reached(id, n) {
    const q = peek(id);
    return !!q && !!q.started && q.step >= n;
  }
  function at(id, n) { return !complete(id) && step(id) === n; }

  function chapter(id) {
    const def = VF.questData.get(id), q = peek(id);
    if (!def || !q || !q.started || q.done) return null;
    return def.chapters[q.step] || null;
  }

  /* What the journal draws: where the player is and what is left of it. */
  function objective(id) {
    const ch = chapter(id);
    if (!ch) return null;
    const q = peek(id), d = VF.state.data;
    const out = { chapter: ch, task: ch.task, where: ch.where || null, text: ch.text || null,
                  goal: null, checklist: null, talk: ch.talk || null };
    if (ch.goal) { try { out.goal = ch.goal(q, d); } catch (e) { /* a bad quest must not eat the panel */ } }
    if (ch.checklist) { try { out.checklist = ch.checklist(q, d); } catch (e) { /* ditto */ } }
    return out;
  }

  /* ------------------------------------------------------------- driving */

  function offer(def) {
    const d = VF.state.data;
    if (d.quests[def.id] && d.quests[def.id].started) return false;
    let ok = false;
    try { ok = def.start ? def.start(d) : true; } catch (e) { ok = false; }
    if (!ok) return false;
    const q = rec(def.id);
    q.started = Date.now();
    q.step = 0;
    const first = def.chapters[0];
    if (first && first.onEnter) { try { first.onEnter(q, d); } catch (e) { /* ignore */ } }
    VF.bus.emit('quest:started', def);
    VF.save.save();
    return true;
  }

  function advance(id) {
    const def = VF.questData.get(id), q = rec(id);
    if (!def || q.done) return;
    const d = VF.state.data;
    const ch = def.chapters[q.step];
    if (ch && ch.onDone) { try { ch.onDone(q, d); } catch (e) { /* ignore */ } }
    q.step++;
    if (q.step >= def.chapters.length) {
      q.step = def.chapters.length;
      q.done = Date.now();
      if (def.onComplete) { try { def.onComplete(); } catch (e) { console.error('[quest]', e); } }
      VF.bus.emit('quest:complete', def);
    } else {
      const nx = def.chapters[q.step];
      if (nx && nx.onEnter) { try { nx.onEnter(q, d); } catch (e) { /* ignore */ } }
      VF.bus.emit('quest:step', { quest: def, step: q.step, chapter: nx });
    }
    VF.save.save();
  }

  /* A chapter that is waiting on the water finishes itself. One that is
     waiting on a conversation does not — being able to hear it is not the
     same as having heard it. */
  function evaluate(id) {
    const def = VF.questData.get(id), q = peek(id);
    if (!def || !q || !q.started || q.done) return;
    let guard = 0;
    while (guard++ < 16) {
      const ch = def.chapters[q.step];
      if (!ch || ch.talk || !ch.done) return;
      let ok = false;
      try { ok = ch.done(q, VF.state.data); } catch (e) { ok = false; }
      if (!ok) return;
      advance(id);
      if (q.done) return;
    }
  }

  /* Called by npcs.talk once the conversation has actually been had. */
  function fromNpc(spec) {
    if (!spec || !spec.id) return;
    const q = rec(spec.id);
    if (spec.flag && !q.flags[spec.flag]) {
      q.flags[spec.flag] = Date.now();
      VF.bus.emit('quest:flag', { quest: VF.questData.get(spec.id), flag: spec.flag });
    }
    if (spec.count) q.counts[spec.count] = (q.counts[spec.count] | 0) + 1;
    if (spec.advance) {
      const def = VF.questData.get(spec.id);
      const ch = def && def.chapters[q.step];
      if (ch && ch.talk) advance(spec.id);
    }
    evaluate(spec.id);
    VF.save.save();
  }

  /* ------------------------------------------------------------- the water */

  function onCatch(c) {
    for (let i = 0; i < VF.questData.list.length; i++) {
      const def = VF.questData.list[i];
      const q = peek(def.id);
      if (!q || !q.started || q.done) continue;
      const ch = def.chapters[q.step];
      if (!ch || !ch.onCatch) continue;
      try { ch.onCatch(q, c, VF.fishing.S.lastFight || {}, VF.state.data); }
      catch (e) { console.error('[quest]', e); }
      evaluate(def.id);
    }
  }

  /* Species tagged with an `event` only exist while that event is happening. */
  function eventActive(tag) {
    if (tag === 'skyfall') return !!(VF.conditions && VF.conditions.has('skyfall'));
    return false;
  }

  /* Is the current chapter the one that puts something enormous on the line? */
  function armed(id) {
    const ch = chapter(id);
    return !!(ch && ch.armsTrial);
  }
  function anyArmed() {
    for (let i = 0; i < VF.questData.list.length; i++) {
      if (armed(VF.questData.list[i].id)) return VF.questData.list[i];
    }
    return null;
  }

  /* Quests the player can see: started ones first, then finished ones. */
  function visible() {
    const out = [];
    for (let i = 0; i < VF.questData.list.length; i++) {
      const def = VF.questData.list[i];
      const q = peek(def.id);
      if (q && q.started) out.push({ def: def, q: q, done: !!q.done });
    }
    out.sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0); });
    return out;
  }
  function activeCount() {
    let n = 0;
    const v = visible();
    for (let i = 0; i < v.length; i++) if (!v[i].done) n++;
    return n;
  }

  /* If a quest is waiting on a conversation then that conversation has to be
     available, or the log is telling the player to do something they cannot
     do. They can fall out of step: any build before the stage counter and its
     payload were made atomic could consume a stage without advancing the
     quest, and the autosave would write that down. Roll the counter back so
     the conversation can be had again — it costs a player who is fine
     nothing, and it is the only way somebody already stuck gets unstuck. */
  function reconcile() {
    for (let i = 0; i < VF.questData.list.length; i++) {
      const def = VF.questData.list[i];
      const q = peek(def.id);
      if (!q || !q.started || q.done) continue;
      const ch = def.chapters[q.step];
      if (!ch || !ch.talk) continue;
      const npc = VF.npcs.get(ch.talk);
      if (!npc) continue;
      const avail = VF.npcs.availableQuest(npc);
      const cur = VF.npcs.peek(ch.talk).qstage | 0;
      if (avail < 0 || cur <= avail) continue;
      VF.npcs.rec(ch.talk).qstage = avail;
      VF.bus.emit('quest:repaired', { quest: def, npc: npc });
      VF.save.save();
    }
  }

  /* Offers are cheap to test and the tests read stats that change constantly,
     so this runs on a slow beat rather than every frame. */
  let acc = 0;
  function tick(dt) {
    acc += dt;
    if (acc < 1.5) return;
    acc = 0;
    reconcile();
    for (let i = 0; i < VF.questData.list.length; i++) {
      const def = VF.questData.list[i];
      if (!started(def.id)) offer(def);
      else evaluate(def.id);
    }
  }

  VF.quests = {
    tick: tick, rec: rec, peek: peek, objective: objective, chapter: chapter,
    started: started, complete: complete, step: step, reached: reached, at: at,
    fromNpc: fromNpc, onCatch: onCatch, advance: advance, evaluate: evaluate,
    reconcile: reconcile,
    eventActive: eventActive, armed: armed, anyArmed: anyArmed,
    visible: visible, activeCount: activeCount
  };

  VF.bus.on('fishing:landed', onCatch);
})(window.VF = window.VF || {});
