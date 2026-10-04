import { inputDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { moralePrompt, promptGroupMorale } from "../chat/morale-card.js";
import { armourCounts, armourTotal, armourUnshielded, noteBearing, noteNamesShield, npcArmourUnshielded, shieldwallAround, shieldwallBearing, SITUATION_CONDITIONS } from "../rules/armour.js";
import { damageAgainst, dismountLanded, harmTargetOf, lastingMarkBy } from "../rules/attack.js";
import { WARDED_OUTCOMES, applyDoom, armourAgainst, resolveDamage, spiritOutcome, wardedResult } from "../rules/damage.js";
import { abilitiesWith } from "../rules/ability-uses.js";
import { lingeringAffliction } from "../rules/afflictions.js";
import { SLAIN_UPDATE, downBy } from "../rules/virtues.js";
import { afflict, afflictionLabel } from "./afflictions.js";
import { downOf, moraleTrigger } from "../rules/morale.js";
import { isDoomed } from "../rules/scars.js";
import { marksOn } from "../chat/gambit-marks.js";
import { chatIsPublic, playDamageFx } from "./attack-fx.js";
import { announceFallenKnight } from "./fallen.js";
import { causedBy } from "./ledger.js";
import { getCalendar } from "./calendar.js";
import { armourConditionText } from "./items.js";
import { offerRevenge, rollScar } from "./scars.js";
import { escapeHTML } from "../rules/text.js";
import { worldKnights } from "./knights.js";

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
	const { conditions } = actor.system;
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
	return actor.type === "knight" ? null : { armour: actor.system.armour, armourNote: actor.system.armourNote };
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
	const stander = (placed, bears) => ({
		name: placed.document.name,
		bearing: bears,
		box: { x: placed.document.x, y: placed.document.y, w: placed.w, h: placed.h }
	});
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
 * @param {boolean} [preset.sparring] A practice bout's, to be shaken off afterwards (p188): nobody's Morale or revenge rides on it.
 * @param {string[]} [preset.except] Ids of the Attack cards being applied, whose own Trap doesn't hold yet.
 * @param {"vig"|"spi"} [preset.virtue] The Virtue past GD it comes off: SPI for a blow an Ability
 *   says harms it rather than VIG (p68), which leaves them broken rather than dying.
 * @param {boolean} [preset.auto] Taken without asking, as an affliction's Damage is each round (p173):
 *   their Armour as it stands, unless the Damage ignores it.
 * @param {string} [preset.cause] What dealt it, said on the card.
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
	const trap = trapOn(actor, worn, preset.except);
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
		scores: () => ({ guard: actor.system.guard.value, vigour: virtues?.[score].value ?? 0 })
	};
	const asked = preset.auto ? autoDamage(target, preset) : await askDamage(target, preset);
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
	if (virtues && result.outcome === "slain") Object.assign(update, { "system.slain": true, "system.mortalWound": false });
	// Damage past GD Wounds them (p8), which some armour answers to. SPI lost to a blow is no Wound.
	if (virtues && !spirit && WOUNDING_OUTCOMES.includes(result.outcome)) update["system.wounded"] = true;
	await actor.update(update, causedBy("damage"));
	if (warden) await takeWard(warden, actor);

	const outcomes = outcomesFor(result.outcome, { warband, structure: Boolean(actor.system.structure) });
	// Nobody routs from a practice bout, and SPI lost to a blow is no Wound for Morale to weigh.
	const trigger = !preset.sparring && !spirit && moraleTrigger({
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
	if (spirit && result.vigourLoss) card.vigourLine = t("damage.spiritLine", { from: before.vigour, to: result.vigour });
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
	await postCard(actor, "damage", card);
	// What the blow looks like where it landed (module/actions/attack-fx.js): after the
	// scores are written and the card says so, since it's only the map catching up.
	playDamageFx(actor, result.outcome, { whispered: !chatIsPublic() });

	if (DOWN_OUTCOMES.includes(result.outcome) && !preset.sparring && !dead) {
		await promptGroupMorale(actor);
		// Bringing down whoever dealt a Humiliation may be the revenge that settles it (p9).
		await offerRevenge(actor);
	}
	// A played Knight taken to VIG 0 is Slain, and their player carries on some other way (p8).
	// Which deaths the book leaves alone is knightHasFallen's to judge, so the outcome goes to it.
	if (!dead) await announceFallenKnight(actor, result.outcome);
	if (warband && actor.system.leader && result.dealt > 0) await shareWithLeader(actor, result.dealt);
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
 * Resolve Damage taken without asking, as an affliction's is each round
 * (p173): their Armour as it stands, unless the Damage ignores it.
 * @param {object} target As askDamage takes.
 * @param {{damage?: number, ignoreArmour?: boolean}} preset
 * @returns {{result: import("../rules/damage.js").DamageResult, armour: number, before: {guard: number, vigour: number}}}
 */
function autoDamage(target, { damage = 0, ignoreArmour = false }) {
	const armour = armourAgainst({ armour: target.armour, ignoreArmour });
	const before = target.scores();
	const result = resolveDamage({ damage: Math.max(0, Number(damage) || 0), armour, guard: before.guard, vigour: before.vigour, exposed: target.exposed, structure: target.structure });
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
	const ours = victim.type === "knight" || Boolean(victim.hasPlayerOwner);
	return (game.actors?.contents ?? []).filter((actor) => {
		if (actor.type !== "knight" || actor === base || !actor.isOwner || downBy(actor.system)) return false;
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
		? { ...SLAIN_UPDATE, "system.wounded": true }
		: { "system.mortalWound": true, "system.wounded": true };
	await warden.update(update, causedBy("damage"));
	await postCard(warden, "note", { icon: "fa-solid fa-shield-heart", text: t(doomed ? "deathWard.doomed" : "deathWard.taken", { name: warden.name, victim: victim.name }) });
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
 * @returns {Promise<import("../rules/damage.js").DamageResult|null>} Null if the dialog was closed.
 */
export async function takeAttack(actor, attack, { scars = true, except = [], sparring = false } = {}) {
	// Only Blast or large-scale Attacks harm a Warband, and only fire, siege weapons or large
	// creatures a structure, or siege weapons stone (p11). In a joint Attack only the dice of
	// shares that can harm them count, and cover, Armour and Slaying follow the die that does (p8).
	const blow = damageAgainst(attack, harmTargetOf(actor.system));
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
		virtue: blow.spirit ? "spi" : "vig"
	});
	// A Humiliation remembers whoever rolled the die that counted, in a joint Attack.
	if (scars && result?.outcome === "scar") await rollScar(actor, { faces: blow.faces, by: blow.dealer });
	const marker = lastingMarkBy(attack);
	if (marker !== null && !sparring && !blow.spirit && WOUNDING_OUTCOMES.includes(result?.outcome)) await leaveLastingMark(actor, marker);
	// Dismounted (p10): off their steed, whose trample no longer joins their Attacks.
	if (result && dismountLanded(attack) && actor.system.mounted === true) await actor.update({ "system.mounted": false }, causedBy("damage"));
	// A bite that takes back the VIG its Wound costs (p166).
	if (blow.drain && !blow.spirit && result?.vigourLoss > 0 && !sparring) await drainTo(blow.dealer, actor, result.vigourLoss);
	// Or one that lowers them into normal sleep, or shows them a memory, if it Wounds (p166).
	if (!blow.spirit && result?.vigourLoss > 0 && !sparring && result.outcome !== "slain") {
		for (const key of attack.onWound ?? []) await postCard(actor, "note", { icon: ON_WOUND_ICONS[key], text: t(`damage.onWound.${key}`, { name: actor.name }) });
	}
	// Acid that burns on, each round, until washed off (p173).
	if (!sparring && LINGERING_OUTCOMES.includes(result?.outcome)) await leaveLingering(actor, attack.lingers ?? []);
	return result;
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
 * Leave on somebody whatever an Attack's weapons burn on with, as acid does
 * each round until washed off (p173): an affliction they carry until cured.
 * @param {Actor} actor
 * @param {{name: string, damage: string, when: string, ignoresArmour?: boolean}[]} lingers
 */
async function leaveLingering(actor, lingers) {
	const took = [];
	for (const entry of lingers) {
		const affliction = lingeringAffliction({ name: entry.name, system: { damage: entry.damage, lingers: entry.when, ignoresArmour: entry.ignoresArmour } });
		if (affliction && (await afflict(actor, affliction))) took.push(t("afflictions.took", { name: actor.name, affliction: afflictionLabel(affliction) }));
	}
	if (took.length) await postCard(actor, "note", { icon: "fa-solid fa-fire", text: took.join(" ") });
}

/**
 * A Smite made to leave a lasting mark rather than more Damage, such as a
 * dagger through the eye, leaves it once the blow Wounds (p187). The card says
 * so and the target's notes keep it, for the table to describe.
 * @param {Actor} actor
 * @param {string} attacker Who Smote for it, from lastingMarkBy.
 */
async function leaveLastingMark(actor, attacker) {
	const text = t("damage.lastingMark", { name: actor.name, attacker });
	if (typeof actor.system.notes === "string" && actor.isOwner) await actor.update({ "system.notes": `${actor.system.notes}<p>${escapeHTML(text)}</p>` }, causedBy("damage"));
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
