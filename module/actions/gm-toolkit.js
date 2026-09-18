import { t } from "../chat/cards.js";
import { SYSTEM_ID, SYSTEM_PATH } from "../system-id.js";

/**
 * The GM Toolkit, the GM's one place for a Realm's Myths and their Omens, the
 * hexes the Company has been to, and notes on its places, the way the Stonetop
 * system keeps its GM's. It's an Actor of its own type, so it has a sheet with a
 * tab rail, keeps the GM's notes in the world, and reopens after a reload as
 * sheets do. Each world has exactly one: the active GM's browser makes it, a
 * second is refused, and the last is never deleted. Nobody but GMs can open it.
 * Each GM is given it as their character, so core's character sheet key opens it.
 */

/** The toolkit's Actor type, as system.json declares it. */
export const GM_TOOLKIT_TYPE = "gmToolkit";

/** The toolkit's portrait: somebody reading behind an open book, as on Stonetop's. */
export const GM_TOOLKIT_IMAGE = `${SYSTEM_PATH}/assets/icons/gm-toolkit.svg`;

/** @returns {Actor[]} The world's toolkits: one, once a GM has loaded the world. */
export const gmToolkits = () => game.actors?.filter((actor) => actor.type === GM_TOOLKIT_TYPE) ?? [];

/** @returns {Actor|null} The world's toolkit. Every GM owns every Actor, so it needs no test of who can open it. */
export const theGmToolkit = () => gmToolkits()[0] ?? null;

/**
 * Whether the world knows the toolkit's type. A world left running while the
 * system updated only learns a new type once it's launched again.
 * @returns {boolean}
 */
const knowsTheType = () => Boolean(game.documentTypes?.Actor?.includes(GM_TOOLKIT_TYPE));

/** The toolkit being made, so asking twice at once makes one. */
let making = null;

/**
 * Make the world's toolkit. Players get no say in it: its ownership leaves them out.
 * @returns {Promise<Actor|null>}
 */
function makeGmToolkit() {
	making ??= (async () => {
		try {
			return await foundry.utils.getDocumentClass("Actor").create({
				name: t("gmToolkit.name"),
				type: GM_TOOLKIT_TYPE,
				img: GM_TOOLKIT_IMAGE,
				prototypeToken: { texture: { src: GM_TOOLKIT_IMAGE } },
				ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
			});
		} finally {
			making = null;
		}
	})();
	return making;
}

/**
 * Give the world its toolkit, once world setup has run: the Welcome decides a
 * world is new by its having no Actors, and the toolkit would be one. Only the
 * active GM's browser makes it, so two GMs never make two.
 * @returns {Promise<Actor|null>}
 */
export async function ensureGmToolkit() {
	if (!game.user.isGM || !game.users?.activeGM?.isSelf) return null;
	const toolkit = theGmToolkit();
	if (toolkit || !knowsTheType()) return toolkit;
	try {
		return await makeGmToolkit();
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't make the GM Toolkit`, error);
		return null;
	}
}

/**
 * Open the toolkit at a page, making it first if the world has none. GMs only.
 * @param {string} [tab] One of TOOLKIT_TABS.
 * @returns {Promise<foundry.applications.api.ApplicationV2|null>} Its sheet.
 */
export async function openGmToolkit(tab) {
	if (!game.user.isGM) return null;
	let toolkit = theGmToolkit();
	if (!toolkit) {
		if (!knowsTheType()) {
			ui.notifications.warn(t("gmToolkit.relaunch"));
			return null;
		}
		toolkit = await makeGmToolkit();
	}
	if (!toolkit) return null;
	await toolkit.sheet.render({ force: true, ...(tab ? { tab } : {}) });
	return toolkit.sheet;
}

/* -------------------------------------------- */
/*  Each GM's character                         */
/* -------------------------------------------- */

/**
 * The User flag set once this GM has been given the toolkit as their
 * character, or found to have a character of their own. It's the GM's own
 * User document's, so each world and each GM has their own, which a client
 * setting shared by every world in the browser wouldn't be.
 */
export const ASSIGNED_FLAG = "gmToolkitAssigned";

/** The assignment being made, so the ready step and the createActor hook write it once. */
let assigning = null;

/**
 * Make the toolkit this GM's character, once, as the Stonetop system does. Core's
 * character sheet key (C) opens the user's character when no Token is
 * selected, and the Players list shows it by their name. A User's character
 * can be any Actor, not only a Knight.
 *
 * A GM who already has a character of their own, such as a Knight they play,
 * keeps it, and is never asked again. A GM who later takes the toolkit off is
 * left without it. Until the world has a toolkit nothing is marked, so the
 * next chance tries again. GMs only.
 * @returns {Promise<Actor|null>} The toolkit, when it's this GM's character.
 */
export function assignGmToolkit() {
	if (!game.user.isGM) return Promise.resolve(null);
	assigning ??= (async () => {
		try {
			return await assignOnce();
		} catch (error) {
			console.warn(`${SYSTEM_ID} | Couldn't make the GM Toolkit this GM's character`, error);
			return null;
		} finally {
			assigning = null;
		}
	})();
	return assigning;
}

