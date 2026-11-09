import { inputDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { replacementEntry } from "../compat.js";
import { knightTableItemId } from "../rules/knight-tables.js";
import { PICK_BLANK, pickedFrom } from "../rules/pick-list.js";
import { isSteed, nameWithoutOwner, pointsBelow, propertyItems } from "../rules/property.js";
import {
	addsPiece,
	columnsToRedo,
	columnStats,
	companionStats,
	isCompanionLine,
	namingColumn,
	retypeFor,
	retypedWeapon,
	snapshotBefore,
	statsForItem,
	tableSubject,
	tableTargets,
	takesStats
} from "../rules/table-stats.js";
import { capitalise } from "../rules/text.js";
import { SYSTEM_ID } from "../system-id.js";
import { COMPANION_FLAG } from "./belonging.js";
import { worldKnights } from "./knights.js";
import { steedOf } from "./steeds.js";

/**
 * The Knight flag keeping what each column's result did, so rolling it again
 * or clearing it puts things back first:
 * `{ [column]: { actor?: string, item?: string, created?: string, before?: object, actorBefore?: object,
 * retypedFrom?: object, named?: string, kind: string } }`. `actor` is a companion's uuid, where the
 * result landed on them rather than the Knight.
 */
const APPLIED_FLAG = "tableApplied";

/**
 * The world setup step that carries Knights' table results again where they
 * now go somewhere else: onto a companion, as a way to throw a weapon, or as a
 * piece of their own.
 */
export const TABLE_RESULTS_STEP = "tableResultsRouted";

/** @param {Record<string, unknown>} paths By path under `system.` @returns {object} An item or actor update. */
const systemUpdate = (paths) => Object.fromEntries(Object.entries(paths).map(([path, value]) => [`system.${path}`, value]));

/**
 * Put the stats each rolled column gives onto the Property it's about: the
 * Cosmic Knight's crossbow takes the form rolled, the War Knight's polearm its
 * specialist die, a steed or a hawk what its result gives it. What the column
 * did before is put back first. A column whose result has no stats changes
 * nothing, except one that says what the Knight's companion is, which names it.
 * @param {Actor} knight
 * @param {number[]} columns By index.
 * @param {object} [options]
 * @param {boolean} [options.ask=true] Ask which possession when several could take a result.
 *   Without asking, such a column is left as it was.
 * @returns {Promise<string[]>} What was done, a line for each column that did anything.
 */
export async function applyTableStats(knight, columns, { ask = true } = {}) {
	const stored = knight?.system.bookTable;
	if (!knight?.isOwner || !stored?.columns?.length) return [];
	const original = knight.getFlag(SYSTEM_ID, APPLIED_FLAG) ?? {};
	const applied = { ...original };
	const said = [];
	for (const column of columns) {
		const roll = stored.rolls[column] ?? 0;
		const entry = roll ? stored.rows[roll - 1]?.[column] : null;
		const was = applied[column] ?? null;
		try {
			const now = namingColumn(stored) === column
				? await nameCompanion(knight, { entry, was })
				: await applyColumn(knight, { stats: columnStats(stored, column, entry), was, header: stored.columns[column], tableName: stored.name, ask });
			if (now?.skipped) continue;
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
 * One column: put back what it did, then do what its result says. A result
 * rolled again on the same possession of the Knight's, which can take it as it
 * is, changes it in one write; anything else is put back first, so gear a
 * weapon was made from is there again to become armour.
 * @returns {Promise<{record: object, said: string}|{skipped: true}|null>} What it did, or null when nothing.
 */
async function applyColumn(knight, { stats, was, header, tableName, ask }) {
	const previous = was && !was.actor && !was.created ? knight.items.get(was.item) : null;
	const kind = stats && previous ? statsForItem(stats, previous).kind : null;
	// Gear made a weapon stays one only for another weapon's result; anything else finds it gear again.
	// A companion's line made a weapon, as a hawk once was, is gear again for its NPC to take the result.
	const retypedFits = !was?.retypedFrom || (!isCompanionLine(was.retypedFrom) && retypeFor(was.retypedFrom.type, kind) === previous?.type);
	const inPlace = Boolean(stats && previous && takesStats(previous, kind) && !addsPiece(stats, previous) && retypedFits);
	// Not asking, a column several possessions could take is left as it is, so nothing is put back first.
	if (was && !inPlace && stats && !ask && tableTargets(itemsAfterPutBack(knight, was), { header, tableName, tableItemId: null, kind: stats.kind }).length > 1) return { skipped: true };
	if (was && !inPlace) await putBack(knight, was);
	if (!stats) return null;

	const target = await targetFor(knight, stats, { header, tableName, kept: inPlace ? previous : null, ask });
	if (!target || target.skipped) return target;
	if (target.companion) return applyToCompanion(target.actor, stats);
	if (target.create) return addPiece(knight, stats);

	const { item } = target;
	const given = statsForItem(stats, item);
	const same = inPlace && previous === item;
	const retype = retypeFor(item.type, given.kind);
	if (retype) {
		// Gear such as the crossbow becomes the weapon it's rolled as, keeping its place, name and flags.
		const data = item.toObject();
		const base = retype === "weapon"
			? { ...retypedWeapon(item.name), description: data.system.description }
			: { description: data.system.description, equipped: true, ...(given.armourKind ? { kind: given.armourKind } : {}) };
		const system = foundry.utils.mergeObject(base, foundry.utils.expandObject(given.system));
		const [made] = await knight.createEmbeddedDocuments("Item", [{ name: data.name, type: retype, img: data.img, sort: data.sort, flags: data.flags, system }]);
		await item.delete();
		return { record: { item: made.id, kind: given.kind, retypedFrom: data }, said: t("knightTable.apply.applied", { item: made.name }) };
	}
	// The same possession rolled again, still the type it was.
	const reroll = same && !was.retypedFrom;
	const record = same && !reroll
		? { ...was, kind: given.kind }
		: { item: item.id, kind: given.kind, before: snapshotBefore(reroll ? was.before : null, given.system, (path) => foundry.utils.getProperty(item.system, path)) };
	// A reroll puts back what the last result changed and this one doesn't.
	const reset = reroll ? Object.fromEntries(Object.entries(was.before ?? {}).filter(([path]) => !(path in given.system))) : {};
	await item.update(systemUpdate({ ...reset, ...given.system }));
	return { record, said: t("knightTable.apply.applied", { item: item.name }) };
}

/**
 * Undo what a column did: anything it added goes, the gear it became a
 * weapon from comes back, or the values it changed go back, on the Knight or
 * on their companion.
 * @param {Actor} knight
 * @param {object} was The column's record.
 * @returns {Promise<void>}
 */
async function putBack(knight, was) {
	const owner = was.actor ? fromUuidSync(was.actor) : knight;
	if (!owner?.isOwner) return;
	if (was.created) await owner.items.get(was.created)?.delete();
	const item = was.item ? owner.items.get(was.item) : null;
	if (was.retypedFrom && item) {
		const { _id: _drop, ...data } = was.retypedFrom;
		await owner.createEmbeddedDocuments("Item", [data]);
		await item.delete();
		return;
	}
	if (was.before && item) await item.update(systemUpdate(was.before));
	if (was.actorBefore) await owner.update(systemUpdate(was.actorBefore));
}

/**
 * The Knight's possessions as putBack would leave them: what the column added
 * gone, and gear it made a weapon or armour of standing as gear again.
 * @param {Actor} knight
 * @param {object} was The column's record.
 * @returns {{id: string, name: string, type: string, system?: object}[]}
 */
function itemsAfterPutBack(knight, was) {
	const items = knight.items.contents;
	// What lands on a companion leaves the Knight's own possessions as they are.
	if (was.actor) return items;
	const retyped = was.retypedFrom && knight.items.get(was.item) ? was.item : null;
	const kept = items.filter((item) => item.id !== was.created && item.id !== retyped);
	return retyped ? [...kept, { ...was.retypedFrom, id: retyped }] : kept;
}

/**
 * Where a result's stats go: on the possession the column or table names, or
 * the one that says "see below"; on the NPC a companion line was made into;
 * or, for a named piece of its own such as a helm beside a suit of plate, onto
 * the Knight as a new possession. Several to choose from are asked about.
 * @returns {Promise<{actor: Actor, item?: Item, companion?: true, create?: true}|{skipped: true}|null>}
 */
async function targetFor(knight, stats, { header, tableName, kept, ask }) {
	const none = () => {
		// A world setup step carrying results again asks nobody, and says nothing of those with no place.
		if (ask) ui.notifications.info(t("knightTable.apply.none", { name: knight.name, column: header }));
		return null;
	};
	if (kept) return { actor: knight, item: kept };
	const items = knight.items.contents;
	const where = { header, tableName, tableItemId: knightTableItemId(knight) };
	const ids = tableTargets(items, { ...where, kind: stats.kind });
	if (!ids.length) {
		// A trample for a steed whose line is gone, as most are once it's an NPC.
		const steed = stats.kind === "trample" ? steedOf(knight) : null;
		if (steed) return { actor: steed, companion: true };
		const subject = tableSubject(items, where);
		if (stats.name && ["weapon", "armour"].includes(stats.kind) && subject) return { actor: knight, create: true };
		return none();
	}
	if (ids.length > 1 && !ask) return { skipped: true };
	const id = ids.length === 1 ? ids[0] : await askWhich(knight, ids, header);
	const item = id ? knight.items.get(id) : null;
	if (!item) return null;
	if (isCompanionLine(item)) {
		const npc = companionFor(knight, item);
		if (npc) return { actor: npc, companion: true };
		return none();
	}
	if (addsPiece(stats, item)) return { actor: knight, create: true };
	return { actor: knight, item };
}

/**
 * The NPC a companion line on a Knight was made into: their steed, or the
 * companion made for them by that name, or the only one made for them.
 * @param {Actor} knight
 * @param {{name: string}} line A companion line.
 * @returns {Actor|null}
 */
function companionFor(knight, line) {
	const [companion] = propertyItems([line.name]).companions;
	if (!companion) return null;
	const steed = steedOf(knight);
	if (isSteed(companion.name) && steed) return steed;
	const made = game.actors.filter((actor) => actor.getFlag(SYSTEM_ID, COMPANION_FLAG) === knight.id && actor.uuid !== knight.system.steed);
	const plain = (name) => nameWithoutOwner(name, knight.name).toLowerCase();
	return made.find((npc) => plain(npc.name) === companion.name.toLowerCase()) ?? (made.length === 1 ? made[0] : null);
}

/**
 * A result put on a companion's NPC: its Armour or Guard, its trample, or
 * the attack the result speaks of.
 * @returns {Promise<{record: object, said: string}|null>}
 */
async function applyToCompanion(npc, stats) {
	const change = companionStats(stats, { items: npc.items.contents }, { trampleName: t("steed.trample") });
	if (!change) return null;
	if (!npc.isOwner) {
		ui.notifications.info(t("knightTable.apply.notYours", { name: npc.name }));
		return null;
	}
	const record = { actor: npc.uuid, kind: stats.kind };
	if (change.actor) {
		record.actorBefore = snapshotBefore(null, change.actor, (path) => foundry.utils.getProperty(npc.system, path));
		await npc.update(systemUpdate(change.actor));
	}
	if (change.item) {
		const item = npc.items.get(change.item.id);
		record.item = item.id;
		record.before = snapshotBefore(null, change.item.system, (path) => foundry.utils.getProperty(item.system, path));
		await item.update(systemUpdate(change.item.system));
	}
	if (change.create) {
		const [made] = await npc.createEmbeddedDocuments("Item", [change.create]);
		record.created = made.id;
	}
	return { record, said: t("knightTable.apply.applied", { item: npc.name }) };
}

/**
 * A named piece a result gives the Knight beside what the table is about, as
 * a helm or a pair of spiked gloves for their armour.
 * @returns {Promise<{record: object, said: string}>}
 */
async function addPiece(knight, stats) {
	const system = foundry.utils.expandObject(stats.system);
	const data = stats.kind === "armour"
		? { type: "armour", name: stats.name, system: { ...system, kind: stats.armourKind ?? "coat", equipped: true } }
		: { type: "weapon", name: stats.name, system: { ...retypedWeapon(stats.name), ...system } };
	const [made] = await knight.createEmbeddedDocuments("Item", [data]);
	return { record: { created: made.id, kind: stats.kind }, said: t("knightTable.apply.added", { item: made.name }) };
}

/**
 * A column whose result says what the Knight's companion is, as an otter:
 * their companion is named so, and named back if the column is cleared. One
 * renamed by hand since keeps its name.
 * @returns {Promise<{record: object, said: string}|null>}
 */
async function nameCompanion(knight, { entry, was }) {
	const line = knight.items.contents.find((item) => isCompanionLine(item) && pointsBelow(item.name));
	const npc = was?.actor ? fromUuidSync(was.actor) : line ? companionFor(knight, line) : null;
	if (!npc?.isOwner) return was ? { record: was } : null;
	const ours = !was || npc.name === was.named;
	const name = capitalise(String(entry ?? "").trim());
	if (!name) {
		if (was && ours) await npc.update({ name: was.before });
		return null;
	}
	if (!ours) return { record: was };
	const before = was?.before ?? npc.name;
	if (npc.name !== name) await npc.update({ name });
	return { record: { actor: npc.uuid, before, named: name, kind: "name" }, said: t("knightTable.apply.named", { name }) };
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

/**
 * A world setup step. Knights whose table was rolled before results could
 * land on a companion, be a thrown way to fight, or be a piece of their own
 * had them put on the wrong possession, or on none. Those columns are carried
 * again, without asking: one that several possessions could take is left as it is.
 * @returns {Promise<void>}
 */
export async function routeTableResults() {
	for (const knight of worldKnights((actor) => actor.isOwner)) {
		const columns = columnsToRedo(knight.system.bookTable, knight.getFlag(SYSTEM_ID, APPLIED_FLAG) ?? {});
		if (!columns.length) continue;
		await applyTableStats(knight, columns, { ask: false }).catch((error) => {
			console.error(`${SYSTEM_ID} | Couldn't carry ${knight.uuid}'s table results again`, error);
		});
	}
}
