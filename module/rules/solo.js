/**
 * Solo play. One person is Referee and Company at once, so the Realm keeps its
 * secrets from them as it would from players: Myths, Landmarks and Barriers
 * are found by travelling, and the rest of the map is open as on the players'
 * own. A Myth is named once its first Omen is met, and its hex is known once
 * the Company has stood in it. Nothing new is kept: what's found is what's no
 * longer hidden on the map, and an Omen met is the Myth's Omen count. Pure, so
 * it can be tested without Foundry.
 */

/** The Realm documents solo play keeps from the Referee while they are hidden. */
const SECRET_KINDS = new Set(["myth", "landmark", "barrier"]);

/**
 * @param {string|undefined} kind A Realm Tile or Drawing's kind.
 * @returns {boolean} Whether solo play keeps it from the Referee while it's hidden.
 */
export const hidesKind = (kind) => SECRET_KINDS.has(kind);

/**
 * @param {{omen?: number, revealed?: boolean}|null|undefined} myth
 * @returns {boolean} Whether the Myth may be named: its hex has been found, or one of its Omens met.
 */
export const mythKnown = (myth) => Boolean(myth && (myth.revealed || (myth.omen ?? 0) >= 1));

/**
 * The Realm as the Company knows it. Holdings, terrain and rivers are all
 * there. A Myth not yet known keeps only its number and its place in the list,
 * so the six still show as six. A Myth whose hex hasn't been found has no hex.
 * Hidden Landmarks and Barriers are left out.
 * @param {import("./realm.js").Realm} realm
 * @returns {import("./realm.js").Realm} A copy. The Realm given is left as it was.
 */
export function soloRealm(realm) {
	return {
		...realm,
		myths: realm.myths.map((myth) => {
			if (!mythKnown(myth)) return { id: myth.id, hex: null, number: myth.number, d6: null, d12: null, omen: 0, revealed: false, unknown: true };
			return myth.revealed ? myth : { ...myth, hex: null };
		}),
		landmarks: realm.landmarks.filter((landmark) => landmark.revealed),
		barriers: realm.barriers.filter((barrier) => barrier.revealed)
	};
}
