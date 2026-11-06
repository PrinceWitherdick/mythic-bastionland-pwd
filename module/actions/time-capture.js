/**
 * Noting what a time advance writes, so an Undo can take it back
 * (actions/time-undo.js). While Next Phase, Weeks Pass, Months Pass, A Year
 * Passes or a journey to a distant Realm runs, every document this client
 * writes is noted with what it held before, every card it posts is marked as
 * the advance's, and every world setting it changes is kept as it was. The
 * active GM's client answers the calendar's turning (restocking, sigils,
 * sparring) on its own, so when another Referee moves time on it notes its
 * part too and hands it over at the end.
 */
import { setAskingGate } from "../apps/ui.js";
import { askActiveGM } from "../ask-gm.js";
import { warn } from "../chat/cards.js";
import { storedWorldSetting } from "../client-settings.js";
import { queryAsker } from "../compat.js";
import { LEDGER_FLAG } from "../rules/ledger.js";
import { normalizeCalendar } from "../rules/time.js";
import { asFound, changedPaths, copyData, finishFields, joinParts, keepRecord, noteFields, sameValue } from "../rules/time-undo.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";

/** The advances kept to be taken back, newest last, as `{records: AdvanceRecord[]}`. */
export const RECORDS_SETTING = "timeUndo";

/** Set under the system's key in a write's options by the Undo itself, which is never noted. */
export const UNDOING_OPTION = "undoingTime";

/** Marks a card as posted by an advance, under the system's flags: the advance's id. */
export const ADVANCE_FLAG = "timeAdvance";

/** The query by which the Referee moving time on asks the active GM to note its part. */
const CAPTURE_QUERY = `${SYSTEM_ID}.timeCapture`;

/**
 * The documents whose writes are noted. Settings are noted on their own, by
 * the JSON they store. Users, their views and the fog are left alone.
 */
const NOTED = Object.freeze([
	"Actor", "Item", "ActiveEffect", "Scene", "Token", "Tile", "Drawing", "Note", "Region", "AmbientLight", "AmbientSound", "Wall",
	"JournalEntry", "JournalEntryPage", "ChatMessage", "Combat", "Combatant", "Folder", "RollTable", "TableResult",
	"Playlist", "PlaylistSound", "Macro", "Cards", "Card"
]);

/**
 * Documents an advance may make that outlast it, such as the GM Toolkit or a
 * Timeline page: an Undo puts back what was written in them, and keeps them.
 */
const KEPT_WHEN_MADE = new Set(["Actor", "Scene", "JournalEntry", "JournalEntryPage", "Folder", "RollTable", "Playlist", "Macro", "Cards"]);

/**
 * Places never put back: the Ledger keeps its lines, Foundry's own stamps, and an advance's mark on what it
 * made. One noted around them, such as a whole flags object new to a document, goes back with them as they are.
 */
export const LEFT_OUT = Object.freeze([`flags.${SYSTEM_ID}.${LEDGER_FLAG}`, "_stats", `flags.${SYSTEM_ID}.${ADVANCE_FLAG}`]);
const leftOut = (path) => LEFT_OUT.some((place) => path === place || path.startsWith(`${place}.`));

/**
 * @param {ClientDocument} doc
 * @returns {(path: string) => boolean} The places never noted on it. Which Scene is active is noted for the
 *   whole advance instead, as the server deactivates the one before without telling the hooks.
 */
const leftOutOf = (doc) => (doc.documentName === "Scene" ? (path) => path === "active" || leftOut(path) : leftOut);

/**
 * How long the active GM keeps noting another Referee's advance without a word from them: while it runs, and
 * while they answer one of its windows. Past that, or once they leave, it's given up.
 */
const REMOTE_IDLE_MS = 5 * 60 * 1000;
const REMOTE_ASKING_MS = 60 * 60 * 1000;

/**
 * How long the writes the calendar's turning sets off are waited for, and how quiet they must fall. A write
 * that changes nothing is asked for and never heard back, so a long enough quiet ends the wait regardless.
 */
