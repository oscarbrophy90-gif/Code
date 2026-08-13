import { DUNK_PACKAGES } from '../sim/moves.ts';
import {
  GENERATED_ACCESSORIES,
  GENERATED_CELEBRATIONS,
  GENERATED_CLOTHING,
  GENERATED_EMOTES,
  GENERATED_JERSEYS,
  GENERATED_SHOES,
  GENERATED_THREE_CELEBRATIONS,
} from './catalogue.ts';
import { PACK_EMOTES } from './emotepack.ts';
import { ALL_TITLES } from './titles.ts';
import { PACK_TATTOOS } from './tattoopack.ts';
import { JUMPSHOTS } from '../shooting.ts';
import type { StoreItem } from '../economy.ts';
import { RANK_ITEMS } from './rankpack.ts';
import { LOOT_ITEMS } from './lootpack.ts';

const jerseys: StoreItem[] = [
  { id: 'jersey-starter', name: 'Blank Practice Tank', category: 'jersey', price: 0, rarity: 'common', colors: ['#e8eef5', '#8a93a6'], description: 'The one everybody starts in.' },
  { id: 'jersey-harbor', name: 'Harbor Point Tide Kit', category: 'jersey', price: 3200, rarity: 'rare', colors: ['#1a6f8f', '#5fe3d0'], description: 'Deep teal with a breaking-wave hem.' },
  { id: 'jersey-forge', name: 'Foundry Forge Kit', category: 'jersey', price: 3200, rarity: 'rare', colors: ['#c2452d', '#ffb347'], description: 'Molten orange over charcoal.' },
  { id: 'jersey-voltage', name: 'Meridian Voltage Kit', category: 'jersey', price: 3200, rarity: 'rare', colors: ['#f0c419', '#4ad9ff'], description: 'High-vis yellow with a circuit trim.' },
  { id: 'jersey-royals', name: 'Crown Heights Royals Kit', category: 'jersey', price: 3200, rarity: 'rare', colors: ['#6b3fc4', '#c9a227'], description: 'Purple and gold, crown on the chest.' },
  { id: 'jersey-elite', name: 'Elite Ladder Kit', category: 'jersey', price: 0, rarity: 'epic', colors: ['#a06bff', '#d9bcff'], requirement: 'Beat Superstar', description: 'Only ladder climbers wear this one.' },
  { id: 'jersey-legend', name: 'Legend Banner Kit', category: 'jersey', price: 0, rarity: 'legendary', colors: ['#ff5c8a', '#ffd23d'], requirement: 'Beat Hall of Fame', description: 'Season banner stitched across the back.' },
  { id: 'jersey-midnight', name: 'Midnight Reflective', category: 'jersey', price: 7500, rarity: 'epic', colors: ['#101018', '#00e5b0'], description: 'Black-on-black that lights up under floodlights.' },
  { id: 'jersey-ironside', name: 'Ironside Works Kit', category: 'jersey', price: 3400, rarity: 'rare', colors: ['#5a6472', '#d94f3d'], description: 'Riveted panel detail down the sides.' },
  { id: 'jersey-orchard', name: 'Orchard Street Greens', category: 'jersey', price: 3400, rarity: 'rare', colors: ['#2f8f5b', '#f2e6c9'], description: 'Cream numbers on deep green.' },
  { id: 'jersey-sundown', name: 'Sundown Classic', category: 'jersey', price: 5200, rarity: 'rare', colors: ['#ff7a3d', '#ffd23d'], description: 'The whole horizon on one chest.' },
  { id: 'jersey-static', name: 'Static Interference', category: 'jersey', price: 8600, rarity: 'epic', colors: ['#1b1f2b', '#b9c6d8'], description: 'Grain pattern that never quite sits still.' },
  { id: 'jersey-glasshouse', name: 'Glass House', category: 'jersey', price: 11000, rarity: 'legendary', colors: ['#cfe8ff', '#3d7fff'], description: 'Translucent panelling over a mirrored trim.' },
];

