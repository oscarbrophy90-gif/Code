import type { StoreItem } from '../economy.ts';
import type { DunkPackageDef } from '../sim/moves.ts';
import type { JumpshotDef } from '../shooting.ts';
import type { TitleDef } from './titles.ts';

/**
 * Everything the ranked path pays out.
 *
 * None of it is for sale. Every item here has `price: 0` and a requirement, so
 * it can never appear on a shelf — the only way to own a Grand Champion Crown
 * is to have been Grand Champion, which is the entire point of a seasonal
 * reward. Wearing one says something you cannot buy.
 *
 * Ids follow the renderer's convention: the second segment is the *kind*, so
 * `cloth-hoodie-rank-street` draws as a hoodie and `acc-goggles-rank-shooter`
 * draws as goggles without a lookup table anywhere. The third segment marks it
 * as ranked so the Locker can group them.
 */

/**
 * Four of the rewards in the spec were already in the game — Street Hoodie, Too
 * Small, Ice Cold and Too Easy. Those ranks pay out the item that already
 * exists rather than a second one wearing the same name, which would be
 * indistinguishable in the Locker.
 */

/** What every ranked item says in place of a price. */
const earned = (tier: string) => `Reach ${tier} and finish the season`;

function item(
  id: string,
  name: string,
  category: StoreItem['category'],
  rarity: StoreItem['rarity'],
  colors: [string, string],
  tier: string,
  description: string,
): StoreItem {
  return { id, name, category, price: 0, rarity, colors, requirement: earned(tier), description };
}

// ------------------------------------------------------------------ jumpshots

/**
 * The ranked jump shots.
 *
 * They get better as the ladder does, but never strictly better — Perfect
 * Release is the fastest release in the game with the tightest window in the
 * game, and a player who cannot hit it will shoot worse on it than on Base
 * Rise. A reward that is a straight upgrade makes the climb pointless the
 * moment somebody hands you one.
 */
export const RANK_JUMPSHOTS: JumpshotDef[] = [
  { id: 'smooth-release', rankReward: 'Emerald', name: 'Smooth Release', blurb: 'Even tempo the whole way up, and it barely notices a drift.', releaseTime: 0.6, greenWindow: 0.0225, falloff: 1.0, driftPenalty: 0.7, price: 0, timingCue: 'setPoint' },
  { id: 'lightning-release', rankReward: 'Sapphire', name: 'Lightning Release', blurb: 'Out of your hands before the contest arrives. Tiny window.', releaseTime: 0.41, greenWindow: 0.0125, falloff: 1.4, driftPenalty: 1.1, price: 0, timingCue: 'release' },
  { id: 'unblockable', rankReward: 'Diamond', name: 'Unblockable', blurb: 'High set point over everything. Slow, and it does not care.', releaseTime: 0.74, greenWindow: 0.0255, falloff: 0.82, driftPenalty: 1.05, price: 0, timingCue: 'jumpApex' },
  { id: 'deadeye', rankReward: 'Champion', name: 'Deadeye', blurb: 'Wide window and a level release. Punishes nothing.', releaseTime: 0.56, greenWindow: 0.0275, falloff: 0.95, driftPenalty: 0.85, price: 0, timingCue: 'setPoint' },
  { id: 'perfect-release', rankReward: 'Grand Champ', name: 'Perfect Release', blurb: 'The fastest release in the game and the smallest window in the game.', releaseTime: 0.38, greenWindow: 0.011, falloff: 1.5, driftPenalty: 0.9, price: 0, timingCue: 'release' },
];

// --------------------------------------------------------------------- dunks

