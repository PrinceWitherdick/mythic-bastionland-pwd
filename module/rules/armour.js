/**
 * What a character's armour adds up to (Wearing Armour, p12). Pure, so it can
 * be tested without Foundry.
 */

/**
 * When a piece's Armour counts: always, on horseback (a rider's plate),
 * while Wounded (a brutal plate), only in some situation (cloaked mail "in
 * verdant environments only"), or in every situation but one (woven coat
 * armour with "no protection against fire").
 */
export const ARMOUR_CONDITIONS = Object.freeze(["", "mounted", "wounded", "only", "except"]);

/** The conditions whose situation is written in by hand, and ticked when it holds. */
export const SITUATION_CONDITIONS = Object.freeze(["only", "except"]);

/**
 * @typedef {object} ArmourPiece An armour item's system data.
 * @property {string} kind       One of ARMOUR_KINDS.
 * @property {number} armour
 * @property {boolean} equipped  Worn.
 * @property {boolean} [broken]
 * @property {string} [condition] One of ARMOUR_CONDITIONS.
 * @property {boolean} [holds]   Whether an "only" or "except" situation holds right now.
 */

/**
 * @typedef {object} Wearer
 * @property {boolean} [mounted]
 * @property {boolean} [wounded]
 */

/**
 * Whether a worn piece's Armour counts right now. A broken piece never does.
 * @param {ArmourPiece} piece
 * @param {Wearer} [wearer]
 * @returns {boolean}
 */
export function armourCounts(piece, { mounted = false, wounded = false } = {}) {
	if (!piece?.equipped || piece.broken) return false;
	switch (piece.condition) {
		case "mounted": return Boolean(mounted);
		case "wounded": return Boolean(wounded);
		case "only": return Boolean(piece.holds);
		case "except": return !piece.holds;
		default: return true;
	}
}

/**
 * The Armour a character has on right now. One of each type can be worn at
 * once (p12), so of two coats only the better one counts.
 * @param {ArmourPiece[]} pieces
 * @param {Wearer} [wearer]
 * @returns {number}
 */
export function armourTotal(pieces, wearer = {}) {
	const best = new Map();
	for (const piece of pieces) {
		if (!armourCounts(piece, wearer)) continue;
		const value = Math.max(0, Math.trunc(Number(piece.armour)) || 0);
		best.set(piece.kind, Math.max(best.get(piece.kind) ?? 0, value));
	}
	return [...best.values()].reduce((sum, value) => sum + value, 0);
}

/**
 * The other pieces of the same type that come off when one is put on, since
 * only one of each type can be worn at once (p12).
 * @param {{id: string, type: string, system: ArmourPiece}[]} items A character's items.
 * @param {string} id The piece being put on.
 * @returns {string[]} Ids of the worn pieces to take off.
 */
export function displacedArmour(items, id) {
	const piece = items.find((item) => item.id === id);
	if (piece?.type !== "armour") return [];
	return items
		.filter((item) => item.type === "armour" && item.id !== id && item.system.equipped && item.system.kind === piece.system.kind)
		.map((item) => item.id);
}

/**
 * What a character brings to a shieldwall (p10): a shield, a buckler (which
 * doesn't make one), or nothing to say either way, as for a character with
 * no shield among their items.
 * @param {ArmourPiece[]} pieces
 * @returns {"shield"|"buckler"|null}
 */
export function shieldwallBearing(pieces) {
	const shields = pieces.filter((piece) => piece.kind === "shield" && piece.equipped && !piece.broken);
	if (!shields.length) return null;
	return shields.some((piece) => !piece.buckler) ? "shield" : "buckler";
}

/** Words that say a weapon is made of wood, and could be broken by a Strong Gambit (p10). */
const WOODEN_WEAPON = /\b(?:wood(?:en)?|oak\w*|branch\w*|root\w*|staff|longstaff|club|cudgel|stick|bow|longbow|shortbow|curvebow|crossbow)\b/i;
/** Metal a shield might be made of, rather than wood. */
const METAL = /\b(?:iron|steel|bronze|brass|copper|gauntlet|metal|gilded|gold|silver)\b|shield-gauntlet/i;

/**
 * Whether a piece is likely made of wood, which a Strong Gambit's Greater
 * effect can break (p10). Round, kite and heater shields are, unless their
 * name says they're metal or they're a buckler; a weapon only when its name says so.
 * @param {string} name
 * @param {{type: string, kind?: string}} what
 * @returns {boolean}
 */
export function looksWooden(name, { type, kind } = {}) {
	const text = String(name ?? "");
	// A buckler is a small fist of metal more often than not.
	if (type === "armour") return kind === "shield" && !METAL.test(text) && !/buckler/i.test(text);
	if (type === "weapon") return WOODEN_WEAPON.test(text) && !METAL.test(text);
	return false;
}