const SETTLE_CAP_MS = 5000;
const QUIET_MS = 300;
const STUCK_MS = 1500;
const STEP_MS = 50;

/**
 * @typedef {object} Capture An advance being noted on this client.
 * @property {string} id
 * @property {string} kind
 * @property {number} depth How many advances run inside it, which are part of it.
 * @property {object} before The calendar as it began.
 * @property {Map<string, {uuid: string, name: string, fields: object}>} docs
 * @property {Map<string, {uuid: string, documentName: string, name: string}>} created
 * @property {object[]} deleted
 * @property {Map<string, {had: boolean, before: string|null}>} settings
 * @property {number} pending Writes asked for and not yet heard back.
 * @property {number} touched When a write was last asked for or heard.
 * @property {number} paused How many of the advance's windows are open, while nothing is noted.
 * @property {boolean} remote Whether the active GM notes its part too.
 * @property {string|null} asker For the active GM's part of another Referee's advance, who that is.
 * @property {number|null} timer When the active GM gives up on that part.
 * @property {string|null} scene The active Scene's UUID as it began.
 */

/** @type {Capture|null} */
let capture = null;

/** Whether the hooks are in, so a test or a world without them runs each advance as it is. */
let installed = false;

/** Who sent each query this client is answering, and how many windows were opened while it was, which are the Referee's own business. */
const answering = [];
let waiting = 0;

/**
 * The queries being answered that aren't part of the advance: all but those
 * from the Referee whose advance the active GM notes here, which it asked for.
 * @returns {number}
 */
const answeringOthers = () => answering.filter((id) => !(capture?.kind === "remote" && id === capture.asker)).length;

/** @returns {string|null} The active Scene's UUID. */
const activeScene = () => globalThis.game?.scenes?.active?.uuid ?? null;

/** @returns {number} Now, by the server's clock, which two clients share. */
export const serverNow = () => globalThis.game?.time?.serverTime ?? Date.now();

/**
 * @param {string} id
 * @param {string} kind
 * @param {string|null} [asker]
 * @returns {Capture}
 */
const newCapture = (id, kind, asker = null) => ({
	id,
	kind,
	depth: 0,
	before: getCalendar(),
	docs: new Map(),
	created: new Map(),
	deleted: [],
	settings: new Map(),
	pending: 0,
	touched: Date.now(),
	paused: 0,
	remote: false,
	asker,
	timer: null,
	scene: asker ? null : activeScene()
});

/**
 * Whether a write now is the advance's to note: not while one of its windows
 * waits on the Referee, whose own edits meanwhile are theirs, and not while
 * this client answers another user's query, such as a player's Spend, which is
 * theirs too. A query from the Referee whose advance it is, the active GM
 * writing for them, is the advance's. A query's own window doesn't count, as
 * the advance runs on meanwhile.
 * @returns {boolean}
 */
const noting = () => Boolean(capture) && capture.paused <= 0 && answeringOthers() <= waiting;

/** @returns {string|null} The id of the advance being noted on this client, which marks what it makes. */
export const currentAdvanceId = () => capture?.id ?? null;

/** @returns {boolean} Whether an advance is being noted on this client. */
export const capturing = () => Boolean(capture);

/**
 * @param {object} options A write's options.
 * @returns {boolean} Whether the Undo made it, which nothing notes.
 */
const byUndo = (options) => Boolean(options?.[SYSTEM_ID]?.[UNDOING_OPTION]);

/**
 * @param {ClientDocument} doc
 * @returns {boolean} Whether it lies inside, or is, a document the advance made, which the Undo deletes whole.
 */
function madeHere(doc) {
	for (const uuid of capture.created.keys()) if (doc.uuid === uuid || doc.uuid?.startsWith(`${uuid}.`)) return true;
	return false;
}

/**
 * What the Undo window calls a document: its own name, or for something held
 * in another, such as an item or a Tile, the name of what holds it.
 * @param {ClientDocument} doc
 * @returns {string}
 */
