import { inputDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { moralePrompt, promptGroupMorale } from "../chat/morale-card.js";
import { armourCounts, armourTotal, armourUnshielded, noteBearing, noteNamesShield, npcArmourUnshielded, shieldwallAround, shieldwallBearing, SITUATION_CONDITIONS } from "../rules/armour.js";
import { attackDamage, dismountLanded } from "../rules/attack.js";
import { applyDoom, armourAgainst, resolveDamage } from "../rules/damage.js";
import { isDown, moraleTrigger } from "../rules/morale.js";
import { isDoomed } from "../rules/scars.js";
import { marksOn } from "../chat/gambit-marks.js";
import { chatIsPublic, playDamageFx } from "./attack-fx.js";
import { announceFallenKnight } from "./fallen.js";
import { causedBy } from "./ledger.js";
import { seerCurrent } from "../rules/seer-state.js";
import { getCalendar } from "./calendar.js";
import { armourConditionText } from "./items.js";
import { offerRevenge, rollScar } from "./scars.js";
import { harmsStructure } from "../rules/structures.js";
import { escapeHTML } from "../rules/text.js";

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
 * @param {boolean} [trapped] A Trap Gambit holds their shield, whose Armour then doesn't count.
 * @returns {number}
 */
function armourWithTicks(pieces, ticked, wearer, trapped = false) {
	const worn = pieces.map((piece) => (piece.id in ticked ? { ...piece, condition: "", equipped: ticked[piece.id] } : piece));
	return trapped ? armourUnshielded(worn, wearer) : armourTotal(worn, wearer);
}

/**
 * A Trap Gambit holding the target's shield until its dealer's next turn
 * (p10), so its Armour doesn't count against the Attacks made meanwhile, by
 * anybody. Ticked from the start where they have a shield to trap. Without
 * one, the Trap may have left them open some other way, such as a beast's
 * belly (p186), which the dialog offers unticked, to ignore their Armour.
 * @param {Actor} actor
 * @param {{bearing: string|null}} worn From armourPieces.
 * @param {string[]} [except] Attack cards being applied now: a Gambit bought
 *   by an Attack takes hold after it, and a duel's Gambits all land at once.
 * @returns {{label: string, shielded: boolean}|null} Null when no Trap holds them. Ticked where shielded.
 */
function trapOn(actor, worn, except = []) {
	const mark = marksOn(actor).findLast((each) => each.key === "trap" && !except.includes(each.messageId));
	if (!mark) return null;
	const name = mark.by || t("gambits.marks.someone");
	const shielded = actor.type === "knight" ? Boolean(worn.bearing) : noteNamesShield(actor.system.armourNote);
	return { label: t(shielded ? "damage.trapped" : "damage.trapOpen", { name }), shielded };
}

/**
 * What somebody brings to a shieldwall (p10): a Knight's shield or buckler
 * among their items, or whichever an NPC's Armour note names.
 * @param {Actor} actor
 * @param {{bearing: string|null}} [worn] From armourPieces, where it's already been worked out.
 * @returns {"shield"|"buckler"|null}
 */
function bearingOf(actor, worn = null) {
	return actor.type === "knight" ? (worn ?? armourPieces(actor)).bearing : noteBearing(actor.system.armourNote);
}

/**
 * Whether someone on the map can stand in a wall: a character, not a ship or
 * wall, still on their feet, and not a steed, which is ridden rather than
 * lined up with.
 * @param {Actor} actor
 * @param {Set<string>} steeds UUIDs of the steeds Knights ride.
 * @param {string} [baseUuid] The world Actor a Token's actor was made from.
 * @returns {boolean}
 */
function canStandInWall(actor, steeds, baseUuid) {
	const vig = actor.system.virtues?.vig.value;
	if (vig === undefined || actor.system.structure || isDown({ vigour: vig, mortalWound: actor.system.mortalWound })) return false;
	return !steeds.has(actor.uuid) && !steeds.has(baseUuid);
}

/**
 * The shieldwall somebody struck stands in on the map (p10): whoever is beside
 * them on their side, and beside those, and so on. It ticks the Damage dialog's
 * shieldwall box when it gives a point of Armour, and says why when not. The
 * formation is theirs to declare, so the box can still be ticked by hand.
 * @param {Actor} actor
 * @param {"shield"|"buckler"|null} bearing What they bear themselves.
 * @returns {{checked: boolean, tip: string}|null} Null when they have no Token on the map.
 */
function shieldwallOnMap(actor, bearing) {
	const token = canvas?.ready ? actor.getActiveTokens(false, false)[0] : null;
	if (!token) return null;
	const { disposition } = token.document;
	if (disposition === CONST.TOKEN_DISPOSITIONS.SECRET) return null;
	const steeds = new Set(game.actors.filter((each) => each.type === "knight" && each.system.steed).map((each) => each.system.steed));
	const stander = (placed, bears) => ({
		name: placed.document.name,
		bearing: bears,
		box: { x: placed.document.x, y: placed.document.y, w: placed.w, h: placed.h }
	});
	const allies = canvas.tokens.placeables
		.filter((placed) => placed !== token && placed.actor && !placed.document.hidden && placed.document.disposition === disposition)
		.filter((placed) => canStandInWall(placed.actor, steeds, placed.document.actorId && `Actor.${placed.document.actorId}`))
		.map((placed) => stander(placed, bearingOf(placed.actor)));
	const wall = shieldwallAround(stander(token, bearing), allies, canvas.grid.size);
	const hint = t("damage.shieldwallHint");
	if (wall.formed) return { checked: true, tip: `${hint} ${t("damage.shieldwallFormed", { count: wall.count })}` };
	if (wall.count < 3) return { checked: false, tip: `${hint} ${t("damage.shieldwallFew", { count: wall.count })}` };
	return { checked: false, tip: `${hint} ${t("damage.shieldwallUnshielded", { names: wall.unshielded.join(", ") })}` };
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
 * @param {string[]} [preset.except] Ids of the Attack cards being applied, whose own Trap doesn't hold yet.
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function takeDamage(actor, preset = {}) {
	const { armour, armourNote, conditions } = actor.system;
	const warband = actor.system.scale === "warband";
	// A Structure actor has only GD. Its Damage card needs no word about VIG, cover, shieldwalls or being Exposed.
	const virtues = actor.system.virtues ?? null;
	const worn = armourPieces(actor);
	const bearing = bearingOf(actor, worn);
	const trap = trapOn(actor, worn, preset.except);
	/** Their Armour with the pieces worn only sometimes ticked or not, and their shield trapped or not. */
	const armourFor = (ticked, trapped) => {
		if (trapped && trap && !trap.shielded) return 0;
		if (actor.type === "knight") return armourWithTicks(worn.pieces, ticked, conditions, trapped);
		return trapped ? npcArmourUnshielded(armour, armourNote) : armour;
	};
	const asked = await askDamage({
		armour: armourFor({}, Boolean(trap?.shielded)),
		situational: worn.situational,
		trap,
		armourFor,
		buckler: bearing === "buckler",
		// Whether they stand in a shieldwall on the map, which a buckler never makes.
		shieldwall: virtues && bearing !== "buckler" ? shieldwallOnMap(actor, bearing) : null,
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

	if (DOWN_OUTCOMES.includes(result.outcome)) {
		await promptGroupMorale(actor);
		// Bringing down whoever dealt a Humiliation may be the revenge that settles it (p9).
		await offerRevenge(actor);
	}
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
 * @param {{label: string, checked: boolean}|null} [target.trap] A Trap Gambit holding their shield, from trapOn.
 * @param {(ticked: Record<string, boolean>, trapped: boolean) => number} [target.armourFor] Their Armour
 *   with those ticked or not, and their shield trapped or not.
 * @param {boolean} [target.buckler] Their only shield is a buckler, which makes no shieldwall (p10).
 * @param {{checked: boolean, tip: string}|null} [target.shieldwall] The shieldwall they stand in on the map, from shieldwallOnMap.
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
			trap: target.trap ?? null,
			buckler: Boolean(target.buckler),
			shieldwall: target.shieldwall ?? null
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
 * are ticked, or a trapped shield is, so it always reads what the Attack is reduced by.
 * @param {foundry.applications.api.DialogV2} dialog
 * @param {object} target As askDamage takes.
 */
function watchSituationalArmour(dialog, target) {
	const form = dialog.element.querySelector("form");
	const box = form?.querySelector("[name='armour']");
	const ticks = [...(form?.querySelectorAll("[data-situational]") ?? [])];
	const trapped = form?.querySelector("[name='trapped']");
	if (!box || (!ticks.length && !trapped) || !target.armourFor) return;
	const update = () => {
		box.value = target.armourFor(Object.fromEntries(ticks.map((tick) => [tick.dataset.situational, tick.checked])), Boolean(trapped?.checked));
	};
	for (const tick of [...ticks, trapped].filter(Boolean)) tick.addEventListener("change", update);
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
 * @param {string[]} [options.except] Ids of the Attack cards being applied now, whose Trap Gambits don't hold yet.
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function takeAttack(actor, attack, { scars = true, except = [] } = {}) {
	const { damage, faces } = attackDamage(attack);
	const result = await takeDamage(actor, {
		damage,
		ignoreArmour: attack.ignoresArmour,
		ranged: !attack.melee,
		nonLethal: Boolean(attack.nonLethal),
		except,
		// Only Blast or large-scale Attacks harm a Warband, and only fire, siege
		// weapons or large creatures a structure, or siege weapons stone (p11).
		harm: { warband: attack.blast || attack.largeScale, structure: harmsStructure(attack.structureHarm, Boolean(actor.system.stone)) }
	});
	if (scars && result?.outcome === "scar") await rollScar(actor, { faces, by: attack.attacker });
	if (attack.smiteMark && WOUNDING_OUTCOMES.includes(result?.outcome)) await leaveLastingMark(actor, attack);
	// Dismounted (p10): off their steed, whose trample no longer joins their Attacks.
	if (result && dismountLanded(attack) && actor.system.mounted === true) await actor.update({ "system.mounted": false });
	return result;
}

/**
 * A Smite made to leave a lasting mark rather than more Damage, such as a
 * dagger through the eye, leaves it once the blow Wounds (p187). The card says
 * so and the target's notes keep it, for the table to describe.
 * @param {Actor} actor
 * @param {import("../rules/attack.js").AttackState} attack
 */
async function leaveLastingMark(actor, attack) {
	const text = t("damage.lastingMark", { name: actor.name, attacker: attack.attackerName });
	if (typeof actor.system.notes === "string" && actor.isOwner) await actor.update({ "system.notes": `${actor.system.notes}<p>${escapeHTML(text)}</p>` });
	await postCard(actor, "note", { icon: "fa-solid fa-eye-slash", text });
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
