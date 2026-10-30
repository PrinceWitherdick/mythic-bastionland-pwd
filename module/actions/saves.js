import { confirmDialog } from "../apps/ui.js";
import { postCard, t } from "../chat/cards.js";
import { abilitiesWith, etchedNumber } from "../rules/ability-uses.js";
import { dieMask } from "../rules/die-shapes.js";
import { BREAK_ICONS, MORALE_BREAKS, isMoraleBreak } from "../rules/morale.js";
import { downBy, isSavePassed } from "../rules/virtues.js";
import { isKnight } from "../rules/knight-types.js";
import { playerCharacter } from "./knights.js";

/**
 * @typedef {object} SaveResult
 * @property {string} virtue  "vig", "cla" or "spi".
 * @property {number} value   The Virtue the d20 had to meet.
 * @property {Roll} roll
 * @property {boolean} passed
 */

/**
 * Roll a Save without posting it, so callers such as Feats can fold the result
 * into their own chat card.
 * @param {Actor} actor
 * @param {string} virtue
 * @returns {Promise<SaveResult>}
 */
export async function evaluateSave(actor, virtue) {
	return turnedByRune(actor, await saveAgainst(virtue, actor.system.virtues[virtue].value));
}

/**
 * A Save whose d20 shows the number its roller's rune is etched for may be
 * turned to another face as it's rolled, spending one of the rune's turns
 * (p100), before anything is made of it. Only whoever plays the Knight is
 * asked: a GM rolling for a Knight whose player is here, as Surprise does for
 * everyone at once, lets the die stand.
 * @param {Actor} actor Whoever rolled it.
 * @param {SaveResult} save
 * @returns {Promise<SaveResult>} The Save as it stands once turned, or as rolled.
 */
async function turnedByRune(actor, save) {
	if (!isKnight(actor) || !actor.isOwner) return save;
	if (game.user?.isGM && game.users?.some((user) => user.active && !user.isGM && actor.testUserPermission(user, "OWNER"))) return save;
	const rune = abilitiesWith(actor.items?.contents ?? [], "sigil").find((item) => etchedNumber(item.system) === save.roll.total);
	if (!rune) return save;
	// Fetched only for a rune that could turn it, since the Ability actions reach far beyond Saves.
	const { turnSaveDie } = await import("./abilities.js");
	const face = await turnSaveDie(actor, rune, save.roll.total);
	return face === null ? save : { ...save, roll: d20Showing(face), passed: isSavePassed(face, save.value) };
}

/**
 * @param {string} virtue
 * @param {number} value
 * @param {number|null} [rolled] The d20 when it was rolled at the table instead.
 * @returns {Promise<SaveResult>}
 */
async function saveAgainst(virtue, value, rolled = null) {
	const roll = rolled === null ? await new Roll("1d20").evaluate() : d20Showing(rolled);
	return { virtue, value, roll, passed: isSavePassed(roll.total, value) };
}

/**
 * A d20 that was rolled at the table rather than here, so the card and the
 * dice in chat show the face the player read out.
 * @param {number} face 1 to 20.
 * @returns {Roll}
 */
function d20Showing(face) {
	const data = new Roll("1d20").toJSON();
	Object.assign(data.terms[0], { results: [{ result: face, active: true }], evaluated: true });
	return Roll.fromData({ ...data, total: face, evaluated: true });
}


/**
 * Template data for the `bastionland.save-result` partial.
 * @param {SaveResult} save
 */
export function saveContext(save) {
	return {
		label: t("save.title", { virtue: t(`virtues.${save.virtue}.label`) }),
		target: t("save.target", { value: save.value }),
		total: save.roll.total,
		// A Save is always rolled on a d20 (p9), so the card draws one behind the result.
		shape: dieMask(20),
		passed: save.passed,
		result: t(save.passed ? "save.pass" : "save.fail")
	};
}

/**
 * Roll a Save and post it to chat.
 * @param {Actor} actor
 * @param {string} virtue
 * @returns {Promise<SaveResult>}
 */
export async function rollSave(actor, virtue) {
	const save = await evaluateSave(actor, virtue);
	await postCard(actor, "save", { save: saveContext(save) }, { rolls: [save.roll] });
	return save;
}

/**
 * A Save made for a named reason, posted as a card that says what it was for
 * and what came of it. Morale, a Reaction and a search all read this way, so
 * the card is built in the one place.
 * @param {Actor} actor
 * @param {string} virtue One of VIRTUES.
 * Whatever turns on the Save itself — usually whether it was made — is given as
 * a function of the result rather than a finished line.
 * @param {object} words
 * @param {string} words.label   What the Save was for, as its heading.
 * @param {string|((save: SaveResult) => string)} words.outcome  What came of it.
 * @param {string|((save: SaveResult) => string)|null} [words.hint] A line of the book's own guidance.
 * @param {object} [options]
 * @param {number|null} [options.rolled] The d20 when it was rolled at the table instead.
 * @param {((save: SaveResult) => object)|null} [options.extra] More for the card, such as buttons offered on how it went.
 * @returns {Promise<SaveResult>}
 */
export async function rollLabelledSave(actor, virtue, { label, outcome, hint = null }, { rolled = null, extra = null } = {}) {
	const save = await turnedByRune(actor, await saveAgainst(virtue, actor.system.virtues[virtue].value, rolled));
	const read = (words) => (typeof words === "function" ? words(save) : words);
	await postCard(actor, "save", {
		save: { ...saveContext(save), label },
		outcome: read(outcome),
		hint: read(hint),
		...extra?.(save)
	}, { rolls: [save.roll] });
	return save;
}

