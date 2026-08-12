import { Rng } from '../rng.ts';

/**
 * The courts a game can be played on.
 *
 * One is drawn at the start of every match, case-opening style. They are data
 * rather than art: each is a palette the court renderer paints with, so a new
 * court is six colours and a name, and the same description drives both the
 * card on the reel and the floor you end up standing on. Nothing here loads an
 * image, which is what keeps the standalone build a single file.
 *
 * The pick is seeded from the match seed rather than from `Math.random`, so both
 * clients in an online game roll the same court — two people playing on
 * different-looking floors would be a bug you could see from space.
 */

export interface CourtSurface {
  id: string;
  name: string;
  /** the line under the name on the reel card */
  blurb: string;
  /** playing surface */
  floor: string;
  /** the key and any painted circles */
  paint: string;
  /** court markings */
  line: string;
  /** the surround the fence stands in */
  apron: string;
  /** how often it comes up, relative to the others */
  weight: number;
  /** what the card's rarity flash looks like on the reel */
  tint: string;
}

export const COURT_SURFACES: CourtSurface[] = [
  {
    id: 'cage-green',
    name: 'The Cage',
    blurb: 'Green rubber, orange key, chain-link all the way round.',
    floor: '#1f8f6b',
    paint: '#d8542f',
    line: '#f4f8fb',
    apron: '#c94a29',
    weight: 10,
    tint: '#3ef07a',
  },
  {
    id: 'sunset-peach',
    name: 'Sunset Yard',
    blurb: 'Peach asphalt with teal keys, floodlit until midnight.',
    floor: '#e9a273',
    paint: '#2f6f6a',
    line: '#fbfdff',
    apron: '#cfd6dc',
    weight: 10,
    tint: '#ffb37a',
  },
  {
    id: 'concrete-grey',
    name: 'Grey Concrete',
    blurb: 'Poured slab, painted lines, and nothing else.',
    floor: '#8d8f92',
    paint: '#7c7e82',
    line: '#f2f4f6',
    apron: '#a9adb2',
    weight: 10,
    tint: '#c6d0dc',
  },
  {
    id: 'terracotta',
    name: 'Clay Court',
    blurb: 'Deep red sport coat, cream lines, dark iron fence.',
    floor: '#a9331d',
    paint: '#8e2916',
    line: '#f6e6cf',
    apron: '#7d2413',
    weight: 8,
    tint: '#ff7a3d',
  },
  {
    id: 'sandlot',
    name: 'The Sandlot',
    blurb: 'Sun-bleached tan, hand-painted markings, trees on three sides.',
    floor: '#dfb488',
    paint: '#cfa172',
    line: '#3a2d22',
    apron: '#c08f61',
    weight: 8,
    tint: '#ffd23d',
  },
  {
    id: 'midnight-blacktop',
    name: 'Midnight Blacktop',
    blurb: 'Black tar under one working light. Rarely comes up.',
    floor: '#22242b',
    paint: '#2e313a',
    line: '#8fd4ff',
    apron: '#17181d',
    weight: 3,
    tint: '#5b8cff',
  },
];

export const COURT_SURFACE_BY_ID: Record<string, CourtSurface> = Object.fromEntries(
  COURT_SURFACES.map((c) => [c.id, c]),
);

/**
 * Which court this match is played on.
 *
 * Weighted, so Midnight Blacktop is the one you are pleased to see. Seeded from
 * the match, which makes it identical on both clients and means a replay of the
 * same seed is played on the same floor.
 */
export function pickCourtSurface(seed: number): CourtSurface {
  const rng = new Rng(seed ^ 0x0c0c0c);
  const total = COURT_SURFACES.reduce((sum, c) => sum + c.weight, 0);
  let roll = rng.next() * total;
  for (const court of COURT_SURFACES) {
    roll -= court.weight;
    if (roll <= 0) return court;
  }
  return COURT_SURFACES[0];
}

/**
 * The strip of cards the reel scrolls through before it stops.
 *
 * The winner is placed at a known index and everything before it is filler, so
 * the animation is a straight scroll to a fixed offset rather than anything
 * that has to be corrected as it lands. The filler is drawn from the same seed
 * so the reel is the same on both clients too.
 */
export function buildReel(seed: number, winner: CourtSurface, length = 44, winnerAt = 38): CourtSurface[] {
  const rng = new Rng(seed ^ 0x5ee1);
  const strip: CourtSurface[] = [];
  for (let i = 0; i < length; i++) {
    if (i === winnerAt) {
      strip.push(winner);
      continue;
    }
    // No repeat within the last two cards. One card of separation still lets
    // the reel fall into an A-B-A-B alternation, which at speed reads as two
    // courts rather than as a shuffle of six.
    const recent = new Set(strip.slice(-2).map((c) => c.id));
    let index = rng.int(0, COURT_SURFACES.length);
    for (let tries = 0; tries < COURT_SURFACES.length && recent.has(COURT_SURFACES[index].id); tries++) {
      index = (index + 1) % COURT_SURFACES.length;
    }
    strip.push(COURT_SURFACES[index]);
  }
  return strip;
}
