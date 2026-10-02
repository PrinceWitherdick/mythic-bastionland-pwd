import { t } from "../chat/cards.js";
import { LEDGER_FLAG, itemChanges, itemListEntry, knightChanges, writeIntoLedger } from "../rules/ledger.js";
import { SYSTEM_ID } from "../system-id.js";

/** The Ledger's own writes carry this option, so they aren't logged in turn. */
const LEDGER_OPTION = "bastionlandLedger";

/**
 * Set on an update made by something other than a hand on the sheet, such as
 * `{ ledgerCause: "Rest" }`, and its lines read "via Rest".
 */
export const CAUSE_OPTION = "ledgerCause";

/**
 * Document update options naming what made the change, for the Ledger.
 * @param {string} key One of `bastionland.ledger.causes`.
 * @returns {object} Options to pass alongside the update.
 */
export const causedBy = (key) => ({ [CAUSE_OPTION]: t(`ledger.causes.${key}`) });

/**
 * The lines an update makes, carried from before it to after it on its options,
 * by the id of the document they're about. One update can change several
 * documents, and Foundry hands every one of them the same options.
 */
const PENDING_OPTION = "bastionlandLedgerEntries";

const LEDGER_PATH = `flags.${SYSTEM_ID}.${LEDGER_FLAG}`;

/** Knights keep a Ledger. */
const keepsLedger = (actor) => actor?.type === "knight" && actor.documentName === "Actor";

/** @returns {import("../rules/ledger.js").LedgerContext} */
const ledgerContext = () => ({
	t,
	nameOf: (uuid) => fromUuidSync(uuid)?.name ?? t("ledger.gone"),
	typeLabel: (type) => game.i18n.localize(`TYPES.Item.${type}`)
});

/**
 * @param {Actor} actor
 * @returns {object[]} Its Ledger, newest first.
 */
export function ledgerEntries(actor) {
	const entries = actor?.getFlag(SYSTEM_ID, LEDGER_FLAG);
	return Array.isArray(entries) ? entries : [];
}

/**
 * One chain of writes per actor. Each write reads the whole Ledger and writes
 * it back, so two at once, such as a Start's kit arriving item by item, would
 * each keep only their own line.
 * @type {Map<string, Promise>}
 */
const writes = new Map();

function queueWrite(actor, work) {
	const key = actor.uuid;
	const run = (writes.get(key) ?? Promise.resolve()).then(work, work);
	const link = run.then(() => {}, () => {}).then(() => {
		if (writes.get(key) === link) writes.delete(key);
	});
	writes.set(key, link);
	return run;
}

/**
 * Write lines into an actor's Ledger, stamped with who and when.
 * @param {Actor} actor
 * @param {import("../rules/ledger.js").LedgerEntry[]} entries In the order they happened.
 * @param {object} [options]
 * @param {string} [options.userId] Who made the change.
 * @param {string} [options.cause]
 */
function appendLedger(actor, entries, { userId = game.user.id, cause } = {}) {
	if (!keepsLedger(actor) || !entries?.length) return;
	const user = game.users.get(userId);
	// Stamped now, not when their turn to be written comes.
	const stamped = entries.map((entry) => ({
		id: foundry.utils.randomID(),
		timestamp: Date.now(),
		userId,
		userName: user?.name ?? "",
		...(cause ? { cause } : {}),
		...entry
	}));
	return queueWrite(actor, () => actor.update(
		{ [LEDGER_PATH]: writeIntoLedger(ledgerEntries(actor), stamped, t) },
		{ [LEDGER_OPTION]: true, render: false }
	));
}

/**
 * @param {Actor} actor
 * @param {Set<string>} ids The lines to strike out.
 */
export function deleteLedgerEntries(actor, ids) {
	if (!ids?.size) return;
	return queueWrite(actor, () => actor.update(
		{ [LEDGER_PATH]: ledgerEntries(actor).filter((entry) => !ids.has(entry.id)) },
		{ [LEDGER_OPTION]: true, render: false }
	));
}

/**
 * Pick up a change as it's asked for, while the actor still holds what it replaces.
 * @param {Actor} actor
 * @param {ClientDocument} doc The actor, or the item of theirs being changed.
 * @param {object} changes
 * @param {object} options
 * @param {(flat: object) => object[]} read
 */
function readChanges(actor, doc, changes, options, read) {
	if (!keepsLedger(actor) || options[LEDGER_OPTION]) return;
	const entries = read(foundry.utils.flattenObject(changes));
	// Set or cleared every time, so options passed again to a later update don't carry this one's lines.
	const pending = options[PENDING_OPTION] ??= {};
	if (entries.length) pending[doc.id] = entries;
	else delete pending[doc.id];
}

/**
 * Write what `readChanges` picked up for `doc`. Every client hears of an
 * update, but only the one who made it writes, as only they surely may.
 */
function writeChanges(actor, doc, options, userId) {
	if (!keepsLedger(actor) || options[LEDGER_OPTION] || userId !== game.user.id) return;
	const pending = options[PENDING_OPTION];
	const entries = pending?.[doc.id];
	if (!entries) return;
	// Written once, even if the hook is heard again.
	delete pending[doc.id];
	return appendLedger(actor, entries, { userId, cause: options[CAUSE_OPTION] });
}

/** Redraw an open Ledger when its lines change. */
function refreshOpenLedger(actor, changes) {
	if (!foundry.utils.hasProperty(changes, LEDGER_PATH)) return;
	for (const app of foundry.applications.instances.values()) {
		if (app.ledgerOf?.uuid === actor.uuid) app.render();
	}
}

export function registerLedgerHooks() {
	Hooks.on("preUpdateActor", (actor, changes, options) => readChanges(actor, actor, changes, options, (flat) => knightChanges(actor, flat, ledgerContext())));
	Hooks.on("updateActor", (actor, changes, options, userId) => {
		refreshOpenLedger(actor, changes);
		writeChanges(actor, actor, options, userId);
	});
	Hooks.on("preUpdateItem", (item, changes, options) => readChanges(item.parent, item, changes, options, (flat) => itemChanges(item, flat, ledgerContext())));
	Hooks.on("updateItem", (item, _changes, options, userId) => writeChanges(item.parent, item, options, userId));
	for (const [hook, phrase] of [["createItem", "added"], ["deleteItem", "removed"]]) {
		Hooks.on(hook, (item, options, userId) => {
			const actor = item.parent;
			if (!keepsLedger(actor) || options[LEDGER_OPTION] || userId !== game.user.id) return;
			const entry = itemListEntry(item, phrase, ledgerContext());
			if (entry) appendLedger(actor, [entry], { userId, cause: options[CAUSE_OPTION] });
		});
	}
}
