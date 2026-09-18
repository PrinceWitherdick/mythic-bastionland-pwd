import { seasonTurn } from "../rules/season-log.js";
import { parseSeasonKey } from "../rules/time.js";
import { SYSTEM_ID } from "../system-id.js";
import { theGmToolkit } from "./gm-toolkit.js";

/**
 * The GM Toolkit's record of each Season (rules/season-log.js), kept on the
 * toolkit itself, since a Season belongs to the world rather than one Realm.
 */

/**
 * @param {string} key A Season's key.
 * @param {object} changes Below the Season's record, such as `{notes}`.
 * @returns {Promise<Actor|null>}
 */
async function writeSeason(key, changes) {
	const toolkit = theGmToolkit();
	if (!game.user.isGM || !toolkit || !parseSeasonKey(key)) return null;
	return toolkit.update(Object.fromEntries(Object.entries(changes).map(([field, value]) => [`system.seasons.${key}.${field}`, value])));
}

/**
 * Keep what came to pass as a Season ended, as its card said, in place of any
 * earlier turn of the same Season. A world that can't keep it still turned its
 * Season, so a failure is only logged.
 * @param {string} key The Season that ended.
 * @param {object} turn As rules/season-log.js's seasonTurn takes it.
 */
export async function recordSeasonTurn(key, turn) {
	try {
		await writeSeason(key, { turn: seasonTurn({ when: Date.now(), ...turn }) });
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't record the Season in the GM Toolkit`, error);
	}
}

/**
 * @param {string} key
 * @param {string} notes What the GM wrote about the Season.
 */
export const writeSeasonNotes = (key, notes) => writeSeason(key, { notes: String(notes ?? "") });