const shoes: StoreItem[] = [
  { id: 'shoes-starter', name: 'Court Basics', category: 'shoes', price: 0, rarity: 'common', colors: ['#f2f2f2', '#c0c6d0'], description: 'Clean white leather. Never out of style.' },
  { id: 'shoes-lowrider', name: 'Low Rider', category: 'shoes', price: 2400, rarity: 'common', colors: ['#2b2f3a', '#ee6c4d'], description: 'Low-cut, light, built for guards.' },
  { id: 'shoes-anvil', name: 'Anvil High', category: 'shoes', price: 4200, rarity: 'rare', colors: ['#5b6570', '#e04f5f'], description: 'Heavy ankle support for bigs.' },
  { id: 'shoes-flare', name: 'Solar Flare', category: 'shoes', price: 6800, rarity: 'epic', colors: ['#ff6b6b', '#ffd166'], description: 'Gradient upper that glows at dusk.' },
  { id: 'shoes-vapor', name: 'Vapor Trail', category: 'shoes', price: 9500, rarity: 'epic', colors: ['#3dd6ff', '#a03dff'], description: 'Leaves a light trail on hard cuts.' },
  { id: 'shoes-crown', name: 'Crown Jewel', category: 'shoes', price: 15000, rarity: 'legendary', colors: ['#c9a227', '#6b3fc4'], description: 'Gold-plated eyelets. Loud on purpose.' },
  { id: 'shoes-grit', name: 'Grit Trainer', category: 'shoes', price: 2800, rarity: 'common', colors: ['#6a7280', '#c9d2dd'], description: 'Ugly, cheap, and it never lets go of the floor.' },
  { id: 'shoes-cutback', name: 'Cutback 2', category: 'shoes', price: 5200, rarity: 'rare', colors: ['#1f4fd8', '#8fd0ff'], description: 'Herringbone tread built for stop-start.' },
  { id: 'shoes-ember', name: 'Ember Sole', category: 'shoes', price: 7600, rarity: 'epic', colors: ['#d43d2a', '#ffb347'], description: 'The sole glows faintly where you push off.' },
  { id: 'shoes-blackice', name: 'Black Ice', category: 'shoes', price: 12500, rarity: 'legendary', colors: ['#0d1018', '#7fe6ff'], description: 'Frosted outsole, zero grip on purpose. It still works.' },
];

const clothing: StoreItem[] = [
  { id: 'cloth-shorts-basic', name: 'Standard Shorts', category: 'clothing', price: 0, rarity: 'common', colors: ['#3a4050', '#8a93a6'], description: 'Nothing fancy.' },
  { id: 'cloth-compression', name: 'Compression Set', category: 'clothing', price: 2600, rarity: 'common', colors: ['#161a24', '#4ad9ff'], description: 'Full sleeve and tights.' },
  { id: 'cloth-hoodie', name: 'Warmup Hoodie', category: 'clothing', price: 4800, rarity: 'rare', colors: ['#4a4f5c', '#ffcc66'], description: 'Worn to the court, never during.' },
  { id: 'cloth-vintage', name: 'Vintage Windbreaker', category: 'clothing', price: 7200, rarity: 'epic', colors: ['#2f8f5b', '#f2e6c9'], description: 'Cut from an old league catalogue.' },
  { id: 'cloth-cutoff', name: 'Cut-Off Tee', category: 'clothing', price: 1800, rarity: 'common', colors: ['#33394a', '#dfe8ef'], description: 'Sleeves removed with whatever was to hand.' },
  { id: 'cloth-longshorts', name: 'Long Cut Shorts', category: 'clothing', price: 3400, rarity: 'rare', colors: ['#20242f', '#a86bff'], description: 'Below the knee, the way it used to be.' },
  { id: 'cloth-tracksuit', name: 'Full Tracksuit', category: 'clothing', price: 9800, rarity: 'epic', colors: ['#1a1a1f', '#c9a227'], description: 'Piped in gold. Worn to intimidate.' },
];

