import {
  CURRENCY_SHORT,
  RARITY_COLOR,
  STORE_ITEMS,
  TITLE_BY_ID,
  streakBadge,
  type StoreCategory,
  type StoreItem,
} from '@hoops/shared';

import { store } from '../../state/store.ts';
import { audio } from '../../engine/audio.ts';
import { navigate, refresh } from '../../main.ts';
import { el, fmt, panel, toast } from '../dom.ts';
import { portraitEl } from '../portrait.ts';

/** Grouped so the locker room reads like a wardrobe, not a spreadsheet. */
const SECTIONS: { title: string; blurb: string; categories: StoreCategory[] }[] = [
  { title: 'Identity', blurb: 'What shows under your name when you walk out.', categories: ['title'] },
  { title: 'Kit', blurb: 'Worn on court.', categories: ['jersey', 'shoes', 'clothing'] },
  { title: 'Accessories', blurb: 'The small stuff people notice.', categories: ['accessory', 'hairstyle', 'tattoo'] },
  { title: 'Animations', blurb: 'How your shot and your dunks look and feel.', categories: ['jumpshot', 'dunkPackage', 'animation'] },
  { title: 'Flair', blurb: 'Celebrations, emotes and your home floor.', categories: ['celebration', 'emote', 'court'] },
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
  celebration: 'Celebrations',
  emote: 'Emotes',
  court: 'Courts',
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
        portraitEl(player, 84),
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
    el('div', { class: 'locker-grid' }, ...owned.map((item) => renderChip(item))),
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
    case 'emote':
      return l.emoteId === item.id;
    case 'court':
      return l.courtId === item.id;
    case 'hairstyle':
      return b.hairstyleId === item.id;
    case 'jumpshot':
      return `jumpshot-${l.jumpshotId}` === item.id;
    case 'dunkPackage':
      return `dunk-${l.dunkPackageId}` === item.id;
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
      case 'emote':
        t.loadout.emoteId = item.id;
        break;
      case 'court':
        t.loadout.courtId = item.id;
        break;
      case 'hairstyle':
        t.body.hairstyleId = item.id;
        break;
      case 'jumpshot':
        t.loadout.jumpshotId = item.id.replace('jumpshot-', '');
        break;
      case 'dunkPackage':
        t.loadout.dunkPackageId = item.id.replace('dunk-', '');
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
