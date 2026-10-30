/**
 * The arms a Holding flies on the Realm map: the shield of the Knight ruling
 * it through their Domain, at the top right of its icon, as a Knight's Token
 * wears theirs. Only the choosing and the geometry live here, so they can be
 * tested without a canvas.
 */
import { heraldryBadge } from "./token-heraldry.js";

/** The shield's height, as a share of the Holding's icon. Small enough to clear a Seat's crown at its top. */
export const ARMS_SHARE = 0.34;

/** How strongly the Referee sees arms on a Holding hidden from the players, as Foundry shows hidden Tiles. */
export const HIDDEN_ALPHA = 0.5;

/**
 * @typedef {object} HoldingTile A Holding's Tile on the map.
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} alpha
 * @property {boolean} hidden
 */

/**
 * @typedef {object} HoldingArms What a Holding's shield is painted with.
 * @property {string} src The heraldry, or the Domain's picture.
 * @property {"fill"|"cover"} fit "fill" for heraldry, painted to the shield; "cover" for a picture.
 */

/**
 * @typedef {object} HoldingArmsMark One shield to draw.
 * @property {string} id The Holding's Tile id.
 * @property {string} src
 * @property {"fill"|"cover"} fit
 * @property {number} alpha
 * @property {ReturnType<typeof heraldryBadge>} badge Where the shield goes, in Scene pixels.
 */

/**
 * @param {{x: number, y: number, width: number, height: number}} box A Holding's icon.
 * @returns {ReturnType<typeof heraldryBadge>} Where its shield goes.
 */
export const holdingArmsBadge = (box) => heraldryBadge(box, Math.min(box.width, box.height), { share: ARMS_SHARE });

/**
 * The domain's arms as a Holding shows them.
 * @param {{picture: string}|{heraldry: string}} shown From domainArms or domainArmsView.
 * @returns {HoldingArms|null} Null where there's nothing painted.
 */
export function holdingArmsOf(shown) {
	if (shown?.picture) return { src: shown.picture, fit: "cover" };
	if (shown?.heraldry) return { src: shown.heraldry, fit: "fill" };
	return null;
}

/**
 * The shields to draw on a Realm's Holdings.
 * @param {object} options
 * @param {HoldingTile[]} options.tiles The Holdings' Tiles, not their Seats' crowns.
 * @param {(id: string) => HoldingArms|null} options.armsFor The arms a Holding flies, by its Tile id.
 * @param {boolean} options.isGM Whether the Referee is looking, who sees the hidden ones faintly.
 * @returns {HoldingArmsMark[]}
 */
export function holdingArmsMarks({ tiles, armsFor, isGM }) {
	const marks = [];
	for (const tile of tiles) {
		if (tile.hidden && !isGM) continue;
		const arms = armsFor(tile.id);
		if (!arms) continue;
		const alpha = tile.alpha * (tile.hidden ? HIDDEN_ALPHA : 1);
		marks.push({ id: tile.id, src: arms.src, fit: arms.fit, alpha, badge: holdingArmsBadge(tile) });
	}
	return marks;
}
