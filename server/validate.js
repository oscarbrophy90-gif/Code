import { clampAttributes, clampPhysicalBuild } from '../shared/src/buildrules.js';

/**
 * The browser is not trusted.
 *
 * Everything that decides a competitive outcome — what your player can do, what
 * the score is, who won, what it was worth — is either computed here or checked
 * here before it is believed. A player with the console open can change what
 * their own screen says; they cannot change what this file lets through.
 *
 * The approach is CORRECTION, not rejection. A build claiming 99 in everything
 * is not refused and its owner is not banned on the strength of one packet —
 * the numbers are pulled back to what that body is actually allowed and the
 * match is built from those. Somebody who edited their attributes simply plays
 * with the build they really have, and the attempt is logged.
 */

/** Where the caps came from, so a rejection is never a mystery. */
export function validateBuild(claim, label = 'player') {
  const notes = [];
  const { build, notes: bodyNotes } = clampPhysicalBuild(claim);
  notes.push(...bodyNotes);

  const { attrs, notes: attrNotes } = clampAttributes(claim?.attrs, build);
  notes.push(...attrNotes);

  // Presentation travels as-is — a jersey colour cannot win a game — but it is
  // bounded so it cannot be used to smuggle a payload to the other client.
  const str = (v, max, fallback) => (typeof v === 'string' && v.length <= max ? v : fallback);

  const safe = {
    id: str(claim?.id, 64, 'online-player'),
    name: str(claim?.name, 24, 'Player'),
    attrs,
    badges: Array.isArray(claim?.badges) ? claim.badges.slice(0, 40) : [],
    heightIn: build.heightIn,
    weightLb: build.weightLb,
    wingspanIn: build.wingspanIn,
    position: build.position,
    jumpshotId: str(claim?.jumpshotId, 64, 'jumpshot-classic'),
    dunkPackageId: str(claim?.dunkPackageId, 64, 'dunk-standard'),
    jerseyPrimary: str(claim?.jerseyPrimary, 32, '#ff7a3d'),
    jerseySecondary: str(claim?.jerseySecondary, 32, '#0d111a'),
    skinTone: Number.isFinite(Number(claim?.skinTone)) ? Math.max(0, Math.min(9, Math.round(Number(claim.skinTone)))) : 3,
    isBot: false,
    // Never from the client: a bot flag would change how the simulation treats
    // them, and `ankleThreat` is a difficulty knob for high-level CPU only.
    archetype: str(claim?.archetype, 32, undefined),
    titleId: str(claim?.titleId, 64, undefined),
    appearance: claim?.appearance && typeof claim.appearance === 'object' ? claim.appearance : undefined,
  };

  if (notes.length > 0) {
    console.log(`[anticheat] ${label}: corrected ${notes.length} value(s) — ${notes.slice(0, 8).join('; ')}${notes.length > 8 ? ' …' : ''}`);
  }
  return { build: safe, corrections: notes };
}

/**
 * Is this score a believable next step from the last one?
 *
 * A basket is 1 or 2, and only one side scores at a time. A client that jumps
 * from 3-2 to 11-2, or edits the opponent's total down, is not reporting a
 * basketball game. The last good score stands and the attempt is logged, so a
 * dropped packet costs nothing while a fabricated one buys nothing.
 */
export function validateScore(previous, claim) {
  const next = [Math.floor(Number(claim?.[0])), Math.floor(Number(claim?.[1]))];
  if (!Number.isFinite(next[0]) || !Number.isFinite(next[1]) || next[0] < 0 || next[1] < 0) {
    return { ok: false, score: previous, reason: 'not a score' };
  }
  const d0 = next[0] - previous[0];
  const d1 = next[1] - previous[1];
  if (d0 < 0 || d1 < 0) return { ok: false, score: previous, reason: 'a score cannot go down' };
  if (d0 > 0 && d1 > 0) return { ok: false, score: previous, reason: 'both sides cannot score at once' };
  if (d0 + d1 > 3) return { ok: false, score: previous, reason: `${d0 + d1} points in one update` };
  return { ok: true, score: next, reason: null };
}
