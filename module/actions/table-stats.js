import { inputDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { replacementEntry } from "../compat.js";
import { knightTableItemId } from "../rules/knight-tables.js";
import { PICK_BLANK, pickedFrom } from "../rules/pick-list.js";
import { entryStats, retypeFor, retypedWeapon, snapshotBefore, tableTargets, takesStats } from "../rules/table-stats.js";
import { SYSTEM_ID } from "../system-id.js";
import { steedOf } from "./steeds.js";

/**
 * The Knight flag keeping what each column's result did, so rolling it again
 * or clearing it puts the possession back first:
 * `{ [column]: { actor?: string, item: string, before?: object, retypedFrom?: object, kind: string } }`.
 */
const APPLIED_FLAG = "tableApplied";

/** @param {Record<string, unknown>} paths By path under `system.` @returns {object} An item update. */
const systemUpdate = (paths) => Object.fromEntries(Object.entries(paths).map(([path, value]) => [`system.${path}`, value]));

/**
 * Put the stats each rolled column gives onto the Property it's about: the
 * Cosmic Knight's crossbow takes the form rolled, the War Knight's polearm its
 * specialist die, a steed its trample. What the column did before is put back
 * first. A column whose result has no stats changes nothing.
 * @param {Actor} knight
 * @param {number[]} columns By index.
 * @returns {Promise<string[]>} What was done, a line for each column that did anything.
 */
export async function applyTableStats(knight, columns) {
	const stored = knight?.system.bookTable;
	if (!knight?.isOwner || !stored?.columns?.length) return [];
	const original = knight.getFlag(SYSTEM_ID, APPLIED_FLAG) ?? {};
	const applied = { ...original };
	const said = [];
	for (const column of columns) {
		const roll = stored.rolls[column] ?? 0;
		const stats = entryStats(roll ? stored.rows[roll - 1]?.[column] : null);
		const was = applied[column] ?? null;
		try {
			const now = await applyColumn(knight, { stats, was, header: stored.columns[column], tableName: stored.name });
			if (now) applied[column] = now.record;
			else delete applied[column];
			if (now?.said) said.push(now.said);
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't carry ${knight.name}'s table result to their Property`, error);
		}
	}
	// Written whole, so a column put back leaves no record behind.
	if (!foundry.utils.objectsEqual(applied, original)) await knight.update(Object.fromEntries([replacementEntry(`flags.${SYSTEM_ID}.${APPLIED_FLAG}`, applied)]));
	return said;
}

/**
 * One column: put back what it did, then do what its result says.
 * @returns {Promise<{record: object, said: string}|null>} What it did, or null when nothing.
 */
async function applyColumn(knight, { stats, was, header, tableName }) {
	const owner = was?.actor ? fromUuidSync(was.actor) : knight;
	const previous = owner?.items.get(was?.item);
	// The same possession again, as a reroll of the same column usually is: one write.
	const target = stats ? await targetFor(knight, stats, { header, tableName, was: previous ? was : null }) : null;
	if (was && previous && target?.item !== previous) await putBack(owner, previous, was);
	if (!target) return null;

	const { actor, item } = target;
	const same = Boolean(was) && previous === item;
	const retype = retypeFor(item.type, stats.kind);
	if (retype) {
		// Gear such as the crossbow becomes the weapon it's rolled as, keeping its place, name and flags.
		const data = item.toObject();
		const base = retype === "weapon" ? { ...retypedWeapon(item.name), description: data.system.description } : { description: data.system.description, equipped: true };
		const system = foundry.utils.mergeObject(base, foundry.utils.expandObject(stats.system));
		const [made] = await actor.createEmbeddedDocuments("Item", [{ name: data.name, type: retype, img: data.img, sort: data.sort, flags: data.flags, system }]);
		await item.delete();
		return { record: { item: made.id, kind: stats.kind, retypedFrom: data }, said: t("knightTable.apply.applied", { item: made.name }) };
	}
	// The same possession rolled again, still the type it was.
	const reroll = same && !was.retypedFrom;
	const record = same && !reroll
		? { ...was, kind: stats.kind }
		: { item: item.id, kind: stats.kind, before: snapshotBefore(reroll ? was.before : null, stats.system, (path) => foundry.utils.getProperty(item.system, path)), ...(actor === knight ? {} : { actor: actor.uuid }) };
	// A reroll puts back what the last result changed and this one doesn't.
	const reset = reroll ? Object.fromEntries(Object.entries(was.before ?? {}).filter(([path]) => !(path in stats.system))) : {};
	await item.update(systemUpdate({ ...reset, ...stats.system }));
	return { record, said: t("knightTable.apply.applied", { item: item.name }) };
}

/**
 * Undo what a column did: the gear it became a weapon from comes back, or the
 * values it changed go back.
 */
async function putBack(owner, item, was) {
	if (was.retypedFrom) {
		const { _id: _drop, ...data } = was.retypedFrom;
		await owner.createEmbeddedDocuments("Item", [data]);
		await item.delete();
		return;
	}
	if (was.before) await item.update(systemUpdate(was.before));
}

/**
 * Where a result's stats go: a steed's trample on the steed, anything else on
 * the Knight's Property, as tableTargets finds it. The possession the column
 * changed before is kept to. Several to choose from are asked about.
 * @returns {Promise<{actor: Actor, item: Item}|null>}
 */
async function targetFor(knight, stats, { header, tableName, was }) {
	if (stats.kind === "trample") {
		const steed = steedOf(knight);
		const trample = steed?.items.find((item) => item.type === "weapon" && item.system.trample);
		if (!trample) ui.notifications.info(t("knightTable.apply.none", { name: knight.name, column: header }));
		return trample ? { actor: steed, item: trample } : null;
	}
	const items = knight.items.contents;
	if (was && !was.actor) {
		const kept = knight.items.get(was.item);
		if (kept && takesStats(kept, stats.kind)) return { actor: knight, item: kept };
	}
	const ids = tableTargets(items, { header, tableName, tableItemId: knightTableItemId(knight), kind: stats.kind });
	if (!ids.length) {
		ui.notifications.info(t("knightTable.apply.none", { name: knight.name, column: header }));
		return null;
	}
	const id = ids.length === 1 ? ids[0] : await askWhich(knight, ids, header);
	const item = id ? knight.items.get(id) : null;
	return item ? { actor: knight, item } : null;
}

/**
 * Ask which possession a result belongs on, when more than one could take it.
 * @returns {Promise<string|null>} The item's id, or null to apply it to none.
 */
async function askWhich(knight, ids, header) {
	const choices = ids.map((id) => knight.items.get(id)).filter(Boolean).map((item) => ({ id: item.id, name: item.name }));
	const data = await inputDialog({
		title: t("knightTable.apply.title"),
		icon: "fa-solid fa-hand-holding",
		template: "table-apply",
		context: { intro: t("knightTable.apply.which", { column: header }), choices },
		ok: { label: t("knightTable.apply.ok") }
	});
	if (!data) return null;
	const picked = pickedFrom(choices, data.item);
	return picked && picked !== PICK_BLANK ? picked.id : null;
}
