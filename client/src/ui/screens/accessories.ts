import {
  CURRENCY_SHORT,
  RARITY_COLOR,
  EMOTE_SLOTS,
  STORE_BY_ID,
  STORE_ITEMS,
  TITLE_BY_ID,
  POINTS_PER_DIVISION,
  streakBadge,
  type StoreCategory,
  type StoreItem,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { audio } from '../../engine/audio.ts';
import { navigate, refresh } from '../../main.ts';
import { el, fmt, panel, toast } from '../dom.ts';
import { AvatarRenderer, livePreview } from '../avatar.ts';
import { rankPanel, ladderStrip } from '../rankbadge.ts';
import { drawDunkFrame } from '../dunkscene.ts';

/** Grouped so the locker room reads like a wardrobe, not a spreadsheet. */
const SECTIONS: { title: string; blurb: string; categories: StoreCategory[] }[] = [
  { title: 'Identity', blurb: 'What shows under your name when you walk out.', categories: ['title'] },
  { title: 'Kit', blurb: 'Worn on court.', categories: ['jersey', 'shoes', 'clothing'] },
  { title: 'Accessories', blurb: 'The small stuff people notice.', categories: ['accessory', 'hairstyle', 'tattoo'] },
  { title: 'Animations', blurb: 'How your shot and your dunks look and feel.', categories: ['jumpshot', 'dunkPackage', 'animation'] },
  { title: 'Flair', blurb: 'What you do after a three, after a win, and the floor you do it on.', categories: ['threeCelebration', 'celebration', 'emote', 'court'] },
  // Only the top of the ladder pays these out, so the section is empty for
  // almost everybody — which is what makes it worth having.
  { title: 'Ranked spoils', blurb: 'Won on the ladder. Nothing here is for sale.', categories: ['aura', 'nameEffect', 'banner'] },
];

const CATEGORY_LABEL: Record<StoreCategory, string> = {
  title: 'Titles',
  jersey: 'Jerseys',
  shoes: 'Shoes',
  clothing: 'Clothing',
  accessory: 'Accessories',
  hairstyle: 'Hairstyles',
  tattoo: 'Tattoos',
  jumpshot: 'Jump shots',
  dunkPackage: 'Dunk packages',
  animation: 'Animations',
  celebration: 'Win celebrations',
  threeCelebration: '3-point celebrations',
  emote: 'Emotes',
  court: 'Courts',
  aura: 'Auras',
  nameEffect: 'Name effects',
  banner: 'Banners',
};

export function renderAccessories(): HTMLElement {
  const player = store.player;
  const title = TITLE_BY_ID[player.loadout.titleId];
  const streak = streakBadge(player.stats);
  const ownedCount = player.unlocked.length;

  return el(
    'div',
    { class: 'wrap' },
    el('h1', { class: 'page' }, 'Locker'),
    el(
      'p',
      { class: 'page-sub' },
      `Everything you own, ready to equip. ${ownedCount} items unlocked — buy more in the Store or earn them from challenges.`,
    ),

    // ------------------------------------------------------------- preview
    panel(
      'How you walk out',
      el(
        'div',
        { class: 'pcard' },
        lockerFigure(),
        el(
          'div',
          { class: 'meta' },
          el('div', { class: 'pname' }, player.name),
          el(
            'div',
            { class: 'row', style: 'gap:7px;margin-top:4px' },
            title && title.id !== 'title-none'
              ? el('span', { class: 'title-tag', style: `--tint:${title.color}` }, title.name)
              : el('span', { class: 'faint', style: 'font-size:12px' }, 'No title equipped'),
            streak ? el('span', { class: 'streak-tag' }, streak) : null,
          ),
          el(
            'div',
            { class: 'pline', style: 'margin-top:6px' },
            el('span', {}, `#${player.build.jerseyNumber}`),
            el('span', {}, player.build.position),
            el('span', {}, `${store.overall()} OVR`),
          ),
        ),
        // The rank sits beside the player, because it is part of who you are on
        // the walkout rather than a statistic filed away on another screen.
        rankPanel(store.profile.online, store.position()),
      ),
    ),
    el('div', { style: 'height:14px' }),

    panel(
      'Online rank',
      el(
        'p',
        { class: 'hint', style: 'margin:0 0 12px' },
        `Ranked matches only — practice, drills and the difficulty ladder do not move it. ${POINTS_PER_DIVISION} wins clears a division, three divisions clears a tier. Past Champion 1 you are Grand Champ, and from there you are placed against everyone else on the ladder.`,
      ),
      ladderStrip(store.profile.online.rp),
      el(
        'div',
        { class: 'row', style: 'gap:8px;margin-top:12px' },
        el('button', { class: 'btn sm', onclick: () => navigate('records') }, 'See the leaderboard'),
        el('button', { class: 'btn sm', onclick: () => navigate('rank') }, 'Play ranked'),
      ),
    ),
    el('div', { style: 'height:14px' }),

    ...SECTIONS.map((section) =>
      el(
        'div',
        { style: 'margin-bottom:14px' },
        panel(
          section.title,
          el('p', { class: 'hint', style: 'margin:0 0 12px' }, section.blurb),
          ...section.categories.map((cat) => renderCategory(cat)),
        ),
      ),
    ),
  );
}

function renderCategory(category: StoreCategory): HTMLElement {
  const player = store.player;
  const owned = STORE_ITEMS.filter((i) => i.category === category && player.unlocked.includes(i.id));

  // Dunk packages are animations, so show the animation rather than a swatch.
  // Emotes get the six-slot rack instead, because which emote you own matters
  // far less than which key it is on.
  const preview = category === 'dunkPackage' ? dunkPreview() : category === 'emote' ? emoteRack() : null;

  if (owned.length === 0) {
    return el(
      'div',
      { style: 'margin-bottom:14px' },
      el('div', { class: 'locker-head' }, CATEGORY_LABEL[category], el('span', { class: 'faint' }, '0 owned')),
      el(
        'div',
        { class: 'empty', style: 'padding:16px;text-align:left' },
        `Nothing here yet. `,
        el('button', { class: 'btn sm', onclick: () => navigate('store', { category }) }, 'Browse store'),
      ),
    );
  }

  return el(
    'div',
    { style: 'margin-bottom:14px' },
    el(
      'div',
      { class: 'locker-head' },
      CATEGORY_LABEL[category],
      el('span', { class: 'faint' }, `${owned.length} owned`),
    ),
    preview,
    el('div', { class: 'locker-grid' }, ...owned.map((item) => renderChip(item))),
  );
}

/**
 * Loops the equipped dunk package so you can see what you have on before you
 * take it into a game. It is the same renderer as the in-game cutaway.
 */
function dunkPreview(): HTMLElement {
  const canvas = el('canvas', { class: 'dunk-preview' }) as HTMLCanvasElement;
  const cfg = store.simConfig();
  const start = performance.now();
  let raf = 0;
  // Two things play in a game off the same package, so both are previewable
  // here: the clean flush, and the one with a defender under the rim wearing it.
  let posterized = false;

  // Only the jersey colours are read for the man getting dunked on, so a
  // stand-in in contrasting kit is all the preview needs.
  const victim = { ...cfg, name: 'Defender', jerseyPrimary: '#8c93a6', jerseySecondary: '#41485c' };

  const hint = el(
    'div',
    { class: 'hint', style: 'margin-top:6px' },
    'Your equipped package, on a loop. This is what plays when you green a dunk.',
  );

  const setMode = (poster: boolean) => {
    posterized = poster;
    normalBtn.classList.toggle('on', !poster);
    posterBtn.classList.toggle('on', poster);
    hint.textContent = poster
      ? 'The poster finish. This is what plays when you green a dunk with a defender in front of you.'
      : 'Your equipped package, on a loop. This is what plays when you green a dunk on an open rim.';
  };

  const normalBtn = el('button', { class: 'btn sm on', onclick: () => setMode(false) }, 'Normal');
  const posterBtn = el('button', { class: 'btn sm', onclick: () => setMode(true) }, 'Poster');

  const frame = (now: number) => {
    if (!canvas.isConnected) {
      cancelAnimationFrame(raf);
      return;
    }
    const ctx = canvas.getContext('2d');
    // A beat of hang at the top before it loops, so it does not feel jerky.
    const t = ((now - start) / 2600) % 1.18;
    if (ctx) {
      drawDunkFrame(ctx, canvas, {
        dunker: cfg,
        victim: posterized ? victim : null,
        packageId: store.player.loadout.dunkPackageId,
        posterized,
      }, Math.min(1, t));
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return el(
    'div',
    { style: 'margin-bottom:10px' },
    canvas,
    el('div', { style: 'display:flex;gap:6px;margin-top:8px' }, normalBtn, posterBtn),
    hint,
  );
}

/**
 * You, head to toe, wearing everything currently equipped. This is the same
 * renderer the court uses, so what the Locker shows is what walks out.
 */
function lockerFigure(): HTMLElement {
  const canvas = el('canvas', { class: 'locker-figure' }) as HTMLCanvasElement;
  const cfg = store.simConfig();
  const avatar = new AvatarRenderer();
  livePreview(canvas, () => avatar.draw(canvas, cfg));
  return canvas;
}

/**
 * The six in-game emote slots. Clicking a slot cycles it through everything you
 * own and then back to empty, so setting up a full bar is six taps rather than
 * six dialogs.
 */
function emoteRack(): HTMLElement {
  const owned = STORE_ITEMS.filter((i) => i.category === 'emote' && store.player.unlocked.includes(i.id));
  const slots = store.player.loadout.emoteSlots ?? [];

  const setSlot = (index: number, id: string | null) => {
    store.update((p) => {
      const target = p.players[p.activeSlot];
      const next = Array.from({ length: EMOTE_SLOTS }, (_, i) => target.loadout.emoteSlots?.[i] ?? null);
      next[index] = id;
      target.loadout.emoteSlots = next;
    });
    audio.play('ui');
    refresh();
  };

  const cycle = (index: number) => {
    if (owned.length === 0) return;
    const current = slots[index] ?? null;
    const at = current ? owned.findIndex((i) => i.id === current) : -1;
    // …last owned emote → empty → first owned emote → …
    const nextAt = at + 1;
    setSlot(index, nextAt >= owned.length ? null : owned[nextAt].id);
  };

  // The first filled slot plays on a loop above the rack, so choosing an emote
  // is done by watching it rather than by reading its name.
  const showing = slots.find((id): id is string => !!id) ?? null;
  const stage = el('canvas', { class: 'preview-figure wide', style: 'max-width:320px;margin:0 auto 10px' }) as HTMLCanvasElement;
  if (showing) {
    const cfg = store.simConfig();
    const avatar = new AvatarRenderer();
    const cycle = 2.6;
    livePreview(stage, (elapsed) => {
      avatar.draw(stage, cfg, { emoteId: showing, t: Math.min(1, ((elapsed % cycle) / cycle) * 1.5), zoom: 0.92 });
    });
  }

  return el(
    'div',
    { style: 'margin-bottom:12px' },
    showing ? stage : null,
    el(
      'div',
      { class: 'emote-rack' },
      ...Array.from({ length: EMOTE_SLOTS }, (_, i) => {
        const item = slots[i] ? STORE_BY_ID[slots[i] as string] : undefined;
        return el(
          'button',
          {
            class: `emote-slot ${item ? 'on' : ''}`,
            style: item ? `--c1:${item.colors[0]};--c2:${item.colors[1]}` : '',
            title: item ? `${item.name} — click to change` : 'Empty — click to fill',
            onclick: () => cycle(i),
          },
          el('span', { class: 'emote-key' }, String(i + 1)),
          el('span', { class: 'emote-name' }, item ? item.name : 'Empty'),
        );
      }),
    ),
    el(
      'div',
      { class: 'hint', style: 'margin-top:8px' },
      owned.length === 0
        ? 'Buy an emote in the store and it can go on a key here.'
        : 'Press 1 to 6 in a game to fire these. Click a slot to cycle through the emotes you own.',
    ),
  );
}

function renderChip(item: StoreItem): HTMLElement {
  const equipped = isEquipped(item);
  return el(
    'button',
    {
      class: `locker-item ${equipped ? 'on' : ''}`,
      style: `--c1:${item.colors[0]};--c2:${item.colors[1]};--rarity:${RARITY_COLOR[item.rarity]}`,
      title: item.description,
      onclick: () => {
        if (equipped) return;
        equip(item);
      },
    },
    el('span', { class: 'locker-swatch' }),
    el(
      'span',
      { style: 'min-width:0;flex:1;text-align:left' },
      el('span', { class: 'locker-name' }, item.name),
      el('span', { class: 'locker-rarity' }, item.rarity),
    ),
    equipped ? el('span', { class: 'equipped' }, 'On') : null,
  );
}

function isEquipped(item: StoreItem): boolean {
  const l = store.player.loadout;
  const b = store.player.body;
  switch (item.category) {
    case 'title':
      return l.titleId === item.id;
    case 'jersey':
      return l.jerseyId === item.id;
    case 'shoes':
      return l.shoesId === item.id;
    case 'clothing':
      return l.clothingId === item.id;
    case 'accessory':
      return l.accessoryId === item.id;
    case 'celebration':
      return l.celebrationId === item.id;
    case 'threeCelebration':
      return l.threeCelebrationId === item.id;
    case 'emote':
      return l.emoteId === item.id;
    case 'court':
      return l.courtId === item.id;
    case 'hairstyle':
      return b.hairstyleId === item.id;
    case 'tattoo':
      return l.tattooId === item.id;
    case 'jumpshot':
      return `jumpshot-${l.jumpshotId}` === item.id;
    case 'dunkPackage':
      return `dunk-${l.dunkPackageId}` === item.id;
    case 'aura':
      return l.auraId === item.id;
    case 'nameEffect':
      return l.nameEffectId === item.id;
    case 'banner':
      return l.bannerId === item.id;
    default:
      return false;
  }
}

export function equip(item: StoreItem): void {
  store.update((p) => {
    const t = p.players[p.activeSlot];
    switch (item.category) {
      case 'title':
        t.loadout.titleId = item.id;
        break;
      case 'jersey':
        t.loadout.jerseyId = item.id;
        break;
      case 'shoes':
        t.loadout.shoesId = item.id;
        break;
      case 'clothing':
        t.loadout.clothingId = item.id;
        break;
      case 'accessory':
        t.loadout.accessoryId = item.id;
        break;
      case 'celebration':
        t.loadout.celebrationId = item.id;
        break;
      case 'threeCelebration':
        t.loadout.threeCelebrationId = item.id;
        break;
      case 'emote':
        t.loadout.emoteId = item.id;
        break;
      case 'court':
        t.loadout.courtId = item.id;
        break;
      case 'hairstyle':
        t.body.hairstyleId = item.id;
        break;
      case 'tattoo':
        t.loadout.tattooId = item.id;
        break;
      case 'jumpshot':
        t.loadout.jumpshotId = item.id.replace('jumpshot-', '');
        break;
      case 'dunkPackage':
        t.loadout.dunkPackageId = item.id.replace('dunk-', '');
        break;
      // The ranked spoils. Each is a single slot and equipping one replaces it;
      // toggling off is done by equipping again, since there is only ever one.
      case 'aura':
        t.loadout.auraId = t.loadout.auraId === item.id ? null : item.id;
        break;
      case 'nameEffect':
        t.loadout.nameEffectId = t.loadout.nameEffectId === item.id ? null : item.id;
        break;
      case 'banner':
        t.loadout.bannerId = t.loadout.bannerId === item.id ? null : item.id;
        break;
      default:
        break;
    }
  });
  audio.play('ui');
  toast(`${item.name} equipped`, 'good');
  refresh();
}

export { CURRENCY_SHORT, fmt };
