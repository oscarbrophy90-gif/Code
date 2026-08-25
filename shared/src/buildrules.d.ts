import type { AttributeKey, Attributes, BuildSpec, Position } from './types.ts';

/**
 * Types for `buildrules.js`. The implementation is plain JavaScript so the Node
 * server can import the very same rules the creator enforces — see the header
 * of that file for why there is no second copy.
 */

export declare const ATTRIBUTE_KEYS: AttributeKey[];
export declare const MIN_ATTRIBUTE: number;
export declare const POSITIONS: Position[];
export declare const HEIGHT_RANGE: Record<Position, { min: number; max: number }>;

/** The highest each attribute may reach for this body. */
export declare function computeCaps(build: BuildSpec): Attributes;

/** A claimed body pulled back inside what the creator would allow. */
export declare function clampPhysicalBuild(claim: unknown): {
  build: Pick<BuildSpec, 'position' | 'heightIn' | 'weightLb' | 'wingspanIn'>;
  notes: string[];
};

/** Claimed attributes pulled back inside the caps for that body. */
export declare function clampAttributes(
  claim: unknown,
  build: Pick<BuildSpec, 'position' | 'heightIn' | 'weightLb' | 'wingspanIn'>,
): { attrs: Attributes; caps: Attributes; notes: string[] };
