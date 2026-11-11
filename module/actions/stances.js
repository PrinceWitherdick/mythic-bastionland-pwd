import { postCard, t, warn } from "../chat/cards.js";
import { gmAsker } from "../gm-asker.js";
import { SYSTEM_ID } from "../system-id.js";
import { combatantOf, placesInCombat } from "./lasting-dice.js";
import { hasStance, onMoveUpdates } from "../rules/stances.js";
import { lapseStances } from "./stance-lapse.js";
import { causedBy } from "./ledger.js";
import { askActiveGMOrWarn } from "../ask-gm-warn.js";
import { attackOf, ownsAnAttacker } from "../chat/attack-flag.js";
import { dieMaker } from "../rules/attack.js";
import { registerQuery } from "../queries.js";


/** The query asking the GM to take up, or end, a stance a Move Gambit brought, for a user who can't (p40). */
const STANCE_QUERY = `${SYSTEM_ID}.stanceOnMove`;

/** The Ability flag naming the card and die whose Move Gambit took its stance up. */
const STANCE_BY_FLAG = "stanceBy";

/**
 * @param {{message?: string, die?: number|null}} [by] The card and die a Move Gambit was spent from.
 * @returns {string|null} What the stance it takes up is stamped with, or null for one no die paid for.
 */
const stampOf = (by) => (by?.message && Number.isInteger(by.die) ? `${by.message}:${by.die}` : null);

/**
 * Whether a card still shows a Move Gambit spent from that die by that Knight, or no longer does.
 * @param {{message?: string, die?: number}} by
 * @param {string} actorUuid
 * @returns {boolean|null} Null without the card.
 */
function moveOnCard(by, actorUuid) {
	const attack = attackOf(game.messages?.get(by?.message));
	if (!attack) return null;
	const spent = attack.gambits?.find((gambit) => gambit.die === by.die);
	return spent?.key === "move" && dieMaker(attack, attack.dice?.[by.die]) === actorUuid;
}

/**
 * Whether a user may have the GM change a Knight's stance from a card: they
 * own the Knight, or one of those making the card's Attack.
 * @param {User} user
 * @param {Actor} actor
 * @param {{message?: string}} by
 * @returns {boolean}
 */
function mayAskStance(user, actor, by) {
	if (actor?.testUserPermission?.(user, "OWNER")) return true;
	const attack = attackOf(game.messages?.get(by?.message));
	return Boolean(attack) && ownsAnAttacker(attack, user);
}

/**
 * Stances some Knights' Abilities let them take up (module/rules/stances.js):
 * taken up and ended from the Ability's row, taken up by a Gambit spent on
 * Moving where the Ability says so (p40), and ended as the Knight's next turn
 * starts where it lasts only that long (p40, p78).
 */

/**
 * Take up an Ability's stance, or end it, and say so to the table.
 * @param {Actor} actor
 * @param {Item|undefined} item The Ability.
 * @returns {Promise<boolean>} Whether it changed.
 */
export async function toggleStance(actor, item) {
	if (item?.type !== "ability" || !hasStance(item.system) || !actor?.isOwner) return false;
	const taking = !item.system.inEffect;
	await item.update({ "system.inEffect": taking }, causedBy("ability"));
	await postCard(actor, "note", { icon: "fa-solid fa-shield-halved", text: t(stanceKey(item.system, taking), { name: actor.name, ability: item.name }) });
	return true;
}

/**
 * @param {object} system The Ability's system data.
 * @param {boolean} taking Whether it's being taken up, rather than ended.
 * @returns {string} The words for it, under `bastionland.stance.`
 */
function stanceKey(system, taking) {
	if (system.oath) return taking ? "stance.sworn" : "stance.fulfilled";
	return taking ? "stance.taken" : "stance.ended";
}

/**
 * What the Ability's row button says: take the stance up, or end it.
 * @param {Item} item
 * @returns {string|null} Null for an Ability with no stance.
 */
export function stanceRowLabel({ type, system }) {
	if (type !== "ability" || !hasStance(system)) return null;
	if (system.oath) return t(system.inEffect ? "stance.fulfil" : "stance.swear");
	return t(system.inEffect ? "stance.end" : "stance.take");
}

/**
 * A Gambit spent on Moving puts into effect the stances that come with one
 * (p40), stamped with the card and die that paid for it so taking the Gambit
 * back ends it again. Whoever can't change the Knight, as an ally spending
 * their die in a joint Attack, asks the GM to.
 * @param {Actor|null|undefined} actor Who spent the die.
 * @param {{message?: string, die?: number|null}} [by] The card and die it was spent from.
 * @returns {Promise<void>}
 */
export async function takeStanceOnMove(actor, by = {}) {
	if (!actor?.items || !onMoveUpdates(actor.items.contents).length) return;
	if (!actor.isOwner) {
		if (stampOf(by)) await askStance(actor, by, false);
		return;
	}
	await putStanceOnMove(actor, by);
}

/**
 * Ask the active GM to take up, or end, a stance for a Knight this user can't
 * change, telling them when nobody can.
 * @param {Actor} actor
 * @param {{message?: string, die?: number|null}} by
 * @param {boolean} end
 * @returns {Promise<boolean>} Whether the GM did it.
 */
async function askStance(actor, by, end) {
	const asked = { actor: actor.uuid, message: by.message, die: by.die, end };
	return Boolean(await askActiveGMOrWarn(STANCE_QUERY, asked, `Couldn't change ${actor.name}'s stance`, { absent: "stance.needsGM", refused: "stance.refused", data: { name: actor.name } }));
}