function nameOf(doc) {
	const held = ["Item", "ActiveEffect", "Token", "Tile", "Drawing", "Note", "Region", "AmbientLight", "AmbientSound", "Wall", "TableResult", "PlaylistSound", "Card", "JournalEntryPage"];
	if (held.includes(doc.documentName)) return doc.parent?.name ?? doc.name ?? "";
	if (doc.documentName === "Combatant") return doc.name ?? doc.actor?.name ?? "";
	return doc.name ?? "";
}

/** A write asked for or heard back. */
const touch = () => {
	if (capture) capture.touched = Date.now();
};

/**
 * Whether an update would change nothing. Foundry calls its pre-hook, then drops it without a word, so
 * counting it would hold every later settle for STUCK_MS. Unsure, it counts, as a long wait does no harm.
 * @param {ClientDocument} doc
 * @param {object} changes
 * @returns {boolean}
 */
const changesNothing = (doc, changes) => {
	const diffObject = globalThis.foundry?.utils?.diffObject;
	return typeof diffObject === "function" && Object.keys(diffObject(doc._source, changes)).every((key) => key === "_id");
};

// Every write this client asks for counts towards settling, noted or not.
function onPreCreate(doc, _data, options) {
	if (!capture || byUndo(options)) return;
	touch();
	capture.pending++;
	// What it makes carries the advance's id, so it's known as the advance's once made, the Undo finds its
	// cards, and a card's Undo button knows whose it is.
	if (noting() && !KEPT_WHEN_MADE.has(doc.documentName)) doc.updateSource({ flags: { [SYSTEM_ID]: { [ADVANCE_FLAG]: capture.id } } });
}

function onCreate(doc, options, userId) {
	if (!capture || userId !== game.user.id || byUndo(options)) return;
	touch();
	capture.pending = Math.max(0, capture.pending - 1);
	if (doc.flags?.[SYSTEM_ID]?.[ADVANCE_FLAG] !== capture.id || KEPT_WHEN_MADE.has(doc.documentName) || madeHere(doc)) return;
	capture.created.set(doc.uuid, { uuid: doc.uuid, documentName: doc.documentName, name: nameOf(doc) });
}

function onPreUpdate(doc, changes, options) {
	if (!capture || byUndo(options)) return;
	touch();
	if (changesNothing(doc, changes)) return;
	capture.pending++;
	if (!noting() || madeHere(doc)) return;
	const entry = capture.docs.get(doc.uuid) ?? { uuid: doc.uuid, name: nameOf(doc), fields: {} };
	noteFields(entry.fields, changedPaths(changes, doc._source), doc._source, leftOutOf(doc), serverNow());
	capture.docs.set(doc.uuid, entry);
}

function onPreDelete(doc, options) {
	if (!capture || byUndo(options)) return;
	touch();
	capture.pending++;
	if (!noting()) return;
	// Made and gone again within the advance: there's nothing to take back.
	if (capture.created.delete(doc.uuid) || madeHere(doc)) return;
	capture.deleted.push({ parentUuid: doc.parent?.uuid ?? null, documentName: doc.documentName, name: nameOf(doc), data: copyData(doc.toObject()), at: serverNow() });
}

function onWritten(_doc, ...rest) {
	const userId = rest.at(-1);
	if (!capture || userId !== game.user.id) return;
	touch();
	capture.pending = Math.max(0, capture.pending - 1);
}

/**
 * The JSON a world setting stores, as the advance found it, the first time it writes it.
 * @param {string} key
 * @param {boolean} had
 * @param {string|null} before
 */
function noteSetting(key, had, before) {
	if (!capture || key === `${SYSTEM_ID}.${RECORDS_SETTING}`) return;
	touch();
	if (noting() && !capture.settings.has(key)) capture.settings.set(key, { had, before, at: serverNow() });
}

/**
 * @param {string} key Such as "mythic-bastionland-pwd.calendar".
 * @returns {string|null|undefined} The JSON the world stores for it, undefined while it stores none.
 */
