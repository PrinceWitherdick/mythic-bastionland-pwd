/**
 * What the table has left open, kept on the Referee Toolkit: favours owed,
 * contacts made and situations nobody has settled (rules/threads.js). It is
 * read on the Toolkit's Time page, beside what else is owed before the Season
 * turns; in the hex it's tied to, in Places; and as a session ends, where the
 * situations are rolled for by name (p17). Settling one takes it off the list
 * and writes a line on the Timeline. The Referee's alone.
 */

import { inputDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { deletionUpdate } from "../compat.js";
import { hexKey, parseHexKey } from "../rules/realm-geometry.js";
import { THREAD_KINDS, lastRoll, newThread, threadList, threadsAt, withRoll } from "../rules/threads.js";
import { COMPANY_TRACK, timelineKeys } from "../rules/timeline.js";
import { getCalendar, seasonLabel } from "./calendar.js";
import { GM_TOOLKIT_TYPE, theGmToolkit } from "./gm-toolkit.js";
import { hexLabel } from "./hex-names.js";
import { companyKnights } from "./knights.js";
import { recordOnTrack } from "./timeline-record.js";

/** Told to whoever shows the list, once it has changed. */
export const THREADS_CHANGED_HOOK = "bastionlandThreadsChanged";

/** Each kind's mark, as the dialog and the list draw it. */
export const THREAD_ICONS = Object.freeze({
	favour: "fa-solid fa-handshake",
	contact: "fa-solid fa-user-group",
	situation: "fa-solid fa-hourglass-half"
});

/** @returns {(import("../rules/threads.js").Thread & {id: string})[]} Everything left open, the oldest first. */
export const openThreads = () => threadList(theGmToolkit()?.system?.threads);

/**
 * @param {Scene|null} scene
 * @param {{col: number, row: number}|null} hex
 * @returns {(import("../rules/threads.js").Thread & {id: string})[]} What's left open in one hex of a Realm.
 */
export const threadsInHex = (scene, hex) => (scene && hex ? threadsAt(openThreads(), scene.id, hexKey(hex)) : []);

/**
 * @param {string} id
 * @returns {(import("../rules/threads.js").Thread & {id: string})|undefined} The open thread of that id.
 */
export const threadById = (id) => openThreads().find((entry) => entry.id === id);

/**
 * @param {import("../rules/threads.js").Thread} thread
 * @returns {{realm: Scene|null, hex: {col: number, row: number}|null}} The Realm and hex it's tied to, where it still has them.
 */
function threadPlace(thread) {
	const realm = thread.scene ? game.scenes.get(thread.scene) ?? null : null;
	return { realm, hex: realm ? parseHexKey(thread.hex) : null };
}

/**
 * @param {{age?: number, season?: string}|null} when
 * @returns {string} Such as "Harvest of the 2nd Age", as the Timeline says it, or "" for a moment not kept.
 */
const seasonOf = (when) => (when?.season ? seasonLabel(when) : "");

/**
 * The Knights a thread can be put to: the living Company, and the one it's
 * already put to, though Slain or gone from the Company since, so changing its
 * words doesn't quietly take it from them.
 * @param {string} knight The id it's put to now, if any.
 * @returns {{id: string, name: string, selected: boolean}[]}
 */
function knightChoices(knight) {
	const choices = companyKnights().filter((actor) => !actor.system.slain).map((actor) => ({ id: actor.id, name: actor.name, selected: actor.id === knight }));
	if (knight && !choices.some(({ id }) => id === knight)) choices.push({ id: knight, name: game.actors.get(knight)?.name ?? t("threads.knightGone"), selected: true });
	return choices;
}

/**
 * A thread as a list draws it: its kind's chip, its name, and what follows the
 * name after a middle dot each: whose it is, when it was left open, and what
 * the last roll made of it.
 * @param {import("../rules/threads.js").Thread & {id: string}} thread
 * @param {object} [options]
 * @param {Scene|null} [options.scene] The Realm whose hexes the list can show on the map.
 * @returns {object}
 */
export function threadView(thread, { scene = null } = {}) {
	const knight = thread.knight ? game.actors.get(thread.knight)?.name ?? "" : "";
	const { realm, hex } = threadPlace(thread);
	const rolled = lastRoll(thread);
	const fate = rolled
		? t("threads.rolled", { result: t(`refereeRolls.tables.unresolved.results.${rolled.result}`), when: seasonOf(rolled.when) || t("threads.before") })
		: "";
	return {
		id: thread.id,
		kind: thread.kind,
		kindLabel: t(`threads.kinds.${thread.kind}.label`),
		icon: THREAD_ICONS[thread.kind],
		name: thread.name,
		details: [knight, seasonOf(thread.opened), fate].filter(Boolean).join(" · "),
		hex: hex ? hexLabel(hex, realm) : "",
		// A button to the hex only on the Realm the list can show; another Realm's is told, not shown.
		hexKey: hex && realm === scene ? thread.hex : ""
	};
}

/**
 * Ask what is being left open, or what an open thing should now say.
 * @param {object} [given] What's already known of it.
 * @param {string} [given.kind] The kind ticked as the window opens.
 * @param {string[]} [given.kinds] The kinds offered, all of them by default.
 * @param {string} [given.name]
 * @param {string} [given.knight] A Knight's id.
 * @param {Scene|null} [given.scene] The Realm of the hex offered.
 * @param {{col: number, row: number}|null} [given.hex] The hex it can be tied to.
 * @param {boolean} [given.tied] Whether that hex starts ticked.
 * @param {boolean} [given.editing] Whether it's a thing already on the list.
 * @returns {Promise<{kind: string, name: string, knight: string, scene: string, hex: string}|null>}
 */
async function askThread({ kind = THREAD_KINDS[0], kinds = THREAD_KINDS, name = "", knight = "", scene = null, hex = null, tied = true, editing = false } = {}) {
	const data = await inputDialog({
		title: t(editing ? "threads.editTitle" : "threads.addTitle"),
		icon: "fa-solid fa-link",
		template: "thread",
		context: {
			kinds: kinds.map((key) => ({
				key,
				label: t(`threads.kinds.${key}.label`),
				detail: t(`threads.kinds.${key}.detail`),
				checked: key === kind || kinds.length === 1
			})),
			name,
			knights: knightChoices(knight),
			place: scene && hex ? { label: t("threads.here", { hex: hexLabel(hex, scene) }), checked: tied } : null
		},
		ok: { label: t(editing ? "threads.save" : "threads.add"), icon: "fa-solid fa-link" }
	});
	if (!data || !String(data.name ?? "").trim()) return null;
	const placed = Boolean(data.place) && scene && hex;
	return {
		kind: kinds.includes(data.kind) ? data.kind : kind,
		name: String(data.name).trim(),
		knight: String(data.knight ?? ""),
		scene: placed ? scene.id : "",
		hex: placed ? hexKey(hex) : ""
	};
}

/**
 * Tell whoever shows the list, on every client, once the Toolkit's threads
 * change, whoever changed them: another Referee's Toolkit and Places window
 * are drawn again as the writer's are. Called during init.
 */
export function registerThreadsWatch() {
	Hooks.on("updateActor", (actor, changes) => {
		if (actor.type === GM_TOOLKIT_TYPE && changes.system?.threads !== undefined) Hooks.callAll(THREADS_CHANGED_HOOK);
	});
}

/**
 * Write the threads' change to the Toolkit, which tells whoever shows them. GMs only.
 * @param {object} update
 * @returns {Promise<boolean>} Whether it was written.
 */
async function writeThreads(update) {
	const toolkit = theGmToolkit();
	if (!game.user.isGM || !toolkit) return false;
	await toolkit.update(update);
	return true;
}

/**
 * Leave several things open in one write, listed in the order given. GMs only.
 * @param {Partial<import("../rules/threads.js").Thread>[]} given Each one's kind and name at least.
 * @returns {Promise<string[]>} The ids of those kept: none where there's no Toolkit to keep them.
 */
export async function addThreads(given) {
	const opened = getCalendar();
	const now = Date.now();
	const update = {};
	given.forEach((one, index) => {
		const thread = newThread({ ...one, opened: one.opened ?? opened, at: one.at ?? now + index });
		if (thread) update[`system.threads.${foundry.utils.randomID()}`] = thread;
	});
	const ids = Object.keys(update).map((path) => path.slice("system.threads.".length));
	return ids.length && (await writeThreads(update)) ? ids : [];
}

/**
 * Leave something open. GMs only.
 * @param {Partial<import("../rules/threads.js").Thread>} given Its kind and name at least.
 * @returns {Promise<string|null>} Its id, or null where it has no name or there's no Toolkit to keep it.
 */
export const addThread = async (given) => (await addThreads([given]))[0] ?? null;

/**
 * Ask what to leave open, then keep it.
 * @param {object} [given] As askThread takes it.
 * @returns {Promise<string|null>} The new thread's id.
 */
export async function leaveOpen(given = {}) {
	if (!game.user.isGM) return null;
	const asked = await askThread(given);
	return asked ? addThread(asked) : null;
}

/**
 * Change what an open thing says: its kind, name, Knight and hex.
 * @param {string} id
 * @param {Scene|null} [scene] The Realm whose hex it may be tied to, where it has none yet.
 * @param {{col: number, row: number}|null} [hex]
 * @returns {Promise<boolean>}
 */
export async function editThread(id, scene = null, hex = null) {
	const thread = threadById(id);
	if (!game.user.isGM || !thread) return false;
	const { realm, hex: at } = threadPlace(thread);
	const asked = await askThread({
		kind: thread.kind,
		name: thread.name,
		knight: thread.knight,
		scene: at ? realm : scene,
		hex: at ?? hex,
		tied: Boolean(at),
		editing: true
	});
	if (!asked) return false;
	const { id: _id, ...kept } = thread;
	return writeThreads({ [`system.threads.${id}`]: { ...kept, ...asked } });
}

/**
 * Keep an Unresolved Situations roll on the thread it was made for (p17).
 * @param {string} id
 * @param {{d6: number, result: string}} roll
 * @param {import("../rules/time.js").Calendar} [when] The Season it was rolled in.
 * @returns {Promise<boolean>}
 */
export const keepThreadRoll = (id, roll, when = getCalendar()) => keepThreadRolls([{ id, roll }], when);

/**
 * Keep several Unresolved Situations rolls, each on the thread it was made
 * for (p17), in one write, as a session's end rolls them together.
 * @param {{id: string, roll: {d6: number, result: string}}[]} rolls
 * @param {import("../rules/time.js").Calendar} [when] The Season they were rolled in.
 * @returns {Promise<boolean>} Whether any was kept.
 */
export async function keepThreadRolls(rolls, when = getCalendar()) {
	const open = new Map(openThreads().map((thread) => [thread.id, thread]));
	const update = {};
	for (const { id, roll } of rolls) {
		const thread = open.get(id);
		if (!thread || !roll?.result) continue;
		const kept = withRoll(thread, { ...roll, when });
		open.set(id, kept);
		update[`system.threads.${id}.rolls`] = kept.rolls;
	}
	return Object.keys(update).length ? writeThreads(update) : false;
}

/**
 * Settle something left open: it leaves the list, and the Company's Timeline
 * says so, where the Timeline is kept.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function settleThread(id) {
	const thread = threadById(id);
	if (!game.user.isGM || !thread) return false;
	if (!(await writeThreads(deletionUpdate(`system.threads.${id}`)))) return false;
	const { realm, hex } = threadPlace(thread);
	// The Timeline's line is written behind it, each thread's writes taking their turn, so whoever settled it
	// sees the list change at once.
	Promise.resolve()
		.then(() => recordOnTrack(COMPANY_TRACK, {
			source: "thread",
			key: timelineKeys.thread(id),
			title: t(`threads.settled.${thread.kind}`, { name: thread.name }),
			...(hex ? { place: hexLabel(hex, realm) } : {})
		}))
		.catch((error) => console.error("Couldn't write the settled thread on the Timeline", error));
	return true;
}
