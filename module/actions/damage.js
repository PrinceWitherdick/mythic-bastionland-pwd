import { inputDialog } from "../apps/ui.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { attackOf } from "../chat/attack-flag.js";
import { SYSTEM_ID } from "../system-id.js";
import { moralePrompt, promptGroupMorale } from "../chat/morale-card.js";
import { armourCounts, armourTotal, armourUnshielded, noteBearing, noteNamesShield, npcArmourUnshielded, shieldwallAround, shieldwallBearing, SITUATION_CONDITIONS, tokenBox } from "../rules/armour.js";
import { DISMOUNT_FACES, damageAgainst, dismountLanded, harmTargetOf, lastingMarkBy } from "../rules/attack.js";
import { temperedDie } from "../rules/lasting-dice.js";
import { temperWeapon } from "./lasting-dice.js";
import { WARDED_OUTCOMES, applyDoom, armourAgainst, downingOutcome, resolveDamage, spiritOutcome, wardedResult } from "../rules/damage.js";
import { abilitiesWith } from "../rules/ability-uses.js";
import { lingeringAffliction } from "../rules/afflictions.js";
import { downBy, slainUpdate, unwrittenFate } from "../rules/virtues.js";
import { afflictionsUpdate } from "./afflictions.js";
import { downOf, moraleTrigger } from "../rules/morale.js";
import { isDoomed } from "../rules/scars.js";
import { SCANNED_MESSAGES, marksOn } from "../chat/gambit-marks.js";
import { chatIsPublic, playDamageFx } from "./attack-fx.js";
import { announceFallenKnight } from "./fallen.js";
import { updateActors } from "./actor-updates.js";
import { causedBy } from "./ledger.js";
import { seenName } from "./seen-name.js";
import { getCalendar } from "./calendar.js";
import { armourConditionText } from "./items.js";
import { giveScar, offerRevenge, rollScar } from "./scars.js";
import { timelineMortalWound, timelineWarded } from "./timeline-events.js";
import { escapeHTML } from "../rules/text.js";
import { keepsSeat } from "../rules/property.js";
import { playerCharacter, worldKnights } from "./knights.js";
import { isCompanyKnight, isKnight } from "../rules/knight-types.js";

/** Outcomes that take VIG, leaving the target Wounded (p8). */
const WOUNDING_OUTCOMES = Object.freeze(["wounded", "mortal", "slain"]);

/**
 * @typedef {object} WornArmour Somebody's armour, as the Damage dialog and a Greater effect weigh it.
 * @property {object[]} situational Pieces worn only in some situation, or in all but one, which the dialog asks about.
 * @property {"shield"|"buckler"|null} bearing What they bring to a shieldwall (p10).
 * @property {boolean} shielded Whether they've a shield a Trap Gambit can hold.
 * @property {(ticked: Record<string, boolean>, trapped: boolean) => number} total Their Armour with the
 *   situational pieces ticked or not, by id, and their shield trapped or not.
 * @property {{armour: number, armourNote: string}|null} single Armour that's one number with a note,
 *   as anybody's but a Knight's is; null for a Knight's, which is the sum of their items.
 */

/**
 * A Knight's armour is every piece they have. NPCs and structures have their
 * Armour as a single number, and bring to a shieldwall whichever shield or
 * buckler their Armour note names. The one place the two are told apart,
 * with singleArmour.
 * @param {Actor} actor
 * @returns {WornArmour}
 */
export function wornArmour(actor) {
	const single = singleArmour(actor);
	if (single) {
		const { armour, armourNote } = single;
		return {
			situational: [],
			bearing: noteBearing(armourNote),
			shielded: noteNamesShield(armourNote),
			total: (_ticked, trapped) => (trapped ? npcArmourUnshielded(armour, armourNote) : armour),
			single
		};
	}
	// Their conditions, and what any stance they've taken up does (p40, p78, p82).
	const conditions = { ...actor.system.conditions, stance: actor.system.stance };
	const pieces = actor.items.filter((item) => item.type === "armour").map((item) => ({ ...item.system.toObject(), id: item.id, name: item.name }));
	const situational = pieces
		.filter((piece) => piece.equipped && !piece.broken && SITUATION_CONDITIONS.includes(piece.condition))
		.map((piece) => ({
			id: piece.id,
			label: t("damage.situationalPiece", { name: piece.name, armour: piece.armour, when: armourConditionText(piece) }),
			checked: armourCounts(piece, conditions)
		}));
	const bearing = shieldwallBearing(pieces);
	return {
		situational,
		bearing,
		shielded: Boolean(bearing),
		total: (ticked, trapped) => armourWithTicks(pieces, ticked, conditions, trapped),
		single: null
	};
}

/**
 * @param {Actor} actor
 * @returns {{armour: number, armourNote: string}|null} Armour that's one number with a note, as
 *   anybody's but a Knight's is; null for a Knight's, which is the sum of their items.
 */
export function singleArmour(actor) {
	return isKnight(actor) ? null : { armour: actor.system.armour, armourNote: actor.system.armourNote };
}

/**
 * The Armour the Damage dialog's box holds once the pieces worn only
 * sometimes are ticked or not: ticked ones count, and the rest follow the wearer.
 * @param {object[]} pieces A Knight's armour items' data, each with its id and name.
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
 * @param {WornArmour} worn
 * @param {string[]} [except] Attack cards being applied now: a Gambit bought
 *   by an Attack takes hold after it, and a duel's Gambits all land at once.
 * @returns {{label: string, shielded: boolean}|null} Null when no Trap holds them. Ticked where shielded.
 */
