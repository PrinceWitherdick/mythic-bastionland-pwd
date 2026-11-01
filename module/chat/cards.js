import { VIRTUES } from "../rules/virtues.js";
import { askActiveGM } from "../ask-gm.js";
import { applyMessageMode, currentMessageMode, queryAsker } from "../compat.js";
import { keyedSerialWrites, oncePerKey } from "../rules/queue.js";
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
 *   They work only on a card a GM posted, so a player can't write one for the Referee to press.
 * @param {boolean} [card.fromPlayers] Whether the Referee's buttons work on a card a player posted too,
 *   as Ask the Referee's does.
 * @param {(button: HTMLElement, message: ChatMessage) => unknown} card.handler What a press does.
 * @param {boolean} [card.once]    Whether each button does its work once only. A press is marked on the
 *   message before its handler runs, so nobody else can press it meanwhile, and the mark is taken back
 *   if the handler returns something falsy or throws. The Referee's own (`gmOnly`) buttons are marked
 *   only once the handler returns something truthy. Once kept, the button is gone for everybody.
 *   Buttons sharing a `data-once-group` are one choice: pressing one takes them all off.
 * @param {boolean} [card.oneChoice] Whether all of a card's buttons of this kind are one choice, as if
 *   they shared a `data-once-group`, which works on cards posted before the template said so.
 * @param {(message: ChatMessage, user: User, button: HTMLElement|null) => boolean} [card.mayPress] Whether
 *   somebody besides the Referee may press a once-only button, such as by owning the actor the card names.
 *   Asked on the presser's client, and again by the active GM who keeps the press for them.
 * @returns {void}
 */
export function registerCardButtons({ selector, gmOnly = false, fromPlayers = false, handler, once = false, oneChoice = false, mayPress = () => true }) {
	if (once) {
		CONFIG.queries[SPEND_QUERY] ??= onSpendQuery;
		onceButtons.set(selector, { gmOnly, mayPress });
	}
	Hooks.on("renderChatMessageHTML", (message, html) => {
		if (!html.querySelector(selector)) return;
		if (gmOnly && (!game.user.isGM || !(fromPlayers || message.author?.isGM))) return dropButtons(html, selector);
		if (!once) return onCardClick(html, selector, (button) => handler(button, message));
		const spent = spentButtons(message);
		const keys = new Map([...html.querySelectorAll(selector)].map((button, index) => [button, `${selector}#${index}`]));
		dropButtons(html, selector, (button) => spent.includes(keys.get(button)));
		onCardClick(html, selector, async (button) => {
			// Spent since the card was drawn: it's on its way off, so the press does nothing.
			if (spentButtons(message).includes(keys.get(button))) return;
			// Nobody could keep it spent, so it would do its work again after a reload.
			if (!message.isOwner && !game.users.activeGM) return warn("cardButtons.needsGM");
			if (!gmOnly && !game.user.isGM && !mayPress(message, game.user, button)) return warn("cardButtons.notYours");
			// Each button of a choice is spent with the one pressed, so the others can't be pressed after it, nor while it works.
			const choice = choiceOf(button, [...keys.keys()], oneChoice);
			const choiceKeys = choice.map((other) => keys.get(other));
			for (const other of choice) other.disabled = true;
			try {
				await pressOnce(message, choiceKeys, () => handler(button, message), { gmOnly });
			} finally {
				for (const other of choice) other.disabled = false;
			}
		});
	});
}

/**
 * The buttons spent together with the one pressed: those of its choice.
 * @param {HTMLElement} button
 * @param {HTMLElement[]} buttons All of that kind on the card.
 * @param {boolean} oneChoice Whether they're all one choice.
 * @returns {HTMLElement[]}
 */
function choiceOf(button, buttons, oneChoice) {
	if (oneChoice) return buttons;
	const group = button.dataset?.onceGroup;
	return group ? buttons.filter((other) => other.dataset?.onceGroup === group) : [button];
}

/** The Referee's own once-only presses under way on this client, by message and button key. */
const pressing = oncePerKey();

/**
 * Do the work of a press of the Referee's own buttons, then mark them spent.
 * Nobody else sees them, so this client keeping the press to itself while it
 * works is enough, and a press that comes to nothing writes nothing.
 * @param {ChatMessage} message
 * @param {string[]} keys
 * @param {() => unknown} work The handler.
 * @returns {Promise<void>}
 */
async function pressThenMark(message, keys, work) {
	const held = keys.map((key) => `${message.id} ${key}`);
	await pressing(held, async () => {
		if (await work()) await markButtons(message, keys);
	}, () => warn("cardButtons.alreadyPressed"));
}

/** How many times a press's mark is asked to be taken back, and how long apart, before the presser is told. */
const RELEASE_TRIES = 3;
const RELEASE_WAIT = 2000;

