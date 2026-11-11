/**
 * Taking back a time advance pressed by mistake. What it wrote was noted as it
 * ran (actions/time-capture.js); the Undo deletes the cards and whatever else
 * it made, makes again anything it deleted, and puts back every value and
 * setting still as it left them, the calendar last, Day and year with it.
 * Anything changed since is kept, and the window asking first says what.
 * Offered from the banner's menu and on the advance's own cards, newest first.
 */
import { confirmDialog } from "../apps/ui.js";
import { askUser } from "../ask-gm.js";
import { plural, postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { deletionEntry, queryAsker, replacementEntry } from "../compat.js";
import { REALM_FLAG } from "../rules/realm.js";
import { hidesKind } from "../rules/solo.js";
import { PHASE_ICONS } from "../rules/time.js";
import { childUuid, isPlainObject, planChanges, undoable, undoPlan } from "../rules/time-undo.js";
import { escapeHTML, stripHTML } from "../rules/text.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, chronicleLabel, getCalendar } from "./calendar.js";
import { causedBy } from "./ledger.js";
import { secretsKeptOn } from "./solo.js";
import { ADVANCE_FLAG, LEFT_OUT, UNDOING_OPTION, advanceRecords, capturing, sameMoment, storedSetting, writeAdvanceRecords } from "./time-capture.js";
import { registerQuery } from "../queries.js";

/** The calendar's own setting, put back after everything else. */
const CALENDAR_KEY = `${SYSTEM_ID}.calendar`;

/** The query by which a Referee asks the active GM to carry out an Undo, so only one runs at a time. */
const UNDO_QUERY = `${SYSTEM_ID}.timeUndo`;

/** How long the Referee waits on the active GM to carry an Undo out. */
const UNDO_TIMEOUT_MS = 2 * 60 * 1000;

/** Whether this client is asking about an Undo, so a second press waits its turn. */
let asking = false;

/** Whether the active GM is carrying an Undo out, so a second waits its turn. */
let undoing = false;

/** What's found on a Realm's secret, kept as it stands by an Undo played alone, as the map's own Undo keeps it. */
const FINDS = Object.freeze(["hidden", `flags.${SYSTEM_ID}.${REALM_FLAG}.omen`, `flags.${SYSTEM_ID}.${REALM_FLAG}.name`]);

/**
 * The places in a document an Undo leaves as they stand: the Ledger's lines
 * and the like, and played alone, what's found on a Myth, Landmark or Barrier.
 * @param {string} uuid
 * @param {object} source
 * @returns {string[]}
 */
export function keptPlaces(uuid, source) {
	const type = uuid.split(".").at(-2);
	if (!["Tile", "Drawing"].includes(type) || !hidesKind(source?.flags?.[SYSTEM_ID]?.[REALM_FLAG]?.kind)) return LEFT_OUT;
	return secretsKeptOn(fromUuidSync(uuid)?.parent ?? null) ? [...LEFT_OUT, ...FINDS] : LEFT_OUT;
}

/**
 * @param {import("../rules/time-undo.js").AdvanceRecord} record
 * @returns {string} Such as "Next Phase".
 */
const kindLabel = (record) => t(`timeUndo.kinds.${record.kind}`);

/** @returns {import("../rules/time-undo.js").AdvanceRecord|null} The advance an Undo takes back now. */
export const undoableAdvance = () => undoable(advanceRecords(), getCalendar(), sameMoment);

/**
 * @returns {{label: string, hint: string}|null} The banner's Undo button, such as "Undo Next Phase", with what
 *   it does for its tooltip, or null with nothing to undo.
 */
export function undoOffer() {
	const record = undoableAdvance();
	if (!record) return null;
	const kind = kindLabel(record);
	return { label: t("timeUndo.banner", { kind }), hint: t("timeUndo.bannerHint", { kind, date: chronicleLabel(record.before) }) };
}

/**
 * @param {import("../rules/time-undo.js").UndoPlan} plan
 * @returns {ChatMessage[]} The cards the advance posted that are still in the log.
 */
const cardsOf = (plan) => plan.deletes.map((uuid) => fromUuidSync(uuid)).filter((doc) => doc?.documentName === "ChatMessage");

/**
 * @param {ChatMessage} message
 * @returns {string} The title its card shows.
 */
function cardTitle(message) {
	const html = String(message.content ?? "");
	const found = /class="bastionland-card__title"[^>]*>([\s\S]*?)<\/h3>/.exec(html)?.[1] ?? "";
	return stripHTML(found) || t("timeUndo.confirm.aCard");
}

/**
 * @param {string[]} names
 * @returns {string} Each name once, in a list a sentence can hold.
 */
const listed = (names) => escapeHTML([...new Set(names.filter(Boolean))].join(", "));

/**
 * What the window asking before an Undo says it will do, and what it keeps.
 * @param {import("../rules/time-undo.js").AdvanceRecord} record
 * @param {import("../rules/time-undo.js").UndoPlan} plan
 * @returns {string[]} Its paragraphs, HTML.
 */
export function undoMessage(record, plan) {
	const cards = cardsOf(plan);
	const made = plan.deletes.length - cards.length;
	const settings = plan.settings.filter(({ key }) => key !== CALENDAR_KEY).length;
	const back = [
		...(plan.writes.length || plan.recreates.length || plan.activate ? [t("timeUndo.confirm.names", { names: listed([...plan.writes, ...plan.recreates, ...(plan.activate ? [plan.activate] : [])].map(({ name }) => name)) })] : []),
		...(cards.length ? [plural("timeUndo.confirm.cards", cards.length)] : []),
		...(made > 0 ? [plural("timeUndo.confirm.made", made)] : []),
		...(settings ? [plural("timeUndo.confirm.settings", settings)] : [])
	];
	const pressed = cards.filter((message) => (message.flags?.[SYSTEM_ID]?.spentButtons ?? []).length);
	const kept = [...plan.kept.map(({ name }) => name), ...plan.keptSettings.map(() => t("timeUndo.confirm.aSetting"))];
	return [
		t("timeUndo.confirm.intro", { kind: escapeHTML(kindLabel(record)), date: escapeHTML(chronicleLabel(record.before)) }),
		...(back.length ? [`<ul>${back.map((line) => `<li>${line}</li>`).join("")}</ul>`] : [t("timeUndo.confirm.onlyTime")]),
		...(kept.length ? [t("timeUndo.confirm.kept", { names: listed(kept) })] : []),
		...(pressed.length ? [t("timeUndo.confirm.pressed", { cards: listed(pressed.map(cardTitle)) })] : [])
	];
}

/**
 * Read the plan for an advance against the world as it stands.
 * @param {import("../rules/time-undo.js").AdvanceRecord} record
 * @returns {import("../rules/time-undo.js").UndoPlan}
 */
const planFor = (record) => undoPlan(record, {
	sourceOf: (uuid) => fromUuidSync(uuid)?._source ?? null,
	settingOf: storedSetting,
	lastKey: CALENDAR_KEY,
	keptPlaces,
	activeScene: () => game.scenes?.active?.uuid ?? null
});

/**
 * Do one part of an Undo, a failure logged rather than thrown, so the rest goes ahead.
 * @param {() => Promise<unknown>} work
 * @returns {Promise<boolean>} Whether it was done.
 */
async function attempt(work) {
	try {
		await work();
		return true;
	} catch (error) {
		console.error(`${SYSTEM_ID} | Undoing a time advance`, error);
		return false;
	}
}

/**
 * Writes gathered into batches, one for each kind of document in each place.
 * @template T
 * @param {T[]} entries
 * @param {(entry: T) => string} keyOf Where an entry is written.
 * @returns {T[][]} The batches, in the order each first comes.
 */
function batched(entries, keyOf) {
	const batches = new Map();
	for (const entry of entries) {
		const key = keyOf(entry);
		if (!batches.has(key)) batches.set(key, []);
		batches.get(key).push(entry);
	}
	return [...batches.values()];
}

/**
 * @param {string} documentName
 * @param {string|null|undefined} parentUuid
 * @param {string|null|undefined} [pack]
 * @returns {string} Where a write lands, for batching.
 */
const placeKey = (documentName, parentUuid, pack) => `${documentName}|${parentUuid ?? ""}|${pack ?? ""}`;

/**
 * Do a batch of an Undo as one request; should that fail, each write on its
 * own, so one that can't be done leaves the rest done.
 * @template T
 * @param {T[]} items
 * @param {(items: T[]) => Promise<unknown>} all
 * @param {(item: T) => Promise<unknown>} each
 * @returns {Promise<boolean>} Whether every write was done.
 */
async function inBatch(items, all, each) {
	try {
		await all(items);
		return true;
	} catch (error) {
		console.warn(`${SYSTEM_ID} | Undoing a time advance: a batch failed, so its writes go one at a time`, error);
		let whole = true;
		for (const item of items) whole = (await attempt(() => each(item))) && whole;
		return whole;
	}
}

/**
 * Carry out a plan up to the calendar, a batch at a time, each on its own so
 * one that fails leaves the rest done: what the advance made goes, what it
 * deleted comes back, parents before what was deleted from them, then every
 * value, the active Scene and every setting but the calendar.
 * @param {import("../rules/time-undo.js").UndoPlan} plan
 * @param {object} options For each write.
 * @returns {Promise<boolean>} Whether every part was done.
 */
async function carryOut(plan, options) {
	let whole = true;
	const part = async (work) => {
		whole = (await attempt(work)) && whole;
	};
	const classOf = (documentName) => foundry.utils.getDocumentClass(documentName);
	// What the advance made, its cards among them, all at once.
	const cards = cardsOf(plan).map((message) => message.id);
	if (cards.length) await part(() => ChatMessage.implementation.deleteDocuments(cards, options));
	const made = plan.deletes.map((uuid) => fromUuidSync(uuid)).filter((doc) => doc && doc.documentName !== "ChatMessage");
	for (const batch of batched(made, (doc) => placeKey(doc.documentName, doc.parent?.uuid, doc.pack))) {
		// Gone already with a parent deleted before it.
		const left = batch.filter((doc) => fromUuidSync(doc.uuid));
		if (!left.length) continue;
		const [{ documentName, parent, pack }] = left;
		whole = (await inBatch(left, (docs) => classOf(documentName).deleteDocuments(docs.map((doc) => doc.id), { ...options, parent: parent ?? null, pack: pack ?? null }), (doc) => (fromUuidSync(doc.uuid) ? doc.delete(options) : null))) && whole;
	}
	for (const batch of batched(plan.recreates, ({ parentUuid, documentName }) => placeKey(documentName, parentUuid))) {
		const [{ parentUuid, documentName }] = batch;
		const parent = parentUuid ? fromUuidSync(parentUuid) : null;
		if (parentUuid && !parent) {
			whole = false;
			for (const { data } of batch) console.error(`${SYSTEM_ID} | Undoing a time advance: ${parentUuid} is gone, so its ${documentName} ${data?._id} can't be made again`);
			continue;
		}
		const createOptions = { ...options, parent, keepId: true };
		// Made already by a batch that failed partway.
		const there = (data) => Boolean(fromUuidSync(childUuid(parentUuid, documentName, data)));
		whole = (await inBatch(batch.map(({ data }) => data), (all) => classOf(documentName).createDocuments(all, createOptions), (data) => (there(data) ? null : classOf(documentName).create(data, createOptions)))) && whole;
	}
	const writes = plan.writes.flatMap(({ uuid, set, unset }) => {
		const doc = fromUuidSync(uuid);
		// An object goes back whole, so a key the advance added inside it goes with it.
		return doc ? [{ doc, update: Object.fromEntries([...set.map(([path, value]) => (isPlainObject(value) ? replacementEntry(path, value) : [path, value])), ...unset.map(deletionEntry)]) }] : [];
	});
	for (const batch of batched(writes, ({ doc }) => placeKey(doc.documentName, doc.parent?.uuid, doc.pack))) {
		const [{ doc: { documentName, parent, pack } }] = batch;
		whole = (await inBatch(batch, (all) => classOf(documentName).updateDocuments(all.map(({ doc, update }) => ({ ...update, _id: doc.id })), { ...options, parent: parent ?? null, pack: pack ?? null }), ({ doc, update }) => doc.update(update, options))) && whole;
	}
	// The Scene active before, which the server makes the only one active again; or, with none before, none.
	// One deleted since stays gone, and the Scene the advance went to stays active.
	const scene = plan.activate ? fromUuidSync(plan.activate.uuid ?? plan.activate.from) : null;
	if (scene) await part(() => scene.update({ active: Boolean(plan.activate.uuid) }, options));
	whole = (await putBackSettings(plan.settings.filter(({ key }) => key !== CALENDAR_KEY), options)) && whole;
	return whole;
}

/**
 * @param {{key: string, had: boolean, before: string|null}[]} which
 * @param {object} options
 * @returns {Promise<boolean>} Whether every one went back.
 */
async function putBackSettings(which, options) {
	let whole = true;
	for (const { key, had, before } of which) {
		const config = game.settings.settings.get(key);
		if (!config) continue;
		const done = await attempt(() => game.settings.set(config.namespace, config.key, had ? JSON.parse(before) : foundry.utils.deepClone(config.default), options));
		whole = done && whole;
	}
	return whole;
}

/**
 * Carry out the Undo of the newest advance, on the active GM's client, one at
 * a time. All of it but the calendar first; only once that's whole is the
 * advance let go and the calendar turned back. Anything left undone keeps the
 * advance and the calendar as they are, so another Undo finishes the job.
 * @param {string} id The advance the Referee agreed to take back.
 * @returns {Promise<"done"|"partly"|"busy"|"moved">}
 */
async function takeBack(id) {
	if (undoing || capturing()) return "busy";
	const records = advanceRecords();
	const record = records.at(-1);
	if (record?.id !== id || !sameMoment(record.after, getCalendar())) return "moved";
	undoing = true;
	try {
		const options = { ...causedBy("undo"), [SYSTEM_ID]: { [UNDOING_OPTION]: true } };
		const plan = planFor(record);
		// The calendar written over since, though at the same moment, can't be turned back, so nothing is.
		if (plan.keptSettings.includes(CALENDAR_KEY)) return "moved";
		if (!(await carryOut(plan, options))) return "partly";
		// The record goes before the calendar turns, so the banner never offers it again.
		if (!(await attempt(() => writeAdvanceRecords(records.filter((kept) => kept.id !== id))))) return "partly";
		if (!(await putBackSettings(plan.settings.filter(({ key }) => key === CALENDAR_KEY), options))) {
			// Time still stands where the advance left it, so it's kept to be tried again.
			await attempt(() => writeAdvanceRecords(records));
			return "partly";
		}
		await postCard(null, "report", {
			tone: record.before.phase,
			icon: PHASE_ICONS[record.before.phase] ?? "fa-solid fa-clock-rotate-left",
			title: t("timeUndo.card.title"),
			tagline: calendarLabel(record.before),
			hint: t(planChanges(plan) ? "timeUndo.card.hint" : "timeUndo.card.onlyTime", { kind: kindLabel(record) })
		});
		return "done";
	} finally {
		undoing = false;
	}
}

/**
 * Ask the active GM to carry out an Undo, or carry it out here when that's this client.
 * @param {string} id
 * @returns {Promise<string>} As takeBack's, or "unanswered".
 */
async function askToTakeBack(id) {
	const gm = game.users?.activeGM;
	if (!gm || gm.isSelf) return takeBack(id);
	return askUser(gm, UNDO_QUERY, { id }, "Couldn't ask the active GM to turn time back", { timeout: UNDO_TIMEOUT_MS, fallback: "unanswered" });
}

/**
 * The active GM carrying out another Referee's Undo.
 * @param {{id?: string}} data
 * @param {object} [context]
 * @returns {Promise<string|null>}
 */
async function onUndoQuery(data = {}, context = {}) {
	if (!queryAsker(context)?.isGM || typeof data?.id !== "string" || !game.users?.activeGM?.isSelf) return null;
	return takeBack(data.id);
}

/**
 * Take back the newest time advance, after asking. With an id, as a card's
 * button gives, only while that advance is the newest. GMs only. The active
 * GM carries it out, so two Referees can't take one back at once.
 * @param {string|null} [id]
 * @returns {Promise<boolean>} Whether it was taken back.
 */
export async function undoAdvance(id = null) {
	if (!game.user.isGM) return false;
	if (asking || undoing || capturing()) {
		warn("timeUndo.busy");
		return false;
	}
	const records = advanceRecords();
	const record = records.at(-1);
	if (!record || (id && record.id !== id)) {
		warn(id && records.some((kept) => kept.id === id) ? "timeUndo.notNewest" : "timeUndo.gone");
		return false;
	}
	if (!sameMoment(record.after, getCalendar())) {
		warn("timeUndo.moved");
		return false;
	}
	asking = true;
	try {
		const yes = await confirmDialog({
			title: t("timeUndo.confirm.title"),
			icon: "fa-solid fa-clock-rotate-left",
			message: undoMessage(record, planFor(record)),
			yes: { label: t("timeUndo.confirm.yes"), icon: "fa-solid fa-clock-rotate-left" },
			no: { label: t("timeUndo.confirm.no") }
		});
		if (!yes) return false;
		const outcome = await askToTakeBack(record.id);
		if (outcome !== "done") warn(`timeUndo.${["partly", "busy", "moved"].includes(outcome) ? outcome : "unanswered"}`);
		return outcome === "done";
	} finally {
		asking = false;
	}
}

/**
 * Wire up the Undo button on an advance's cards, and take it off a card once
 * its advance can no longer be taken back. Called during init.
 */
export function registerTimeUndo() {
	registerQuery(UNDO_QUERY, onUndoQuery);
	registerCardButtons({ selector: "[data-undo-time]", gmOnly: true, handler: (_button, message) => {
		// The card names its own advance, never just the newest.
		const id = message?.flags?.[SYSTEM_ID]?.[ADVANCE_FLAG];
		return id ? undoAdvance(id) : false;
	} });
	Hooks.on("renderChatMessageHTML", (message, html) => {
		const button = html.querySelector?.("[data-undo-time]");
		if (!button) return;
		const kept = advanceRecords().some((record) => record.id === message.flags?.[SYSTEM_ID]?.[ADVANCE_FLAG]);
		if (kept) return;
		const row = button.closest(".bastionland-card__actions");
		button.remove();
		if (row && !row.querySelector("button")) row.remove();
	});
}
