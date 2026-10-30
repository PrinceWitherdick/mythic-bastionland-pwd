import { inputDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { DIE_SIZES } from "../rules/attack.js";
import { awaitsRevengeOn, isScarPending, scarDescription, scarForRoll, scarRaisesGuardLater, scarRaisesGuardNow, settlesByTending } from "../rules/scars.js";
import { isDying } from "../rules/virtues.js";
import { seasonKey } from "../rules/time.js";
import { getCalendar } from "./calendar.js";
import { causedBy } from "./ledger.js";
import { seenName } from "./seen-name.js";
import { timelineScar, timelineScarSettled } from "./timeline-events.js";
import { worldKnights } from "./knights.js";

/**
 * The d6 that said where a Scar landed, read back from the place it names.
 * @param {{key: string, detail?: boolean}} scar The Scar table's entry.
 * @param {string|null} location
 * @returns {number|null}
 */
function detailOf(scar, location) {
	if (!scar.detail || !location) return null;
	const found = [1, 2, 3, 4, 5, 6].find((roll) => t(`scars.${scar.key}.detail.${roll}`) === location);
	return found ?? null;
}

/**
 * Re-roll the die that caused a Scar and read the Scar table (p9). When the
 * player agrees, the Scar is recorded on the Knight and its immediate effects
 * are applied: Virtue Loss, and a max GD increase where the entry grants one
 * straight away. Effects that wait on a later event stay as text on the Scar,
 * and a Humiliation remembers who dealt it, for the revenge that settles it.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {number} [options.faces=6] The die that dealt the Scar, selected in the dialog.
 * @param {string} [options.by] Actor UUID of whoever dealt the blow, when an Attack card knows.
 * @returns {Promise<{roll: number, key: string, location: string|null, faces: number, apply: boolean}|null>} The
 *   Scar's table entry, where it landed, the die rolled and whether it was recorded, or null if the dialog was closed.
 */
export async function rollScar(actor, { faces: caused, by } = {}) {
	const preset = DIE_SIZES.includes(caused) ? caused : 6;
	const data = await inputDialog({
		title: t("scarRoll.title"),
		icon: "fa-solid fa-bone-break",
		template: "scar",
		context: { dice: DIE_SIZES.map((faces) => ({ faces, selected: faces === preset })) },
		ok: { label: t("scarRoll.roll"), icon: "fa-solid fa-dice" }
	});
	if (!data) return null;

	const faces = DIE_SIZES.includes(Number(data.die)) ? Number(data.die) : 6;
	const apply = Boolean(data.apply);

	const scarRoll = await new Roll(`1d${faces}`).evaluate();
	const scar = scarForRoll(scarRoll.total);
	const rolls = [scarRoll];

	let location = null;
	let detail = null;
	if (scar.detail) {
		const detailRoll = await new Roll("1d6").evaluate();
		rolls.push(detailRoll);
		detail = detailRoll.total;
		location = t(`scars.${scar.key}.detail.${detail}`);
	}
	await giveScar(actor, { scar, location, detail, faces, by, apply, rolls });
	return { ...scar, location, detail, faces, apply };
}

/**
 * Give somebody a Scar already rolled: its Virtue Loss and any GD it raises
 * straight away are rolled for them, it's recorded on them, and a card says
 * so. Rolled for one and given to another too, as a Scar some Knights give
 * back to whoever dealt it (p116).
 * @param {Actor} actor
 * @param {object} scarred
 * @param {object} scarred.scar          The Scar table's entry, from scarForRoll.
 * @param {string|null} [scarred.location] Where it landed, for one that says.
 * @param {number|null} [scarred.detail] The d6 that said where, read back from the location when not given.
 * @param {number} scarred.faces         The die that dealt it, for the card.
 * @param {string} [scarred.by]          Actor UUID of whoever dealt it, owed revenge for a Humiliation.
 * @param {boolean} [scarred.apply=true] Recorded on them, and its losses taken, or only shown.
 * @param {Roll[]} [scarred.rolls]       Rolls made for it already, shown on its card.
 * @returns {Promise<void>}
 */
export async function giveScar(actor, { scar, location = null, detail = null, faces, by, apply = true, rolls: rolled = [] }) {
	const text = (part) => t(`scars.${scar.key}.${part}`);
	const rolls = [...rolled];
	const lines = [];
	const update = {};

	if (scar.loss) {
		const { virtue, formula } = scar.loss;
		const lossRoll = await new Roll(formula).evaluate();
		rolls.push(lossRoll);
		update[`system.virtues.${virtue}.value`] = Math.max(0, actor.system.virtues[virtue].value - lossRoll.total);
		lines.push(t("scarRoll.lost", { amount: lossRoll.total, virtue: t(`virtues.${virtue}.abbr`) }));
	}

	const maxGuard = actor.system.guard.max;
	if (scarRaisesGuardNow(scar, maxGuard)) {
		const guardRoll = await new Roll("1d6").evaluate();
		rolls.push(guardRoll);
		update["system.guard.max"] = maxGuard + guardRoll.total;
		lines.push(t("scarRoll.guardRaised", { amount: guardRoll.total, value: maxGuard + guardRoll.total }));
	}

	// Revenge on whoever dealt a Humiliation settles it (p9).
	const foe = scar.byRevenge && by ? fromUuidSync(by) : null;
	const foeName = foe ? seenName(by) : "";
	if (foe) lines.push(t("revenge.owed", { name: foeName }));

	const name = text("name");
	let item = null;
	if (apply) {
		if (!foundry.utils.isEmpty(update)) await actor.update(update, causedBy("scar"));
		[item] = await actor.createEmbeddedDocuments("Item", [{
			type: "scar",
			name: location ? `${name} (${location})` : name,
			system: {
				roll: scar.roll,
				detail: detail ?? detailOf(scar, location),
				// Doom lasts the Season it was taken in.
				season: seasonKey(getCalendar()),
				foe: foe?.uuid ?? "",
				foeName,
				description: scarDescription(text("flavour"), text("effect"))
			}
		}]);
	}

	await Promise.all([
		item && timelineScar(actor, item, text("effect")),
		postCard(actor, "scar", {
			faces,
			roll: scar.roll,
			name,
			flavour: text("flavour"),
			effect: text("effect"),
			location,
			lines
		}, { rolls })
	]);
}

/**
 * Settle a Scar whose GD increase waited on something: being stitched or
 * patched up, the next Season, or revenge. Max GD rises by d6 if it's still at
 * or under the Scar's limit, and the Scar is marked settled either way, on its
 * bearer's Timeline thread whichever way it came.
 * @param {Actor} actor   Who bears it.
 * @param {Item} item     A Scar item.
 * @param {number} maxGuard Max GD before settling.
 * @param {{when?: string}} [options] The Season it's settled in, on the Timeline, when it isn't now.
 * @returns {Promise<{roll: Roll|null, guardMax: number, line: string}>} The caller saves `guardMax`.
 */
export async function settleScar(actor, item, maxGuard, options) {
	const limit = scarForRoll(item.system.roll)?.laterGuardAtMost;
	const raises = scarRaisesGuardLater(item.system, maxGuard);
	await item.update({ "system.resolved": true }, causedBy("scar"));
	const settled = raises ? await raiseGuard(item, maxGuard) : { roll: null, guardMax: maxGuard, line: t("scarRoll.settledNoRaise", { name: item.name, limit }) };
	await timelineScarSettled(actor, item, settled.line, options);
	return settled;
}

/**
 * @param {Item} item A Scar item.
 * @param {number} maxGuard
 * @returns {Promise<{roll: Roll, guardMax: number, line: string}>} Max GD raised by d6.
 */
async function raiseGuard(item, maxGuard) {
	const roll = await new Roll("1d6").evaluate();
	const guardMax = maxGuard + roll.total;
	return { roll, guardMax, line: t("scarRoll.settledRaise", { name: item.name, amount: roll.total, value: guardMax }) };
}

/**
 * Settle Scars one after another, each raising max GD from where the last left it.
 * @param {Actor} actor Who bears them.
 * @param {Item[]} items Scar items.
 * @param {number} guardMax Max GD before the first.
 * @param {{when?: string}} [options] The Season they're settled in, on the Timeline, when it isn't now.
 * @returns {Promise<{rolls: Roll[], lines: string[], guardMax: number}>} The caller saves `guardMax`.
 */
export async function settleScars(actor, items, guardMax, options) {
	const rolls = [];
	const lines = [];
	for (const item of items) {
		const settled = await settleScar(actor, item, guardMax, options);
		if (settled.roll) rolls.push(settled.roll);
		guardMax = settled.guardMax;
		lines.push(settled.line);
	}
	return { rolls, lines, guardMax };
}

/**
 * @param {Actor} actor
 * @returns {Item[]} Their Gouges and Tears waiting on being stitched or patched up (p9).
 */
const tendingScars = (actor) => actor.items.filter((item) => item.type === "scar" && settlesByTending(item.system));

/**
 * @param {Actor} actor
 * @returns {boolean} Whether patching them up would do anything: a Mortal Wound, or a Scar it settles.
 */
export const canPatchUp = (actor) => isDying(actor.system) || tendingScars(actor).length > 0;

/**
 * Patch someone up (p8): a Mortal Wound tended in a few moments, and any Gouge
 * or Tear waiting on being stitched or patched up settled with it (p9).
 * @param {Actor} actor
 * @returns {Promise<string[]|null>} The card's lines, or null when there was nothing to tend.
 */
export async function patchUp(actor) {
	if (!canPatchUp(actor)) return null;
	const { rolls, lines, guardMax } = await settleScars(actor, tendingScars(actor), actor.system.guard?.max ?? 0);
	const update = { "system.mortalWound": false };
	if (actor.system.guard && guardMax !== actor.system.guard.max) update["system.guard.max"] = guardMax;
	await actor.update(update, causedBy("scar"));
	const text = [t("scarRoll.patchedUp", { name: actor.name }), ...lines].join(" ");
	await postCard(actor, "note", { icon: "fa-solid fa-kit-medical", text }, { rolls });
	return lines;
}

/**
 * Settle one Scar from the sheet, when the Referee judges its moment has come.
 * @param {Actor} actor
 * @param {Item|undefined} item
 */
export async function resolveScar(actor, item) {
	if (item?.type !== "scar" || !isScarPending(item.system)) return null;
	const maxGuard = actor.system.guard.max;
	const settled = await settleScar(actor, item, maxGuard);
	if (settled.guardMax !== maxGuard) await actor.update({ "system.guard.max": settled.guardMax }, causedBy("scar"));
	await postCard(actor, "note", { icon: "fa-solid fa-bone-break", text: settled.line }, { rolls: settled.roll ? [settled.roll] : [] });
	return settled;
}

/**
 * Somebody brought down may be a Knight's revenge (p9). Each Knight whose
 * Humiliation names them gets a card asking whether it is, and its button
 * settles the Scar. Whether it counts is the table's to say, so nothing
 * settles by itself.
 * @param {Actor} foe Whoever was just Mortally Wounded, Slain or routed.
 * @returns {Promise<ChatMessage[]>}
 */
export async function offerRevenge(foe) {
	const owed = worldKnights((actor) => actor !== foe)
		.flatMap((knight) => knight.items.filter((item) => item.type === "scar" && awaitsRevengeOn(item.system, foe)));
	const cards = [];
	for (const item of owed) {
		const knight = item.parent;
		cards.push(await postCard(knight, "revenge", {
			tagline: t("revenge.tagline", { name: knight.name, scar: item.name }),
			text: t("revenge.text", { foe: foe.name, name: knight.name }),
			uuid: item.uuid
		}));
	}
	return cards;
}

/**
 * Settle a Humiliation from its revenge card. Only the Knight's player and the
 * Referee may, and only while it still waits.
 * @param {Item|null} item The Scar.
 * @returns {Promise<object|null>} What settleScar found, or null.
 */
export async function takeRevenge(item) {
	const knight = item?.parent;
	if (item?.type !== "scar" || !knight) return null;
	if (!item.isOwner) {
		ui.notifications.warn(t("revenge.notYours", { name: knight.name }));
		return null;
	}
	if (!isScarPending(item.system)) {
		ui.notifications.info(t("revenge.settled", { name: knight.name, scar: item.name }));
		return null;
	}
	return resolveScar(knight, item);
}
