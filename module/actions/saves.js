import { postCard, t } from "../chat/cards.js";
import { dieMask } from "../rules/die-shapes.js";
import { BREAK_ICONS, MORALE_BREAKS } from "../rules/morale.js";
import { isSavePassed } from "../rules/virtues.js";

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
	return saveAgainst(virtue, actor.system.virtues[virtue].value);
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
 * Roll a Save for someone with no Actor of their own, such as the Seer who
 * knighted a Knight, whose Virtues are printed only on their Knight's page.
 * The card is spoken in their name.
 * @param {string} name
 * @param {string} virtue
 * @param {number} value
 * @returns {Promise<SaveResult>}
 */
export async function rollSaveFor(name, virtue, value) {
	const save = await saveAgainst(virtue, value);
	// Not getSpeaker, which would speak for whichever Token is selected.
	await postCard(null, "save", { save: saveContext(save) }, { rolls: [save.roll], speaker: { alias: name } });
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
	const save = await saveAgainst(virtue, actor.system.virtues[virtue].value, rolled);
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
 * The buttons a failed Morale Save offers, to mark whoever it stood for as
 * fled or surrendered. Only NPCs keep the mark, since Morale doesn't affect
 * player characters (p10).
 * @param {Actor[]} group
 * @returns {{actors: string, choices: object[]}|null} `actors` their UUIDs, comma-separated. Null with no NPC among them.
 */
export function moraleBreakButtons(group) {
	const npcs = group.filter((member) => member?.type === "npc");
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
 * Roll Morale: a SPI Save to stand rather than rout or surrender (Wavering
 * Morale, p10). A failed Save offers to mark who broke as fled or
 * surrendered, which takes them out of the fight until cleared.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {Actor[]} [options.group] Everybody the roll stands for, as an organised group's
 *   leader rolls for them all. Themself alone by default.
 * @returns {Promise<SaveResult>}
 */
export async function rollMorale(actor, { group = [actor] } = {}) {
	return rollLabelledSave(actor, "spi", {
		label: t("morale.title"),
		outcome: ({ passed }) => t(passed ? "morale.holds" : "morale.breaks"),
		hint: t("morale.hint")
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
