import { MYTH_NOTES_VERSION, normaliseMythNotes, withMythNote } from "../rules/myth-notes.js";
import { serialWrites } from "../rules/queue.js";
import { SYSTEM_ID } from "../system-id.js";
import { isRealmScene } from "./realm.js";

/**
 * What the GM has written about each Myth of a Realm, and whether the group
 * feels it's resolved (p27), kept on the Realm's Scene.
 */

/** The Scene flag holding the GM's notes on a Realm's Myths. */
export const MYTH_NOTES_FLAG = "mythNotes";

/**
 * @param {Scene|null} scene
 * @returns {import("../rules/myth-notes.js").MythNotes} Empty for a Scene that isn't a Realm.
 */
export function getMythNotes(scene) {
	return normaliseMythNotes(isRealmScene(scene) ? scene.getFlag(SYSTEM_ID, MYTH_NOTES_FLAG) : null);
}

/** Myth note writes, taken one at a time. */
const queueMythWrite = serialWrites();

/** @returns {string} An update path into the flag. */
const flagPath = (...parts) => `flags.${SYSTEM_ID}.${MYTH_NOTES_FLAG}.${parts.join(".")}`;

/**
 * Change what's kept about one Myth, writing that Myth's own path. GMs only.
 * @param {Scene} scene
 * @param {{number: number, d6: number, d12: number}} myth
 * @param {{note?: string, resolved?: boolean}} changes
 * @returns {Promise<boolean>} Whether anything was written.
 */
export function editMythNote(scene, myth, changes) {
	if (!game.user.isGM || !isRealmScene(scene) || !myth) return Promise.resolve(false);
	return queueMythWrite(async () => {
		const before = getMythNotes(scene);
		const after = withMythNote(before, myth, changes);
		if (after === before) return false;
		const key = String(myth.number);
		await scene.update({
			[flagPath("version")]: MYTH_NOTES_VERSION,
			[flagPath("myths", key)]: after.myths[key] ?? new foundry.data.operators.ForcedDeletion()
		});
		return true;
	});
}
