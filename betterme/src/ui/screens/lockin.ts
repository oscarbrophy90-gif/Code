import {
  ATTRIBUTE_META,
  comebackLine,
  greeting,
  levelProgress,
  lockInGoal,
  longDate,
  MAX_SWAPS_PER_DAY,
  partOfDay,
  profileView,
  rankTierFor,
  tierLabel,
  type DayRecord,
  type PlannedActivity,
  type Profile,
} from '../../core/index.ts';
import { store } from '../../state/store.ts';
import { celebrate } from '../celebrate.ts';
import { bar, el, fmt, toast } from '../dom.ts';
import { navigate } from '../router.ts';
import { showDaySummary } from '../summary.ts';
import { streakFlame } from '../widgets.ts';

/**
 * The Lock In screen — the one people open every day.
 *
 * Everything above the fold answers a single question: *what do I have to do
 * today, and how close am I?* Ratings, charts and badges deliberately live on
 * other screens; this one is a list you can work through with a thumb.
 */

export function renderLockIn(): HTMLElement {
  const profile = store.profile;
  const day = store.day;
  if (!profile || !day) return el('div', {});

  const view = profileView(profile);
  const goal = lockInGoal(day.plan);
  const core = day.plan.filter((a) => a.kind !== 'challenge');
  const coreDone = core.filter((a) => day.completed.includes(a.id)).length;

  return el(
    'div',
    { class: 'screen lockin' },
    header(profile, view),
    comebackBanner(),
    progressCard(day, goal, coreDone, core.length),
    el(
      'div',
      { class: 'task-list' },
      day.plan.map((activity) => taskCard(activity, day)),
    ),
    footer(day, coreDone, goal),
  );
}

function header(profile: Profile, view: ReturnType<typeof profileView>): HTMLElement {
  const tier = rankTierFor(view.overall);
  const level = levelProgress(profile.totalXp);

  return el(
    'header',
    { class: 'lockin-head' },
    el(
      'div',
      { class: 'row between center' },
      el(
        'div',
        {},
        el('span', { class: 'kicker dim' }, longDate(store.today)),
        el('h1', {}, `Lock in, ${profile.survey.name}`),
      ),
      streakFlame(profile.streak.current, profile.streak.shields),
    ),
    el('p', { class: 'greeting' }, greeting(partOfDay(), store.today, profile)),
    el(
      'button',
      { class: 'level-strip', onclick: () => navigate('profile'), 'aria-label': 'Open your profile' },
      el('span', { class: 'ovr-pill', style: `--tier:${tier.color}` }, el('b', {}, String(view.overall)), el('em', {}, 'OVR')),
      el(
        'span',
        { class: 'level-body' },
        el('span', { class: 'row between' }, el('b', {}, `Level ${level.level}`), el('em', { class: 'dim' }, `${fmt(level.into)} / ${fmt(level.needed)} XP`)),
        bar(level.fraction, '#ffc53d'),
      ),
    ),
  );
}

function comebackBanner(): HTMLElement | null {
  const opened = store.lastOpen;
  if (!opened) return null;

  if (opened.streakBroken) {
    return el(
      'div',
      { class: 'banner soft' },
      el('b', {}, 'Welcome back.'),
      el('p', {}, comebackLine(opened.missedDays, store.today)),
      el('p', { class: 'dim small' }, `Everything you earned is still on your card. Today's activities pay a +25% comeback bonus.`),
    );
  }
  if (opened.shieldsUsed > 0) {
    return el(
      'div',
      { class: 'banner good' },
      el('b', {}, `🛡 Streak shield used`),
      el('p', {}, `You missed ${opened.shieldsUsed === 1 ? 'a day' : `${opened.shieldsUsed} days`} — a shield covered it. Streak still ${store.profile?.streak.current}.`),
    );
  }
  return null;
}

