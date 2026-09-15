import { templatePath } from "../system-id.js";

/**
 * Post a chat card spoken by an actor. Rolls ride along on the message so
 * dice animations and roll tooltips work, and the user's chosen message mode
 * (public, private, blind, self) is respected.
 *
 * @param {Actor|null} actor Null for a card from the user themself, such as the GM's Realm cards.
 * @param {string} template  Name of a file in templates/chat, without extension.
 * @param {object} context   Data for the template.
 * @param {object} [options]
 * @param {Roll[]} [options.rolls]
 * @param {string} [options.mode] A message mode such as "gm", used instead of the user's choice.
 * @returns {Promise<ChatMessage>}
 */
export async function postCard(actor, template, context, { rolls = [], mode } = {}) {
	const content = await foundry.applications.handlebars.renderTemplate(templatePath(`chat/${template}.hbs`), context);
	const data = {
		// Without an actor, Foundry would speak for whichever Token is selected.
		speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : { alias: game.user.name },
		content,
		rolls
	};
	if (rolls.length) data.sound = CONFIG.sounds.dice;
	ChatMessage.implementation.applyMode(data, mode ?? game.settings.get("core", "messageMode"));
	return ChatMessage.implementation.create(data);
}

/**
 * Shorthand for a localized string under the system's namespace.
 * @param {string} key   Path below `bastionland.`
 * @param {object} [data] Values for `{placeholders}`.
 * @returns {string}
 */
export function t(key, data) {
	const path = `bastionland.${key}`;
	return data ? game.i18n.format(path, data) : game.i18n.localize(path);
}
