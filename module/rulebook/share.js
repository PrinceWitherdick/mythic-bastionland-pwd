import { t } from "../chat/cards.js";
import { readerPage } from "../rules/rulebook.js";
import { SYSTEM_ID } from "../system-id.js";
import { openRulebook } from "./BookReader.js";

/**
 * Show Players: the page the GM is reading, opened on everyone else's screen.
 * It's an event rather than a setting, so a player signing in later isn't
 * handed last session's page, and turning the GM's page afterwards doesn't
 * drag the table along.
 */
const SHOW_QUERY = `${SYSTEM_ID}.showRulebookPage`;

/** Answer the GM's query. Called during init. */
export function registerRulebookShare() {
	CONFIG.queries[SHOW_QUERY] = onShowQuery;
}

/**
 * @param {number} page
 * @returns {Promise<boolean>} Whether it was sent to anyone.
 */
export async function showRulebookPage(page) {
	const number = readerPage(page);
	if (!game.user.isGM || !number) return false;

	const others = game.users.filter((user) => user.active && !user.isSelf);
	if (!others.length) {
		ui.notifications.info(t("rulebook.nobodyToShow"));
		return false;
	}
	await Promise.all(others.map((user) => user.query(SHOW_QUERY, { page: number }).catch((error) => {
		console.warn(`${SYSTEM_ID} | Couldn't show the rulebook to ${user.name}`, error);
	})));
	return true;
}

/**
 * Only a GM's query opens anything. Shown pages open even for players who
 * aren't offered the book: the GM chose to show them this one.
 * @param {{page: number}} data
 * @param {{user: User}} context
 * @returns {Promise<boolean>}
 */
async function onShowQuery({ page } = {}, { user } = {}) {
	if (!user?.isGM) return false;
	return !!openRulebook({ page, shown: true });
}
