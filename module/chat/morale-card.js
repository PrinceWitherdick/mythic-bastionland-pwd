import { chooseActor } from "../apps/actor-pick.js";
import { askActiveGM } from "../ask-gm.js";
import { queryAsker } from "../compat.js";
import { playerCharacter } from "../actions/knights.js";
import { combatantOf } from "../actions/lasting-dice.js";
import { letGoOf } from "../actions/leading.js";
import { keepsMoraleMark, rollMorale } from "../actions/saves.js";
import { offerRevenge } from "../actions/scars.js";
import { BREAK_ICONS, GROUP_ORDER, downOf, downedPlace, groupHalved, isMoraleBreak, moraleRollers, skipsBrokenTurn } from "../rules/morale.js";
import { outOfFight } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { onCardClick, postCard, t, warn } from "./cards.js";

/**
 * Wavering Morale prompts (p10). A Damage card asks a Wounded NPC for its
 * Morale Save, and GMs are told when half of a side in combat is down, with
 * buttons to roll for the group the way the book describes. A failed Save's
 * card asks whether they fled or surrendered, which marks them on their sheet
 * and takes them out of the Combat's turn order until the mark is cleared.
 * Anybody but the players' own who goes down for good is taken out of the turn
 * order too, until healed, patched up or repaired.
 */

/** Combat flag listing the Token dispositions whose groups have already been asked. */
const PROMPTED_FLAG = "moralePrompted";

/** Marks a Combatant defeated here because their Morale broke, so clearing it can stand them up again. */
const BROKE_FLAG = "moraleBroke";

/** Marks a Combatant defeated here because they went down for good, so getting up again can stand them up. */
const DOWN_FLAG = "downed";

/** The query asking the active GM to weigh a side's Morale, for a player who brought one of it down. */
const GROUP_MORALE_QUERY = `${SYSTEM_ID}.groupMorale`;

/** Morale buttons on Damage cards, group prompts and failed Saves. */
const MORALE_BUTTONS = "[data-morale-roll], [data-morale-group], [data-morale-break]";

/**
 * @param {Actor|null} actor
 * @returns {boolean} Whether they belong in a group whose Morale can waver: anybody with Virtues
 *   not the players' own, the Referee's Knights and creatures that count as structures among them.
 *   A ship or wall has no Virtues, and so no nerve to lose.
 */
const wavers = (actor) => Boolean(actor?.system?.virtues) && !playerCharacter(actor);

/**
 * @param {Combatant} combatant
 * @returns {{combatant: Combatant, actor: Actor, down: boolean}} Down counts a Warband broken at
 *   SPI 0, which follows no orders (p11).
 */
function memberOf(combatant) {
	const { actor } = combatant;
	return { combatant, actor, down: downOf(actor, { defeated: combatant.isDefeated, orders: true }) };
}

/**
 * After an NPC, or a Knight the Referee plays, goes down in combat, ask the GM for the group's Morale once half
 * of those on its side are down. Each side is asked once per combat. Only a
 * GM can mark the combat, so a player who brought down one of their own, such
 * as a follower, asks the active one.
 * @param {Actor} actor Who just took Damage.
 * @returns {Promise<ChatMessage|null>}
 */
export async function promptGroupMorale(actor) {
	if (!wavers(actor)) return null;
	if (!game.user.isGM) {
		if (game.users.activeGM && combatantOf(actor)) await askActiveGM(GROUP_MORALE_QUERY, { uuid: actor.uuid }, `Couldn't ask the Referee about ${actor.name}'s side's Morale`);
		return null;
	}
	const own = combatantOf(actor);
	const combat = own?.parent;
	const disposition = own?.token?.disposition;
	if (disposition === undefined) return null;

	const prompted = combat.getFlag(SYSTEM_ID, PROMPTED_FLAG) ?? [];
	if (prompted.includes(disposition)) return null;

	const members = combat.combatants.filter((combatant) => combatant.token?.disposition === disposition && wavers(combatant.actor)).map(memberOf);
	const standing = members.filter((member) => !member.down);
	// Nobody left standing has any Morale left to roll, as when an organised group broke together.
	if (!groupHalved(members) || !standing.length) return null;

	await combat.setFlag(SYSTEM_ID, PROMPTED_FLAG, [...prompted, disposition]);
	return postCard(null, "morale-group", {
		intro: t("morale.group.intro", { down: members.length - standing.length, count: members.length }),
		standing: standing.map(({ actor: member }) => member.name),
		orders: GROUP_ORDER.map((order) => ({ key: order, label: t(`morale.group.orders.${order}.label`), hint: t(`morale.group.orders.${order}.hint`) }))
	}, { mode: "gm", flags: { [SYSTEM_ID]: { moraleGroup: { actors: standing.map(({ actor: member }) => member.uuid) } } } });
}