const accessories: StoreItem[] = [
  { id: 'acc-none', name: 'None', category: 'accessory', price: 0, rarity: 'common', colors: ['#3a4050', '#3a4050'], description: 'Clean look.' },
  { id: 'acc-headband', name: 'Headband', category: 'accessory', price: 1200, rarity: 'common', colors: ['#e8eef5', '#c2452d'], description: 'Keeps the sweat out of your eyes.' },
  { id: 'acc-armsleeve', name: 'Shooting Sleeve', category: 'accessory', price: 1800, rarity: 'common', colors: ['#161a24', '#e8eef5'], description: 'Left or right, your call.' },
  { id: 'acc-chain', name: 'Court Chain', category: 'accessory', price: 5400, rarity: 'rare', colors: ['#c9a227', '#f0e0a0'], description: 'Swings on every crossover.' },
  { id: 'acc-goggles', name: 'Rec Goggles', category: 'accessory', price: 3600, rarity: 'rare', colors: ['#3b4a8f', '#dfe8ef'], description: 'Strapped tight, no excuses.' },
  { id: 'acc-wristbands', name: 'Wristbands', category: 'accessory', price: 900, rarity: 'common', colors: ['#e8eef5', '#1f4fd8'], description: 'One on each arm, pushed high.' },
  { id: 'acc-kneepad', name: 'Knee Pad', category: 'accessory', price: 1600, rarity: 'common', colors: ['#161a24', '#8a93a6'], description: 'For the ones who go to the floor.' },
  { id: 'acc-mouthguard', name: 'Mouthguard', category: 'accessory', price: 2200, rarity: 'common', colors: ['#dfe8ef', '#4ad9ff'], description: 'Hangs out when you are locked in.' },
  { id: 'acc-earrings', name: 'Studs', category: 'accessory', price: 6800, rarity: 'epic', colors: ['#f0e0a0', '#c9a227'], description: 'Small, and they catch the floodlights.' },
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
  { id: 'hair-highfade', name: 'High Top Fade', category: 'hairstyle', price: 2600, rarity: 'rare', colors: ['#1a1210', '#3a2a24'], description: 'Squared off and tall.' },
  { id: 'hair-cornrows', name: 'Cornrows', category: 'hairstyle', price: 2800, rarity: 'rare', colors: ['#1a1210', '#4a3a30'], description: 'Tight rows, straight back.' },
  { id: 'hair-curls', name: 'Loose Curls', category: 'hairstyle', price: 2200, rarity: 'common', colors: ['#241a17', '#4a3226'], description: 'Grown out and left alone.' },
];

const tattoos: StoreItem[] = [
  { id: 'tat-none', name: 'No Ink', category: 'tattoo', price: 0, rarity: 'common', colors: ['#00000000', '#00000000'], description: 'Blank canvas.' },
  { id: 'tat-sleeve-left', name: 'Left Sleeve', category: 'tattoo', price: 3800, rarity: 'rare', colors: ['#2a2a2a', '#4a4a4a'], description: 'Full left arm.' },
  { id: 'tat-sleeve-both', name: 'Double Sleeve', category: 'tattoo', price: 6400, rarity: 'epic', colors: ['#2a2a2a', '#4a4a4a'], description: 'Both arms, matched.' },
  { id: 'tat-chest', name: 'Chest Piece', category: 'tattoo', price: 4600, rarity: 'rare', colors: ['#2a2a2a', '#4a4a4a'], description: 'Centred across the chest.' },
  { id: 'tat-neck', name: 'Neck Script', category: 'tattoo', price: 5200, rarity: 'epic', colors: ['#2a2a2a', '#4a4a4a'], description: 'Small script, high placement.' },
  { id: 'tat-forearm', name: 'Forearm Band', category: 'tattoo', price: 2600, rarity: 'common', colors: ['#2a2a2a', '#4a4a4a'], description: 'One solid band, just below the elbow.' },
  { id: 'tat-back', name: 'Back Piece', category: 'tattoo', price: 7400, rarity: 'epic', colors: ['#2a2a2a', '#4a4a4a'], description: 'Shoulder blade to waist.' },
  { id: 'tat-full', name: 'Full Body', category: 'tattoo', price: 16000, rarity: 'legendary', colors: ['#1f1f1f', '#5a5a5a'], description: 'Nothing left uncovered.' },
];

