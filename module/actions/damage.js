import { postCard, t } from "../chat/cards.js";
import { resolveDamage } from "../rules/damage.js";
import { templatePath } from "../system-id.js";

/**
 * Ask how much Damage an Attack dealt, apply it to GD and VIG in the book's
 * order, and post what happened.
 * @param {Actor} actor
 */
export async function takeDamage(actor) {
	const { armour, conditions } = actor.system;

	const content = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/damage.hbs"), {
		armour,
		exposed: conditions.exposed
	});

	const data = await foundry.applications.api.DialogV2.input({
		window: { title: t("damage.title"), icon: "fa-solid fa-heart-crack" },
		classes: ["bastionland-dialog"],
		content,
		ok: { label: t("damage.apply"), icon: "fa-solid fa-check" },
		rejectClose: false
	});
	if (!data) return null;

	const appliedArmour = data.ignoreArmour ? 0 : Math.max(0, Number(data.armour) || 0);
	const before = { guard: actor.system.guard.value, vigour: actor.system.virtues.vig.value };
	const result = resolveDamage({
		damage: Math.max(0, Number(data.damage) || 0),
		armour: appliedArmour,
		guard: before.guard,
		vigour: before.vigour,
		exposed: Boolean(data.exposed)
	});

	const update = {
		"system.guard.value": result.guard,
		"system.virtues.vig.value": result.vigour
	};
	if (result.outcome === "mortal") update["system.mortalWound"] = true;
	await actor.update(update);

	await postCard(actor, "damage", {
		outcomeKey: result.outcome,
		dealt: t("damage.dealt", { dealt: result.dealt, armour: appliedArmour }),
		guardLine: result.guardLoss ? t("damage.guardLine", { from: before.guard, to: result.guard }) : null,
		vigourLine: result.vigourLoss ? t("damage.vigourLine", { from: before.vigour, to: result.vigour }) : null,
		outcome: t(`damage.outcomes.${result.outcome}`)
	});

	return result;
}