export function storedSetting(key) {
	const doc = storedWorldSetting(key);
	return doc ? (doc._source?.value ?? null) : undefined;
}

/**
 * @param {object} a
 * @param {object} b
 * @returns {boolean} Whether two calendars stand at one moment.
 */
export const sameMoment = (a, b) => sameValue(normalizeCalendar(a), normalizeCalendar(b));

/** Hold until the writes an advance set off have landed, or it's waited long enough. */
async function settle(noted) {
	const start = Date.now();
	while (Date.now() - start < SETTLE_CAP_MS) {
		const quiet = Date.now() - noted.touched;
		if (quiet >= (noted.pending <= 0 ? QUIET_MS : STUCK_MS)) return;
		await new Promise((resolve) => setTimeout(resolve, STEP_MS));
	}
}

/**
 * Let an advance's writes so far land, then note nothing while one of its windows is open.
 * @param {Capture} noted
 */
async function pauseCapture(noted) {
	await settle(noted);
	noted.paused++;
}

/**
 * Note again once the window is answered, waiting afresh for what follows it.
 * @param {Capture} noted
 */
function resumeCapture(noted) {
	noted.paused = Math.max(0, noted.paused - 1);
	noted.touched = Date.now();
}

/**
 * What one client noted, with what each place holds now the advance is over.
 * @param {Capture} noted
 * @returns {Pick<import("../rules/time-undo.js").AdvanceRecord, "docs"|"created"|"deleted"|"settings">}
 */
function finishCapture(noted) {
	const docs = [];
	for (const { uuid, name, fields } of noted.docs.values()) {
		const source = fromUuidSync(uuid)?._source;
		if (!source) continue;
		const done = finishFields(fields, source);
		if (Object.keys(done).length) docs.push({ uuid, name, fields: done });
	}
	const settings = [];
	for (const [key, note] of noted.settings) {
		const value = storedSetting(key);
		const now = { has: value !== undefined, value };
		if (asFound(now, note)) continue;
		settings.push({ key, ...note, has: now.has, after: now.has ? value : null });
	}
	// Each but a card with its data as the advance left it, so the Undo keeps one changed since.
	const created = [...noted.created.values()].map((entry) => (entry.documentName === "ChatMessage" ? entry : { ...entry, data: copyData(fromUuidSync(entry.uuid)?._source) }));
	return { docs, created, deleted: noted.deleted, settings };
}

/**
 * @param {string|null} before
 * @param {string|null} after
 * @returns {object|null} Which Scene was active before and after, when the advance changed it.
 */
function sceneChange(before, after) {
	if (before === after) return null;
	const name = (uuid) => (uuid ? fromUuidSync(uuid)?.name ?? "" : "");
	return { before, after, beforeName: name(before), afterName: name(after) };
}

/** @returns {{records: object[]}} */
const storedRecords = () => game.settings.get(SYSTEM_ID, RECORDS_SETTING) ?? { records: [] };

/** @returns {import("../rules/time-undo.js").AdvanceRecord[]} The advances kept to be taken back, newest last. */
export function advanceRecords() {
	if (!installed) return [];
	const records = storedRecords()?.records;
	return Array.isArray(records) ? records : [];
}

/**
 * @param {import("../rules/time-undo.js").AdvanceRecord[]} records
 * @returns {Promise<unknown>}
 */
export const writeAdvanceRecords = (records) => game.settings.set(SYSTEM_ID, RECORDS_SETTING, { records }, { [SYSTEM_ID]: { [UNDOING_OPTION]: true } });

/**
 * Run a time advance, noting what it writes so an Undo can take it back. An
 * advance run inside another, such as the Season turning on a journey to a
 * distant Realm, is part of it. Kept only when the calendar moved: an advance
 * stopped before time passed leaves nothing to undo. GMs only; anyone else,
 * or a world without the hooks, runs it as it is. Refused while this client
 * notes another Referee's advance, which this one isn't part of.
 * @template T
 * @param {string} kind "phase", "weeks", "season", "age" or "distant".
 * @param {() => Promise<T>} run
 * @returns {Promise<T|null>}
 */
