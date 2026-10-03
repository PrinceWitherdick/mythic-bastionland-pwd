import { warn } from "../chat/cards.js";
import { HEX_LAYOUT } from "../rules/hex-journal.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * What the hex and Site journals share: reading an entry to plan its writes
 * from, gathering a burst of changes before syncing, and opening an entry
 * that another GM's browser may still be making.
 */

/**
 * What's in the world for an entry the system keeps, to plan its writes from.
 * @param {JournalEntry} entry
 * @param {import("../rules/hex-journal.js").JournalLayout} [layout] Its pages' parts.
 * @param {boolean} [open] Whether the entry was last opened to players.
 * @returns {import("../rules/hex-journal.js").EntrySnapshot}
 */
export function entrySnapshot(entry, layout = HEX_LAYOUT, open = false) {
	const pages = {};
	for (const page of entry.pages ?? []) {
		const role = page.getFlag(SYSTEM_ID, "role");
		if (layout.roles.includes(role) && !pages[role]) pages[role] = { id: page.id, markdown: page.text?.markdown ?? "" };
	}
	return {
		id: entry.id,
		name: entry.name,
		sort: entry.sort,
		ownership: entry.ownership?.default ?? 0,
		open,
		pages
	};
}

/**
 * Gather ids through a burst of writes, then hand them on together once it's
 * over: the map writes a Realm or a Site a little at a time.
 * @param {(ids: string[]) => void} flush
 * @param {() => Promise<unknown>} [settled] What else to wait for before the ids are taken.
 * @returns {(id: string) => void}
 */
export function afterBurst(flush, settled = () => Promise.resolve()) {
	const waiting = new Set();
	let later = null;
	const take = () => {
		const ids = [...waiting];
		waiting.clear();
		flush(ids);
	};
	return (id) => {
		waiting.add(id);
		later ??= foundry.utils.debounce(() => settled().then(take), 400);
		later();
	};
}

/** How long another GM waits for the active GM's browser to make an entry. */
const MADE_ELSEWHERE_MS = 3000;

/**
 * Wait for the active GM's browser to make an entry.
 * @param {() => JournalEntry|null} find
 * @returns {Promise<void>} Once the entry is there, or the wait is over.
 */
function madeElsewhere(find) {
	return new Promise((resolve) => {
		const done = () => {
			Hooks.off("createJournalEntry", made);
			clearTimeout(timer);
			resolve();
		};
		const made = () => find() && done();
		const timer = setTimeout(done, MADE_ELSEWHERE_MS);
		Hooks.on("createJournalEntry", made);
	});
}

/**
 * Open a kept entry, making it first if it's due one and hasn't got it yet.
 * Another GM's browser waits a moment for the active GM's to make it.
 * @param {object} keeper
 * @param {() => JournalEntry|null} keeper.find The entry, if it's there.
 * @param {() => boolean} keeper.on Whether these entries are kept in this world.
 * @param {() => boolean} keeper.keeps Whether this browser is the one that writes them.
 * @param {() => Promise<void>} keeper.make Bring the entry up to date, making it if it's due.
 * @param {string} keeper.none The warning when there's still none.
 * @returns {Promise<JournalEntry|null>}
 */
export async function openKeptJournal({ find, on, keeps, make, none }) {
	if (!find()) {
		if (keeps()) await make();
		else if (game.user?.isGM && game.users?.activeGM && on()) await madeElsewhere(find);
	}
	const entry = find();
	if (!entry) {
		warn(none);
		return null;
	}
	await entry.sheet.render({ force: true });
	return entry;
}
