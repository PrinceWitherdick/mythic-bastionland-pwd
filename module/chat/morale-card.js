import { combatantOf } from "../actions/lasting-dice.js";
import { rollMorale } from "../actions/saves.js";
import { offerRevenge } from "../actions/scars.js";
import { BREAK_ICONS, GROUP_ORDER, downOf, groupHalved, isMoraleBreak, moraleRollers, skipsBrokenTurn } from "../rules/morale.js";
import { SYSTEM_ID } from "../system-id.js";
import { onCardClick, postCard, t, warn } from "./cards.js";

/**
 * Wavering Morale prompts (p10). A Damage card asks a Wounded NPC for its
 * Morale Save, and GMs are told when half of a side in combat is down, with
 * buttons to roll for the group the way the book describes. A failed Save's
 * card asks whether they fled or surrendered, which marks them on their sheet
 * and takes them out of the Combat's turn order until the mark is cleared.
 */

/** Combat flag listing the Token dispositions whose groups have already been asked. */
const PROMPTED_FLAG = "moralePrompted";

/** Marks a Combatant defeated here because their Morale broke, so clearing it can stand them up again. */
const BROKE_FLAG = "moraleBroke";

/** Morale buttons on Damage cards, group prompts and failed Saves. */
const MORALE_BUTTONS = "[data-morale-roll], [data-morale-group], [data-morale-break]";

/**
 * @param {Combatant} combatant
 * @returns {boolean} Whether they belong in a group whose Morale can waver: an NPC who isn't a structure.
 */
const wavers = (combatant) => combatant.actor?.type === "npc" && !combatant.actor.system.structure;

/**
 * @param {Combatant} combatant
 * @returns {{combatant: Combatant, actor: Actor, down: boolean}}
 */
function memberOf(combatant) {
	const { actor } = combatant;
	return { combatant, actor, down: downOf(actor, { defeated: combatant.isDefeated }) };
}

/**
 * After an NPC goes down in combat, ask the GM for the group's Morale once half
 * of those on its side are down. Each side is asked once per combat. GMs only,
 * since only they can mark the combat.
 * @param {Actor} actor Who just took Damage.
 * @returns {Promise<ChatMessage|null>}
 */
export async function promptGroupMorale(actor) {
	if (!game.user.isGM || actor.type !== "npc") return null;
	const own = combatantOf(actor);
	const combat = own?.parent;
	const disposition = own?.token?.disposition;
	if (disposition === undefined) return null;

	const prompted = combat.getFlag(SYSTEM_ID, PROMPTED_FLAG) ?? [];
	if (prompted.includes(disposition)) return null;

	const members = combat.combatants.filter((combatant) => combatant.token?.disposition === disposition && wavers(combatant)).map(memberOf);
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
async function chooseLeader(actors) {
	const { escapeHTML } = foundry.utils;
	const options = actors.map((actor) => `<option value="${escapeHTML(actor.uuid)}">${escapeHTML(actor.name)}</option>`).join("");
	const data = await foundry.applications.api.DialogV2.input({
		window: { title: t("morale.group.title"), icon: "fa-solid fa-flag" },
		classes: ["bastionland-dialog"],
		content: `<div class="form-group"><label for="bastionland-morale-leader">${t("morale.group.leader")}</label>`
			+ `<div class="form-fields"><select id="bastionland-morale-leader" name="leader">${options}</select></div></div>`,
		ok: { label: t("morale.roll"), icon: "fa-solid fa-dice-d20" },
		rejectClose: false
	});
	return actors.find((actor) => actor.uuid === data?.leader) ?? null;
}

/**
 * Roll a group's Morale: once on its leader's SPI when organised, or for each
 * member still standing.
 * @param {ChatMessage} message
 * @param {string} order One of GROUP_ORDER.
 */
async function rollGroup(message, order) {
	const uuids = message.getFlag(SYSTEM_ID, "moraleGroup")?.actors ?? [];
	const members = uuids.map((uuid) => fromUuidSync(uuid)).filter((actor) => actor?.isOwner).map((actor) => ({ actor, down: downOf(actor) }));
	const standing = members.filter((member) => !member.down);
	if (!standing.length) return warn("morale.group.noneStanding");

	let leader = null;
	if (order === "organised") {
		const chosen = standing.length === 1 ? standing[0].actor : await chooseLeader(standing.map((member) => member.actor));
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
	const npcs = actors.filter((actor) => actor?.type === "npc");
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
	const turns = combat.turns.map((combatant) => ({ broken: combatant.actor?.system?.moraleBroken ?? "" }));
	if (skipsBrokenTurn(turns, combat.turn)) await combat.nextTurn();
}

/**
 * Wire up Morale buttons on Damage cards and group prompts.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
function activateMoraleButtons(message, html) {
	if (!html.querySelector(MORALE_BUTTONS)) return;
	onCardClick(html, MORALE_BUTTONS, async (button) => {
		if (button.dataset.moraleRoll) await rollFor(button.dataset.moraleRoll);
		else if (GROUP_ORDER.includes(button.dataset.moraleGroup)) await rollGroup(message, button.dataset.moraleGroup);
		else if (button.dataset.moraleBreak) await breakFrom(button);
	});
}

/**
 * Mark whoever a failed Morale card stood for, as its button says.
 * @param {HTMLElement} button
 */
async function breakFrom(button) {
	const actors = (button.dataset.actors ?? "").split(",").filter(Boolean).map((uuid) => fromUuidSync(uuid)).filter(Boolean);
	if (!actors.length) return warn("morale.gone");
	return breakMorale(actors, button.dataset.moraleBreak);
}

/** Called during init. */
export function registerMoraleCards() {
	Hooks.on("renderChatMessageHTML", activateMoraleButtons);
	// Round 0 becoming 1 is a turn change too, as Surprise finds.
	Hooks.on("combatTurnChange", (combat) => skipBrokenMorale(combat));
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
