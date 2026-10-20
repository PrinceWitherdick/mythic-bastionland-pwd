import { VIRTUES } from "../rules/virtues.js";
import { applyMessageMode, currentMessageMode } from "../compat.js";
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
 * @param {object} [options.speaker] Who speaks instead, such as a Seer who has no Actor.
 * @returns {Promise<ChatMessage>}
 */
export async function postCard(actor, template, context, { rolls = [], mode, flags, speaker } = {}) {
	const content = await foundry.applications.handlebars.renderTemplate(templatePath(`chat/${template}.hbs`), context);
	const data = {
		// Without an actor, Foundry would speak for whichever Token is selected.
		speaker: speaker ?? (actor ? ChatMessage.implementation.getSpeaker({ actor }) : { alias: game.user.name }),
		content,
		rolls
	};
	if (flags) data.flags = flags;
	if (rolls.length) data.sound = CONFIG.sounds.dice;
	applyMessageMode(data, mode ?? currentMessageMode());
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
 * Each Virtue's abbreviation, and GD's as `guard`, for formatStatLine.
 * @returns {Record<string, string>}
 */
export function statLabels() {
	return {
		...Object.fromEntries(VIRTUES.map((key) => [key, t(`virtues.${key}.abbr`)])),
		guard: t("guard.abbr")
	};
}

/**
 * Warn this user with a localized string.
 * @param {string} key   Path below `bastionland.`
 * @param {object} [data]
 */
export const warn = (key, data) => ui.notifications.warn(t(key, data));

/**
 * A localized string that reads for its count, taking the key's "One" sibling
 * when there is just the one of whatever it counts.
 * @param {string} key   Path below `bastionland.`, whose singular is the same with "One" on the end.
 * @param {number} count
 * @returns {string}
 */
export const plural = (key, count) => t(count === 1 ? `${key}One` : key, { count });

/**
 * A list of keys as a window offers them to be picked between: each with the
 * words kept under its own key, and one of them marked as already chosen.
 * @param {readonly string[]} keys
 * @param {string} path Where their words are kept, such as "explore.search.aims".
 * @param {object} [options]
 * @param {"checked"|"selected"|"active"} [options.mark] What marks the chosen one: `checked` for a
 *   radio, `selected` for a drop-down, `active` for a row of buttons.
 * @param {string} [options.chosen] Which is chosen, the first of them by default.
 * @param {boolean} [options.hint]  Whether each carries the book's own line about it.
 * @returns {object[]}
 */
export function keyChoices(keys, path, { mark = "checked", chosen = keys[0], hint = true } = {}) {
	return keys.map((key) => ({
		key,
		label: t(`${path}.${key}.label`),
		...(hint ? { hint: t(`${path}.${key}.hint`) } : {}),
		[mark]: key === chosen
	}));
}

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
			await handler(button, event);
		} finally {
			button.disabled = false;
		}
	});
}

/**
 * Wire up one kind of card's buttons wherever chat draws it. A card module says
 * what marks its own buttons and what pressing one does; a card that carries
 * none of them is left alone. Called during init.
 * @param {object} card
 * @param {string} card.selector   What marks its buttons, such as "[data-fallen-path]".
 * @param {boolean} [card.gmOnly]  Whether they're the Referee's alone, as a card whispered to them is:
 *   anybody else who sees the card, such as a player who asked for it, sees it without them.
 * @param {(button: HTMLElement, message: ChatMessage) => unknown} card.handler What a press does.
 * @param {boolean} [card.once]    Whether each button does its work once only: a press whose handler
 *   returns something truthy is kept on the message, and the button is gone from then on, for everybody.
 * @returns {void}
 */
