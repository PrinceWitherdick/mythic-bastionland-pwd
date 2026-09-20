import { inputDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { DIE_SIZES } from "../rules/attack.js";
import { isScarPending, scarForRoll, scarRaisesGuardLater, scarRaisesGuardNow } from "../rules/scars.js";
import { seasonKey } from "../rules/time.js";
import { getCalendar } from "./calendar.js";
import { causedBy } from "./ledger.js";

/**
 * Re-roll the die that caused a Scar and read the Scar table (p9). When the
 * player agrees, the Scar is recorded on the Knight and its immediate effects
 * are applied: Virtue Loss, and a max GD increase where the entry grants one
 * straight away. Effects that wait on a later event stay as text on the Scar.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {number} [options.faces=6] The die that caused the Scar, selected in the dialog.
 */
export async function rollScar(actor, { faces: caused } = {}) {
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
	const text = (part) => t(`scars.${scar.key}.${part}`);
	const rolls = [scarRoll];
	const lines = [];
	const update = {};

	let location = null;
	if (scar.detail) {
		const detailRoll = await new Roll("1d6").evaluate();
		rolls.push(detailRoll);
		location = t(`scars.${scar.key}.detail.${detailRoll.total}`);
	}

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

	const name = text("name");
	if (apply) {
		if (!foundry.utils.isEmpty(update)) await actor.update(update, causedBy("scar"));
		await actor.createEmbeddedDocuments("Item", [{
			type: "scar",
			name: location ? `${name} (${location})` : name,
			system: {
				roll: scar.roll,
				// Doom lasts the Season it was taken in.
				season: seasonKey(getCalendar()),
				description: `<p><em>${text("flavour")}</em></p><p>${text("effect")}</p>`
			}
		}]);
	}

	await postCard(actor, "scar", {
		faces,
		roll: scar.roll,
		name,
		flavour: text("flavour"),
		effect: text("effect"),
		location,
		lines
	}, { rolls });

	return scar;
}

/**
 * Settle a Scar whose GD increase waited on something: being stitched or
 * patched up, the next Season, or revenge. Max GD rises by d6 if it's still at
 * or under the Scar's limit, and the Scar is marked settled either way.
 * @param {Item} item     A Scar item.
 * @param {number} maxGuard Max GD before settling.
 * @returns {Promise<{roll: Roll|null, guardMax: number, line: string}>} The caller saves `guardMax`.
 */
export async function settleScar(item, maxGuard) {
	const limit = scarForRoll(item.system.roll)?.laterGuardAtMost;
	const raises = scarRaisesGuardLater(item.system, maxGuard);
	await item.update({ "system.resolved": true });
	if (!raises) return { roll: null, guardMax: maxGuard, line: t("scarRoll.settledNoRaise", { name: item.name, limit }) };

	const roll = await new Roll("1d6").evaluate();
	const guardMax = maxGuard + roll.total;
	return { roll, guardMax, line: t("scarRoll.settledRaise", { name: item.name, amount: roll.total, value: guardMax }) };
}

/**
 * Settle one Scar from the sheet, when the Referee judges its moment has come.
 * @param {Actor} actor
 * @param {Item|undefined} item
 */
export async function resolveScar(actor, item) {
	if (item?.type !== "scar" || !isScarPending(item.system)) return null;
	const maxGuard = actor.system.guard.max;
	const settled = await settleScar(item, maxGuard);
	if (settled.guardMax !== maxGuard) await actor.update({ "system.guard.max": settled.guardMax }, causedBy("scar"));
	await postCard(actor, "note", { icon: "fa-solid fa-bone-break", text: settled.line }, { rolls: settled.roll ? [settled.roll] : [] });
	return settled;
}
