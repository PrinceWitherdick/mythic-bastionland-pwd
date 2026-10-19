import { attackMarks, markLapsed } from "../rules/gambit-marks.js";
import { SYSTEM_ID } from "../system-id.js";
import { t } from "./cards.js";

/**
 * Reading the marks that landed Gambits hold over somebody, off the Attack
 * cards that bought them (Gambits, p10). Nothing is written to the marked
 * actor, so a Gambit taken back or Saved against takes its mark with it.
 */

/** How far back in the chat log a mark could still be holding. */
export const SCANNED_MESSAGES = 200;

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
 * Each actor's marks as last read, by their UUID, with where the Combat stood
 * then. A sheet drawn again for a change to its actor reads them from here;
 * any change to the chat log, the turn order or the Tokens forgets them all.
 * @type {Map<string, {place: string, marks: object[]}>}
 */
const kept = new Map();

/**
 * Where the Combat stands, and how long the chat log is, so a card posted or
 * deleted is read whichever hook asks first.
 * @param {{combat: string, round: number, turn: number}|null} now
 */
const placeKey = (now) => `${now ? `${now.combat}:${now.round}:${now.turn}` : ""}#${game.messages.size}`;

/**
 * @param {object[]} marks
 * @returns {string} What a sheet shows of them, to tell whether a turn moving on changed it.
 */
const shownMarks = (marks) => marks.map((mark) => `${mark.messageId}/${mark.index}/${mark.hint}`).join("|");

/**
 * The marks still holding over an actor, newest last.
 * @param {Actor} actor
 * @returns {(import("../rules/gambit-marks.js").Mark & {messageId: string, label: string, hint: string})[]}
 */
export function marksOn(actor) {
	if (!actor?.uuid || !game.messages) return [];
	const now = combatPlace();
	const place = placeKey(now);
	const read = kept.get(actor.uuid);
	if (read?.place === place) return [...read.marks];
	const marks = readMarks(actor, now);
	kept.set(actor.uuid, { place, marks });
	return [...marks];
}

/**
 * @param {Actor} actor
 * @param {{combat: string, round: number, turn: number}|null} now
 * @returns {object[]} The marks holding over them, read off the chat log.
 */
function readMarks(actor, now) {
	const combat = now ? game.combat : null;
	const places = turnOrder(combat);
	const ownTurn = places.get(actor.uuid) ?? null;
	const marks = [];
	const log = game.messages.contents;
	for (let i = Math.max(0, log.length - SCANNED_MESSAGES); i < log.length; i++) {
		const message = log[i];
		const attack = message.flags?.[SYSTEM_ID]?.attack;
		if (!attack?.gambits?.length || !targeted(attack, actor)) continue;
		// A Trap lapses as its payer's next turn begins, who in a joint Attack may not be the attacker.
		const turnOf = (uuid) => places.get(uuid) ?? null;
		for (const mark of attackMarks(attack, { ownTurn, turnOf })) {
			if (markLapsed(mark, now)) continue;
			// An Impair on one foe's weapon, from a card aimed at several, holds nobody else.
			if (mark.weapon?.actor && mark.weapon.actor !== actor.uuid) continue;
			const name = mark.by || t("gambits.marks.someone");
			marks.push({
				...mark,
				messageId: message.id,
				label: t(`gambits.names.${mark.key}`),
				hint: mark.weapon
					? t("gambits.marks.impairWeapon", { name, weapon: mark.weapon.name })
					: t(`gambits.marks.${mark.key}`, { name })
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

/**
 * Redraw each combatant's sheet whose marks the turn order moving changed.
 * @param {Combat|null} combat
 * @param {Map<string, {marks: object[]}>} before Each actor's marks as read before it moved.
 * @param {boolean} [every] Redraw every one of them anyway.
 */
function redrawMoved(combat, before, every = false) {
	const seen = new Set();
	for (const combatant of combat?.turns ?? []) {
		const actor = combatant.actor;
		if (!actor?.sheet?.rendered || seen.has(actor.uuid)) continue;
		seen.add(actor.uuid);
		const was = before.get(actor.uuid)?.marks;
		if (every || !was || shownMarks(was) !== shownMarks(marksOn(actor))) actor.sheet.render(false);
	}
}

/** Called during init. */
export function registerGambitMarks() {
	// Whatever the marks are read from: the cards, the turn order, and the Tokens the cards were aimed at.
	const forget = () => kept.clear();
	for (const hook of ["createChatMessage", "updateChatMessage", "deleteChatMessage", "createCombatant", "deleteCombatant", "createToken", "deleteToken"]) {
		Hooks.on(hook, forget);
	}
	Hooks.on("createChatMessage", refreshMarked);
	Hooks.on("updateChatMessage", refreshMarked);
	// A mark lapses by the turn order, so a combatant's sheet redraws as the turn moves on, where
	// that changed its marks. A new round may begin the fight, which shows on every sheet.
	// Only the turn moving matters: a Combat is updated for initiative and flags too.
	Hooks.on("updateCombat", (combat, changes) => {
		if (!("turn" in changes) && !("round" in changes)) return;
		redrawMoved(combat, kept, "round" in changes);
	});
	// So does an initiative rolled or set, which puts the turns in another order. Foundry lays
	// them out again after this hook, so they're read once it has.
	Hooks.on("updateCombatant", (combatant, changes) => {
		const before = new Map(kept);
		kept.clear();
		if (!("initiative" in changes)) return;
		setTimeout(() => {
			kept.clear();
			redrawMoved(combatant.parent, before);
		}, 0);
	});
}