const celebrations: StoreItem[] = [
  { id: 'celeb-nod', name: 'Slow Nod', category: 'celebration', price: 0, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'Say nothing. Nod once.' },
  { id: 'celeb-shrug', name: 'The Shrug', category: 'celebration', price: 2200, rarity: 'common', colors: ['#4aa3ff', '#dfe8ef'], description: 'Palms up. Not your fault you are open.' },
  { id: 'celeb-cold', name: 'Ice in the Veins', category: 'celebration', price: 4800, rarity: 'rare', colors: ['#3dd6ff', '#e8f7ff'], description: 'Two fingers to the forearm.' },
  { id: 'celeb-flex', name: 'Full Flex', category: 'celebration', price: 4800, rarity: 'rare', colors: ['#c2452d', '#ffb347'], description: 'Hold it for a full second.' },
  { id: 'celeb-crown', name: 'Crown Placement', category: 'celebration', price: 9000, rarity: 'epic', colors: ['#c9a227', '#6b3fc4'], description: 'Reserved for game point.' },
  { id: 'celeb-lights', name: 'Lights Out', category: 'celebration', price: 14000, rarity: 'legendary', colors: ['#a06bff', '#ff5c8a'], description: 'The park floodlights flicker on cue.' },
  { id: 'celeb-walkoff', name: 'Walk It Off', category: 'celebration', price: 3600, rarity: 'common', colors: ['#8a93a6', '#dfe8ef'], description: 'Turn and walk. Do not watch it go in.' },
  { id: 'celeb-toobig', name: 'Too Big', category: 'celebration', price: 6200, rarity: 'rare', colors: ['#4aa3ff', '#e8f7ff'], description: 'Hand held flat above your own head.' },
  { id: 'celeb-nightnight', name: 'Night Night', category: 'celebration', price: 11000, rarity: 'epic', colors: ['#2a1f6b', '#8fa8ff'], description: 'Two hands, one cheek, eyes closed.' },
];

const emotes: StoreItem[] = [
  { id: 'emote-wave', name: 'Wave', category: 'emote', price: 0, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'Say hi in the park.' },
  { id: 'emote-clap', name: 'Sarcastic Clap', category: 'emote', price: 900, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'Sincerity optional.' },
  { id: 'emote-bow', name: 'Take a Bow', category: 'emote', price: 2600, rarity: 'rare', colors: ['#c9a227', '#f0e0a0'], description: 'After a big win only.' },
  { id: 'emote-sit', name: 'Sit Down', category: 'emote', price: 3400, rarity: 'rare', colors: ['#4a4f5c', '#ee6c4d'], description: 'Court-side rest.' },
  { id: 'emote-shrug', name: 'Shrug', category: 'emote', price: 0, rarity: 'common', colors: ['#8a93a6', '#dfe8ef'], description: 'Palms up. No idea how that went in.' },
  { id: 'emote-point', name: 'Point', category: 'emote', price: 0, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'Straight down the floor at them.' },
  { id: 'emote-flex', name: 'Flex', category: 'emote', price: 1400, rarity: 'common', colors: ['#c2452d', '#ffb347'], description: 'Both arms, held.' },
  { id: 'emote-facepalm', name: 'Facepalm', category: 'emote', price: 1400, rarity: 'common', colors: ['#5a6472', '#dfe8ef'], description: 'For your own misses.' },
  { id: 'emote-heartbreak', name: 'Heartbreak', category: 'emote', price: 2200, rarity: 'common', colors: ['#d94f6a', '#ffc0cb'], description: 'Hand on chest, head back.' },
  { id: 'emote-callit', name: 'Call It', category: 'emote', price: 2600, rarity: 'rare', colors: ['#4aa3ff', '#e8f7ff'], description: 'Point at the spot before you shoot from it.' },
  { id: 'emote-nonono', name: 'No No No', category: 'emote', price: 2800, rarity: 'rare', colors: ['#3ef07a', '#0f6b3a'], description: 'One finger, side to side, after a block.' },
  { id: 'emote-timeout', name: 'Timeout', category: 'emote', price: 2400, rarity: 'rare', colors: ['#dfe8ef', '#8a93a6'], description: 'T with both hands. Purely decorative.' },
  { id: 'emote-crown', name: 'Crown', category: 'emote', price: 7800, rarity: 'epic', colors: ['#c9a227', '#f0e0a0'], description: 'Set it on your own head.' },
  { id: 'emote-mic', name: 'Mic Drop', category: 'emote', price: 8600, rarity: 'epic', colors: ['#a86bff', '#e0d0ff'], description: 'Nothing left to say.' },
];

