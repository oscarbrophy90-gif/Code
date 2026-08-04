import { DUNK_PACKAGES } from '../sim/moves.ts';
import { JUMPSHOTS } from '../shooting.ts';
import type { StoreItem } from '../economy.ts';

const jerseys: StoreItem[] = [
  { id: 'jersey-starter', name: 'Blank Practice Tank', category: 'jersey', price: 0, rarity: 'common', colors: ['#e8eef5', '#8a93a6'], description: 'The one everybody starts in.' },
  { id: 'jersey-harbor', name: 'Harbor Point Tide Kit', category: 'jersey', price: 3200, rarity: 'rare', colors: ['#1a6f8f', '#5fe3d0'], description: 'Deep teal with a breaking-wave hem.' },
  { id: 'jersey-forge', name: 'Foundry Forge Kit', category: 'jersey', price: 3200, rarity: 'rare', colors: ['#c2452d', '#ffb347'], description: 'Molten orange over charcoal.' },
  { id: 'jersey-voltage', name: 'Meridian Voltage Kit', category: 'jersey', price: 3200, rarity: 'rare', colors: ['#f0c419', '#4ad9ff'], description: 'High-vis yellow with a circuit trim.' },
  { id: 'jersey-royals', name: 'Crown Heights Royals Kit', category: 'jersey', price: 3200, rarity: 'rare', colors: ['#6b3fc4', '#c9a227'], description: 'Purple and gold, crown on the chest.' },
  { id: 'jersey-elite', name: 'Elite Ladder Kit', category: 'jersey', price: 0, rarity: 'epic', colors: ['#a06bff', '#d9bcff'], requirement: 'Reach Elite rank', description: 'Only ladder players wear this one.' },
  { id: 'jersey-legend', name: 'Legend Banner Kit', category: 'jersey', price: 0, rarity: 'legendary', colors: ['#ff5c8a', '#ffd23d'], requirement: 'Reach Legend rank', description: 'Season banner stitched across the back.' },
  { id: 'jersey-midnight', name: 'Midnight Reflective', category: 'jersey', price: 7500, rarity: 'epic', colors: ['#101018', '#00e5b0'], description: 'Black-on-black that lights up under floodlights.' },
];

const shoes: StoreItem[] = [
  { id: 'shoes-starter', name: 'Court Basics', category: 'shoes', price: 0, rarity: 'common', colors: ['#f2f2f2', '#c0c6d0'], description: 'Clean white leather. Never out of style.' },
  { id: 'shoes-lowrider', name: 'Low Rider', category: 'shoes', price: 2400, rarity: 'common', colors: ['#2b2f3a', '#ee6c4d'], description: 'Low-cut, light, built for guards.' },
  { id: 'shoes-anvil', name: 'Anvil High', category: 'shoes', price: 4200, rarity: 'rare', colors: ['#5b6570', '#e04f5f'], description: 'Heavy ankle support for bigs.' },
  { id: 'shoes-flare', name: 'Solar Flare', category: 'shoes', price: 6800, rarity: 'epic', colors: ['#ff6b6b', '#ffd166'], description: 'Gradient upper that glows at dusk.' },
  { id: 'shoes-vapor', name: 'Vapor Trail', category: 'shoes', price: 9500, rarity: 'epic', colors: ['#3dd6ff', '#a03dff'], description: 'Leaves a light trail on hard cuts.' },
  { id: 'shoes-crown', name: 'Crown Jewel', category: 'shoes', price: 15000, rarity: 'legendary', colors: ['#c9a227', '#6b3fc4'], description: 'Gold-plated eyelets. Loud on purpose.' },
];

const clothing: StoreItem[] = [
  { id: 'cloth-shorts-basic', name: 'Standard Shorts', category: 'clothing', price: 0, rarity: 'common', colors: ['#3a4050', '#8a93a6'], description: 'Nothing fancy.' },
  { id: 'cloth-compression', name: 'Compression Set', category: 'clothing', price: 2600, rarity: 'common', colors: ['#161a24', '#4ad9ff'], description: 'Full sleeve and tights.' },
  { id: 'cloth-hoodie', name: 'Warmup Hoodie', category: 'clothing', price: 4800, rarity: 'rare', colors: ['#4a4f5c', '#ffcc66'], description: 'Worn to the court, never during.' },
  { id: 'cloth-vintage', name: 'Vintage Windbreaker', category: 'clothing', price: 7200, rarity: 'epic', colors: ['#2f8f5b', '#f2e6c9'], description: 'Cut from an old league catalogue.' },
];