export const RANK_DUNKS: DunkPackageDef[] = [
  { id: 'above-the-rim', rankReward: 'Emerald', name: 'Above The Rim', blurb: 'Everything finished with the wrist over the cylinder.', requires: 80, requiresVertical: 76, contactCapable: false, price: 0, duration: 0.78, rarity: 'epic' },
  { id: 'poster-machine', rankReward: 'Sapphire', name: 'Poster Machine', blurb: 'Goes straight through a set defender, every time.', requires: 86, requiresVertical: 82, contactCapable: true, price: 0, duration: 0.96, rarity: 'epic' },
  { id: 'takeover', rankReward: 'Diamond', name: 'Takeover', blurb: 'Two-hand reverse windmills off one foot at full speed.', requires: 90, requiresVertical: 86, contactCapable: true, price: 0, duration: 1.02, rarity: 'legendary' },
  { id: 'rim-reaper', rankReward: 'Champion', name: 'Rim Reaper', blurb: 'Cocked behind the head and brought down on the front iron.', requires: 92, requiresVertical: 88, contactCapable: true, price: 0, duration: 1.06, rarity: 'legendary' },
  { id: 'gravity-breaker', rankReward: 'Grand Champ', name: 'Gravity Breaker', blurb: 'Hangs at the apex a beat longer than anybody else can.', requires: 95, requiresVertical: 92, contactCapable: true, price: 0, duration: 1.14, rarity: 'mythic' },
];

// -------------------------------------------------------------------- titles

/**
 * The nine ranked titles.
 *
 * Each one names the rank that earned it, so the line under your build on the
 * walkout is a claim anybody can check against the leaderboard.
 */
export const RANK_TITLES: TitleDef[] = [
  { id: 'title-rank-bronze', name: 'Rising Hooper — Skyline', description: 'Finished a season in Bronze.', price: 0, rarity: 'common', color: '#c87d43', earn: earned('Bronze') },
  { id: 'title-rank-silver', name: 'Street Baller — Skyline', description: 'Finished a season in Silver.', price: 0, rarity: 'common', color: '#c6d0dc', earn: earned('Silver') },
  { id: 'title-rank-gold', name: 'Certified Bucket — Skyline', description: 'Finished a season in Gold.', price: 0, rarity: 'rare', color: '#ffd23d', earn: earned('Gold') },
  { id: 'title-rank-platinum', name: 'Hoop Specialist — Skyline', description: 'Finished a season in Platinum.', price: 0, rarity: 'rare', color: '#9fe8ff', earn: earned('Platinum') },
  { id: 'title-rank-emerald', name: 'Elite Hooper — Skyline', description: 'Finished a season in Emerald.', price: 0, rarity: 'epic', color: '#3ef07a', earn: earned('Emerald') },
  { id: 'title-rank-sapphire', name: 'Court Dominator — Skyline', description: 'Finished a season in Sapphire.', price: 0, rarity: 'epic', color: '#5b8cff', earn: earned('Sapphire') },
  { id: 'title-rank-diamond', name: 'Superstar — Skyline', description: 'Finished a season in Diamond.', price: 0, rarity: 'legendary', color: '#8ff2ff', earn: earned('Diamond') },
  { id: 'title-rank-champion', name: 'Champion — Skyline', description: 'Finished a season in Champion.', price: 0, rarity: 'legendary', color: '#c77dff', earn: earned('Champion') },
  { id: 'title-rank-grandchamp', name: 'King of the Court — Skyline', description: 'Finished a season as Grand Champion.', price: 0, rarity: 'mythic', color: '#ff5c8a', earn: earned('Grand Champ') },
];

// --------------------------------------------------------------------- items