function trapOn(actor, worn, except = []) {
	const mark = marksOn(actor).findLast((each) => each.key === "trap" && !except.includes(each.messageId));
	if (!mark) return null;
	const name = mark.by || t("gambits.marks.someone");
	return { label: t(worn.shielded ? "damage.trapped" : "damage.trapOpen", { name }), shielded: worn.shielded };
}

/**
 * A shield out of hand because its bearer's own last blow in this fight was
 * two-handed (p12): it counts as a Trap does, ticked from the start.
 * @param {Actor} actor
 * @param {WornArmour} worn
 * @param {string[]} [except] Attack cards being applied now.
 * @returns {{label: string, shielded: boolean}|null}
 */
const twoHandedOn = (actor, worn, except) => (worn.shielded && foughtTwoHanded(actor, except) ? { label: t("damage.twoHanded"), shielded: true } : null);

/**
 * Whether somebody's last Attack in the fight now running was made with a Long
 * weapon, which takes both hands (p12) and leaves no hand for a shield until
 * they attack again. Outside a Combat, nobody's last blow says how they stand now.
 * @param {Actor} actor
 * @param {string[]} [except] Attack cards being applied now: how they stood when
 *   the first of them was rolled is what counts, not any Attack of their own since.
 * @returns {boolean}
 */
