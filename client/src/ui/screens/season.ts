import {
  BATTLE_PASS_TIERS,
  CURRENCY_SHORT,
  RARITY_COLOR,
  STORE_BY_ID,
  XP_PER_TIER,
  buildBattlePass,
  generateChallenges,
  seasonForTime,
  seasonTimeRemaining,
  tierForPassXp,
  type ChallengeDef,
  type PassReward,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { audio } from '../../engine/audio.ts';
import { navigate, refresh } from '../../main.ts';
import { bar, el, fmt, panel, tabs, toast } from '../dom.ts';

type Tab = 'pass' | 'challenges' | 'rewards';
let tab: Tab = 'pass';

export function renderSeason(): HTMLElement {
  const now = Date.now();
  const season = seasonForTime(now);
  const remaining = seasonTimeRemaining(now);
  const pass = store.profile.battlePass;
  const progress = tierForPassXp(pass.tierXp);

  const root = el('div', { class: 'wrap' });

  root.append(
    el(
      'div',
      {
        class: 'panel clipped mb',
        style: `background:linear-gradient(120deg, ${season.accent}22, ${season.accentAlt}18), linear-gradient(180deg, var(--panel), var(--panel-2))`,
      },
      el('div', { style: `font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:${season.accent}` }, `${season.id} · 8 week season`),
      el('h1', { style: 'margin:4px 0 6px;font-size:clamp(24px,4vw,38px);font-weight:900;letter-spacing:-.02em' }, season.name.split(': ')[1] ?? season.name),
      el('p', { class: 'dim', style: 'margin:0 0 16px' }, season.theme),
      el(
        'div',
        { class: 'barrow' },
        el('span', { class: 'lbl' }, `Tier ${progress.tier} of ${BATTLE_PASS_TIERS}`),
        el('span', { class: 'val' }, `${remaining.days}d ${remaining.hours}h ${remaining.minutes}m remaining`),
        bar(progress.percent),
      ),
      el('div', { class: 'faint', style: 'font-size:11px;margin-top:6px' }, `${fmt(progress.into)} / ${fmt(XP_PER_TIER)} XP to the next tier`),
      !pass.premium
        ? el(
            'button',
            {
              class: 'btn primary',
              style: 'margin-top:14px',
              onclick: () => {
                store.update((p) => {
                  p.battlePass.premium = true;
                });
                audio.play('levelUp');
                toast('Premium track unlocked — cosmetics and boosts only, never attributes', 'good');
                refresh();
              },
            },
            'Unlock premium track',
          )
        : el('span', { class: 'pill live', style: 'margin-top:14px;display:inline-block' }, 'Premium track active'),
    ),
    tabs(
      [
        { id: 'pass', label: 'Battle pass' },
        { id: 'challenges', label: 'Challenges' },
        { id: 'rewards', label: 'Ranked rewards' },
      ],
      tab,
      (id) => {
        tab = id as Tab;
        refresh();
      },
    ),
  );

  if (tab === 'pass') root.appendChild(renderPass());
  else if (tab === 'challenges') root.appendChild(renderChallenges());
  else root.appendChild(renderRankedRewards());

  return root;
}

// --------------------------------------------------------------- battle pass

function renderPass(): HTMLElement {
  const season = seasonForTime(Date.now());
  const rewards = buildBattlePass(season);
  const pass = store.profile.battlePass;
  const currentTier = tierForPassXp(pass.tierXp).tier;

  const byTier = new Map<number, { free?: PassReward; premium?: PassReward }>();
  for (const r of rewards) {
    const entry = byTier.get(r.tier) ?? {};
    entry[r.track] = r;
    byTier.set(r.tier, entry);
  }

  const claim = (tier: number) => {
    if (tier > currentTier) {
      toast('Reach that tier first', 'bad');
      return;
    }
    if (pass.claimed.includes(tier)) return;
    const entry = byTier.get(tier);
    let currency = 0;
    if (entry?.free?.kind === 'currency') currency += entry.free.amount ?? 0;
    if (pass.premium && entry?.premium?.kind === 'currency') currency += entry.premium.amount ?? 0;

    store.update((p) => {
      p.battlePass.claimed.push(tier);
      p.players[p.activeSlot].currency += currency;
      for (const track of ['free', 'premium'] as const) {
        const reward = entry?.[track];
        if (!reward?.itemId) continue;
        if (track === 'premium' && !p.battlePass.premium) continue;
        if (!p.players[p.activeSlot].unlocked.includes(reward.itemId)) {
          p.players[p.activeSlot].unlocked.push(reward.itemId);
        }
      }
    });
    audio.play('levelUp');
    toast(currency > 0 ? `Claimed tier ${tier} — +${fmt(currency)} ${CURRENCY_SHORT}` : `Claimed tier ${tier}`, 'good');
    refresh();
  };

  return el(
    'div',
    { style: 'overflow-x:auto;padding-bottom:8px' },
    el(
      'div',
      { style: `display:grid;grid-auto-flow:column;grid-auto-columns:132px;gap:9px;grid-template-rows:auto auto auto` },
      ...[...byTier.entries()].map(([tier, entry]) => {
        const unlocked = tier <= currentTier;
        const claimed = pass.claimed.includes(tier);
        return el(
          'div',
          { style: 'display:grid;grid-row:span 3;gap:7px' },
          el(
            'div',
            {
              style: `text-align:center;font-size:11px;font-weight:900;letter-spacing:.1em;padding:5px;border-radius:3px;background:${unlocked ? 'var(--accent)' : 'var(--panel-2)'};color:${unlocked ? '#17110a' : 'var(--text-faint)'}`,
            },
            `TIER ${tier}`,
          ),
          rewardCard(entry.free, 'Free', unlocked, claimed, true),
          rewardCard(entry.premium, 'Premium', unlocked && pass.premium, claimed, pass.premium),
          el(
            'button',
            {
              class: 'btn sm block',
              disabled: !unlocked || claimed,
              onclick: () => claim(tier),
            },
            claimed ? 'Claimed' : unlocked ? 'Claim' : 'Locked',
          ),
        );
      }),
    ),
  );
}

function rewardCard(reward: PassReward | undefined, track: string, unlocked: boolean, claimed: boolean, available: boolean): HTMLElement {
  if (!reward) return el('div', {});
  const tint = track === 'Premium' ? 'var(--purple)' : 'var(--blue)';
  return el(
    'div',
    {
      class: 'panel',
      style: `padding:9px;min-height:88px;opacity:${available ? (unlocked ? 1 : 0.62) : 0.35};border-color:${claimed && unlocked ? 'var(--green)' : 'var(--line)'}`,
    },
    el('div', { style: `font-size:9px;font-weight:900;letter-spacing:.14em;color:${tint};text-transform:uppercase` }, track),
    el('div', { style: 'font-size:11.5px;font-weight:700;line-height:1.25;margin-top:4px' }, reward.name),
    el('div', { class: 'faint', style: 'font-size:9.5px;margin-top:4px;text-transform:uppercase;letter-spacing:.1em' }, reward.kind),
  );
}

// ---------------------------------------------------------------- challenges

function renderChallenges(): HTMLElement {
  const now = Date.now();
  const defs = generateChallenges(now);
  const scopes: { key: 'daily' | 'weekly' | 'seasonal'; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'seasonal', label: 'Seasonal' },
  ];

  const claim = (def: ChallengeDef) => {
    const item = def.itemReward ? STORE_BY_ID[def.itemReward] : undefined;
    const alreadyOwned = item ? store.player.unlocked.includes(item.id) : false;

    store.update((p) => {
      const state = p.challenges.find((c) => c.id === def.id);
      if (!state || state.claimed) return;
      state.claimed = true;
      const target = p.players[p.activeSlot];
      target.currency += def.currency;
      target.xp += def.xp;
      // An item you already own is paid out as coins instead, so a reward is
      // never wasted on a duplicate.
      if (item && !target.unlocked.includes(item.id)) target.unlocked.push(item.id);
      else if (item) target.currency += Math.round(item.price * 0.5);
      p.battlePass.tierXp += def.xp;
      p.battlePass.tier = Math.min(BATTLE_PASS_TIERS, Math.floor(p.battlePass.tierXp / XP_PER_TIER) + 1);
    });

    audio.play('levelUp');
    if (item && !alreadyOwned) {
      toast(`${def.name} claimed — ${item.name} unlocked, equip it in the Locker`, 'good');
    } else {
      toast(`${def.name} claimed — +${fmt(def.currency)} ${CURRENCY_SHORT}, +${fmt(def.xp)} XP`, 'good');
    }
    refresh();
  };

  return el(
    'div',
    { class: 'grid cols-3' },
    ...scopes.map((scope) =>
      panel(
        scope.label,
        ...defs
          .filter((d) => d.scope === scope.key)
          .map((d) => {
            const state = store.profile.challenges.find((c) => c.id === d.id);
            const progress = state?.progress ?? 0;
            const complete = progress >= d.target;
            const claimed = state?.claimed ?? false;
            const item = d.itemReward ? STORE_BY_ID[d.itemReward] : undefined;
            return el(
              'div',
              { style: 'padding:9px 0;border-bottom:1px solid rgba(42,51,70,.5)' },
              el('div', { style: 'font-size:13px;font-weight:800' }, d.name),
              el('div', { class: 'faint', style: 'font-size:11.5px;margin-bottom:6px' }, d.description),
              item
                ? el(
                    'button',
                    {
                      class: 'challenge-prize',
                      style: `--rarity:${RARITY_COLOR[item.rarity]};--c1:${item.colors[0]};--c2:${item.colors[1]}`,
                      title: item.description,
                      onclick: () => navigate('locker'),
                    },
                    el('span', { class: 'locker-swatch' }),
                    el(
                      'span',
                      { style: 'min-width:0;text-align:left' },
                      el('span', { class: 'locker-name' }, item.name),
                      el('span', { class: 'locker-rarity' }, `${item.rarity} reward`),
                    ),
                  )
                : null,
              el(
                'div',
                { class: 'barrow' },
                el('span', { class: 'lbl' }, `${fmt(d.currency)} ${CURRENCY_SHORT} · ${fmt(d.xp)} XP`),
                el('span', { class: 'val' }, `${progress}/${d.target}`),
                bar(Math.min(1, progress / d.target), complete ? 'green' : ''),
              ),
              complete && !claimed
                ? el('button', { class: 'btn sm block', style: 'margin-top:7px', onclick: () => claim(d) }, 'Claim')
                : claimed
                  ? el('div', { style: 'margin-top:6px;font-size:11px;color:var(--green);font-weight:800' }, 'Claimed')
                  : null,
            );
          }),
      ),
    ),
  );
}

