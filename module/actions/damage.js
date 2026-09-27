import { inputDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { moralePrompt, promptGroupMorale } from "../chat/morale-card.js";
import { armourCounts, armourTotal, shieldwallBearing, SITUATION_CONDITIONS } from "../rules/armour.js";
import { attackDamage, dismountLanded } from "../rules/attack.js";
import { applyDoom, armourAgainst, resolveDamage } from "../rules/damage.js";
import { moraleTrigger } from "../rules/morale.js";
import { isDoomed } from "../rules/scars.js";
import { chatIsPublic, playDamageFx } from "./attack-fx.js";
import { announceFallenKnight } from "./fallen.js";
import { causedBy } from "./ledger.js";
import { seerCurrent } from "../rules/seer-state.js";
import { getCalendar } from "./calendar.js";
import { armourConditionText } from "./items.js";
import { rollScar } from "./scars.js";
import { harmsStructure } from "../rules/structures.js";

/** Outcomes that take VIG, leaving the target Wounded (p8). */
const WOUNDING_OUTCOMES = Object.freeze(["wounded", "mortal", "slain"]);

/**
 * A Knight's armour as the Damage dialog weighs it: every piece, and those
 * worn only in some situation, or in all but one, which the dialog asks about.
 * NPCs and structures have their Armour as a single number.
 * @param {Actor} actor
 * @returns {{pieces: object[], situational: object[], bearing: "shield"|"buckler"|null}}
 */
function armourPieces(actor) {
	if (actor.type !== "knight") return { pieces: [], situational: [], bearing: null };
	const wearer = actor.system.conditions;
	const pieces = actor.items.filter((item) => item.type === "armour").map((item) => ({ ...item.system.toObject(), id: item.id, name: item.name }));
	const situational = pieces
		.filter((piece) => piece.equipped && !piece.broken && SITUATION_CONDITIONS.includes(piece.condition))
		.map((piece) => ({
			id: piece.id,
			label: t("damage.situationalPiece", { name: piece.name, armour: piece.armour, when: armourConditionText(piece) }),
			checked: armourCounts(piece, wearer)
		}));
	return { pieces, situational, bearing: shieldwallBearing(pieces) };
}

/**
 * The Armour the Damage dialog's box holds once the pieces worn only
 * sometimes are ticked or not: ticked ones count, and the rest follow the wearer.
 * @param {object[]} pieces From armourPieces.
 * @param {Record<string, boolean>} ticked By piece id.
 * @param {object} wearer The target's conditions.
 * @returns {number}
 */
function armourWithTicks(pieces, ticked, wearer) {
	return armourTotal(pieces.map((piece) => (piece.id in ticked ? { ...piece, condition: "", equipped: ticked[piece.id] } : piece)), wearer);
}

/**
 * Outcomes that take somebody out of the fight, which can leave their side at
 * half its number. A Warband meets them differently: a Mortal Wound routs it,
 * and 0 VIG wipes it out (p11).
 */
const DOWN_OUTCOMES = Object.freeze(["mortal", "slain"]);

/** Outcomes worded for a ship or structure, which holds or is destroyed (p11). */
const STRUCTURE_OUTCOMES = Object.freeze(["evaded", "destroyed"]);

/**
 * Which set of words a Damage card tells the outcome in: a Warband is broken
 * rather than brought down, and a structure wrecked rather than wounded.
 * @param {string} outcome
 * @param {object} [of]
 * @param {boolean} [of.warband]
 * @param {boolean} [of.structure]
 * @returns {"outcomes"|"warbandOutcomes"|"structureOutcomes"} A key under `bastionland.damage.`
 */
function outcomesFor(outcome, { warband = false, structure = false } = {}) {
	if (warband && DOWN_OUTCOMES.includes(outcome)) return "warbandOutcomes";
	if (structure && STRUCTURE_OUTCOMES.includes(outcome)) return "structureOutcomes";
	return "outcomes";
}

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
 * @param {boolean} [preset.nonLethal] The Attack's Damage never Slays or leaves anybody dying.
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function takeDamage(actor, preset = {}) {
	const { armour, conditions } = actor.system;
	const warband = actor.system.scale === "warband";
	// A Structure actor has only GD. Its Damage card needs no word about VIG, cover, shieldwalls or being Exposed.
	const virtues = actor.system.virtues ?? null;
	const worn = armourPieces(actor);
	const asked = await askDamage({
		armour,
		situational: worn.situational,
		armourFor: (ticked) => armourWithTicks(worn.pieces, ticked, conditions),
		buckler: worn.bearing === "buckler",
		exposed: conditions.exposed,
		character: Boolean(virtues),
		warband,
		structure: Boolean(actor.system.structure),
		stone: Boolean(actor.system.stone),
		// What keeps some of the Cast from harm, weighed as the blow lands.
		immunity: actor.system.immunity ?? "",
		scores: () => ({ guard: actor.system.guard.value, vigour: virtues?.vig.value ?? 0 })
	}, preset);
	if (!asked) return null;
	const { armour: appliedArmour, before } = asked;
	let { result } = asked;
	const scars = actor.items.filter((item) => item.type === "scar").map((item) => item.system);
	if (result.outcome === "mortal" && isDoomed(scars, getCalendar())) result = applyDoom(result, before.vigour);

	const update = { "system.guard.value": result.guard };
	if (virtues) update["system.virtues.vig.value"] = result.vigour;
	// Non-lethal Damage leaves them down, but not dying.
	if (result.outcome === "mortal" && !preset.nonLethal) update["system.mortalWound"] = true;
	// Damage past GD Wounds them (p8), which some armour answers to.
	if (virtues && WOUNDING_OUTCOMES.includes(result.outcome)) update["system.wounded"] = true;
	await actor.update(update, causedBy("damage"));

	const outcomes = outcomesFor(result.outcome, { warband, structure: Boolean(actor.system.structure) });
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
	const morale = moralePrompt({ name: actor.name, uuid: actor.uuid }, trigger);
	const card = damageCard(result, appliedArmour, before, outcomes, morale);
	// Non-lethal Damage leaves them down, but not dying.
	if (preset.nonLethal && result.outcome === "mortal" && virtues) card.outcome = t("damage.nonLethalDown");
	await postCard(actor, "damage", card);
	// What the blow looks like where it landed (module/actions/attack-fx.js): after the
	// scores are written and the card says so, since it's only the map catching up.
	playDamageFx(actor, result.outcome, { whispered: !chatIsPublic() });

	if (DOWN_OUTCOMES.includes(result.outcome)) await promptGroupMorale(actor);
	// A played Knight taken to VIG 0 is Slain, and their player carries on some other way (p8).
	// Which deaths the book leaves alone is knightHasFallen's to judge, so the outcome goes to it.
	await announceFallenKnight(actor, result.outcome);
	if (warband && actor.system.leader && result.dealt > 0) await shareWithLeader(actor, result.dealt);
	return result;
}

/**
 * Damage to the Seer who knighted a Knight, kept on the Knight's sheet since
 * the Seer has no Actor. The book's Armour for them is filled in, and a Seer
 * that counts as a structure is harmed as one. Nobody rolls Morale from the
 * card, so it only says a Wounded Seer must: their SPI on the Seer page rolls it.
 * @param {Actor} knight
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function takeSeerDamage(knight) {
	const stats = knight.system.seerBook;
	if (!stats) return null;
	const { structure } = stats;
	const now = seerCurrent(stats, knight.system.seerState);
	const asked = await askDamage({
		armour: stats.armour,
		// CLA 0 Exposes, as it does anyone.
		exposed: now.cla === 0,
		character: !structure,
		warband: false,
		structure,
		scores: () => {
			const at = seerCurrent(stats, knight.system.seerState);
			return { guard: at.guard, vigour: at.vig ?? 0 };
		}
	});
	if (!asked) return null;
	const { result, armour, before } = asked;

	const update = { "system.seerState.guard": result.guard };
	if (Number.isInteger(now.vig)) update["system.seerState.vig"] = result.vigour;
	if (result.outcome === "mortal") update["system.seerState.mortalWound"] = true;
	await knight.update(update);

	const name = knight.system.seer || t("seer.label");
	const outcomes = outcomesFor(result.outcome, { structure });
	const trigger = moraleTrigger({ outcome: result.outcome, vigourBefore: before.vigour, vigourAfter: result.vigour, vigourMax: stats.vig ?? 0, structure });
	const morale = moralePrompt({ name }, trigger);
	// Not getSpeaker, which would speak for whichever Token is selected.
	await postCard(null, "damage", damageCard(result, armour, before, outcomes, morale), { speaker: { alias: name } });
	return result;
}

/**
 * Ask how much Damage an Attack dealt, and resolve it against GD and VIG in
 * the book's order. A Warband or a structure is only harmed by the kinds of
 * Attack that can reach it, so the dialog asks about those too.
 * @param {object} target Whoever was hit.
 * @param {number} target.armour
 * @param {{id: string, label: string, checked: boolean}[]} [target.situational] Armour worn only
 *   sometimes, ticked in the dialog when it counts against this Attack.
 * @param {(ticked: Record<string, boolean>) => number} [target.armourFor] Their Armour with those ticked or not.
 * @param {boolean} [target.buckler] Their only shield is a buckler, which makes no shieldwall (p10).
 * @param {boolean} target.exposed
 * @param {boolean} target.character Has Virtues, unlike a structure.
 * @param {boolean} target.warband
 * @param {boolean} target.structure
 * @param {boolean} [target.stone] A stone wall, which only siege weapons breach.
 * @param {string} [target.immunity] What keeps them from harm, asked about as a requirement of its own.
 * @param {() => {guard: number, vigour: number}} target.scores Their GD and VIG, read once the
 *   dialog closes, so Damage that landed while it stood open isn't undone by this one.
 * @param {object} [preset] As takeDamage takes.
 * @returns {Promise<{result: import("../rules/damage.js").DamageResult, armour: number,
 *   before: {guard: number, vigour: number}}|null>} `armour` is what the Attack was reduced by,
 *   `before` their scores as it landed. Null if the dialog was closed.
 */
async function askDamage(target, { damage = null, ignoreArmour = false, ranged = null, harm = {}, nonLethal = false } = {}) {
	const requirements = [target.warband && "warband", target.structure && "structure", target.immunity && "immunity"]
		.filter(Boolean)
		.map((key) => ({
			key,
			// A stone wall asks for a siege weapon alone.
			label: t(`damage.harm.${key === "structure" && target.stone ? "stone" : key}.label`, { immunity: target.immunity }),
			hint: t(`damage.harm.${key === "structure" && target.stone ? "stone" : key}.hint`),
			checked: Boolean(harm[key])
		}));

	const data = await inputDialog({
		title: t("damage.title"),
		icon: "fa-solid fa-heart-crack",
		template: "damage",
		context: {
			damage,
			armour: target.armour,
			ignoreArmour,
			offerCover: ranged !== false,
			character: target.character,
			exposed: target.exposed,
			requirements,
			situational: target.situational ?? [],
			buckler: Boolean(target.buckler)
		},
		ok: { label: t("damage.apply") },
		render: (_event, dialog) => watchSituationalArmour(dialog, target)
	});
	if (!data) return null;

	const armour = armourAgainst({
		armour: data.armour,
		ignoreArmour: Boolean(data.ignoreArmour),
		cover: Boolean(data.cover),
		// Opened by hand, the box itself says the Attack was ranged.
		ranged: ranged !== false,
		shieldwall: Boolean(data.shieldwall)
	});
	const before = target.scores();
	const result = resolveDamage({
		damage: Math.max(0, Number(data.damage) || 0),
		armour,
		guard: before.guard,
		vigour: before.vigour,
		exposed: Boolean(data.exposed),
		immune: requirements.some(({ key }) => !data[`harm-${key}`]),
		structure: target.structure,
		nonLethal
	});
	return { result, armour, before };
}

/**
 * Keep the Damage dialog's Armour box in step as pieces worn only sometimes
 * are ticked, so it always reads what the Attack is reduced by.
 * @param {foundry.applications.api.DialogV2} dialog
 * @param {object} target As askDamage takes.
 */
function watchSituationalArmour(dialog, target) {
	const form = dialog.element.querySelector("form");
	const box = form?.querySelector("[name='armour']");
	const ticks = [...(form?.querySelectorAll("[data-situational]") ?? [])];
	if (!box || !ticks.length || !target.armourFor) return;
	const update = () => {
		box.value = target.armourFor(Object.fromEntries(ticks.map((tick) => [tick.dataset.situational, tick.checked])));
	};
	for (const tick of ticks) tick.addEventListener("change", update);
}

/**
 * What the Damage card says.
 * @param {import("../rules/damage.js").DamageResult & {doom?: boolean}} result
 * @param {number} armour What the Attack was reduced by.
 * @param {{guard: number, vigour: number}} before
 * @param {string} outcomes Which set of outcome words, under `bastionland.damage`.
 * @param {{text: string, uuid?: string, label?: string}|null} morale A Morale Save called for; its button needs a uuid.
 * @returns {object}
 */
function damageCard(result, armour, before, outcomes, morale) {
	return {
		outcomeKey: result.outcome,
		dealt: result.outcome === "unharmed" ? null : t("damage.dealt", { dealt: result.dealt, armour }),
		guardLine: result.guardLoss ? t("damage.guardLine", { from: before.guard, to: result.guard }) : null,
		vigourLine: result.vigourLoss ? t("damage.vigourLine", { from: before.vigour, to: result.vigour }) : null,
		outcome: result.doom ? t("damage.doom") : t(`damage.${outcomes}.${result.outcome}`),
		morale
	};
}

/**
 * Take the Damage of an Attack card, then roll a Scar with the die that caused
 * it, and come off a steed a Dismount landed on.
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
		nonLethal: Boolean(attack.nonLethal),
		// Only Blast or large-scale Attacks harm a Warband, and only fire, siege
		// weapons or large creatures a structure, or siege weapons stone (p11).
		harm: { warband: attack.blast || attack.largeScale, structure: harmsStructure(attack.structureHarm, Boolean(actor.system.stone)) }
	});
	if (scars && result?.outcome === "scar") await rollScar(actor, { faces });
	// Dismounted (p10): off their steed, whose trample no longer joins their Attacks.
	if (result && dismountLanded(attack) && actor.system.mounted === true) await actor.update({ "system.mounted": false });
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
