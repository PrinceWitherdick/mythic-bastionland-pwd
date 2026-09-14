import { templatePath } from "../system-id.js";

/**
 * Post a chat card spoken by an actor. Rolls ride along on the message so
 * dice animations and roll tooltips work, and the user's chosen message mode
 * (public, private, blind, self) is respected.
 *
 * @param {Actor} actor
 * @param {string} template  Name of a file in templates/chat, without extension.
 * @param {object} context   Data for the template.
 * @param {object} [options]
 * @param {Roll[]} [options.rolls]
 * @returns {Promise<ChatMessage>}
 */
export async function postCard(actor, template, context, { rolls = [] } = {}) {
	const content = await foundry.applications.handlebars.renderTemplate(templatePath(`chat/${template}.hbs`), context);
	const data = {
		speaker: ChatMessage.implementation.getSpeaker({ actor }),
		content,
		rolls
	};
	if (rolls.length) data.sound = CONFIG.sounds.dice;
	ChatMessage.implementation.applyMode(data, game.settings.get("core", "messageMode"));
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
