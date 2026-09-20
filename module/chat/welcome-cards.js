import { newRealm } from "../actions/realm.js";
import { bringInRulebook } from "../rulebook/bring-in.js";
import { hasRulebook } from "../rulebook/store.js";
import { SYSTEM_ID } from "../system-id.js";
import { onCardClick, postCard, t } from "./cards.js";

/**
 * Two cards a new world's GMs find waiting in chat, beside the Welcome: one
 * to bring in the rulebook PDF, one to make the first Realm. Only GMs are
 * whispered them, and only a GM's click does anything.
 */

/** The world setup step that posts them, once. */
export const WELCOME_CARDS_STEP = "welcomeCards";

/**
 * The cards, in the order they're posted: each names its icon, what its button
 * does, and, where it isn't always wanted, when it is.
 */
const CARDS = {
	import: { icon: "fa-solid fa-file-import", run: () => bringInRulebook(), wanted: () => !hasRulebook() },
	realm: { icon: "fa-solid fa-map", run: newRealm }
};

/** The cards, in the order they're posted. */
export const WELCOME_CARDS = Object.freeze(Object.keys(CARDS));

const BUTTONS = "[data-welcome-card]";

/**
 * Post the cards, whispered to every GM. A world setup step: only a world the
 * Welcome still greets gets them, so one already in play never does. A world
 * that already has its rulebook, found kept by another world, isn't asked for it.
 * @param {() => boolean} isNewWorld
 */
export async function postWelcomeCards(isNewWorld) {
	if (!isNewWorld()) return;
	const speaker = { alias: game.system.title };
	const cards = WELCOME_CARDS.filter((card) => CARDS[card].wanted?.() ?? true);
	for (const card of cards) {
		await postCard(null, "welcome", {
			card,
			icon: CARDS[card].icon,
			title: t(`welcome.chat.${card}.title`),
			text: t(`welcome.chat.${card}.text`),
			label: t(`welcome.chat.${card}.button`)
		}, { mode: "gm", flags: { [SYSTEM_ID]: { welcomeCard: card } }, speaker });
	}
}

/**
 * Wire up a welcome card's button, for GMs.
 * @param {ChatMessage} _message
 * @param {HTMLElement} html
 */
function activateWelcomeCard(_message, html) {
	if (!game.user.isGM || !html.querySelector(BUTTONS)) return;
	onCardClick(html, BUTTONS, (button) => CARDS[button.dataset.welcomeCard]?.run());
}

/** Called during init. */
export function registerWelcomeCards() {
	Hooks.on("renderChatMessageHTML", activateWelcomeCard);
}