/**
 * A player's ask that a side be weighed for its Morale, answered by the GM
 * who was asked: only for somebody the asker owns, as one they just harmed.
 * @param {{uuid?: string}} data
 * @param {object} context
 * @returns {Promise<boolean>} Whether the side was asked.
 */
export async function onGroupMoraleQuery(data = {}, context = {}) {
	const asker = queryAsker(context);
	if (!asker || !game.user.isGM) return false;
	const actor = data?.uuid ? fromUuidSync(data.uuid) : null;
	if (!actor?.testUserPermission?.(asker, "OWNER")) return false;
	return Boolean(await promptGroupMorale(actor));
}

/**
 * Roll one character's Morale from a card, if this user may.
 * @param {string} uuid
 */
async function rollFor(uuid) {
	const actor = fromUuidSync(uuid);
	if (!actor) return warn("morale.gone");
	if (!actor.isOwner) return warn("morale.notOwner", { name: actor.name });
	return rollMorale(actor);
}

/**
 * Ask which member leads an organised group.
 * @param {Actor[]} actors
 * @returns {Promise<Actor|null>}
 */
const chooseLeader = (actors) => chooseActor(actors, {
	title: t("morale.group.title"),
	message: t("morale.group.leader"),
	icon: "fa-solid fa-flag",
	ok: t("morale.roll")
});

/**
 * Roll a group's Morale: once on its leader's SPI when organised, or for each
 * member still standing.
 * @param {ChatMessage} message
 * @param {string} order One of GROUP_ORDER.
 */
async function rollGroup(message, order) {
	const uuids = message.getFlag(SYSTEM_ID, "moraleGroup")?.actors ?? [];
	const members = uuids.map((uuid) => fromUuidSync(uuid)).filter((actor) => actor?.isOwner).map((actor) => ({ actor, down: downOf(actor, { orders: true }) }));
	const standing = members.filter((member) => !member.down);
	if (!standing.length) return warn("morale.group.noneStanding");

	let leader = null;
	if (order === "organised") {
		const chosen = await chooseLeader(standing.map((member) => member.actor));
		if (!chosen) return;
		leader = standing.find((member) => member.actor === chosen);
	}
	// An organised group stands or breaks on its leader's roll, so a failed one marks them all.
	const group = standing.map((member) => member.actor);
	for (const { actor } of moraleRollers(members, { order, leader })) await rollMorale(actor, order === "organised" ? { group } : {});
}

/**
 * Put their Combatants out of the turn order, or back into it: marked
 * defeated as their Morale breaks, and stood up again once it's cleared,
 * unless they're down some other way by then. A Combatant already marked
 * defeated by hand is left as it was.
 * @param {Actor} actor
 * @param {boolean} out
 */
async function setOutOfCombat(actor, out) {
	for (const combat of game.combats ?? []) {
		const theirs = combat.combatants.filter((combatant) => combatant.actor?.uuid === actor.uuid && combatant.isOwner);
		const updates = theirs.flatMap((combatant) => {
			if (out) return combatant.defeated ? [] : [{ _id: combatant.id, defeated: true, [`flags.${SYSTEM_ID}.${BROKE_FLAG}`]: true }];
			if (!combatant.getFlag(SYSTEM_ID, BROKE_FLAG)) return [];
			return [{ _id: combatant.id, defeated: downOf(actor, { morale: false }), [`flags.${SYSTEM_ID}.${BROKE_FLAG}`]: false }];
		});
		if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
	}
}

