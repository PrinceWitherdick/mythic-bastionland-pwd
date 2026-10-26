/**
 * The two Actor types a Knight comes in. A `knight` is the Company's, or one
 * a player may yet take up. An `npcKnight` is one the Referee plays, such as a
 * Holding's ruler or a rival met on the road: the same sheet and rules, but
 * never one of the Company.
 */

export const KNIGHT_TYPE = "knight";
export const NPC_KNIGHT_TYPE = "npcKnight";
export const KNIGHT_TYPES = Object.freeze([KNIGHT_TYPE, NPC_KNIGHT_TYPE]);

/** The Start an NPC Knight's Virtues and GD are rolled with (p6), as the Referee's Knights are Rulers. */
export const NPC_KNIGHT_START = "ruler";

/**
 * @param {{type?: string}|null|undefined} actor
 * @returns {boolean} Whether this is a Knight of either kind, Squires among them.
 */
export const isKnight = (actor) => KNIGHT_TYPES.includes(actor?.type);

/**
 * @param {{type?: string}|null|undefined} actor
 * @returns {boolean} Whether this is a Knight of the Company's kind, Squires
 * among them, whoever holds them: never an NPC Knight.
 */
export const isCompanyKnight = (actor) => actor?.type === KNIGHT_TYPE;

/**
 * @param {{type?: string}|null|undefined} actor
 * @returns {boolean} Whether this is a Knight the Referee plays.
 */
export const isNpcKnight = (actor) => actor?.type === NPC_KNIGHT_TYPE;

/**
 * The stamp a Knight's `kindChanged` takes as they change between Knight and
 * NPC Knight: later than the last, even within one millisecond. Both kinds
 * hold the same data, and Foundry 14 sends other clients a change of type only
 * when the data replaced with it differs.
 * @param {number} [previous] The stamp they have now.
 * @param {number} [now]
 * @returns {number}
 */
export const kindStamp = (previous = 0, now = Date.now()) => Math.max(now, (Number(previous) || 0) + 1);

/**
 * Whether a Knight made before NPC Knights had a type of their own was one
 * the Referee plays, and should become an NPC Knight: one no player owns,
 * kept in the NPCs folder, or one a solo Referee marked as not riding with
 * the Company. A Squire stays as they are.
 * @param {{type?: string, isSquire?: boolean, hasPlayerOwner?: boolean, inNpcFolder?: boolean, companyKnight?: boolean}} knight
 * @returns {boolean}
 */
export const becomesNpcKnight = ({ type, isSquire, hasPlayerOwner, inNpcFolder, companyKnight }) =>
	type === KNIGHT_TYPE && !isSquire && !hasPlayerOwner && (Boolean(inNpcFolder) || companyKnight === false);