/**
 * Take back the mark on buttons whose work came to nothing, asking again a
 * little later if it couldn't be, as when the Referee has just left.
 * @param {ChatMessage} message
 * @param {string[]} keys
 * @returns {Promise<boolean>} Whether they can be pressed again.
 */
async function releaseButtons(message, keys) {
	for (let tries = 1; ; tries++) {
		try {
			if (await markButtons(message, keys, { release: true })) return true;
		} catch (error) {
			console.warn(`${SYSTEM_ID} | Couldn't free the button again`, error);
		}
		if (tries >= RELEASE_TRIES) return false;
		await new Promise((resolve) => setTimeout(resolve, RELEASE_WAIT));
	}
}

/**
 * Mark buttons spent, do their work, and take the mark back if it came to
 * nothing. Marked first, so two people pressing at once can't both do it.
 * Where the mark can't be taken back, the presser is told. The Referee's own
 * buttons are marked once their work is done.
 * @param {ChatMessage} message
 * @param {string[]} keys
 * @param {() => unknown} work The handler.
 * @param {{gmOnly?: boolean}} [options]
 * @returns {Promise<void>}
 */
async function pressOnce(message, keys, work, { gmOnly = false } = {}) {
	if (gmOnly) return pressThenMark(message, keys, work);
	if (!(await markButtons(message, keys))) {
		warn(writesCard(message) ? "cardButtons.alreadyPressed" : "cardButtons.notKept");
		return;
	}
	let done = false;
	try {
		done = Boolean(await work());
	} finally {
		if (!done && !(await releaseButtons(message, keys))) warn("cardButtons.stuck");
	}
}

/** Where a card keeps the buttons that have done their work for good. */
const SPENT_FLAG = "spentButtons";

/** The GM query that marks a card's buttons pressed, or takes the mark back, for whoever pressed them. */
const SPEND_QUERY = `${SYSTEM_ID}.spendButton`;

/** Each card's writes, one at a time, so two at once each start from the other's. */
const cardWrites = keyedSerialWrites();

/**
 * Whether this client writes a card's changes itself. With a GM here, only
 * the active GM's client writes cards, so two people's changes at once are
 * kept one after the other; without one, the card's owner writes it.
 * @param {ChatMessage} message
 * @returns {boolean}
 */
function writesCard(message) {
	const gm = game.users?.activeGM;
	return gm ? Boolean(gm.isSelf) : Boolean(message.isOwner);
}

/**
 * @param {ChatMessage} message
 * @returns {string[]} The keys of its buttons that have done their work.
 */
const spentButtons = (message) => message?.flags?.[SYSTEM_ID]?.[SPENT_FLAG] ?? [];

/**
 * Mark buttons spent, or with `release` take back the mark on buttons whose work came to nothing, so they can
 * be pressed again: here where this client writes the card, else by asking the active GM.
 * @param {ChatMessage} message
 * @param {string[]} keys
 * @param {{release?: boolean}} [options]
 * @returns {Promise<boolean>} False when one was spent already, or the GM didn't keep them.
 */
async function markButtons(message, keys, { release = false } = {}) {
	if (writesCard(message)) return writeMarks(message, keys, release);
	const asked = { messageId: message.id, keys, ...(release ? { release: true } : {}) };
	const failure = release ? "Couldn't free the button again" : "Couldn't keep the button pressed";
	return (await askActiveGM(SPEND_QUERY, asked, failure)) === true;
}

/**
 * Mark buttons spent on the card, in its queue, unless one of them is already;
 * or, released, take the mark off them.
 * @param {ChatMessage} message
 * @param {string[]} keys
 * @param {boolean} release
 * @returns {Promise<boolean>}
 */
function writeMarks(message, keys, release) {
	return cardWrites(message.id)(async () => {
		const spent = spentButtons(message);
		const marked = keys.some((key) => spent.includes(key));
		if (release) {
			if (marked) await message.setFlag(SYSTEM_ID, SPENT_FLAG, spent.filter((key) => !keys.includes(key)));
			return true;
		}
		if (marked) return false;
		await message.setFlag(SYSTEM_ID, SPENT_FLAG, [...spent, ...keys]);
		return true;
	});
}

/**
 * The selectors, as a key begins, of every once-only button, each with
 * whether it's the Referee's alone and who else may press it.
 * @type {Map<string, {gmOnly: boolean, mayPress: (message: ChatMessage, user: User, button: HTMLElement|null) => boolean}>}
 */
const onceButtons = new Map();

/**
 * Whether a user sees a card, and so its buttons: a whisper only its author
 * and those it's whispered to.
 * @param {ChatMessage} message
 * @param {User} user
 * @returns {boolean}
 */
const seesCard = (message, user) => !message.whisper?.length || message.author?.id === user.id || message.whisper.includes(user.id);