/**
 * Fired the moment a three goes down, during the beat before the ball is checked
 * back in. Separate from the win celebration because they happen at completely
 * different moments and you want different things at each.
 */
const threeCelebrations: StoreItem[] = [
  { id: 'three-none', name: 'Straight Back', category: 'threeCelebration', price: 0, rarity: 'common', colors: ['#8a93a6', '#dfe8ef'], description: 'Nothing at all. Turn and get back on defence.' },
  { id: 'three-hold', name: 'Hold the Follow', category: 'threeCelebration', price: 0, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'Freeze the wrist and admire it.' },
  { id: 'three-threetothehead', name: 'Three to the Head', category: 'threeCelebration', price: 2400, rarity: 'common', colors: ['#4aa3ff', '#e8f7ff'], description: 'Three fingers, straight to the temple.' },
  { id: 'three-cold', name: 'Ice Cold', category: 'threeCelebration', price: 3800, rarity: 'rare', colors: ['#3dd6ff', '#e8f7ff'], description: 'Two fingers to the forearm, walking away.' },
  { id: 'three-goggles', name: 'Night Goggles', category: 'threeCelebration', price: 4600, rarity: 'rare', colors: ['#2a1f6b', '#8fa8ff'], description: 'Both hands to the eyes, framing the shot.' },
  { id: 'three-bang', name: 'Bang Bang', category: 'threeCelebration', price: 5400, rarity: 'rare', colors: ['#c2452d', '#ffb347'], description: 'Two shots fired down the floor.' },
  { id: 'three-shimmy', name: 'The Shimmy', category: 'threeCelebration', price: 7200, rarity: 'epic', colors: ['#a86bff', '#e0d0ff'], description: 'Shoulders going, backpedalling the whole way.' },
  { id: 'three-fromdeep', name: 'From Way Downtown', category: 'threeCelebration', price: 9800, rarity: 'epic', colors: ['#ff7a3d', '#ffd23d'], description: 'Arms out wide, turning to the whole park.' },
  { id: 'three-toosmall', name: 'Too Small', category: 'threeCelebration', price: 12500, rarity: 'legendary', colors: ['#c9a227', '#f0e0a0'], description: 'Hand flat over his head on the way back.' },
];