function progressCard(day: DayRecord, goal: number, coreDone: number, coreTotal: number): HTMLElement {
  const done = day.completed.length;
  const total = day.plan.length;
  const xp = day.xpEarned;

  return el(
    'section',
    { class: `today-card ${day.lockedIn ? 'locked' : ''}` },
    el(
      'div',
      { class: 'row between center' },
      el('div', {}, el('b', { class: 'big' }, `${done}`), el('span', { class: 'dim' }, ` / ${total} done`)),
      el('div', { class: 'row gap center' }, el('b', { class: 'xp-total' }, `+${fmt(xp)}`), el('span', { class: 'dim' }, 'XP today')),
    ),
    bar(total === 0 ? 0 : done / total, '#3ef07a'),
    el(
      'p',
      { class: `lock-note ${day.lockedIn ? 'on' : ''}` },
      day.lockedIn
        ? '🔒 Day locked in. Anything else today is bonus.'
        : `${Math.max(0, goal - coreDone)} more of your ${coreTotal} main activities to lock the day in.`,
    ),
  );
}

function taskCard(activity: PlannedActivity, day: DayRecord): HTMLElement {
  const done = day.completed.includes(activity.id);
  const meta = ATTRIBUTE_META[activity.attribute];
  const card = el('article', {
    class: `task-card ${done ? 'done' : ''} kind-${activity.kind}`,
    style: `--accent:${meta.accent}`,
  });

  const check = el(
    'button',
    {
      class: 'check',
      'aria-pressed': done,
      'aria-label': done ? `Undo ${activity.title}` : `Complete ${activity.title}`,
      onclick: () => toggle(activity, done, card),
    },
    done ? '✓' : '',
  );

  const swapLeft = MAX_SWAPS_PER_DAY - day.swapsUsed;
  const canSwap = !done && swapLeft > 0;

  card.appendChild(check);
  card.appendChild(
    el(
      'div',
      { class: 'task-body' },
      el(
        'div',
        { class: 'task-top' },
        el('span', { class: 'attr-tag' }, meta.icon, ' ', meta.label),
        activity.kind === 'challenge' ? el('span', { class: 'chip challenge' }, '★ Challenge') : null,
        activity.kind === 'keystone' ? el('span', { class: 'chip keystone' }, '◆ Keystone') : null,
        el('span', { class: `chip tier-${activity.tier}` }, tierLabel(activity.tier)),
        el('span', { class: 'xp-chip' }, `+${activity.xp}`),
      ),
      el('h4', {}, activity.title),
      el('p', { class: 'dim' }, activity.detail),
      el(
        'div',
        { class: 'task-foot' },
        activity.secondary ? el('span', { class: 'dim small' }, `also ${ATTRIBUTE_META[activity.secondary].label}`) : null,
        activity.when ? el('span', { class: 'dim small' }, `best in the ${activity.when === 'daytime' ? 'day' : activity.when}`) : null,
        canSwap
          ? el(
              'button',
              {
                class: 'link-btn',
                onclick: () => {
                  const replacement = store.swapActivity(activity.id);
                  toast(replacement ? `Swapped for “${replacement.title}”` : 'Nothing suitable to swap in today.', replacement ? 'info' : 'bad');
                },
              },
              `Can’t do this — swap (${swapLeft} left)`,
            )
          : null,
      ),
    ),
  );

  return card;
}

function toggle(activity: PlannedActivity, done: boolean, card: HTMLElement): void {
  if (done) {
    if (store.undo(activity.id)) toast('Unticked. No hard feelings.', 'info');
    return;
  }
  const result = store.complete(activity.id);
  if (!result) return;
  celebrate(result, card);
}

function footer(day: DayRecord, coreDone: number, goal: number): HTMLElement {
  const anythingDone = day.completed.length > 0;
  return el(
    'div',
    { class: 'lockin-foot' },
    el(
      'button',
      { class: `btn ${anythingDone ? 'primary' : 'ghost'} wide`, onclick: () => showDaySummary(store.today) },
      anythingDone ? 'See today’s summary' : 'Nothing done yet — see the day',
    ),
    el(
      'p',
      { class: 'dim small center' },
      day.lockedIn
        ? `Streak safe. ${coreDone} of ${goal} needed — you cleared it.`
        : 'Missing a day costs you nothing but the streak. Come back tomorrow either way.',
    ),
  );
}