export async function captureAdvance(kind, run) {
	if (!installed || !game.user?.isGM) return run();
	if (capture?.kind === "remote") {
		warn("timeUndo.busy");
		return null;
	}
	if (capture) {
		capture.depth++;
		try {
			return await run();
		} finally {
			capture.depth--;
		}
	}
	const noted = (capture = newCapture(foundry.utils.randomID(), kind));
	const gm = game.users?.activeGM;
	noted.remote = gm && !gm.isSelf ? (await askActiveGM(CAPTURE_QUERY, { step: "start", id: noted.id }, "Couldn't ask the active GM to note the advance")) === true : false;
	try {
		return await run();
	} finally {
		await settle(noted);
		if (capture === noted) capture = null;
		const part = noted.remote ? await askActiveGM(CAPTURE_QUERY, { step: "finish", id: noted.id }, "Couldn't collect the active GM's part of the advance") : null;
		const after = getCalendar();
		// Time that never moved leaves nothing an Undo could take back.
		if (!sameMoment(noted.before, after)) {
			const scenes = sceneChange(noted.scene, activeScene());
			const record = joinParts({ id: noted.id, kind: noted.kind, at: Date.now(), before: noted.before, after, ...finishCapture(noted), ...(scenes ? { scenes } : {}) }, part || null);
			await writeAdvanceRecords(keepRecord(advanceRecords(), record));
		}
	}
}

/**
 * Before one of the system's windows asks something: while an advance is
 * noted here, its writes so far are let land, and nothing is noted until the
 * window is answered, on the active GM's client as well, so the Referee's own
 * edits meanwhile aren't taken for the advance's. Given to apps/ui.js.
 * @returns {Promise<() => Promise<void>>} Called once the window is answered.
 */
async function askingReferee() {
	// Opened while answering a query, it's the query's, and the advance runs on meanwhile.
	const forQuery = answeringOthers() > waiting;
	if (forQuery) waiting++;
	const noted = capture && capture.kind !== "remote" ? capture : null;
	if (noted) {
		await pauseCapture(noted);
		if (noted.remote) await askActiveGM(CAPTURE_QUERY, { step: "pause", id: noted.id }, "Couldn't ask the active GM to wait on a window");
	}
	return async () => {
		if (forQuery) waiting--;
		if (!noted) return;
		resumeCapture(noted);
		if (noted.remote) await askActiveGM(CAPTURE_QUERY, { step: "resume", id: noted.id }, "Couldn't tell the active GM a window was answered");
	};
}

/**
 * Wait again for word from the Referee whose advance the active GM notes.
 * @param {Capture} noted
 */
function keepWaiting(noted) {
	clearTimeout(noted.timer);
	noted.timer = setTimeout(() => giveUp(noted), noted.paused > 0 ? REMOTE_ASKING_MS : REMOTE_IDLE_MS);
}

/**
 * Stop noting another Referee's advance, such as once they've left.
 * @param {Capture} noted
 */
function giveUp(noted) {
	clearTimeout(noted.timer);
	if (capture === noted) capture = null;
}

/**
 * The active GM noting its part of another Referee's advance, then handing it
 * over: started, held while one of their windows is open, and finished.
 * @param {{step?: string, id?: string}} data
 * @param {object} [context]
 * @returns {Promise<unknown>}
 */
async function onCaptureQuery(data = {}, context = {}) {
	const asker = queryAsker(context);
	if (!asker?.isGM || typeof data?.id !== "string") return null;
	if (data.step === "start") {
		if (capture) return false;
		capture = newCapture(data.id, "remote", asker.id);
		keepWaiting(capture);
		return true;
	}
	const noted = capture;
	if (noted?.kind !== "remote" || noted.id !== data.id || noted.asker !== asker.id) return null;
	if (data.step === "pause" || data.step === "resume") {
		if (data.step === "pause") await pauseCapture(noted);
		else resumeCapture(noted);
		keepWaiting(noted);
		return true;
	}
	if (data.step !== "finish") return null;
	await settle(noted);
	giveUp(noted);
	return finishCapture(noted);
}