const courts: StoreItem[] = [
  { id: 'court-standard', name: 'Standard Blacktop', category: 'court', price: 0, rarity: 'common', colors: ['#4a4f5c', '#e8eef5'], description: 'What every park starts with.' },
  { id: 'court-hardwood', name: 'Polished Hardwood', category: 'court', price: 8000, rarity: 'rare', colors: ['#c08c4a', '#f8f4ec'], description: 'Indoor feel, glossy finish.' },
  { id: 'court-neon', name: 'Neon Grid', category: 'court', price: 13500, rarity: 'epic', colors: ['#101018', '#00e5b0'], description: 'Reactive lines that pulse on a green.' },
  { id: 'court-sand', name: 'Packed Sand', category: 'court', price: 9500, rarity: 'rare', colors: ['#e0c48a', '#fff3d6'], description: 'Beach lines burned into the surface.' },
  { id: 'court-marble', name: 'Champion Marble', category: 'court', price: 22000, rarity: 'legendary', colors: ['#e8e4dc', '#c9a227'], requirement: 'Complete the career ladder', description: 'Poured for winners only.' },
  { id: 'court-rooftop', name: 'Rooftop Tar', category: 'court', price: 7400, rarity: 'rare', colors: ['#2b2b30', '#d94f3d'], description: 'Patched, repainted, and higher than everything else.' },
  { id: 'court-chalk', name: 'Chalk Lines', category: 'court', price: 6200, rarity: 'rare', colors: ['#3d4350', '#f2f2f2'], description: 'Drawn on by hand and redrawn every week.' },
  { id: 'court-glass', name: 'Glass Floor', category: 'court', price: 18000, rarity: 'epic', colors: ['#0e1420', '#6fd8ff'], description: 'Lit from underneath.' },
  { id: 'court-void', name: 'The Void', category: 'court', price: 52000, rarity: 'mythic', rotationOnly: true, colors: ['#000000', '#ff4d8d'], description: 'No floor at all. Just the lines, hanging in the dark.' },
];

const jumpshotItems: StoreItem[] = JUMPSHOTS.map((j) => ({
  id: `jumpshot-${j.id}`,
  name: `Jump Shot: ${j.name}`,
  category: 'jumpshot' as const,
  price: j.price,
  rarity: j.price === 0 ? ('common' as const) : j.price > 12000 ? ('epic' as const) : ('rare' as const),
  colors: ['#3ef07a', '#0f6b3a'] as [string, string],
  // A ranked shot is free and ungated on price alone, which would put it in
  // everybody's starting loadout. The gate is what keeps it earned.
  requirement: j.rankReward ? `Reach ${j.rankReward} and finish the season` : undefined,
  description: j.blurb,
}));

const dunkItems: StoreItem[] = DUNK_PACKAGES.map((d) => ({
  id: `dunk-${d.id}`,
  name: `Dunk Package: ${d.name}`,
  category: 'dunkPackage' as const,
  price: d.price,
  // A package that states its tier is taken at its word; the older ones without
  // one fall back to reading it off the price.
  rarity:
    d.rarity ??
    (d.mythic
      ? ('mythic' as const)
      : d.price === 0
        ? ('common' as const)
        : d.price > 12000
          ? ('legendary' as const)
          : d.price > 8000
            ? ('epic' as const)
            : ('rare' as const)),
  rotationOnly: d.mythic && !d.rankReward,
  requirement: d.rankReward ? `Reach ${d.rankReward} and finish the season` : undefined,
  colors: (d.mythic ? ['#05060a', '#ff4d8d'] : ['#ff7a3d', '#ffd23d']) as [string, string],
  description: `${d.blurb} Requires ${d.requires} Dunk / ${d.requiresVertical} Vertical.`,
}));

