import { JB2A_IDS, SEQUENCER_ID, SOUNDFX_ID, moduleActive } from "../actions/attack-fx.js";
import { newRealm } from "../actions/realm.js";
import { bringInRulebook } from "../rulebook/bring-in.js";
import { hasRulebook } from "../rulebook/store.js";
import { FXMASTER_IDS } from "../rules/weather.js";
import { SYSTEM_ID } from "../system-id.js";
import { onCardClick, postCard, t } from "./cards.js";

/**
 * The cards a new world's GMs find waiting in chat, beside the Welcome: one
 * to bring in the rulebook PDF, one to make the first Realm, and one naming
 * the modules the system makes use of. Only GMs are whispered them, and only
 * a GM's click does anything.
 */

/** The world setup step that posts them, once. */
export const WELCOME_CARDS_STEP = "welcomeCards";

/**
 * The modules the modules card recommends, in the README's order: each with
 * its package page and the module ids it needs, every group of which must
 * have one on.
 */
export const RECOMMENDED_MODULES = Object.freeze([
	{ key: "diceSoNice", url: "https://foundryvtt.com/packages/dice-so-nice", needs: [["dice-so-nice"]] },
	{ key: "sequencer", url: "https://foundryvtt.com/packages/sequencer", needs: [[SEQUENCER_ID], JB2A_IDS] },
	{ key: "soundFx", url: "https://foundryvtt.com/packages/soundfxlibrary", needs: [[SOUNDFX_ID]] },
	{ key: "fxmaster", url: "https://foundryvtt.com/packages/fxmaster", needs: [FXMASTER_IDS] }
]);

/** @returns {boolean} Whether a recommended module isn't on in this world yet. */
function modulesMissing() {
	return RECOMMENDED_MODULES.some(({ needs }) => !needs.every((ids) => ids.some(moduleActive)));
}

/** Foundry's Manage Modules window, the same way its Settings tab opens it. */
function manageModules() {
	new foundry.applications.sidebar.apps.ModuleManagement().render({ force: true });
}

/**
 * The cards, in the order they're posted: each names its icon, what its button
 * does, where it isn't always wanted, when it is, and anything more it shows.
 */
const CARDS = {
	import: { icon: "fa-solid fa-file-import", run: () => bringInRulebook(), wanted: () => !hasRulebook() },
	realm: { icon: "fa-solid fa-map", run: newRealm },
	modules: {
		icon: "fa-solid fa-puzzle-piece",
		run: manageModules,
		wanted: modulesMissing,
		context: () => ({
			modules: RECOMMENDED_MODULES.map(({ key, url }) => ({
				url,
				name: t(`welcome.chat.modules.list.${key}.name`),
				text: t(`welcome.chat.modules.list.${key}.text`)
			}))
		})
	}
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
			label: t(`welcome.chat.${card}.button`),
			...CARDS[card].context?.()
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
