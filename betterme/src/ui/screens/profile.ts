import {
  ACHIEVEMENTS,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_META,
  levelTitle,
  nextRankTier,
  overallWeights,
  profileView,
  rankTierFor,
  TIER_COLORS,
  type AttributeKey,
  type Profile,
} from '../../core/index.ts';
import { store } from '../../state/store.ts';
import { bar, el, fmt, overlay, panel } from '../dom.ts';
import { navigate } from '../router.ts';
import { attributeRadar, attributeRow, overallRing, statTile, streakFlame } from '../widgets.ts';

/**
 * The player card.
 *
 * Modelled on a sports-game rating card on purpose: one big number, a shape you
 * recognise at a glance, and attributes you can point at. The dashed outline on
 * the radar is where you started — the gap between the two shapes is the entire
 * product in one picture.
 */

export function renderProfile(): HTMLElement {
  const profile = store.profile;
  if (!profile) return el('div', {});
  const view = profileView(profile);
  const tier = rankTierFor(view.overall);
  const next = nextRankTier(view.overall);
  const earned = ACHIEVEMENTS.filter((a) => profile.achievements[a.id]);

  return el(
    'div',
    { class: 'screen profile' },
    el(
      'section',
      { class: 'player-card', style: `--tier:${tier.color}` },
      el('div', { class: 'card-glow' }),
      el(
        'div',
        { class: 'card-top' },
        overallRing(view.overall, { size: 128 }),
        el(
          'div',
          { class: 'card-id' },
          el('h1', {}, profile.survey.name),
          el('div', { class: 'tier-pill', style: `--tier:${tier.color}` }, tier.label),
          el('p', { class: 'dim small' }, `Level ${view.level.level} · ${levelTitle(view.level.level)}`),
          streakFlame(profile.streak.current, profile.streak.shields),
        ),
      ),
      el(
        'div',
        { class: 'card-level' },
        el(
          'div',
          { class: 'row between' },
          el('b', {}, `Level ${view.level.level}`),
          el('em', { class: 'dim' }, `${fmt(view.level.into)} / ${fmt(view.level.needed)} XP`),
        ),
        bar(view.level.fraction, '#ffc53d'),
      ),
      next
        ? el(
            'p',
            { class: 'card-next dim small' },
            `${next.min - view.overall} more Overall to ${next.label}.`,
          )
        : el('p', { class: 'card-next dim small' }, 'Top tier reached. Now hold it.'),
      el(
        'div',
        { class: 'card-stats' },
        statTile('Started at', view.seedOverall, `now ${view.overall}`),
        statTile('Best streak', profile.streak.best, `${profile.streak.totalLockInDays} ${profile.streak.totalLockInDays === 1 ? 'day' : 'days'} locked in`),
        statTile('Days active', profile.stats.daysActive, `${fmt(profile.stats.activitiesCompleted)} activities`),
        statTile('Total XP', fmt(profile.totalXp), `${profile.stats.perfectDays} perfect days`),
      ),
    ),

    panel('Attributes', attributeRadar(view.attributes, { size: 280, compare: profile.seedAttributes }), el('p', { class: 'dim small center' }, 'Dashed outline: where you started.')),

    panel(
      null,
      el(
        'div',
        { class: 'attr-list' },
        sortedKeys(view.attributes).map((key) =>
          attributeRow(key, view.attributes[key], {
            fraction: view.nextAttributeSteps[key].fraction,
            delta: view.attributes[key] - profile.seedAttributes[key] || undefined,
            focus: profile.traits.focus.includes(key),
            onClick: () => showAttribute(profile, key),
          }),
        ),
      ),
      el('p', { class: 'dim small center' }, 'Tap an attribute to see what feeds it.'),
    ),

    earned.length > 0
      ? panel(
          'Badges',
          el(
            'div',
            { class: 'badge-strip' },
            earned
              .slice(-8)
              .reverse()
              .map((a) => el('span', { class: 'badge-chip', style: `--tier:${TIER_COLORS[a.tier]}`, title: a.blurb }, a.icon)),
          ),
          el('button', { class: 'btn ghost wide', onclick: () => navigate('achievements') }, `All achievements (${earned.length}/${ACHIEVEMENTS.length})`),
        )
      : null,

    words(profile),
  );
}

function sortedKeys(attributes: Record<AttributeKey, number>): AttributeKey[] {
  return ATTRIBUTE_KEYS.slice().sort((a, b) => attributes[b] - attributes[a]);
}

function words(profile: Profile): HTMLElement | null {
  const { strengths, weaknesses, ambition } = profile.survey;
  if (!strengths && !weaknesses && !ambition) return null;
  return panel(
    'In your own words',
    ambition ? el('div', { class: 'quote' }, el('em', { class: 'dim small' }, 'Where you want to be'), el('p', {}, ambition)) : null,
    strengths ? el('div', { class: 'quote' }, el('em', { class: 'dim small' }, 'What you’re good at'), el('p', {}, strengths)) : null,
    weaknesses ? el('div', { class: 'quote' }, el('em', { class: 'dim small' }, 'What keeps letting you down'), el('p', {}, weaknesses)) : null,
  );
}

function showAttribute(profile: Profile, key: AttributeKey): void {
  const meta = ATTRIBUTE_META[key];
  const view = profileView(profile);
  const step = view.nextAttributeSteps[key];
  const weight = overallWeights(profile.traits.focus)[key];

  overlay((close) =>
    el(
      'div',
      { class: 'attr-detail', style: `--accent:${meta.accent}` },
      el('div', { class: 'attr-detail-head' }, el('span', { class: 'attr-detail-icon' }, meta.icon), el('div', {}, el('h2', {}, meta.label), el('b', { class: 'attr-detail-value' }, String(view.attributes[key])))),
      el('p', {}, meta.blurb),
      el('p', { class: 'dim small' }, meta.measures),
      el(
        'div',
        { class: 'attr-detail-bar' },
        el('div', { class: 'row between small' }, el('span', { class: 'dim' }, `Next point`), el('b', {}, `${fmt(step.into)} / ${fmt(step.needed)} XP`)),
        bar(step.fraction, meta.accent),
      ),
      el(
        'div',
        { class: 'kv-list' },
        kv('Started at', String(profile.seedAttributes[key])),
        kv('Now', String(view.attributes[key])),
        kv('XP earned here', fmt(profile.attributeXp[key])),
        kv('Weight in Overall', weight > 1 ? `${weight}× (focus area)` : `${weight}×`),
      ),
      el('button', { class: 'btn primary wide', onclick: close }, 'Close'),
    ),
  );
}

function kv(key: string, value: string): HTMLElement {
  return el('div', { class: 'kv' }, el('span', { class: 'dim' }, key), el('b', {}, value));
}