/**
 * @param {Actor} actor
 * @param {{message?: string, die?: number|null}} by
 * @returns {Promise<boolean>}
 */
async function putStanceOnMove(actor, by) {
	const stamp = stampOf(by);
	const updates = onMoveUpdates(actor.items.contents)
		.map((update) => (stamp ? { ...update, [`flags.${SYSTEM_ID}.${STANCE_BY_FLAG}`]: stamp } : update));
	if (!updates.length) return false;
	await actor.updateEmbeddedDocuments("Item", updates, causedBy("ability"));
	const names = updates.map(({ _id }) => actor.items.get(_id)?.name).filter(Boolean);
	await postCard(actor, "note", { icon: "fa-solid fa-shield-halved", text: t("stance.onMove", { name: actor.name, ability: names.join(", ") }) });
	return true;
}

/**
 * A Move Gambit taken back ends the stance it took up (p40), and only that one.
 * @param {Actor|null|undefined} actor Who spent the die.
 * @param {{message?: string, die?: number|null}} by The card and die it was spent from.
 * @returns {Promise<void>}
 */
export async function endStanceFromMove(actor, by) {
	const stamp = stampOf(by);
	if (!actor?.items || !stamp || !takenBy(actor, stamp).length) return;
	if (actor.isOwner) await dropStanceFromMove(actor, stamp);
	else await askStance(actor, by, true);
}

/**
 * @param {Actor} actor
 * @param {string} stamp
 * @returns {Item[]} Their Abilities whose stance that card and die took up, still in effect.
 */
const takenBy = (actor, stamp) => actor.items.filter((item) => item.type === "ability" && item.system.inEffect && item.getFlag?.(SYSTEM_ID, STANCE_BY_FLAG) === stamp);

/**
 * @param {Actor} actor
 * @param {string} stamp
 * @returns {Promise<boolean>}
 */
async function dropStanceFromMove(actor, stamp) {
	const taken = takenBy(actor, stamp);
	if (!taken.length) return false;
	await actor.updateEmbeddedDocuments("Item", taken.map((item) => ({ _id: item.id, "system.inEffect": false })), causedBy("ability"));
	await postCard(actor, "note", { icon: "fa-solid fa-shield-halved", text: t("stance.takenBack", { name: actor.name, ability: taken.map((item) => item.name).join(", ") }) });
	return true;
}

/**
 * The GM taking up, or ending, a stance a Move Gambit brought, for whoever
 * spent or took back the die: only as the card shows it, and only for somebody
 * who plays the Knight or one of those making the Attack, whose pooled dice any
 * of them may spend (p8).
 * @param {{actor?: string, message?: string, die?: number, end?: boolean}} data
 * @param {object} context
 * @returns {Promise<boolean>}
 */
export async function onStanceQuery(data = {}, context = {}) {
	const asker = gmAsker(context);
	if (!asker) return false;
	const actor = typeof data?.actor === "string" ? fromUuidSync(data.actor) : null;
	const by = { message: data?.message, die: data?.die };
	const stamp = stampOf(by);
	if (!actor?.items || !stamp || !mayAskStance(asker, actor, by)) return false;
	const shown = moveOnCard(by, actor.uuid);
	if (data.end) return shown === false ? dropStanceFromMove(actor, stamp) : false;
	return shown === true ? putStanceOnMove(actor, by) : false;
}

/** As a Combatant's turn starts, their stances that last until then end. */
async function onTurnChange(combat, _prior, current) {
	if (!game.users.activeGM?.isSelf) return;
	await lapseStances(combat.combatants.get(current?.combatantId)?.actor);
}

/** A fight over ends every stance that lasts only a turn. */
async function onCombatEnd(combat) {
	if (!game.users.activeGM?.isSelf) return;
	// Each actor once, though a linked actor may hold several places.
	const actors = new Set(combat.combatants.map((combatant) => combatant.actor).filter(Boolean));
	await Promise.all([...actors].map((actor) => lapseStances(actor)));
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
	// A battle not yet begun has no horn sounding in it.
	return placesInCombat(actor).some(({ combat }) => combat.started && [...combat.combatants].some((combatant) => combatant.getFlag(SYSTEM_ID, WILD_HORN_FLAG)));
}

/**
 * Blow a horn in battle (p72): until the Combat ends, VIG lost to Damage is
 * doubled for everybody in it. The flag is kept on the blower's own place in
 * the Combat, which their player may write, and goes when the Combat does.
 * @param {Actor} actor
 * @param {Item|undefined} item The Ability.
 * @returns {Promise<boolean>} Whether it was blown.
 */
export async function blowHorn(actor, item) {
	const combatant = combatantOf(actor);
	if (!combatant) {
		warn("wildHorn.notInCombat", { name: actor.name });
		return false;
	}
	if (hornBlownFor(actor)) {
		warn("wildHorn.already");
		return false;
	}
	await combatant.setFlag(SYSTEM_ID, WILD_HORN_FLAG, true);
	await postCard(actor, "note", { icon: "fa-solid fa-bullhorn", text: t("wildHorn.blown", { name: actor.name, ability: item?.name ?? "" }) });
	return true;
}

/** Called during init. */
export function registerStanceHooks() {
	Hooks.on("combatTurnChange", onTurnChange);
	Hooks.on("deleteCombat", onCombatEnd);
	registerQuery(STANCE_QUERY, onStanceQuery);
}