function foughtTwoHanded(actor, except = []) {
	const combat = game.combat;
	if (!combat?.started || !actor?.uuid) return false;
	const log = game.messages?.contents ?? [];
	const applied = except.map((id) => log.findIndex((message) => message.id === id)).filter((index) => index >= 0);
	const end = applied.length ? Math.min(...applied) : log.length;
	for (let i = end - 1; i >= Math.max(0, end - SCANNED_MESSAGES); i--) {
		const attack = attackOf(log[i]);
		if (!attack) continue;
		// Their share of it, whether they made the Attack or rolled into another's.
		const share = attack.attacker === actor.uuid ? attack : attack.joined?.find((entry) => entry.actor === actor.uuid);
		if (!share) continue;
		return attack.place?.combat === combat.id && Boolean(share.twoHanded);
	}
	return false;
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
	if (actor.system.virtues?.vig.value === undefined || actor.system.structure || downOf(actor)) return false;
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
	const steeds = new Set(worldKnights((each) => each.system.steed).map((each) => each.system.steed));
	const stander = (placed, bears) => ({ name: placed.document.name, bearing: bears, box: tokenBox(placed) });
	const allies = canvas.tokens.placeables
		.filter((placed) => placed !== token && placed.actor && !placed.document.hidden && placed.document.disposition === disposition)
		.filter((placed) => canStandInWall(placed.actor, steeds, placed.document.actorId && `Actor.${placed.document.actorId}`))
		.map((placed) => stander(placed, wornArmour(placed.actor).bearing));
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
 * @param {string} outcome
 * @param {Actor} actor Who it landed on.
 * @returns {boolean} Whether it takes them out of the fight, as downingOutcome judges.
 */
const downs = (outcome, actor) => downingOutcome(outcome, { character: Boolean(actor.system.virtues), fightsOn: Boolean(actor.system.fightsOn) });

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
 * A Knight's Ultimate fate, as Damage slays them, where nobody has written one yet.
 * @param {Actor} actor
 * @param {object|null} [by] Who dealt the blow.
 * @returns {object} The update, or nothing to write.
 */
function slainFate(actor, by) {
	const dealer = seenName(by);
	return unwrittenFate(actor, dealer ? t("fallen.fateSlainBy", { name: dealer }) : t("fallen.fateSlain"));
}

/** What marks the button on an unhorsed rider's card. */
const UNHORSED_SELECTOR = "[data-unhorsed]";

/**
 * A steed brought down throws its riders: off it, and being dismounted causes
 * d6 Damage (p10), which their card offers to whoever can deal it.
 * @param {Actor} steed
 * @returns {Promise<Actor[]>} The riders thrown.
 */
async function unhorseRiders(steed) {
	// Nobody rides a Knight.
	if (isKnight(steed)) return [];
	const as = new Set([steed.uuid, steed.isToken ? steed.token?.baseActor?.uuid : null].filter(Boolean));
	const riders = [
		...worldKnights((knight) => as.has(knight.system.steed) && knight.system.mounted === true && knight.isOwner),
		...npcRidersOn(steed)
	];
	if (!riders.length) return riders;
	await updateActors(riders.map((rider) => [rider, { "system.mounted": false }]), causedBy("damage"));
	await Promise.all(riders.map((rider) => postCard(rider, "note", {
		icon: "fa-solid fa-horse",
		text: t("damage.unhorsed", { name: rider.name, steed: steed.name }),
		action: { data: "unhorsed", icon: "fa-solid fa-dice-d6", label: t("damage.unhorsedRoll") }
	}, { flags: { [SYSTEM_ID]: { unhorsed: rider.uuid } } })));
	return riders;
}

/**
 * Whether a Token sits on another: its centre lies within the other's square,
 * as a rider's Token is laid on their steed's.
 * @param {{x: number, y: number, w: number, h: number}} rider
 * @param {{x: number, y: number, w: number, h: number}} steed
 * @returns {boolean}
 */
export function sitsOn(rider, steed) {
	const x = rider.x + rider.w / 2;
	const y = rider.y + rider.h / 2;
	return x > steed.x && x < steed.x + steed.w && y > steed.y && y < steed.y + steed.h;
}

/**
 * The NPCs riding a steed. Nothing ties an NPC to its steed but the map, so
 * it's those marked Mounted whose Token sits on one of the steed's.
 * @param {Actor} steed
 * @returns {Actor[]} Those this user can change.
 */
function npcRidersOn(steed) {
	const riders = new Map();
	for (const placed of steed.getActiveTokens?.() ?? []) {
		const box = tokenBox(placed);
		for (const other of placed.layer?.placeables ?? []) {
			const rider = other.actor;
			if (other === placed || rider?.type !== "npc" || rider.system.mounted !== true || !rider.isOwner) continue;
			if (sitsOn(tokenBox(other), box)) riders.set(rider.uuid, rider);
		}
	}
	return [...riders.values()];
}

/**
 * @param {ChatMessage} message An unhorsed rider's card.
 * @returns {Actor|null} The rider it names.
 */
const unhorsedRider = (message) => fromUuidSync(message?.flags?.[SYSTEM_ID]?.unhorsed ?? "");

/** Wire the unhorsed rider's card, which deals the d6 of the fall. Called during init. */
export function registerUnhorsed() {
	registerCardButtons({
		selector: UNHORSED_SELECTOR,
		// The fall is dealt once, kept on the card so a reload doesn't offer it again.
		once: true,
		// Only by whoever may deal it.
		mayPress: (message, user) => Boolean(unhorsedRider(message)?.testUserPermission?.(user, "OWNER")),
		handler: async (_button, message) => {
			const rider = unhorsedRider(message);
			if (!rider?.isOwner) {
				warn("damage.unhorsedNotYours");
				return false;
			}
			const roll = await new Roll(`1d${DISMOUNT_FACES}`).evaluate();
			await postCard(rider, "note", { icon: "fa-solid fa-horse", text: t("damage.unhorsedRolled", { name: rider.name, damage: roll.total }) }, { rolls: [roll] });
			// Rolled and posted, the fall is spent even if the Damage window is closed.
			await takeDamage(rider, { damage: roll.total, ranged: false, cause: t("damage.unhorsedCause") });
			return true;
		}
	});
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
 * @param {boolean} [preset.sparring] A practice bout's, to be shaken off afterwards (p188): nobody's Morale or revenge rides on it.
 * @param {string[]} [preset.except] Ids of the Attack cards being applied, whose own Trap doesn't hold yet.
 * @param {"vig"|"spi"} [preset.virtue] The Virtue past GD it comes off: SPI for a blow an Ability
 *   says harms it rather than VIG (p68), which leaves them broken rather than dying.
 * @param {boolean} [preset.auto] Taken without asking, as an affliction's Damage is each round (p173):
 *   their Armour as it stands, unless the Damage ignores it.
 * @param {string} [preset.cause] What dealt it, said on the card.
 * @param {string} [preset.by] Actor UUID of whoever dealt it, when an Attack card knows: the Timeline names them.
 * @param {(result: import("../rules/damage.js").DamageResult) => object} [preset.also] More of the actor
 *   to change with the blow, by the outcome, written in the same update as the Damage.
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function takeDamage(actor, preset = {}) {
	const { conditions } = actor.system;
	const warband = actor.system.scale === "warband";
	// A Structure actor has only GD. Its Damage card needs no word about VIG, cover, shieldwalls or being Exposed.
	const virtues = actor.system.virtues ?? null;
	// Damage to SPI rather than VIG never Wounds, leaves nobody dying, and Slays nobody (p68).
	const spirit = preset.virtue === "spi" && Boolean(virtues?.spi);
	const score = spirit ? "spi" : "vig";
	// The dead can still be struck, but nobody wards a death already died or mourns it twice.
	const dead = Boolean(actor.system.slain);
	const worn = wornArmour(actor);
	const { bearing } = worn;
	// A horn blown in their battle doubles the VIG Damage costs them (p72); SPI lost to a blow isn't VIG.
	const vigourTimes = !spirit && virtues && hornBlownFor(actor) ? 2 : 1;
	const trap = trapOn(actor, worn, preset.except) ?? twoHandedOn(actor, worn, preset.except);
	/** Their Armour with the pieces worn only sometimes ticked or not, and their shield trapped or not. */
	const armourFor = (ticked, trapped) => (trapped && trap && !trap.shielded ? 0 : worn.total(ticked, trapped));
	const target = {
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
		vigourTimes,
		scores: () => ({ guard: actor.system.guard.value, vigour: virtues?.[score].value ?? 0 })
	};
	const asked = preset.auto
		? unaskedDamage(target, preset)
		: preset.quick && !wantsJudging(target, preset) ? unaskedDamage(target, preset, cardBlow(target, preset)) : await askDamage(target, preset);
	if (!asked) return null;
	const { armour: appliedArmour, before } = asked;
	let { result } = asked;
	if (spirit) result = spiritOutcome(result);
	const scars = actor.items.filter((item) => item.type === "scar").map((item) => item.system);
	// Non-lethal Damage never Slays, Doom or not.
	if (result.outcome === "mortal" && !preset.nonLethal && isDoomed(scars, getCalendar())) result = applyDoom(result, before.vigour);
	// An ally may take the Mortal Wound, or the death, in their place (p66).
	const warden = virtues && !dead && !preset.nonLethal && !preset.sparring && WARDED_OUTCOMES.includes(result.outcome) ? await offerWard(actor) : null;
	if (warden) result = wardedResult(result, before.vigour);

	const update = { "system.guard.value": result.guard };
	if (virtues) update[`system.virtues.${score}.value`] = result.vigour;
	// Non-lethal Damage leaves them down, but not dying.
	if (result.outcome === "mortal" && !preset.nonLethal) update["system.mortalWound"] = true;
	// VIG 0 by Damage is Slain (p8), which Virtue Loss to 0 never is, so it's marked. The dead aren't dying.
	if (virtues && result.outcome === "slain") Object.assign(update, { "system.slain": true, "system.mortalWound": false }, slainFate(actor, preset.by));
	// Damage past GD Wounds them (p8), which some armour answers to. SPI lost to a blow is no Wound.
	if (virtues && !spirit && WOUNDING_OUTCOMES.includes(result.outcome)) update["system.wounded"] = true;
	// Whatever else the blow leaves on them goes in the same write.
	if (preset.also) Object.assign(update, preset.also(result));
	await actor.update(update, causedBy("damage"));
	// The Timeline's row is written beside the card, which needn't wait for it.
	let recorded = null;
	if (warden) await takeWard(warden, actor);
	// A Mortal Wound that will be shaken off, or one somebody died of, is no milestone of its own.
	else if (virtues && !dead && result.outcome === "mortal" && !preset.nonLethal && !preset.sparring) {
		const dealer = seenName(preset.by);
		recorded = timelineMortalWound(actor, preset.cause || (dealer ? t("timeline.auto.scarBy", { name: dealer }) : ""));
	}

	const outcomes = outcomesFor(result.outcome, { warband, structure: Boolean(actor.system.structure) });
	// Nobody routs from a practice bout, and SPI lost to a blow is no Wound for Morale to weigh.
	const trigger = !preset.sparring && !spirit && moraleTrigger({
		outcome: result.outcome,
		vigourBefore: before.vigour,
		vigourAfter: result.vigour,
		vigourMax: virtues?.vig.max ?? 0,
		// Morale doesn't affect player characters, though the Referee's own Knights waver as any NPC does.
		playerCharacter: playerCharacter(actor),
		structure: Boolean(actor.system.structure),
		warband
	});
	const morale = moralePrompt({ name: actor.name, uuid: actor.uuid }, trigger);
	const card = damageCard(result, appliedArmour, before, outcomes, morale);
	if (spirit && result.vigourLoss) card.vigourLine = t("damage.spiritLine", { from: before.vigour, to: result.vigour });
	if (vigourTimes > 1 && result.vigourLoss) card.dealt = [card.dealt, t("damage.hornDoubled")].filter(Boolean).join(" ");
	const said = warden
		? t("damage.outcomes.warded", { name: warden.name })
		: spirit && result.outcome === "wounded"
			? t("damage.spiritHurt")
			// Non-lethal Damage leaves them down, but not dying.
			: preset.nonLethal && result.outcome === "mortal" && virtues
				? t(preset.sparring ? "damage.sparringDown" : "damage.nonLethalDown")
				: null;
	if (said) card.outcome = said;
	if (preset.cause) card.cause = preset.cause;
	await Promise.all([postCard(actor, "damage", card), recorded]);
	// What the blow looks like where it landed (module/actions/attack-fx.js): after the
	// scores are written and the card says so, since it's only the map catching up.
	playDamageFx(actor, result.outcome, { whispered: !chatIsPublic() });

	// Down, a Knight holds no stance taken for the fight's turns. Fetched here, as stances.js reads the horn from this file.
	// Brought down, or a creature that counts as a structure destroyed (p11).
	const down = downs(result.outcome, actor);
	if (down && isKnight(actor)) await (await import("./stances.js")).lapseStances(actor);
	if (down && !preset.sparring && !dead) {
		// A steed going down throws whoever rode it (p10).
		await unhorseRiders(actor);
		await promptGroupMorale(actor);
		// Bringing down whoever dealt a Humiliation may be the revenge that settles it (p9).
		await offerRevenge(actor);
	}
	// A played Knight taken to VIG 0 is Slain, and their player carries on some other way (p8).
	// Which deaths the book leaves alone is knightHasFallen's to judge, so the outcome goes to it.
	if (!dead) await announceFallenKnight(actor, result.outcome);
	if (warband && actor.system.leader && result.dealt > 0) await shareWithLeader(actor, result.dealt, { faces: preset.faces, by: preset.by });
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
		nonLethal,
		vigourTimes: target.vigourTimes ?? 1
	});
	return { result, armour, before };
}

