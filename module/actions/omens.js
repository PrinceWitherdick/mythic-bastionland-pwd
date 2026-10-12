import { setOmen } from "../rules/realm-edits.js";
import { completedMythId } from "../rules/season-log.js";
import { editRealm, sceneGeometry } from "./realm.js";
import { timelineOmens } from "./timeline-events.js";
import { findCompany } from "./wilderness.js";

/**
 * Mark how many of a Myth's Omens have been met, by the Referee's hand, and
 * write each one met or taken back on the Timeline, where the Company stood.
 * @param {Scene} scene The Realm.
 * @param {number} number The Myth's number.
 * @param {number|((myth: object) => number)} omen How many are met now, or how to tell from the Myth as it stands.
 * @returns {Promise<boolean>} Whether anything was written.
 */
export async function markMythOmen(scene, number, omen) {
	let change = null;
	const written = await editRealm(scene, (realm) => {
		const myth = realm.myths.find((candidate) => candidate.number === number);
		if (!myth) return realm;
		const next = setOmen(realm, number, typeof omen === "function" ? omen(myth) : omen);
		const to = next.myths.find((candidate) => candidate.number === number)?.omen ?? myth.omen;
		if (to === myth.omen) return realm;
		change = { myth, from: myth.omen, to };
		return next;
	});
	if (written && change) {
		const { hex } = findCompany(scene, sceneGeometry(scene), { selected: false });
		await timelineOmens(scene, change.myth, { from: change.from, to: change.to, hex });
	}
	return written;
}

/**
 * Undo or Redo on a Realm takes a Myth's Omens back or puts them back: its
 * rows on the Timeline follow, as they do when the Referee marks them.
 * Listens to REALM_STEPPED_HOOK.
 * @param {Scene} scene The Realm.
 * @param {object} before The Realm as it was.
 * @param {object} after The Realm as Undo or Redo left it.
 */
export async function followOmenSteps(scene, before, after) {
	const was = new Map((before?.myths ?? []).map((myth) => [completedMythId(scene.id, myth), myth.omen ?? 0]));
	for (const myth of after?.myths ?? []) {
		const from = was.get(completedMythId(scene.id, myth));
		const to = myth.omen ?? 0;
		if (from !== undefined && from !== to) await timelineOmens(scene, myth, { from, to });
	}
}