const accessories: StoreItem[] = [
  { id: 'acc-none', name: 'None', category: 'accessory', price: 0, rarity: 'common', colors: ['#3a4050', '#3a4050'], description: 'Clean look.' },
  { id: 'acc-headband', name: 'Headband', category: 'accessory', price: 1200, rarity: 'common', colors: ['#e8eef5', '#c2452d'], description: 'Keeps the sweat out of your eyes.' },
  { id: 'acc-armsleeve', name: 'Shooting Sleeve', category: 'accessory', price: 1800, rarity: 'common', colors: ['#161a24', '#e8eef5'], description: 'Left or right, your call.' },
  { id: 'acc-chain', name: 'Court Chain', category: 'accessory', price: 5400, rarity: 'rare', colors: ['#c9a227', '#f0e0a0'], description: 'Swings on every crossover.' },
  { id: 'acc-goggles', name: 'Rec Goggles', category: 'accessory', price: 3600, rarity: 'rare', colors: ['#3b4a8f', '#dfe8ef'], description: 'Strapped tight, no excuses.' },
];

const hairstyles: StoreItem[] = [
  { id: 'hair-fade', name: 'Low Fade', category: 'hairstyle', price: 0, rarity: 'common', colors: ['#241a17', '#3a2a24'], description: 'Standard issue.' },
  { id: 'hair-buzz', name: 'Buzz', category: 'hairstyle', price: 0, rarity: 'common', colors: ['#241a17', '#3a2a24'], description: 'Zero maintenance.' },
  { id: 'hair-afro', name: 'Afro', category: 'hairstyle', price: 1500, rarity: 'common', colors: ['#1a1210', '#3a2a24'], description: 'Full and round.' },
  { id: 'hair-braids', name: 'Braids', category: 'hairstyle', price: 2400, rarity: 'rare', colors: ['#1a1210', '#4a3a30'], description: 'Straight back, tied off.' },
  { id: 'hair-locs', name: 'Locs', category: 'hairstyle', price: 2800, rarity: 'rare', colors: ['#241a17', '#5a4030'], description: 'Shoulder length.' },
  { id: 'hair-bald', name: 'Bald', category: 'hairstyle', price: 0, rarity: 'common', colors: ['#00000000', '#00000000'], description: 'Aerodynamic.' },
  { id: 'hair-topknot', name: 'Top Knot', category: 'hairstyle', price: 3200, rarity: 'rare', colors: ['#241a17', '#3a2a24'], description: 'Tied high.' },
  { id: 'hair-waves', name: 'Waves', category: 'hairstyle', price: 2000, rarity: 'common', colors: ['#1a1210', '#2f2420'], description: 'Brushed in.' },
];

const tattoos: StoreItem[] = [
  { id: 'tat-none', name: 'No Ink', category: 'tattoo', price: 0, rarity: 'common', colors: ['#00000000', '#00000000'], description: 'Blank canvas.' },
  { id: 'tat-sleeve-left', name: 'Left Sleeve', category: 'tattoo', price: 3800, rarity: 'rare', colors: ['#2a2a2a', '#4a4a4a'], description: 'Full left arm.' },
  { id: 'tat-sleeve-both', name: 'Double Sleeve', category: 'tattoo', price: 6400, rarity: 'epic', colors: ['#2a2a2a', '#4a4a4a'], description: 'Both arms, matched.' },
  { id: 'tat-chest', name: 'Chest Piece', category: 'tattoo', price: 4600, rarity: 'rare', colors: ['#2a2a2a', '#4a4a4a'], description: 'Centred across the chest.' },
  { id: 'tat-neck', name: 'Neck Script', category: 'tattoo', price: 5200, rarity: 'epic', colors: ['#2a2a2a', '#4a4a4a'], description: 'Small script, high placement.' },
];

const celebrations: StoreItem[] = [
  { id: 'celeb-nod', name: 'Slow Nod', category: 'celebration', price: 0, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'Say nothing. Nod once.' },
  { id: 'celeb-shrug', name: 'The Shrug', category: 'celebration', price: 2200, rarity: 'common', colors: ['#4aa3ff', '#dfe8ef'], description: 'Palms up. Not your fault you are open.' },
  { id: 'celeb-cold', name: 'Ice in the Veins', category: 'celebration', price: 4800, rarity: 'rare', colors: ['#3dd6ff', '#e8f7ff'], description: 'Two fingers to the forearm.' },
  { id: 'celeb-flex', name: 'Full Flex', category: 'celebration', price: 4800, rarity: 'rare', colors: ['#c2452d', '#ffb347'], description: 'Hold it for a full second.' },
  { id: 'celeb-crown', name: 'Crown Placement', category: 'celebration', price: 9000, rarity: 'epic', colors: ['#c9a227', '#6b3fc4'], description: 'Reserved for game point.' },
  { id: 'celeb-lights', name: 'Lights Out', category: 'celebration', price: 14000, rarity: 'legendary', colors: ['#a06bff', '#ff5c8a'], description: 'The park floodlights flicker on cue.' },
];

const emotes: StoreItem[] = [
  { id: 'emote-wave', name: 'Wave', category: 'emote', price: 0, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'Say hi in the park.' },
  { id: 'emote-clap', name: 'Slow Clap', category: 'emote', price: 900, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'Sincerity optional.' },
  { id: 'emote-bow', name: 'Take a Bow', category: 'emote', price: 2600, rarity: 'rare', colors: ['#c9a227', '#f0e0a0'], description: 'After a big win only.' },
  { id: 'emote-sit', name: 'Sit Down', category: 'emote', price: 3400, rarity: 'rare', colors: ['#4a4f5c', '#ee6c4d'], description: 'Court-side rest.' },
];