// ------------------------------------------------------------ ranked rewards

function renderRankedRewards(): HTMLElement {
  const rows: { tier: string; color: string; reward: string; currency: number }[] = [
    { tier: 'Bronze', color: '#b3763c', reward: 'Season participation banner', currency: 2500 },
    { tier: 'Silver', color: '#9fb0c0', reward: 'Silver shoe colourway', currency: 5000 },
    { tier: 'Gold', color: '#e0b141', reward: 'Gold jersey trim + emote', currency: 9000 },
    { tier: 'Platinum', color: '#4fd6c4', reward: 'Platinum court decal', currency: 14000 },
    { tier: 'Diamond', color: '#5aa9ff', reward: 'Diamond accessory set', currency: 20000 },
    { tier: 'Elite', color: '#a06bff', reward: 'Elite Ladder Kit jersey', currency: 30000 },
    { tier: 'Legend', color: '#ff5c8a', reward: 'Legend Banner Kit + animated celebration', currency: 45000 },
  ];

  return el(
    'div',
    {},
    el('p', { class: 'hint mb' }, 'Ranked rewards are granted at the end of the season based on your highest rank reached, not where you finish — so climbing is never punished by a late losing streak.'),
    panel(
      'End of season',
      el(
        'table',
        { class: 'stats' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Tier'), el('th', {}, 'Reward'), el('th', { class: 'num' }, `Bonus ${CURRENCY_SHORT}`))),
        el(
          'tbody',
          {},
          ...rows.map((r) =>
            el(
              'tr',
              {},
              el('td', {}, el('b', { style: `color:${r.color}` }, r.tier)),
              el('td', {}, r.reward),
              el('td', { class: 'num' }, fmt(r.currency)),
            ),
          ),
        ),
      ),
    ),
  );
}