/**
 * Whether an Attack card's Damage needs the Damage window before it lands: a
 * ranged blow, where cover is the table's call (p10); Armour worn only
 * sometimes, or a shield a Trap may hold; or a Warband, structure or a
 * creature kept from harm that the card can't say this blow reaches.
 * @param {object} target As askDamage takes.
 * @param {object} preset As takeDamage takes.
 * @returns {boolean}
 */
export function wantsJudging(target, { ranged = null, harm = {} } = {}) {
	if (ranged !== false || target.situational?.length || target.trap || (target.immunity && !harm.immunity)) return true;
	return (target.warband && harm.warband === undefined) || (target.structure && harm.structure === undefined);
}

/**
 * What an Attack card's blow meets beyond Armour: a shieldwall as the map
 * shows it, and whether it can harm a Warband or structure as the card worked out.
 * @param {object} target As askDamage takes.
 * @param {object} preset As takeDamage takes.
 * @returns {{shieldwall: boolean, immune: boolean}}
 */
const cardBlow = (target, { harm = {} }) => ({
	shieldwall: Boolean(target.shieldwall?.checked),
	immune: Boolean((target.warband && !harm.warband) || (target.structure && !harm.structure))
});

/**
 * Resolve Damage without asking: their Armour as it stands, unless the Damage
 * ignores it, as an affliction's is each round (p173), and whatever else an
 * Attack card's blow meets.
 * @param {object} target As askDamage takes.
 * @param {{damage?: number, ignoreArmour?: boolean, nonLethal?: boolean}} preset
 * @param {{shieldwall?: boolean, immune?: boolean}} [blow] From cardBlow.
 * @returns {{result: import("../rules/damage.js").DamageResult, armour: number, before: {guard: number, vigour: number}}}
 */