const courts: StoreItem[] = [
  { id: 'court-standard', name: 'Standard Blacktop', category: 'court', price: 0, rarity: 'common', colors: ['#4a4f5c', '#e8eef5'], description: 'What every park starts with.' },
  { id: 'court-hardwood', name: 'Polished Hardwood', category: 'court', price: 8000, rarity: 'rare', colors: ['#c08c4a', '#f8f4ec'], description: 'Indoor feel, glossy finish.' },
  { id: 'court-neon', name: 'Neon Grid', category: 'court', price: 13500, rarity: 'epic', colors: ['#101018', '#00e5b0'], description: 'Reactive lines that pulse on a green.' },
  { id: 'court-sand', name: 'Packed Sand', category: 'court', price: 9500, rarity: 'rare', colors: ['#e0c48a', '#fff3d6'], description: 'Beach lines burned into the surface.' },
  { id: 'court-marble', name: 'Champion Marble', category: 'court', price: 22000, rarity: 'legendary', colors: ['#e8e4dc', '#c9a227'], requirement: 'Win a Seasonal Championship', description: 'Poured for winners only.' },
];

const jumpshotItems: StoreItem[] = JUMPSHOTS.map((j) => ({
  id: `jumpshot-${j.id}`,
  name: `Jump Shot: ${j.name}`,
  category: 'jumpshot' as const,
  price: j.price,
  rarity: j.price === 0 ? ('common' as const) : j.price > 12000 ? ('epic' as const) : ('rare' as const),
  colors: ['#3ef07a', '#0f6b3a'] as [string, string],
  description: j.blurb,
}));

const dunkItems: StoreItem[] = DUNK_PACKAGES.map((d) => ({
  id: `dunk-${d.id}`,
  name: `Dunk Package: ${d.name}`,
  category: 'dunkPackage' as const,
  price: d.price,
  rarity: d.price === 0 ? ('common' as const) : d.price > 12000 ? ('legendary' as const) : d.price > 8000 ? ('epic' as const) : ('rare' as const),
  colors: ['#ff7a3d', '#ffd23d'] as [string, string],
  description: `${d.blurb} Requires ${d.requires} Dunk / ${d.requiresVertical} Vertical.`,
}));

const animations: StoreItem[] = [
  { id: 'anim-sig-cross-1', name: 'Signature Crossover: Snap', category: 'animation', price: 5600, rarity: 'rare', colors: ['#4aa3ff', '#dfe8ef'], description: 'Sharp, low, and fast off the front foot.' },
  { id: 'anim-sig-cross-2', name: 'Signature Crossover: Sway', category: 'animation', price: 5600, rarity: 'rare', colors: ['#a86bff', '#e0d0ff'], description: 'Wide sway that sells the shoulder.' },
  { id: 'anim-sig-size-1', name: 'Signature Size-Up: Metronome', category: 'animation', price: 6400, rarity: 'epic', colors: ['#3ef07a', '#0f6b3a'], description: 'Rhythmic pounds that bait a reach.' },
  { id: 'anim-sig-step-1', name: 'Signature Stepback: Drift', category: 'animation', price: 8800, rarity: 'epic', colors: ['#ff7a3d', '#ffd23d'], description: 'Long lateral drift into the shot.' },
  { id: 'anim-dribble-idle', name: 'Idle Handle: Low Pound', category: 'animation', price: 2400, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'How you hold the ball at the top.' },
];

export const STORE_ITEMS: StoreItem[] = [
  ...jerseys,
  ...shoes,
  ...clothing,
  ...accessories,
  ...hairstyles,
  ...tattoos,
  ...celebrations,
  ...emotes,
  ...courts,
  ...jumpshotItems,
  ...dunkItems,
  ...animations,
];

export const STORE_BY_ID: Record<string, StoreItem> = Object.fromEntries(STORE_ITEMS.map((i) => [i.id, i]));

export const DEFAULT_UNLOCKS = STORE_ITEMS.filter((i) => i.price === 0 && !i.requirement).map((i) => i.id);

export function itemsInCategory(category: StoreItem['category']): StoreItem[] {
  return STORE_ITEMS.filter((i) => i.category === category);
}

export const SKIN_TONES = ['#f2d3ba', '#e5be9e', '#d1a07a', '#b0784f', '#8d5a34', '#6b4326', '#4d2f1c', '#332013'];

export const FACIAL_HAIR = [
  { id: 'face-none', name: 'Clean' },
  { id: 'face-stubble', name: 'Stubble' },
  { id: 'face-goatee', name: 'Goatee' },
  { id: 'face-full', name: 'Full Beard' },
  { id: 'face-mustache', name: 'Moustache' },
];
