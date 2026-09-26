import { normalizeSeasonRecord, seasonTurn, withCompletedMyth, withoutCompletedMyth } from "../rules/season-log.js";
import { parseSeasonKey, seasonKey } from "../rules/time.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
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

/**
 * What the toolkit keeps about a Season. A world with no toolkit yet reads as a
 * Season nothing has been written about.
 * @param {string} key A Season's key.
 * @returns {import("../rules/season-log.js").SeasonRecord}
 */
export function seasonRecord(key) {
	return normalizeSeasonRecord(theGmToolkit()?.system.seasons?.[key]);
}

/**
 * Keep which of a Season's events have come to pass (p17).
 * @param {string} key A Season's key.
 * @param {string[]} events
 * @returns {Promise<Actor|null>}
 */
export const writeSeasonEvents = (key, events) => writeSeason(key, { events });

/**
 * Keep a Myth as resolved in the Season the world is in (p27), for Past Seasons.
 * @param {import("../rules/season-log.js").CompletedMyth} myth
 * @returns {Promise<Actor|null>}
 */
export function recordMythCompleted(myth) {
	const key = seasonKey(getCalendar());
	return writeSeason(key, { myths: withCompletedMyth(seasonRecord(key).myths, myth) });
}

/**
 * A Myth marked unresolved again comes out of whichever Season it was resolved in.
 * @param {string} id As rules/season-log.js's completedMythId gives it.
 * @returns {Promise<Actor|null>}
 */
export async function forgetMythCompleted(id) {
	const seasons = theGmToolkit()?.system.seasons ?? {};
	const changes = {};
	for (const key of Object.keys(seasons)) {
		const { myths } = seasonRecord(key);
		if (myths.some((myth) => myth.id === id)) changes[`system.seasons.${key}.myths`] = withoutCompletedMyth(myths, id);
	}
	if (!game.user.isGM || !Object.keys(changes).length) return null;
	return theGmToolkit().update(changes);
}
