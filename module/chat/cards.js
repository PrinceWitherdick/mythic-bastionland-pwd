import { SYSTEM_ID, templatePath } from "../system-id.js";

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
 * @param {object} [options.flags] Flags to store on the message, such as an Attack card's state.
 * @returns {Promise<ChatMessage>}
 */
export async function postCard(actor, template, context, { rolls = [], mode, flags } = {}) {
	const content = await foundry.applications.handlebars.renderTemplate(templatePath(`chat/${template}.hbs`), context);
	const data = {
		// Without an actor, Foundry would speak for whichever Token is selected.
		speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : { alias: game.user.name },
		content,
		rolls
	};
	if (flags) data.flags = flags;
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

/**
 * Warn this user with a localized string.
 * @param {string} key   Path below `bastionland.`
 * @param {object} [data]
 */
export const warn = (key, data) => ui.notifications.warn(t(key, data));

/**
 * Handle clicks on a card's buttons, holding each button disabled until its
 * handler finishes so a double click doesn't act twice.
 * @param {HTMLElement} element  The card, or the message holding it.
 * @param {string} selector      Matches the buttons.
 * @param {(button: HTMLElement) => Promise<unknown>} handler
 */
export function onCardClick(element, selector, handler) {
	element.addEventListener("click", async (event) => {
		const button = event.target.closest(selector);
		if (!button || button.disabled) return;
		event.preventDefault();
		button.disabled = true;
		try {
			await handler(button);
		} finally {
			button.disabled = false;
		}
	});
}

/**
 * A card that keeps its state in a flag and re-renders as it changes. Only a
 * message's author and GMs can update it, so a user who can't asks the active
 * GM to record the change, through a query the caller registers.
 * @template State
 * @param {object} options
 * @param {string} options.flag    Key of the state under the system's flags.
 * @param {string} options.query   Name of the GM query.
 * @param {string} options.notices Path below `bastionland.` holding `needsGM` and `changeRefused`.
 * @param {(state: State, change: object) => State|null} options.change Null if the card no longer allows the change.
 * @param {(state: State) => Promise<string>} options.render The card's HTML.
 * @param {(change: object) => boolean} [options.queryable] Whether a user may ask the GM for this change.
 */
export function statefulCard({ flag, query, notices, change, render, queryable = () => true }) {
	/**
	 * @param {ChatMessage|undefined} message
	 * @returns {State|null}
	 */
	const stateOf = (message) => message?.flags?.[SYSTEM_ID]?.[flag] ?? null;

	/**
	 * @param {ChatMessage} message
	 * @param {object} delta
	 * @returns {Promise<boolean>} False if the card no longer allows the change.
	 */
	async function commit(message, delta) {
		const state = change(stateOf(message), delta);
		if (!state) return false;
		await message.update({ content: await render(state), [`flags.${SYSTEM_ID}.${flag}`]: state });
		return true;
	}

	/**
	 * Record a change on the card, asking the GM when this user can't.
	 * @param {ChatMessage} message
	 * @param {object} delta
	 * @returns {Promise<boolean>} Whether it was recorded.
	 */
	async function save(message, delta) {
		let saved = false;
		if (message.isOwner) saved = await commit(message, delta);
		else if (queryable(delta)) {
			if (!game.users.activeGM) {
				warn(`${notices}.needsGM`);
				return false;
			}
			saved = await game.users.activeGM.query(query, { messageId: message.id, change: delta });
		}
		if (!saved) warn(`${notices}.changeRefused`);
		return Boolean(saved);
	}

	return { stateOf, commit, save };
}