function unaskedDamage(target, { damage = 0, ignoreArmour = false, nonLethal = false }, { shieldwall = false, immune = false } = {}) {
	const armour = armourAgainst({ armour: target.armour, ignoreArmour, shieldwall });
	const before = target.scores();
	const result = resolveDamage({
		damage: Math.max(0, Number(damage) || 0),
		armour,
		guard: before.guard,
		vigour: before.vigour,
		exposed: target.exposed,
		immune,
		structure: target.structure,
		nonLethal,
		vigourTimes: target.vigourTimes ?? 1
	});
	return { result, armour, before };
}

/**
 * The Knights who could take a Mortal Wound in somebody's place (p66): each
 * with an Ability that does it, on their feet, someone this user can change,
 * and nearby, which on the map is on the same Scene. Only an ally's: a Knight
 * or somebody a player owns, or on the map somebody on the warden's side.
 * Somebody on no map at all leaves nearness for the table to judge.
 * @param {Actor} victim
 * @returns {Actor[]}
 */
function wardensFor(victim) {
	const base = victim.token?.baseActor ?? victim;
	const scene = sceneOf(victim);
	const placed = scene ? tokensOn(victim, scene) : [];
	const ours = isCompanyKnight(victim) || Boolean(victim.hasPlayerOwner);
	return worldKnights((actor) => {
		if (actor === base || !actor.isOwner || downBy(actor.system)) return false;
		if (!abilitiesWith(actor.items.contents, "deathWard").length) return false;
		if (!scene) return ours;
		const near = tokensOn(actor, scene);
		return near.length > 0 && (ours || near.some((token) => placed.some((other) => other.disposition === token.disposition)));
	});
}

/**
 * The Scene somebody stands on: the one being viewed if they're on it, or else
 * the first they are, as when a blow lands while the GM looks at another map.
 * @param {Actor} actor
 * @returns {Scene|null}
 */
function sceneOf(actor) {
	if (canvas?.ready && actor.getActiveTokens(false, true).length) return canvas.scene;
	if (actor.token?.parent) return actor.token.parent;
	return (game.scenes?.contents ?? []).find((scene) => tokensOn(actor, scene).length) ?? null;
}

/**
 * Somebody's Token documents on a Scene.
 * @param {Actor} actor
 * @param {Scene} scene
 * @returns {TokenDocument[]}
 */
function tokensOn(actor, scene) {
	if (canvas?.ready && scene === canvas.scene) return actor.getActiveTokens(false, true).filter((token) => token.parent === scene);
	if (actor.token) return actor.token.parent === scene ? [actor.token] : [];
	return scene.tokens?.filter((token) => token.actorLink && token.actorId === actor.id) ?? [];
}

/**
 * Ask whether a nearby Knight takes the Mortal Wound, or the death, in the
 * victim's place, as an Ability lets them (p66). Letting it land is the first choice.
 * @param {Actor} victim
 * @returns {Promise<Actor|null>} Whoever takes it, or null.
 */
async function offerWard(victim) {
	const wardens = wardensFor(victim);
	if (!wardens.length) return null;
	const data = await inputDialog({
		title: t("deathWard.title"),
		icon: "fa-solid fa-shield-heart",
		template: "death-ward",
		context: {
			hint: t("deathWard.hint", { name: victim.name }),
			wardens: wardens.map((actor) => ({ uuid: actor.uuid, name: actor.name }))
		},
		ok: { label: t("deathWard.ok") }
	});
	return wardens.find((actor) => actor.uuid === data?.warden) ?? null;
}

/**
 * A Knight takes the Mortal Wound in somebody's place (p66). Doom makes it
 * their death instead (Scar 11, p9).
 * @param {Actor} warden
 * @param {Actor} victim
 */