/**
 * Whether a failed Morale Save can mark somebody fled or surrendered: an NPC,
 * or a Knight the Referee plays. Morale doesn't affect player characters (p10).
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
export const keepsMoraleMark = (actor) => actor?.type === "npc" || (isKnight(actor) && !playerCharacter(actor));

/**
 * The buttons a failed Morale Save offers, to mark whoever it stood for as
 * fled or surrendered. Only those keepsMoraleMark says yes to keep the mark.
 * @param {Actor[]} group
 * @returns {{actors: string, choices: object[]}|null} `actors` their UUIDs, comma-separated. Null with no NPC among them.
 */
export function moraleBreakButtons(group) {
	const npcs = group.filter(keepsMoraleMark);
	if (!npcs.length) return null;
	return {
		actors: npcs.map((member) => member.uuid).join(","),
		choices: MORALE_BREAKS.map((key) => ({
			key,
			icon: BREAK_ICONS[key],
			label: t(`morale.broke.${key}.label`),
			hint: t(npcs.length === 1 ? `morale.broke.${key}.hintOne` : `morale.broke.${key}.hint`)
		}))
	};
}

/**
 * Whoever leads a Warband from the front, and so makes its Morale Save on
 * their own SPI: an organised group rolls once using its leader's (p10, p11).
 * Only a leader still on their feet, and not broken themself, leads it.
 * @param {Actor} actor
 * @returns {Actor|null} Null for anybody but a Warband led that way.
 */
export function moraleLeaderOf(actor) {
	if (actor?.system?.scale !== "warband" || !actor.system.leader) return null;
	const leader = fromUuidSync(actor.system.leader);
	if (!leader?.system?.virtues?.spi || leader.uuid === actor.uuid || downBy(leader.system) || isMoraleBreak(leader.system.moraleBroken)) return null;
	return leader;
}

/**
 * Roll Morale: a SPI Save to stand rather than rout or surrender (Wavering
 * Morale, p10). A failed Save offers to mark who broke as fled or
 * surrendered, which takes them out of the fight until cleared. A Warband led
 * from the front rolls on its leader's SPI, and only the Warband is marked.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {Actor[]} [options.group] Everybody the roll stands for, as an organised group's
 *   leader rolls for them all. Themself alone by default.
 * @returns {Promise<SaveResult>}
 */
export async function rollMorale(actor, { group = [actor] } = {}) {
	const leader = moraleLeaderOf(actor);
	return rollLabelledSave(leader ?? actor, "spi", {
		label: t("morale.title"),
		outcome: ({ passed }) => t(passed ? "morale.holds" : "morale.breaks"),
		hint: leader ? t("morale.ledHint", { warband: actor.name, leader: leader.name }) : t("morale.hint")
	}, { extra: ({ passed }) => (passed ? {} : { breaks: moraleBreakButtons(group) }) });
}

/**
 * Reaction (p8): how someone takes something follows from the moment,
 * and when the Referee is uncertain how one takes something, a SPI Save says
 * whether the reaction is unfavourable.
 * @param {Actor} actor
 * @returns {Promise<SaveResult>}
 */
export async function rollReaction(actor) {
	return rollLabelledSave(actor, "spi", {
		label: t("reaction.title"),
		outcome: ({ passed }) => t(passed ? "reaction.favourable" : "reaction.unfavourable"),
		hint: t("reaction.hint")
	});
}

/**
 * Whether the GM accepts what an NPC sheet's button does once told it: Rest,
 * Morale and Reaction, which have no rules beside them to say so.
 * @param {Actor} actor
 * @param {string} key Where its words are kept: `${key}Title`, `${key}Intro` and `${key}What`.
 * @param {string} icon Font Awesome classes, as its button has.
 * @param {object} values What `${key}What` is filled in with.
 * @param {string} [what] Another key for what it does, where this time it does something else.
 * @returns {Promise<boolean>}
 */
export function acceptAfterTelling(actor, key, icon, values, what = `${key}What`) {
	return confirmDialog({
		title: t(`${key}Title`, { name: actor.name }),
		icon,
		message: [t(`${key}Intro`, { name: foundry.utils.escapeHTML(actor.name) }), t(what, values)],
		yes: { label: t("sheet.accept") }
	});
}

/**
 * Whether the GM accepts a SPI Save once told what it does.
 * @param {Actor} actor
 * @param {"morale"|"reaction"} key Where its words are kept.
 * @param {string} icon
 * @returns {Promise<boolean>}
 */
const acceptedSave = (actor, key, icon) => acceptAfterTelling(actor, `${key}.ask`, icon, { value: actor.system.virtues.spi.value });

/**
 * Roll Morale once the GM has read what it does and accepted.
 * @param {Actor} actor
 * @returns {Promise<SaveResult|null>} Null when it wasn't accepted.
 */
export async function rollMoraleIfAccepted(actor) {
	// A Warband led from the front rolls on its leader's SPI (p10, p11).
	const leader = moraleLeaderOf(actor);
	const accepted = leader
		? await acceptAfterTelling(actor, "morale.ask", "fa-solid fa-flag", { value: leader.system.virtues.spi.value, leader: foundry.utils.escapeHTML(leader.name) }, "morale.askLedWhat")
		: await acceptedSave(actor, "morale", "fa-solid fa-flag");
	return accepted ? rollMorale(actor) : null;
}

/**
 * Roll a Reaction once the GM has read what it does and accepted.
 * @param {Actor} actor
 * @returns {Promise<SaveResult|null>} Null when it wasn't accepted.
 */
export async function rollReactionIfAccepted(actor) {
	return (await acceptedSave(actor, "reaction", "fa-solid fa-comments")) ? rollReaction(actor) : null;
}