export const RANK_ITEMS: StoreItem[] = [
  // Bronze
  item('emote-balltap-rank', 'Ball Tap', 'emote', 'common', ['#c87d43', '#ffd8b0'], 'Bronze', 'Two taps on the ball, eyes up.'),
  item('three-quickpoint-rank', 'Quick Point', 'threeCelebration', 'common', ['#c87d43', '#ffd8b0'], 'Bronze', 'One finger, straight back down the floor.'),

  // Silver
  item('emote-aroundtheworld-rank', 'Around The World', 'emote', 'common', ['#c6d0dc', '#f2f6fb'], 'Silver', 'The ball goes round the waist, the head, and back.'),
  item('hair-twists-rank', 'Twists', 'hairstyle', 'common', ['#241a17', '#3a2a24'], 'Silver', 'Short twists, packed tight.'),

  // Gold
  item('celeb-walkoff-rank', 'Walk Off', 'celebration', 'rare', ['#ffd23d', '#a37c00'], 'Gold', 'You do not watch it go in. You are already leaving.'),
  item('acc-snapback-rank', 'Backwards Snapback', 'accessory', 'rare', ['#1b1f2b', '#ffd23d'], 'Gold', 'Brim turned, worn all game.'),

  // Platinum
  item('shoes-phantom1s-rank', 'Phantom 1s', 'shoes', 'epic', ['#161a24', '#9fe8ff'], 'Platinum', 'Matte upper that disappears under the lights.'),
  item('cloth-compression-rank-elite', 'Elite Compression Set', 'clothing', 'epic', ['#101018', '#9fe8ff'], 'Platinum', 'Full sleeve and tights, cut for the ladder.'),
  item('emote-spintherock-rank', 'Spin The Rock', 'emote', 'rare', ['#9fe8ff', '#3d8ba3'], 'Platinum', 'On one finger, held for as long as you like.'),
  item('court-blacktop-rank', 'Blacktop', 'court', 'epic', ['#25262b', '#e8eef5'], 'Platinum', 'Repainted lines on old tar. Nothing else needed.'),

  // Emerald
  item('hair-braids-rank-elite', 'Elite Braids', 'hairstyle', 'epic', ['#1d1512', '#3ef07a'], 'Emerald', 'Straight back, tied off at the neck.'),
  item('acc-goggles-rank-shooter', 'Shooter Goggles', 'accessory', 'epic', ['#0f2e1c', '#3ef07a'], 'Emerald', 'Tinted, strapped, and never coming off.'),

  // Sapphire
  item('shoes-phantomx-rank', 'Phantom X', 'shoes', 'epic', ['#0d1018', '#5b8cff'], 'Sapphire', 'The Phantom line, rebuilt around a carbon plate.'),
  item('emote-breakhisankles-rank', 'Break His Ankles', 'emote', 'epic', ['#5b8cff', '#1f3f9e'], 'Sapphire', 'A slow look back at where they fell.'),
  item('celeb-bowdown-rank', 'Bow Down', 'celebration', 'epic', ['#5b8cff', '#1f3f9e'], 'Sapphire', 'One arm across, a full bow to the floor.'),
  item('court-neonblacktop-rank', 'Neon Blacktop', 'court', 'legendary', ['#0a0d16', '#5b8cff'], 'Sapphire', 'Every line lit from underneath the paint.'),

  // Diamond
  item('shoes-diamondx1-rank', 'Diamond X1', 'shoes', 'legendary', ['#e8f8ff', '#8ff2ff'], 'Diamond', 'Faceted sole that throws light on every cut.'),
  item('hair-locs-rank-superstar', 'Superstar Locs', 'hairstyle', 'legendary', ['#1d1512', '#8ff2ff'], 'Diamond', 'Shoulder length, pulled back off the face.'),
  item('acc-goggles-rank-diamond', 'Diamond Goggles', 'accessory', 'legendary', ['#8ff2ff', '#e8f8ff'], 'Diamond', 'Clear lens, iced frame.'),
  item('three-iceinmyveins-rank', 'Ice In My Veins', 'threeCelebration', 'legendary', ['#8ff2ff', '#1f7f96'], 'Diamond', 'Two fingers to the forearm, held.'),
  item('celeb-mvpwalk-rank', 'MVP Walk', 'celebration', 'legendary', ['#8ff2ff', '#1f7f96'], 'Diamond', 'A slow lap of the court with both arms out.'),
  item('emote-thesilencer-rank', 'The Silencer', 'emote', 'legendary', ['#0d1018', '#8ff2ff'], 'Diamond', 'One finger to the lips, turning as you go.'),

  // Champion
  item('shoes-champ1s-rank', 'Champ 1s', 'shoes', 'legendary', ['#c77dff', '#ffd23d'], 'Champion', 'Gold eyelets on a champion-purple upper.'),
  item('jersey-champion-rank', 'Champion Jersey', 'jersey', 'legendary', ['#5f2c8f', '#ffd23d'], 'Champion', 'Gold trim, champion patch on the chest.'),
  item('hair-braids-rank-crown', 'Crown Braids', 'hairstyle', 'legendary', ['#1d1512', '#ffd23d'], 'Champion', 'Braided into a band across the top.'),
  item('acc-armsleeve-rank-champion', 'Champion Arm Sleeve', 'accessory', 'legendary', ['#5f2c8f', '#ffd23d'], 'Champion', 'Full length, gold banded at the bicep.'),
  item('celeb-raisethetrophy-rank', 'Raise The Trophy', 'celebration', 'legendary', ['#ffd23d', '#a37c00'], 'Champion', 'Both hands over your head at centre court.'),
  item('emote-cantguardme-rank', "You Can't Guard Me", 'emote', 'legendary', ['#c77dff', '#5f2c8f'], 'Champion', 'A shrug, and then a point at the man who tried.'),
  item('court-championship-rank', 'Championship Court', 'court', 'legendary', ['#2a1840', '#ffd23d'], 'Champion', 'Gold-leafed lines and a trophy at centre.'),

  // Grand Champion
  item('shoes-godstep1s-rank', 'GODSTEP 1s', 'shoes', 'mythic', ['#0a0410', '#ffd23d'], 'Grand Champ', 'Nine hundred people in the world own a pair.'),
  item('jersey-grandchampion-rank', 'Grand Champion Jersey', 'jersey', 'mythic', ['#1a0a14', '#ff5c8a'], 'Grand Champ', 'Black and rose with a crown across the back.'),
  item('hair-locs-rank-royal', 'Royal Locs', 'hairstyle', 'mythic', ['#1d1512', '#ff5c8a'], 'Grand Champ', 'Long, tied high, gold cuffs through them.'),
  item('acc-crown-rank', 'Grand Champion Crown', 'accessory', 'mythic', ['#ffd23d', '#ff5c8a'], 'Grand Champ', 'You are allowed to play in it.'),
  item('three-crownthethree-rank', 'Crown The Three', 'threeCelebration', 'mythic', ['#ffd23d', '#ff5c8a'], 'Grand Champ', 'Both hands to the head as it drops.'),
  item('celeb-kingsthrone-rank', "King's Throne", 'celebration', 'mythic', ['#ff5c8a', '#8f1f42'], 'Grand Champ', 'You sit down on the court and let them look.'),
  item('court-kingdom-rank', 'The Kingdom', 'court', 'mythic', ['#10030c', '#ff5c8a'], 'Grand Champ', 'Rose light on black stone, and a crown at centre.'),
  item('aura-royal-rank', 'Royal Energy', 'aura', 'mythic', ['#ffd23d', '#ff5c8a'], 'Grand Champ', 'Gold light that follows you around the floor.'),
  item('name-gold-rank', 'Animated Gold Name', 'nameEffect', 'mythic', ['#ffd23d', '#fff4c2'], 'Grand Champ', 'Your name moves. Everywhere it appears.'),
  item('banner-grandchamp-rank', 'Grand Champion Banner', 'banner', 'mythic', ['#1a0a14', '#ff5c8a'], 'Grand Champ', 'Hangs behind you on every walkout.'),
];

export const RANK_ITEM_BY_ID: Record<string, StoreItem> = Object.fromEntries(RANK_ITEMS.map((i) => [i.id, i]));