/**
 * Whether a user may mark one of a card's once-only buttons, or take the mark
 * back: never one only the Referee has unless they're a GM, nor one on a card
 * they can't see, nor one whose work they couldn't do, nor one the card doesn't hold.
 * @param {ChatMessage} message
 * @param {Document} content Its HTML, parsed.
 * @param {User} user
 * @param {unknown} key
 * @returns {boolean}
 */
function mayAskSpend(message, content, user, key) {
	if (typeof key !== "string") return false;
	const at = key.lastIndexOf("#");
	const selector = key.slice(0, at);
	const index = key.slice(at + 1);
	const kind = onceButtons.get(selector);
	if (at < 0 || !kind || !/^\d{1,3}$/.test(index)) return false;
	// The button as the card was posted, if it holds one there.
	const button = content.querySelectorAll(selector)[Number(index)];
	if (!button || !seesCard(message, user)) return false;
	if (user.isGM) return true;
	return !kind.gmOnly && Boolean(kind.mayPress(message, user, button));
}

/**
 * A user's press of a once-only button, marked for them by the active GM, or
 * its mark taken back when its work came to nothing. Each card's are kept one
 * at a time, so of two pressing at once only the first is kept.
 * @param {{messageId: string, keys?: string[], release?: boolean}} data
 * @param {object} [context]
 * @returns {Promise<boolean>} False when refused, or already pressed.
 */
async function onSpendQuery(data = {}, context = {}) {
	const user = queryAsker(context);
	if (!user) return false;
	const message = game.messages.get(data?.messageId);
	const keys = Array.isArray(data?.keys) ? data.keys : [];
	if (!message || !keys.length) return false;
	const content = new DOMParser().parseFromString(String(message.content ?? ""), "text/html");
	if (!keys.every((key) => mayAskSpend(message, content, user, key))) return false;
	return writeMarks(message, keys, data.release === true);
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
 * A card that keeps its state in a flag and re-renders as it changes. With a
 * GM here, every change is recorded by the active GM, the card's author's too,
 * through the query `answer` builds, so changes made at once are kept one
 * after the other rather than written over each other. Its judge must allow
 * whatever the author's own client lets them change. Without a GM, the card's
 * owner records their own changes.
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
 * @param {(message: ChatMessage, change: object) => boolean} [options.fits] Whether the change fits
 *   what else the world holds, checked on every commit, the card's own client's or the asked GM's.
 */
export function statefulCard({ flag, query, notices, change, render, queryable = () => true, alsoUpdate = () => ({}), fits = () => true }) {
	/**
	 * @param {ChatMessage|undefined} message
	 * @returns {State|null}
	 */
	const stateOf = (message) => message?.flags?.[SYSTEM_ID]?.[flag] ?? null;

	/**
	 * Write a change, after any already being written to this card, from the
	 * state as those left it.
	 * @param {ChatMessage} message
	 * @param {object} delta
	 * @returns {Promise<boolean>} False if the card no longer allows the change.
	 */
	function commit(message, delta) {
		return cardWrites(message.id)(async () => {
			const card = game.messages?.get(message.id) ?? message;
			if (!fits(card, delta)) return false;
			const state = change(stateOf(card), delta);
			if (!state) return false;
			await card.update({ ...alsoUpdate(card, delta), content: await render(state), [`flags.${SYSTEM_ID}.${flag}`]: state });
			return true;
		});
	}

	/**
	 * Record a change on the card, asking the active GM unless this client writes it.
	 * @param {ChatMessage} message
	 * @param {object} delta
	 * @returns {Promise<boolean>} Whether it was recorded.
	 */
	async function save(message, delta) {
		let saved = false;
		if (writesCard(message)) saved = await commit(message, delta);
		// The author asks too, so a change of theirs is written in turn with everybody else's.
		else if (message.isOwner || queryable(delta)) {
			if (!game.users.activeGM) {
				warn(`${notices}.needsGM`);
				return false;
			}
			saved = await askActiveGM(query, { messageId: message.id, change: delta }, "Couldn't have the card changed");
		}
		if (!saved) warn(`${notices}.changeRefused`);
		return Boolean(saved);
	}

	/**
	 * The query the active GM answers for a change asked of it, to register
	 * under `query`. The card's judge says what of the change to record, told
	 * whether the asker is the card's author, whose own client recorded it
	 * when no GM was here.
	 * @param {(change: object, state: State, user: User, card: {message: ChatMessage, authored: boolean}) => object|null} judge
	 *   The change to record, or null when it's refused.
	 * @returns {(data: {messageId?: string, change?: object}, context: object) => Promise<boolean>}
	 */
	function answer(judge) {
		return async (data, context) => {
			const user = queryAsker(context);
			const message = game.messages?.get(data?.messageId);
			const state = stateOf(message);
			if (!user || !state || !data.change) return false;
			const allowed = judge(data.change, state, user, { message, authored: message.author?.id === user.id });
			return allowed ? commit(message, allowed) : false;
		};
	}

	return { stateOf, commit, save, answer };
}