export function registerCardButtons({ selector, gmOnly = false, handler, once = false }) {
	if (once) {
		CONFIG.queries[SPEND_QUERY] ??= onSpendQuery;
		if (!gmOnly) askedSpends.add(selector);
	}
	Hooks.on("renderChatMessageHTML", (message, html) => {
		if (!html.querySelector(selector)) return;
		if (gmOnly && !game.user.isGM) return dropButtons(html, selector);
		if (!once) return onCardClick(html, selector, (button) => handler(button, message));
		const spent = spentButtons(message);
		const keys = new Map([...html.querySelectorAll(selector)].map((button, index) => [button, `${selector}#${index}`]));
		dropButtons(html, selector, (button) => spent.includes(keys.get(button)));
		onCardClick(html, selector, async (button) => {
			const key = keys.get(button);
			if (spentButtons(message).includes(key)) return;
			// Nobody could keep it spent, so it would do its work again after a reload.
			if (!message.isOwner && !game.users.activeGM) return warn("cardButtons.needsGM");
			if (await handler(button, message)) await spendButton(message, key);
		});
	});
}

/** Where a card keeps the buttons that have done their work for good. */
const SPENT_FLAG = "spentButtons";

/** The GM query that keeps a pressed button on a card its presser can't update. */
const SPEND_QUERY = `${SYSTEM_ID}.spendButton`;

/**
 * @param {ChatMessage} message
 * @returns {string[]} The keys of its buttons that have done their work.
 */
const spentButtons = (message) => message?.flags?.[SYSTEM_ID]?.[SPENT_FLAG] ?? [];

/**
 * Keep on a card that one of its buttons has done its work, asking the active
 * GM where the presser can't update the card.
 * @param {ChatMessage} message
 * @param {string} key
 * @returns {Promise<unknown>}
 */
function spendButton(message, key) {
	if (message.isOwner) return message.setFlag(SYSTEM_ID, SPENT_FLAG, [...new Set([...spentButtons(message), key])]);
	return game.users.activeGM?.query(SPEND_QUERY, { messageId: message.id, key });
}

/**
 * The selectors, as a key begins, of the once-only buttons somebody besides
 * the Referee may press. The Referee can update any card, so never asks.
 * @type {Set<string>}
 */
const askedSpends = new Set();

/**
 * Whether a user sees a card, and so its buttons: a whisper only its author
 * and those it's whispered to.
 * @param {ChatMessage} message
 * @param {User} user
 * @returns {boolean}
 */
const seesCard = (message, user) => !message.whisper?.length || message.author?.id === user.id || message.whisper.includes(user.id);

/**
 * A user's press of a once-only button, kept for them by the active GM. A
 * button only the Referee has is never spent by asking, nor one on a card the
 * asker can't see. Foundry 13 doesn't say who asked, so there only the first holds.
 * @param {{messageId: string, key: string}} data
 * @param {{user?: User}} [context] Who asked, from Foundry 14.
 * @returns {Promise<boolean>}
 */
async function onSpendQuery({ messageId, key } = {}, { user } = {}) {
	const message = game.messages.get(messageId);
	if (!message || typeof key !== "string" || !askedSpends.has(key.slice(0, key.lastIndexOf("#")))) return false;
	if (user && !seesCard(message, user)) return false;
	await spendButton(message, key);
	return true;
}

/**
 * Take buttons off a card, and the row that held them once it's empty.
 * @param {HTMLElement} html
 * @param {string} selector
 * @param {(button: HTMLElement) => boolean} [which] Those of them to take off, all by default.
 */
function dropButtons(html, selector, which = () => true) {
	for (const button of [...html.querySelectorAll(selector)].filter(which)) {
		const row = button.closest(".bastionland-card__actions");
		button.remove();
		if (row && !row.querySelector("button")) row.remove();
	}
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
 * @param {(message: ChatMessage, change: object) => object} [options.alsoUpdate] More of the
 *   message a change updates, such as the rolls another combatant adds to an Attack card.
 */
export function statefulCard({ flag, query, notices, change, render, queryable = () => true, alsoUpdate = () => ({}) }) {
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
		await message.update({ ...alsoUpdate(message, delta), content: await render(state), [`flags.${SYSTEM_ID}.${flag}`]: state });
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
