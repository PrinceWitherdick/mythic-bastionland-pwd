import { attackMarks, markLapsed } from "../rules/gambit-marks.js";
import { SYSTEM_ID } from "../system-id.js";
import { t } from "./cards.js";

/**
 * Reading the marks that landed Gambits hold over somebody, off the Attack
 * cards that bought them (Gambits, p10). Nothing is written to the marked
 * actor, so a Gambit taken back or Saved against takes its mark with it.
 */

/** How far back in the chat log a mark could still be holding. */
const SCANNED_MESSAGES = 200;

/**
 * Where the running Combat stands.
 * @returns {{combat: string, round: number, turn: number}|null} Null when none is running.
 */
export function combatPlace() {
	const combat = game.combat;
	if (!combat?.started) return null;
	return { combat: combat.id, round: combat.round ?? 0, turn: combat.turn ?? 0 };
}

/**
 * Where everyone in the running Combat stands, read once rather than scanned
 * per Attack card.
 * @param {Combat|null} combat
 * @returns {Map<string, number>} Actor UUID to their place in the turn order.
 */
function turnOrder(combat) {
	const places = new Map();
	(combat?.turns ?? []).forEach((combatant, index) => {
		const uuid = combatant.actor?.uuid;
		if (uuid && !places.has(uuid)) places.set(uuid, index);
	});
	return places;
}

/**
 * @param {import("../rules/attack.js").AttackState} attack
 * @param {Actor} actor
 * @returns {boolean} Whether the Attack was aimed at this actor.
 */
function targeted(attack, actor) {
	return (attack.targets ?? []).some(({ uuid }) => fromUuidSync(uuid)?.actor?.uuid === actor.uuid);
}

/**
 * The marks still holding over an actor, newest last.
 * @param {Actor} actor
 * @returns {(import("../rules/gambit-marks.js").Mark & {messageId: string, label: string, hint: string})[]}
 */
export function marksOn(actor) {
	if (!actor?.uuid || !game.messages) return [];
	const now = combatPlace();
	const combat = now ? game.combat : null;
	const places = turnOrder(combat);
	const ownTurn = places.get(actor.uuid) ?? null;
	const marks = [];
	const log = game.messages.contents;
	for (let i = Math.max(0, log.length - SCANNED_MESSAGES); i < log.length; i++) {
		const message = log[i];
		const attack = message.flags?.[SYSTEM_ID]?.attack;
		if (!attack?.gambits?.length || !targeted(attack, actor)) continue;
		const attackerTurn = places.get(attack.attacker) ?? null;
		for (const mark of attackMarks(attack, { ownTurn, attackerTurn })) {
			if (markLapsed(mark, now)) continue;
			const name = mark.by || t("gambits.marks.someone");
			marks.push({
				...mark,
				messageId: message.id,
				label: t(`gambits.names.${mark.key}`),
				hint: t(`gambits.marks.${mark.key}`, { name })
			});
		}
	}
	return marks;
}

/**
 * Redraw the sheets of whoever an Attack marked, since the pills are read off
 * the chat log rather than kept on the actor.
 * @param {ChatMessage} message
 */
function refreshMarked(message) {
	const attack = message.flags?.[SYSTEM_ID]?.attack;
	if (!attack?.gambits?.length) return;
	for (const { uuid } of attack.targets ?? []) {
		const actor = fromUuidSync(uuid)?.actor;
		if (actor?.sheet?.rendered) actor.sheet.render(false);
	}
}

/** Called during init. */
export function registerGambitMarks() {
	Hooks.on("createChatMessage", refreshMarked);
	Hooks.on("updateChatMessage", refreshMarked);
	// A mark lapses by the turn order, so every combatant's sheet redraws as the turn moves on.
	// Only the turn moving matters: a Combat is updated for initiative and flags too.
	Hooks.on("updateCombat", (combat, changes) => {
		if (!("turn" in changes) && !("round" in changes)) return;
		for (const combatant of combat.turns ?? []) {
			if (combatant.actor?.sheet?.rendered) combatant.actor.sheet.render(false);
		}
	});
}
