import { rollMorale } from "../actions/saves.js";
import { GROUP_ORDER, groupHalved, isDown, moraleRollers } from "../rules/morale.js";
import { SYSTEM_ID } from "../system-id.js";
import { onCardClick, postCard, t, warn } from "./cards.js";

/**
 * Wavering Morale prompts (p10). A Damage card asks a Wounded NPC for its
 * Morale Save, and GMs are told when half of a side in combat is down, with
 * buttons to roll for the group the way the book describes.
 */

/** Combat flag listing the Token dispositions whose groups have already been asked. */
const PROMPTED_FLAG = "moralePrompted";

/** Morale buttons on Damage cards and group prompts. */
const MORALE_BUTTONS = "[data-morale-roll], [data-morale-group]";

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
	return {
		combatant,
		actor,
		down: isDown({ vigour: actor.system.virtues.vig.value, mortalWound: actor.system.mortalWound, defeated: combatant.isDefeated })
	};
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
	const combat = game.combats.find((candidate) => candidate.combatants.some((combatant) => combatant.actor?.uuid === actor.uuid));
	const own = combat?.combatants.find((combatant) => combatant.actor?.uuid === actor.uuid);
	const disposition = own?.token?.disposition;
	if (disposition === undefined) return null;

	const prompted = combat.getFlag(SYSTEM_ID, PROMPTED_FLAG) ?? [];
	if (prompted.includes(disposition)) return null;

	const members = combat.combatants.filter((combatant) => combatant.token?.disposition === disposition && wavers(combatant)).map(memberOf);
	if (!groupHalved(members)) return null;

	await combat.setFlag(SYSTEM_ID, PROMPTED_FLAG, [...prompted, disposition]);
	const standing = members.filter((member) => !member.down);
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
	const members = uuids.map((uuid) => fromUuidSync(uuid)).filter((actor) => actor?.isOwner).map((actor) => ({
		actor,
		down: isDown({ vigour: actor.system.virtues.vig.value, mortalWound: actor.system.mortalWound })
	}));
	const standing = members.filter((member) => !member.down);
	if (!standing.length) return warn("morale.group.noneStanding");

	let leader = null;
	if (order === "organised") {
		const chosen = standing.length === 1 ? standing[0].actor : await chooseLeader(standing.map((member) => member.actor));
		if (!chosen) return;
		leader = standing.find((member) => member.actor === chosen);
	}
	for (const { actor } of moraleRollers(members, { order, leader })) await rollMorale(actor);
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
	});
}

/** Called during init. */
export function registerMoraleCards() {
	Hooks.on("renderChatMessageHTML", activateMoraleButtons);
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