/** @returns {Promise<Actor|null>} */
async function assignOnce() {
	const user = game.user;
	if (user.getFlag(SYSTEM_ID, ASSIGNED_FLAG)) return null;
	const toolkit = theGmToolkit();
	const current = user.character;
	if (current && current.id !== toolkit?.id) {
		// Their own choice, made before the toolkit came: left alone for good.
		await user.setFlag(SYSTEM_ID, ASSIGNED_FLAG, true);
		return null;
	}
	if (!toolkit) return null;
	// The character and the mark that it was given go in one write, so neither lands without the other.
	await user.update({ character: toolkit.id, [`flags.${SYSTEM_ID}.${ASSIGNED_FLAG}`]: true });
	return toolkit;
}

/**
 * A toolkit made while a GM is here, on this browser or another GM's, becomes
 * their character as it arrives.
 * @param {Actor} actor
 */
export function adoptNewToolkit(actor) {
	if (!game.user.isGM || actor?.type !== GM_TOOLKIT_TYPE || actor.pack) return undefined;
	return assignGmToolkit();
}

/**
 * With no Token selected, core speaks a user's chat as their character, which
 * for a GM is now the toolkit. Nothing in this system speaks as the toolkit on
 * purpose, so such a message is signed with the GM's own name instead.
 * @param {ChatMessage} message
 * @param {object} _data
 * @param {object} _options
 * @param {string} userId Who is sending it.
 */
export function speakAsTheGm(message, _data, _options, userId) {
	const speaker = message?.speaker;
	const toolkit = speaker?.actor ? game.actors?.get(speaker.actor) : null;
	if (toolkit?.type !== GM_TOOLKIT_TYPE) return;
	const author = game.users?.get(userId) ?? game.user;
	// An alias the sender chose on purpose stays; the toolkit's own name doesn't.
	const alias = speaker.alias && speaker.alias !== toolkit.name ? speaker.alias : author.name;
	message.updateSource({ speaker: { actor: null, token: null, alias } });
}

/* -------------------------------------------- */
/*  One per world                               */
/* -------------------------------------------- */

/** Toolkits each batch of deletions has asked to delete so far, by the batch's options. */
const deleting = new WeakMap();

/**
 * Refuse a second toolkit, or one made by a player, whether it comes from
 * Create Actor, a duplicate, an import or a macro. A compendium may hold as
 * many as it likes.
 * @param {Actor} actor
 * @param {object} data
 * @param {object} options
 * @returns {boolean|void} False to refuse.
 */
export function refuseSecondToolkit(actor, data, options) {
	if ((data?.type ?? actor?.type) !== GM_TOOLKIT_TYPE || options?.pack || actor?.pack) return;
	if (!game.user.isGM) {
		ui.notifications.warn(t("gmToolkit.gmOnly"));
		return false;
	}
	if (!gmToolkits().length) return;
	ui.notifications.warn(t("gmToolkit.onlyOne"));
	return false;
}

/**
 * Refuse to delete the world's last toolkit, which holds the GM's notes. Many
 * Actors deleted at once share one options object, so deleting two toolkits
 * together still keeps one.
 * @param {Actor} actor
 * @param {object} options
 * @returns {boolean|void} False to refuse.
 */
export function keepLastToolkit(actor, options) {
	if (actor?.type !== GM_TOOLKIT_TYPE || actor.pack) return;
	const batch = (options && deleting.get(options)) ?? new Set();
	batch.add(actor.id);
	if (options && typeof options === "object") deleting.set(options, batch);
	if (gmToolkits().some((toolkit) => !batch.has(toolkit.id))) return;
	batch.delete(actor.id);
	ui.notifications.warn(t("gmToolkit.keep"));
	return false;
}

/**
 * Leave the toolkit out of Create Actor once the world has one, and always for
 * players: it's made for the world, not chosen.
 * @param {foundry.applications.api.ApplicationV2} _dialog
 * @param {HTMLElement} element
 */
export function hideToolkitType(_dialog, element) {
	const option = element?.querySelector?.(`select[name="type"] option[value="${GM_TOOLKIT_TYPE}"]`);
	if (!option || (game.user.isGM && !gmToolkits().length)) return;
	const select = option.parentElement;
	const wasChosen = option.selected;
	option.remove();
	if (wasChosen && select?.options.length) select.selectedIndex = 0;
}

/** Keep the toolkit one per world and each GM's character, and their chat their own. Called during init. */
export function registerGmToolkitHooks() {
	Hooks.on("preCreateActor", refuseSecondToolkit);
	Hooks.on("preDeleteActor", keepLastToolkit);
	Hooks.on("renderDialogV2", hideToolkitType);
	Hooks.on("createActor", adoptNewToolkit);
	Hooks.on("preCreateChatMessage", speakAsTheGm);
}