/**
 * Mark those a failed Morale Save stood for as fled or surrendered (p10). It
 * takes them out of the fight: out of the Combat's turn order, and counted as
 * down when half of their side is. Being brought low that way may also be the
 * revenge a Humiliation waits on (p9).
 * @param {Actor[]} actors
 * @param {string} broken One of MORALE_BREAKS.
 * @returns {Promise<Actor[]>} Those newly marked.
 */
export async function breakMorale(actors, broken) {
	if (!isMoraleBreak(broken)) return [];
	const npcs = actors.filter(keepsMoraleMark);
	const owned = npcs.filter((actor) => actor.isOwner);
	if (!owned.length) {
		if (npcs.length) warn("morale.broke.notOwner");
		return [];
	}
	const marked = owned.filter((actor) => actor.system.moraleBroken !== broken);
	if (!marked.length) {
		ui.notifications.info(t("morale.broke.already"));
		return [];
	}

	await Promise.all(marked.map(async (actor) => {
		// Fled then said to have surrendered is out of the fight already.
		const wasOut = isMoraleBreak(actor.system.moraleBroken);
		await actor.update({ "system.moraleBroken": broken });
		if (!wasOut) await setOutOfCombat(actor, true);
	}));
	const names = marked.map((actor) => actor.name).join(", ");
	await postCard(marked.length === 1 ? marked[0] : null, "note", {
		icon: BREAK_ICONS[broken],
		text: t(marked.length === 1 ? `morale.broke.${broken}.didOne` : `morale.broke.${broken}.did`, { names })
	});
	for (const actor of marked) {
		await promptGroupMorale(actor);
		await offerRevenge(actor);
	}
	return marked;
}

/**
 * Clear the mark a failed Morale Save left, from its pill on the sheet: they
 * rallied, or it was pressed by mistake. Their Combatants go back into the
 * turn order.
 * @param {Actor} actor
 * @returns {Promise<boolean>} Whether there was a mark to clear.
 */
export async function clearMoraleBreak(actor) {
	if (!actor?.isOwner || !isMoraleBreak(actor.system.moraleBroken)) return false;
	await actor.update({ "system.moraleBroken": "" });
	await setOutOfCombat(actor, false);
	return true;
}

/**
 * Pass over the turn of somebody whose Morale broke, where the tracker still
 * lands on it, as it does unless it's set to skip the defeated. The active GM
 * moves the tracker on.
 * @param {Combat} combat
 */
async function skipBrokenMorale(combat) {
	if (!game.users.activeGM?.isSelf || !combat?.started) return;
	const turns = combat.turns.map((combatant) => ({
		broken: combatant.actor?.system?.moraleBroken ?? "",
		down: Boolean(combatant.defeated && combatant.getFlag(SYSTEM_ID, DOWN_FLAG))
	}));
	if (skipsBrokenTurn(turns, combat.turn)) await combat.nextTurn();
}

/** What an Actor update can change that takes somebody out of the fight for good, or brings them back. */
const DOWN_PATHS = Object.freeze(["system.slain", "system.mortalWound", "system.fightsOn", "system.guard.value", "system.virtues.vig.value", "system.structure", "system.scale"]);

/**
 * Put somebody's Combatants out of the turn order as they go down for good,
 * or back into it as they get up again, as downedPlace says.
 * @param {Actor} actor
 * @param {boolean} out Whether they're out of the fight for good now.
 */
async function markDowned(actor, out) {
	const broken = isMoraleBreak(actor.system.moraleBroken);
	for (const combat of game.combats ?? []) {
		const updates = combat.combatants.filter((combatant) => combatant.actor?.uuid === actor.uuid).flatMap((combatant) => {
			const change = downedPlace({
				defeated: Boolean(combatant.defeated),
				downFlag: Boolean(combatant.getFlag(SYSTEM_ID, DOWN_FLAG)),
				brokeFlag: Boolean(combatant.getFlag(SYSTEM_ID, BROKE_FLAG))
			}, { out, broken });
			if (!change) return [];
			const update = { _id: combatant.id };
			if ("defeated" in change) update.defeated = change.defeated;
			if ("downFlag" in change) update[`flags.${SYSTEM_ID}.${DOWN_FLAG}`] = change.downFlag;
			if ("brokeFlag" in change) update[`flags.${SYSTEM_ID}.${BROKE_FLAG}`] = change.brokeFlag;
			return [update];
		});
		if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
	}
}