/** Marks a query handler wrapped by answeringQueries. */
const ANSWERS = Symbol("answers");

/**
 * Mark every query this client answers, so what it writes for another user
 * isn't taken for part of an advance. Its own timeCapture query is left alone.
 */
function answeringQueries() {
	for (const [name, handler] of Object.entries(CONFIG.queries ?? {})) {
		if (name === CAPTURE_QUERY || typeof handler !== "function" || handler[ANSWERS]) continue;
		// Called at once, as v13's queryAsker hears the sender only before the handler first waits.
		const marked = async function (...args) {
			const asker = queryAsker(args[1])?.id ?? null;
			answering.push(asker);
			try {
				return await handler.apply(this, args);
			} finally {
				answering.splice(answering.indexOf(asker), 1);
			}
		};
		marked[ANSWERS] = true;
		CONFIG.queries[name] = marked;
	}
}

/**
 * Note writes, the hooks going in last once every other is in, so each write
 * is seen as other hooks have left it, such as a Seat taken with its Holding.
 * Called once the world is ready: nothing moves time on before then.
 */
export function watchWrites() {
	for (const name of NOTED) {
		Hooks.on(`preCreate${name}`, onPreCreate);
		Hooks.on(`create${name}`, onCreate);
		Hooks.on(`preUpdate${name}`, onPreUpdate);
		Hooks.on(`update${name}`, onWritten);
		Hooks.on(`preDelete${name}`, onPreDelete);
		Hooks.on(`delete${name}`, onWritten);
	}
	// A pre-hook answering false would stop the write, so these never answer at all.
	Hooks.on("preCreateSetting", (doc, data, options) => {
		if (!byUndo(options)) noteSetting(doc?.key ?? data?.key, false, null);
	});
	Hooks.on("preUpdateSetting", (doc, changes, options) => {
		if (!byUndo(options) && Object.hasOwn(changes ?? {}, "value")) noteSetting(doc.key, true, doc._source?.value ?? null);
	});
	answeringQueries();
	shownRecords = new Set(advanceRecords().map(({ id }) => id));
	// Another Referee's advance, noted here, is given up once they leave, or once this client is no longer the active GM.
	Hooks.on("userConnected", (user, connected) => {
		if (capture?.kind !== "remote") return;
		if ((!connected && user?.id === capture.asker) || !game.users?.activeGM?.isSelf) giveUp(capture);
	});
}

/** The advances whose cards were last drawn with an Undo button. */
let shownRecords = null;

/**
 * Draw again each card whose advance has just been kept or let go, so its Undo
 * button comes as the advance is kept, and goes once it can't be taken back.
 * @param {{records?: object[]}} value The setting as it now stands.
 */
function redrawAdvanceCards(value) {
	const now = new Set((Array.isArray(value?.records) ? value.records : []).map(({ id }) => id));
	const before = shownRecords;
	shownRecords = now;
	for (const message of globalThis.game?.messages ?? []) {
		const id = message.flags?.[SYSTEM_ID]?.[ADVANCE_FLAG];
		if (!id || !String(message.content ?? "").includes("data-undo-time")) continue;
		if (!before || before.has(id) !== now.has(id)) globalThis.ui?.chat?.updateMessage?.(message);
	}
}

/** Register the record of advances. Called during init; watchWrites starts the noting once the world is ready. */
export function registerTimeCapture() {
	game.settings.register(SYSTEM_ID, RECORDS_SETTING, { scope: "world", config: false, type: Object, default: { records: [] }, onChange: redrawAdvanceCards });
	CONFIG.queries[CAPTURE_QUERY] = onCaptureQuery;
	setAskingGate(askingReferee);
	installed = true;
}
