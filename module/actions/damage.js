import { inputDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { moralePrompt, promptGroupMorale } from "../chat/morale-card.js";
import { attackDamage } from "../rules/attack.js";
import { applyDoom, armourAgainst, resolveDamage } from "../rules/damage.js";
import { moraleTrigger } from "../rules/morale.js";
import { isDoomed } from "../rules/scars.js";
import { getCalendar } from "./calendar.js";
import { rollScar } from "./scars.js";

/**
 * Outcomes that take somebody out of the fight, which can leave their side at
 * half its number. A Warband meets them differently: a Mortal Wound routs it,
 * and 0 VIG wipes it out (p11).
 */
const DOWN_OUTCOMES = Object.freeze(["mortal", "slain"]);

/** Outcomes worded for a ship or structure, which holds or is destroyed (p11). */
const STRUCTURE_OUTCOMES = Object.freeze(["evaded", "destroyed"]);

/**
 * Ask how much Damage an Attack dealt, apply it to GD and VIG in the book's
 * order, and post what happened. A Warband or a structure is only harmed by
 * the kinds of Attack that can reach it, so the dialog asks about those too.
 * @param {Actor} actor
 * @param {object} [preset] What an Attack card already knows, filled into the dialog.
 * @param {number|null} [preset.damage] Left out, the field starts empty so typing a number doesn't land beside a 0.
 * @param {boolean} [preset.ignoreArmour]
 * @param {boolean|null} [preset.ranged] Whether the Attack is ranged. Cover only counts against ranged
 *                                       Attacks, so a known melee Attack doesn't offer it.
 * @param {{warband?: boolean, structure?: boolean}} [preset.harm] Which harm requirements the Attack meets.
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function takeDamage(actor, { damage = null, ignoreArmour = false, ranged = null, harm = {} } = {}) {
	const { armour, conditions } = actor.system;
	const warband = actor.system.scale === "warband";
	// A Structure actor has only GD. Its Damage card needs no word about VIG, cover, shieldwalls or being Exposed.
	const virtues = actor.system.virtues ?? null;
	const requirements = [warband && "warband", actor.system.structure && "structure"]
		.filter(Boolean)
		.map((key) => ({
			key,
			label: t(`damage.harm.${key}.label`),
			hint: t(`damage.harm.${key}.hint`),
			checked: Boolean(harm[key])
		}));

	const data = await inputDialog({
		title: t("damage.title"),
		icon: "fa-solid fa-heart-crack",
		template: "damage",
		context: { damage, armour, ignoreArmour, offerCover: ranged !== false, character: Boolean(virtues), exposed: conditions.exposed, requirements },
		ok: { label: t("damage.apply") }
	});
	if (!data) return null;

	const appliedArmour = armourAgainst({
		armour: data.armour,
		ignoreArmour: Boolean(data.ignoreArmour),
		cover: Boolean(data.cover),
		// Opened by hand, the box itself says the Attack was ranged.
		ranged: ranged !== false,
		shieldwall: Boolean(data.shieldwall)
	});
	const before = { guard: actor.system.guard.value, vigour: virtues?.vig.value ?? 0 };
	let result = resolveDamage({
		damage: Math.max(0, Number(data.damage) || 0),
		armour: appliedArmour,
		guard: before.guard,
		vigour: before.vigour,
		exposed: Boolean(data.exposed),
		immune: requirements.some(({ key }) => !data[`harm-${key}`]),
		structure: Boolean(actor.system.structure)
	});
	const scars = actor.items.filter((item) => item.type === "scar").map((item) => item.system);
	if (result.outcome === "mortal" && isDoomed(scars, getCalendar())) result = applyDoom(result, before.vigour);

	const update = { "system.guard.value": result.guard };
	if (virtues) update["system.virtues.vig.value"] = result.vigour;
	if (result.outcome === "mortal") update["system.mortalWound"] = true;
	await actor.update(update);

	let outcomes = "outcomes";
	if (warband && DOWN_OUTCOMES.includes(result.outcome)) outcomes = "warbandOutcomes";
	else if (actor.system.structure && STRUCTURE_OUTCOMES.includes(result.outcome)) outcomes = "structureOutcomes";
	const trigger = moraleTrigger({
		outcome: result.outcome,
		vigourBefore: before.vigour,
		vigourAfter: result.vigour,
		vigourMax: virtues?.vig.max ?? 0,
		// Squires are Knights too, and Morale doesn't affect player characters.
		playerCharacter: actor.type === "knight",
		structure: Boolean(actor.system.structure),
		warband
	});
	await postCard(actor, "damage", {
		outcomeKey: result.outcome,
		dealt: result.outcome === "unharmed" ? null : t("damage.dealt", { dealt: result.dealt, armour: appliedArmour }),
		guardLine: result.guardLoss ? t("damage.guardLine", { from: before.guard, to: result.guard }) : null,
		vigourLine: result.vigourLoss ? t("damage.vigourLine", { from: before.vigour, to: result.vigour }) : null,
		outcome: result.doom ? t("damage.doom") : t(`damage.${outcomes}.${result.outcome}`),
		morale: moralePrompt(actor, trigger)
	});

	if (DOWN_OUTCOMES.includes(result.outcome)) await promptGroupMorale(actor);
	if (warband && actor.system.leader && result.dealt > 0) await shareWithLeader(actor, result.dealt);
	return result;
}

/**
 * Take the Damage of an Attack card, then roll a Scar with the die that caused it.
 * @param {Actor} actor
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {object} [options]
 * @param {boolean} [options.scars=true] False where Scars can't be gained, such as a bloodless duel.
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function takeAttack(actor, attack, { scars = true } = {}) {
	const { damage, faces } = attackDamage(attack);
	const result = await takeDamage(actor, {
		damage,
		ignoreArmour: attack.ignoresArmour,
		ranged: !attack.melee,
		// Only Blast or large-scale Attacks harm a Warband (p11).
		harm: { warband: attack.blast || attack.largeScale }
	});
	if (scars && result?.outcome === "scar") await rollScar(actor, { faces });
	return result;
}

/**
 * Whoever leads a Warband from the front suffers the same Damage it does
 * (p11), so they take what got past its Armour without their own.
 * @param {Actor} warband
 * @param {number} dealt
 */
async function shareWithLeader(warband, dealt) {
	const leader = fromUuidSync(warband.system.leader);
	if (!leader?.system?.virtues) return;
	if (!leader.isOwner) {
		await postCard(warband, "note", { icon: "fa-solid fa-flag", text: t("damage.leaderShares", { name: leader.name, warband: warband.name, damage: dealt }) });
		return;
	}
	const result = await takeDamage(leader, { damage: dealt, ignoreArmour: true });
	if (result?.outcome === "scar") await rollScar(leader);
}
