/**
 * What the table has left open: a favour owed, a contact made (Courtesy, p17;
 * a long stay as guests, p18; hired help, p13), and an important situation
 * nobody has settled, which changes as a Season or Age turns (p17). The book
 * names these as things that come back; the list only keeps them so they do.
 * Pure, so it can be tested without Foundry.
 */

/** The kinds of thing left open. Wording lives under `bastionland.threads.kinds`. */
export const THREAD_KINDS = Object.freeze(["favour", "contact", "situation"]);

/** The kind the Unresolved Situations table is rolled for (p17). */
export const SITUATION_KIND = "situation";

/**
 * @typedef {object} Thread Something left open.
 * @property {string} kind      One of THREAD_KINDS.
 * @property {string} name      What it is, in the Referee's words.
 * @property {string} knight    The id of the Knight it's owed to or who made it, or "".
 * @property {string} scene     The id of the Realm it belongs to, or "".
 * @property {string} hex       The hex it's tied to, as a key such as "5,9", or "".
 * @property {{age: number, year: number, season: string}|null} opened The Season it was left open in.
 * @property {number} at        When it was added, in milliseconds, for the list's order.
 * @property {{d6: number, result: string, when: object|null}[]} rolls Each Unresolved Situations roll made for it.
 */

/**
 * Something new left open, or null where it has no name or no kind.
 * @param {Partial<Thread>} given
 * @returns {Thread|null}
 */
export function newThread({ kind, name, knight = "", scene = "", hex = "", opened = null, at = 0 } = {}) {
	const said = String(name ?? "").trim();
	if (!THREAD_KINDS.includes(kind) || !said) return null;
	const place = String(hex ?? "").trim();
	return {
		kind,
		name: said,
		knight: String(knight ?? ""),
		// A hex means nothing without its Realm.
		scene: place ? String(scene ?? "") : "",
		hex: place && scene ? place : "",
		opened: opened ? { age: opened.age, year: opened.year, season: opened.season } : null,
		at: Number(at) || 0,
		rolls: []
	};
}

/**
 * Read what's kept as threads, whatever shape an older world left it in.
 * @param {Record<string, object>|null|undefined} kept By id.
 * @returns {(Thread & {id: string})[]} The oldest first.
 */
export function threadList(kept) {
	return Object.entries(kept ?? {})
		.filter(([, thread]) => thread && THREAD_KINDS.includes(thread.kind) && String(thread.name ?? "").trim())
		.map(([id, thread]) => ({
			id,
			kind: thread.kind,
			name: String(thread.name).trim(),
			knight: String(thread.knight ?? ""),
			scene: String(thread.scene ?? ""),
			hex: String(thread.hex ?? ""),
			opened: thread.opened ?? null,
			at: Number(thread.at) || 0,
			rolls: Array.isArray(thread.rolls) ? thread.rolls.filter((roll) => roll?.result) : []
		}))
		.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/**
 * A thread with one more Unresolved Situations roll kept on it.
 * @param {Thread} thread
 * @param {{d6: number, result: string, when?: object|null}} roll
 * @returns {Thread}
 */
export function withRoll(thread, { d6, result, when = null }) {
	const kept = when ? { age: when.age, year: when.year, season: when.season } : null;
	return { ...thread, rolls: [...(thread.rolls ?? []), { d6, result, when: kept }] };
}

/**
 * @param {Thread} thread
 * @returns {{d6: number, result: string, when: object|null}|null} The last roll made for it.
 */
export const lastRoll = (thread) => thread.rolls?.at(-1) ?? null;

/**
 * The threads tied to one hex of a Realm.
 * @param {(Thread & {id: string})[]} threads
 * @param {string} sceneId
 * @param {string} hex The hex's key.
 * @returns {(Thread & {id: string})[]}
 */
export const threadsAt = (threads, sceneId, hex) => threads.filter((thread) => thread.hex && thread.hex === hex && thread.scene === sceneId);

/**
 * @param {(Thread & {id: string})[]} threads
 * @returns {(Thread & {id: string})[]} The situations among them, which change as a Season or Age turns.
 */
export const situationsOf = (threads) => threads.filter((thread) => thread.kind === SITUATION_KIND);