/**
 * Somebody Slain, Mortally Wounded, destroyed or wiped out is out of the
 * fight, so their turns pass them by and nobody they led from the front is led
 * any longer; healed, patched up or repaired, they're back in it. The players'
 * own Knights keep their turns, as the table plays on through a death. The
 * active GM makes the change, whoever made the update.
 * @param {Actor} actor
 * @param {object} changed The update, expanded.
 */
async function onDownChange(actor, changed) {
	if (!game.users.activeGM?.isSelf || !DOWN_PATHS.some((path) => foundry.utils.hasProperty(changed, path))) return;
	const out = Boolean(outOfFight(actor.system));
	if (out) await letGoOf(actor);
	if (!playerCharacter(actor)) await markDowned(actor, out);
}

/**
 * Wire up Morale buttons on Damage cards and group prompts.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function activateMoraleButtons(message, html) {
	if (!html.querySelector(MORALE_BUTTONS)) return;
	// A Morale roll, or a broken NPC's mark, is only for whoever may change them.
	for (const button of html.querySelectorAll(MORALE_BUTTONS)) {
		const uuids = button.dataset.moraleRoll ? [button.dataset.moraleRoll] : actorUuidsOf(button);
		const actors = uuids.map((uuid) => fromUuidSync(uuid));
		// The Referee keeps a button whose characters are all gone, so a click says so.
		const gone = game.user.isGM && actors.every((actor) => !actor);
		if (uuids.length && !gone && !actors.some((actor) => actor?.isOwner)) button.hidden = true;
	}
	onCardClick(html, MORALE_BUTTONS, async (button) => {
		if (button.dataset.moraleRoll) await rollFor(button.dataset.moraleRoll);
		else if (GROUP_ORDER.includes(button.dataset.moraleGroup)) await rollGroup(message, button.dataset.moraleGroup);
		else if (button.dataset.moraleBreak) await breakFrom(button);
	});
}

/**
 * @param {HTMLElement} button
 * @returns {string[]} The UUIDs of those a group's button stands for.
 */
const actorUuidsOf = (button) => (button.dataset.actors ?? "").split(",").filter(Boolean);

/**
 * Mark whoever a failed Morale card stood for, as its button says.
 * @param {HTMLElement} button
 */
async function breakFrom(button) {
	const actors = actorUuidsOf(button).map((uuid) => fromUuidSync(uuid)).filter(Boolean);
	if (!actors.length) return warn("morale.gone");
	return breakMorale(actors, button.dataset.moraleBreak);
}

/** Called during init. */
export function registerMoraleCards() {
	Hooks.on("renderChatMessageHTML", activateMoraleButtons);
	// Round 0 becoming 1 is a turn change too, as Surprise finds.
	Hooks.on("combatTurnChange", (combat) => skipBrokenMorale(combat));
	Hooks.on("updateActor", (actor, changed) => {
		onDownChange(actor, changed).catch((error) => console.error(`${SYSTEM_ID} | Couldn't follow ${actor.name} going down`, error));
	});
	CONFIG.queries[GROUP_MORALE_QUERY] = onGroupMoraleQuery;
}

/**
 * Template data for the Morale line on a Damage card.
 * @param {{name: string, uuid?: string|null}} who Whoever took the harm. A Seer has no
 *   Actor and so no UUID: their card says the Morale Roll is due without offering it,
 *   since it's their SPI on the Seer page that rolls it.
 * @param {string|null} trigger One of MORALE_TRIGGERS.
 * @returns {{text: string, uuid?: string, label?: string}|null}
 */
export function moralePrompt({ name, uuid = null }, trigger) {
	if (!trigger) return null;
	const text = t(`morale.triggers.${trigger}`, { name });
	return uuid ? { uuid, text, label: t("morale.roll") } : { text };
}