const animations: StoreItem[] = [
  { id: 'anim-sig-cross-1', name: 'Signature Crossover: Snap', category: 'animation', price: 5600, rarity: 'rare', colors: ['#4aa3ff', '#dfe8ef'], description: 'Sharp, low, and fast off the front foot.' },
  { id: 'anim-sig-cross-2', name: 'Signature Crossover: Sway', category: 'animation', price: 5600, rarity: 'rare', colors: ['#a86bff', '#e0d0ff'], description: 'Wide sway that sells the shoulder.' },
  { id: 'anim-sig-size-1', name: 'Signature Size-Up: Metronome', category: 'animation', price: 6400, rarity: 'epic', colors: ['#3ef07a', '#0f6b3a'], description: 'Rhythmic pounds that bait a reach.' },
  { id: 'anim-sig-step-1', name: 'Signature Stepback: Drift', category: 'animation', price: 8800, rarity: 'epic', colors: ['#ff7a3d', '#ffd23d'], description: 'Long lateral drift into the shot.' },
  { id: 'anim-dribble-idle', name: 'Idle Handle: Low Pound', category: 'animation', price: 2400, rarity: 'common', colors: ['#8a93a6', '#e8eef5'], description: 'How you hold the ball at the top.' },
  { id: 'anim-sig-hesi-1', name: 'Signature Hesitation: Freeze', category: 'animation', price: 6000, rarity: 'rare', colors: ['#4ad9ff', '#e8f7ff'], description: 'A full stop that sells the pull-up.' },
  { id: 'anim-sig-spin-1', name: 'Signature Spin: Whip', category: 'animation', price: 7200, rarity: 'epic', colors: ['#ff7a3d', '#ffd23d'], description: 'Tight spin off the pivot with the shoulder low.' },
  { id: 'anim-landing-1', name: 'Landing: Stick It', category: 'animation', price: 3000, rarity: 'common', colors: ['#8a93a6', '#dfe8ef'], description: 'Land square and hold, no stumble.' },
  { id: 'anim-sig-euro-1', name: 'Signature Eurostep: Long Second', category: 'animation', price: 9400, rarity: 'epic', colors: ['#3ef07a', '#0f6b3a'], description: 'Second step stretched out past the help.' },
  { id: 'anim-warmup-1', name: 'Warmup: Half Court Heave', category: 'animation', price: 26000, rarity: 'mythic', rotationOnly: true, colors: ['#0a0616', '#ff4d8d'], description: 'Your walkout ends with one from the logo. It goes in.' },
];

// Every title is a store item so the locker can list them all — the two
// starters are free and ungated, so they land in DEFAULT_UNLOCKS.
const titleItems: StoreItem[] = ALL_TITLES.map((t) => ({
  id: t.id,
  name: t.name,
  category: 'title' as const,
  price: t.price,
  rarity: t.rarity,
  // Mythics are never on a normal shelf, in every other category too.
  rotationOnly: t.rarity === 'mythic' || undefined,
  colors: [t.color, '#101018'] as [string, string],
  requirement: t.price === 0 ? t.earn : undefined,
  description: t.description,
}));

export const STORE_ITEMS: StoreItem[] = [
  ...titleItems,
  ...jerseys,
  ...GENERATED_JERSEYS,
  ...shoes,
  ...GENERATED_SHOES,
  ...clothing,
  ...GENERATED_CLOTHING,
  ...accessories,
  ...GENERATED_ACCESSORIES,
  ...hairstyles,
  ...tattoos,
  ...PACK_TATTOOS,
  ...celebrations,
  ...GENERATED_CELEBRATIONS,
  ...threeCelebrations,
  ...GENERATED_THREE_CELEBRATIONS,
  ...emotes,
  ...GENERATED_EMOTES,
  ...PACK_EMOTES,
  ...courts,
  ...jumpshotItems,
  ...dunkItems,
  ...animations,
  ...RANK_ITEMS,
  // Crate stock. In the catalogue so the Locker, the previews and every
  // id lookup can see it; kept off the shelves and out of DEFAULT_UNLOCKS by
  // its crateOnly flag rather than by living in a second catalogue nothing
  // else knows about.
  ...LOOT_ITEMS,
];

export const STORE_BY_ID: Record<string, StoreItem> = Object.fromEntries(STORE_ITEMS.map((i) => [i.id, i]));

export const DEFAULT_UNLOCKS = STORE_ITEMS.filter((i) => i.price === 0 && !i.requirement && !i.crateOnly).map((i) => i.id);

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