async function takeWard(warden, victim) {
	const scars = warden.items.filter((item) => item.type === "scar").map((item) => item.system);
	const doomed = isDoomed(scars, getCalendar());
	const update = doomed
		? { ...slainUpdate(warden, t("fallen.fateWarded", { name: victim.name })), "system.wounded": true }
		: { "system.mortalWound": true, "system.wounded": true };
	await warden.update(update, causedBy("damage"));
	await Promise.all([
		timelineWarded(warden, victim, { doomed }),
		postCard(warden, "note", { icon: "fa-solid fa-shield-heart", text: t(doomed ? "deathWard.doomed" : "deathWard.taken", { name: warden.name, victim: victim.name }) })
	]);
	if (doomed) await announceFallenKnight(warden, "slain");
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
 * @param {boolean} [options.sparring] A practice bout's blow: non-lethal, and leaving no lasting mark.
 * @param {object[]|null} [options.mirrors] Where a Wound or Scar given back is kept rather than given, for
 *   landMirrors to give once every blow struck together has landed, as a duel's two do (p10).
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function takeAttack(actor, attack, { scars = true, except = [], sparring = false, quick = false, mirrors = null } = {}) {
	// Only Blast or large-scale Attacks harm a Warband, and only fire, siege weapons or large
	// creatures a structure, or siege weapons stone (p11). In a joint Attack only the dice of
	// shares that can harm them count, and cover, Armour and Slaying follow the die that does (p8).
	const seated = keepsSeat(actor.items.contents);
	const blow = damageAgainst(attack, { ...harmTargetOf(actor.system), seated });
	const marker = lastingMarkBy(attack);
	const marks = (result) => marker !== null && !sparring && !blow.spirit && WOUNDING_OUTCOMES.includes(result?.outcome);
	/** What burns on, given to them with the blow; said on a card of its own after. */
	let took = [];
	const result = await takeDamage(actor, {
		damage: blow.damage,
		ignoreArmour: blow.ignoresArmour,
		ranged: blow.ranged,
		// Sparring's Damage is shaken off afterwards (p188), so it leaves nobody dying.
		nonLethal: sparring || blow.nonLethal,
		sparring,
		except,
		harm: blow.harm,
		// A blow an Ability says harms SPI rather than VIG (p68).
		virtue: blow.spirit ? "spi" : "vig",
		by: blow.dealer,
		// The die that counted, which a leader sharing a Warband's Scar rolls again (p9, p11).
		faces: blow.faces,
		quick,
		also: (landed) => {
			const also = {};
			if (marks(landed)) Object.assign(also, lastingMarkUpdate(actor, marker));
			// Dismounted (p10): off their steed, whose trample no longer joins their Attacks.
			// Somebody who can never be dismounted keeps their seat (p44). A blow that can't harm
			// them at all, as an individual's at a Warband, unhorses nobody either (p11).
			if (dismountLanded(attack) && actor.system.mounted === true && !seated && landed.outcome !== "unharmed") also["system.mounted"] = false;
			// Acid that burns on, each round, until washed off (p173).
			if (!sparring && LINGERING_OUTCOMES.includes(landed.outcome)) {
				const lingering = afflictionsUpdate(actor, lingeringAfflictions(attack.lingers ?? []));
				Object.assign(also, lingering.update);
				took = lingering.took;
			}
			return also;
		}
	});
	// A Humiliation remembers whoever rolled the die that counted, in a joint Attack.
	// A Warband left at 0GD takes no Scar, which is an individual's (p9, p11).
	const scarred = scars && result?.outcome === "scar" && actor.system.scale !== "warband" ? await rollScar(actor, { faces: blow.faces, by: blow.dealer }) : null;
	// A Wound or Scar given back to whoever dealt it (p116).
	if (result && !sparring && abilitiesWith(actor.items.contents, "mirror").length) {
		const mirrored = { dealer: blow.dealer, victim: actor, loss: blow.spirit ? 0 : result.vigourLoss, scarred };
		if (mirrors) mirrors.push(mirrored);
		else await landMirrors([mirrored]);
	}
	// A Wound dealt with a weapon an Ability tempers gives it a die for the rest of the fight (p98).
	if (result?.vigourLoss > 0 && !sparring && !blow.spirit) {
		const tempered = temperedDie(attack, blow);
		const dealer = tempered ? fromUuidSync(blow.dealer) : null;
		if (dealer) await temperWeapon(dealer, tempered.item, actor);
	}
	// A blow that costs its maker d6 if the foe stays up (p54), or brings back their allies' SPI if it falls (p74).
	if (result && !sparring && result.outcome !== "unharmed") {
		const down = downs(result.outcome, actor);
		for (const maker of makersWith(attack, down ? "rally" : "backlash")) {
			await (down ? offerRally(maker, actor) : offerBacklash(maker, actor));
		}
	}
	if (marks(result)) await postCard(actor, "note", { icon: "fa-solid fa-eye-slash", text: lastingMarkText(actor, marker) });
	// A bite that takes back the VIG its Wound costs (p166).
	if (blow.drain && !blow.spirit && result?.vigourLoss > 0 && !sparring) await drainTo(blow.dealer, actor, result.vigourLoss);
	// Or one that lowers them into normal sleep, or shows them a memory, if it Wounds (p166).
	if (!blow.spirit && result?.vigourLoss > 0 && !sparring && result.outcome !== "slain") {
		for (const key of attack.onWound ?? []) await postCard(actor, "note", { icon: ON_WOUND_ICONS[key], text: t(`damage.onWound.${key}`, { name: actor.name }) });
	}
	if (took.length) await postCard(actor, "note", { icon: "fa-solid fa-fire", text: took.join(" ") });
	return result;
}

/** The Combatant flag a horn blown leaves on whoever blew it, for the rest of the battle (p72). */
export const WILD_HORN_FLAG = "wildHorn";

/**
 * Whether a horn has been blown in a battle somebody is fighting, one that has
 * begun and that they have a place in, which doubles the VIG anybody in it loses to Damage until it ends (p72).
 * @param {Actor} actor
 * @returns {boolean}
 */
export function hornBlownFor(actor) {
	for (const combat of game.combats ?? []) {
		// A battle not yet begun has no horn sounding in it.
		if (!combat.started) continue;
		const combatants = [...combat.combatants];
		if (!combatants.some((combatant) => combatant.actor === actor || combatant.actor?.uuid === actor.uuid)) continue;
		if (combatants.some((combatant) => combatant.getFlag(SYSTEM_ID, WILD_HORN_FLAG))) return true;
	}
	return false;
}

/**
 * Whoever Wounded or Scarred a Knight who gives it back (p116) loses as much
 * VIG, as Virtue Loss, which never Wounds or Slays (p9), and gets the same
 * Scar. Somebody this user can't change is told of it on a card instead.
 * @param {string} dealerUuid
 * @param {Actor} victim The Knight struck.
 * @param {object} struck
 * @param {number} struck.loss The VIG the blow cost them.
 * @param {object|null} struck.scarred The Scar it gave them, as rollScar rolled it.
 */
async function mirrorBack(dealerUuid, victim, { loss, scarred }) {
	const dealer = dealerUuid ? fromUuidSync(dealerUuid) : null;
	if (!dealer || dealer.uuid === victim.uuid) return;
	const vig = dealer.system?.virtues?.vig;
	if (loss > 0 && vig) {
		const to = Math.max(0, vig.value - loss);
		if (dealer.isOwner) await dealer.update({ "system.virtues.vig.value": to }, causedBy("ability"));
		const text = dealer.isOwner
			? t("damage.mirrored", { name: dealer.name, amount: vig.value - to, victim: victim.name, from: vig.value, to })
			: t("damage.mirroredAsk", { name: dealer.name, amount: loss, victim: victim.name });
		await postCard(dealer, "note", { icon: "fa-solid fa-clone", text });
	}
	// A ship or structure has no VIG to lose and takes no Scar.
	if (!scarred?.apply || !vig) return;
	if (dealer.isOwner) await giveScar(dealer, { scar: scarred, location: scarred.location, faces: scarred.faces, by: victim.uuid });
	else await postCard(dealer, "note", { icon: "fa-solid fa-clone", text: t("damage.mirrorScarAsk", { name: dealer.name, victim: victim.name }) });
}

/**
 * Give back the Wounds and Scars takeAttack kept (p116).
 * @param {{dealer: string, victim: Actor, loss: number, scarred: object|null}[]} mirrors
 */
export async function landMirrors(mirrors) {
	for (const { dealer, victim, loss, scarred } of mirrors) await mirrorBack(dealer, victim, { loss, scarred });
}

/**
 * Who made an Attack with a blow that carries this, in a joint Attack each
 * joiner by their own dice, as a joiner's Ability is theirs alone.
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {"backlash"|"rally"} key
 * @returns {string[]} Their actor UUIDs.
 */
export function makersWith(attack, key) {
	const makers = attack[key] && attack.attacker ? [attack.attacker] : [];
	for (const die of attack.dice ?? []) if (die[key] && die.actor) makers.push(die.actor);
	return [...new Set(makers)];
}

/** What marks the buttons on the cards a backlash and a rally post. */
const BACKLASH_SELECTOR = "[data-backlash]";
const RALLY_SELECTOR = "[data-rally]";

/**
 * A blow that costs its maker d6 Damage should the foe stay up (p54): a card
 * offers it to whoever can deal it.
 * @param {string} attackerUuid
 * @param {Actor} target
 */
async function offerBacklash(attackerUuid, target) {
	const attacker = fromUuidSync(attackerUuid ?? "");
	if (!attacker) return;
	await postCard(attacker, "note", {
		icon: "fa-solid fa-hourglass-half",
		text: t("damage.backlash", { name: attacker.name, target: target.name }),
		action: { data: "backlash", icon: "fa-solid fa-dice-d6", label: t("damage.backlashRoll") }
	}, { flags: { [SYSTEM_ID]: { backlash: attacker.uuid } } });
}

/**
 * A blow that brings back the SPI of its maker's allies should the foe go
 * down (p74): a card offers it to the Referee, who knows who fought beside them.
 * @param {string} attackerUuid
 * @param {Actor} target
 */
async function offerRally(attackerUuid, target) {
	const attacker = fromUuidSync(attackerUuid ?? "");
	if (!attacker) return;
	await postCard(attacker, "note", {
		icon: "fa-solid fa-dove",
		text: t("damage.rally", { name: attacker.name, target: target.name }),
		action: { data: "rally", icon: "fa-solid fa-sun", label: t("damage.rallyButton") }
	}, { flags: { [SYSTEM_ID]: { rally: attacker.uuid } } });
}

/**
 * The allies a rally brings SPI back to (p74): the Knights fighting in a
 * Combat on its maker's side, by their Tokens' disposition; outside one, the
 * Company's standing Knights, if its maker rides with them. Never its maker.
 * @param {Actor} attacker
 * @returns {Actor[]}
 */
export function rallied(attacker) {
	const fighting = (combat) => [...combat.combatants].find((combatant) => combatant.actor?.uuid === attacker.uuid);
	// A fight under way before one only set up, as on another Scene; the viewed one first.
	const combats = [...new Set([game.combat, ...(game.combats ?? [])].filter(Boolean))];
	const combat = combats.find((each) => each.started && fighting(each)) ?? combats.find(fighting);
	const side = combat ? fighting(combat).token?.disposition : null;
	let allies = [];
	if (combat) allies = side === undefined || side === null ? [] : [...combat.combatants].filter((combatant) => combatant.actor && combatant.token?.disposition === side).map((combatant) => combatant.actor);
	else if (isCompanyKnight(attacker)) allies = worldKnights((knight) => isCompanyKnight(knight));
	return [...new Set(allies)].filter((ally) => ally.uuid !== attacker.uuid && isKnight(ally) && !ally.system.slain && ally.system.virtues?.spi);
}

/** Wire the backlash and rally cards. Called during init. */
export function registerAbilityBlows() {
	registerCardButtons({
		selector: BACKLASH_SELECTOR,
		// Dealt once, kept on the card so a reload doesn't offer it again.
		once: true,
		mayPress: (message, user) => Boolean(fromUuidSync(message?.flags?.[SYSTEM_ID]?.backlash ?? "")?.testUserPermission?.(user, "OWNER")),
		handler: async (_button, message) => {
			const attacker = fromUuidSync(message?.flags?.[SYSTEM_ID]?.backlash ?? "");
			if (!attacker?.isOwner) {
				warn("damage.backlashNotYours");
				return false;
			}
			const roll = await new Roll("1d6").evaluate();
			await postCard(attacker, "note", { icon: "fa-solid fa-hourglass-half", text: t("damage.backlashRolled", { name: attacker.name, damage: roll.total }) }, { rolls: [roll] });
			// Rolled and posted, it's spent even if the Damage window is closed.
			await takeDamage(attacker, { damage: roll.total, ranged: false, cause: t("damage.backlashCause") });
			return true;
		}
	});
	registerCardButtons({
		selector: RALLY_SELECTOR,
		once: true,
		mayPress: (_message, user) => Boolean(user?.isGM),
		handler: async (_button, message) => {
			const attacker = fromUuidSync(message?.flags?.[SYSTEM_ID]?.rally ?? "");
			const allies = attacker ? rallied(attacker).filter((ally) => ally.isOwner) : [];
			if (!allies.length) {
				warn("damage.rallyNobody");
				return false;
			}
			// Fetched here, since recovery.js reaches back to Damage through what it imports.
			const { restoreVirtueOfEach } = await import("./recovery.js");
			const entries = await restoreVirtueOfEach(allies, "spi", "ability");
			await postCard(attacker, "report", { title: t("damage.rallyTitle"), tagline: t("damage.rallyTagline", { name: attacker.name }), entries });
			return true;
		}
	});
}

/** The note each of ON_WOUND posts once a Wound lands. */
const ON_WOUND_ICONS = Object.freeze({ sleep: "fa-solid fa-bed", memory: "fa-solid fa-brain" });

/** Outcomes that leave what burns on where it landed: the blow got past their GD, and they live. */
const LINGERING_OUTCOMES = Object.freeze(["scar", "spared", "wounded", "mortal", "warded"]);

/**
 * Whoever dealt a Wound takes back the VIG it cost, as a bite may let them
 * (p166), up to their most. Somebody this user can't change is told of it on a
 * card instead, for their owner to write in.
 * @param {string} dealerUuid
 * @param {Actor} victim
 * @param {number} amount The VIG the victim lost.
 */
async function drainTo(dealerUuid, victim, amount) {
	const dealer = fromUuidSync(dealerUuid);
	const vig = dealer?.system?.virtues?.vig;
	if (!vig) return;
	const to = Math.min(vig.max, vig.value + amount);
	// Already at their most, there's nothing to take back.
	if (to <= vig.value) return;
	if (dealer.isOwner) await dealer.update({ "system.virtues.vig.value": to }, causedBy("damage"));
	const text = dealer.isOwner
		? t("damage.drained", { name: dealer.name, amount: to - vig.value, victim: victim.name, from: vig.value, to })
		: t("damage.drainedAsk", { name: dealer.name, amount, victim: victim.name });
	await postCard(dealer, "note", { icon: "fa-solid fa-droplet", text });
}

/**
 * Whatever an Attack's weapons burn on with, as acid does each round until
 * washed off (p173): afflictions those it lands on carry until cured.
 * @param {{name: string, damage: string, when: string, ignoresArmour?: boolean}[]} lingers
 * @returns {object[]}
 */
const lingeringAfflictions = (lingers) => lingers
	.map((entry) => lingeringAffliction({ name: entry.name, system: { damage: entry.damage, lingers: entry.when, ignoresArmour: entry.ignoresArmour } }))
	.filter(Boolean);

/**
 * A Smite made to leave a lasting mark rather than more Damage, such as a
 * dagger through the eye, leaves it once the blow Wounds (p187). A card says
 * so and the target's notes keep it, for the table to describe.
 * @param {Actor} actor
 * @param {string} attacker Who Smote for it, from lastingMarkBy.
 */
const lastingMarkText = (actor, attacker) => t("damage.lastingMark", { name: actor.name, attacker });

/**
 * @param {Actor} actor
 * @param {string} attacker
 * @returns {object} Their notes with the mark kept at the foot, where this user may write them.
 */
function lastingMarkUpdate(actor, attacker) {
	if (typeof actor.system.notes !== "string" || !actor.isOwner) return {};
	return { "system.notes": `${actor.system.notes}<p>${escapeHTML(lastingMarkText(actor, attacker))}</p>` };
}

/**
 * Whoever leads a Warband from the front suffers the same Damage it does
 * (p11), so they take what got past its Armour without their own. A leader
 * Slain or dying leads it no longer, and is let go of rather than struck again.
 * @param {Actor} warband
 * @param {number} dealt
 */
async function shareWithLeader(warband, dealt, { faces, by } = {}) {
	const leader = fromUuidSync(warband.system.leader);
	if (!leader?.system?.virtues) return;
	if (downBy(leader.system)) {
		if (warband.isOwner) await warband.update({ "system.leader": "" }, causedBy("damage"));
		return;
	}
	if (!leader.isOwner) {
		await postCard(warband, "note", { icon: "fa-solid fa-flag", text: t("damage.leaderShares", { name: leader.name, warband: warband.name, damage: dealt }) });
		return;
	}
	const result = await takeDamage(leader, { damage: dealt, ignoreArmour: true, by });
	// Their Scar is the blow's: the die that dealt it, and a Humiliation remembers who did (p9).
	if (result?.outcome === "scar") await rollScar(leader, { faces, by });
}
