import { postCard, t } from "../chat/cards.js";
import { DIE_SIZES } from "../rules/attack.js";
import { scarForRoll, scarRaisesGuardNow } from "../rules/scars.js";
import { templatePath } from "../system-id.js";

/**
 * Re-roll the die that caused a Scar and read the Scar table (p9). When the
 * player agrees, the Scar is recorded on the Knight and its immediate effects
 * are applied: Virtue Loss, and a max GD increase where the entry grants one
 * straight away. Effects that wait on a later event stay as text on the Scar.
 * @param {Actor} actor
 */
export async function rollScar(actor) {
	const content = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/scar.hbs"), {
		dice: DIE_SIZES.map((faces) => ({ faces, selected: faces === 6 }))
	});

	const data = await foundry.applications.api.DialogV2.input({
		window: { title: t("scarRoll.title"), icon: "fa-solid fa-bone-break" },
		classes: ["bastionland-dialog"],
		content,
		ok: { label: t("scarRoll.roll"), icon: "fa-solid fa-dice" },
		rejectClose: false
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
		if (!foundry.utils.isEmpty(update)) await actor.update(update);
		await actor.createEmbeddedDocuments("Item", [{
			type: "scar",
			name: location ? `${name} (${location})` : name,
			system: {
				roll: scar.roll,
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
