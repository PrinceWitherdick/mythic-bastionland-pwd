import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { REALM_DRAWING_FLAG } from "../rules/realm-drawing.js";
import { hiddenTilesIn } from "../rules/realm-documents.js";
import { SOLO_SECRETS_FLAG, SOLO_SECRET_WAYS, mythKnown, soloRealm } from "../rules/solo.js";
import { visitedMarkHexes } from "../rules/travels.js";
import { SYSTEM_ID } from "../system-id.js";
import { companyTokenHex } from "./company.js";
import { COMPANY_PLACED_HOOK, getJourney } from "./journey.js";
import { centredTiles, getRealm, isDrawingRealm, isRealmScene, sceneGeometry } from "./realm.js";

/**
 * Solo play: the Referee is the Company too, so the Realm's Myths, Landmarks
 * and Barriers are kept from them until travelling finds them. The rules are
 * in rules/solo.js. Every GM-side screen that would give a secret away asks
 * keptFromMe first, or secretsKeptOn where it shows or changes one Realm.
 */

/** The world setting that turns solo play on. */
export const SOLO_SETTING = "soloPlay";

/** Called on every client when solo play is turned on or off, with whether it's now on. */
export const SOLO_CHANGED_HOOK = `${SYSTEM_ID}.soloChanged`;

/** The Realm Key card, which names every secret a Realm holds. */
const REALM_KEY_SELECTOR = ".bastionland-card--realm-key";

/** The Realm's Myths window, which shows every Myth, name and hex. */
const MYTH_CHOOSER_ID = "bastionland-myth-chooser";

/** The setting as last read, once the world is ready; cleared as it changes. Asked for each Knight and each secret drawn. */
let soloNow = null;

/** @returns {boolean} Whether this world is played alone. */
export function isSolo() {
	if (soloNow !== null) return soloNow;
	const on = read(SOLO_SETTING, false) === true;
	if (game.ready) soloNow = on;
	return on;
}

/**
 * @param {Scene|null|undefined} scene
 * @returns {string|null} How a solo Referee drawing this Realm has its secrets placed, one of
 *   SOLO_SECRET_WAYS, until they're settled as its drawing is first finished.
 */
export function secretsToSettle(scene) {
	const way = scene?.getFlag?.(SYSTEM_ID, SOLO_SECRETS_FLAG);
	return SOLO_SECRET_WAYS.includes(way) ? way : null;
}

/**
 * Whether a solo Referee is drawing this Realm and placing its secrets by
 * their own hand, so sees them until its drawing is first finished.
 * @param {Scene|null|undefined} scene
 * @returns {boolean}
 */
const placingOwnSecrets = (scene) => isDrawingRealm(scene) && ["hide", "show"].includes(secretsToSettle(scene));

/** @returns {boolean} Whether this client is a Referee playing alone, from whom the Realms' secrets are kept. */
export const keptFromMe = () => Boolean(game.user?.isGM) && isSolo();

/**
 * @param {Scene|null} [scene] The Realm in question, the one on the canvas by default.
 * @returns {boolean} Whether this Realm's secrets are kept from this client: from a Referee playing alone,
 *   save while they place a Realm's secrets by their own hand as they draw it.
 */
export const secretsKeptOn = (scene = globalThis.canvas?.scene ?? null) => keptFromMe() && !placingOwnSecrets(scene);

/**
 * Who has the steps of Creating a Realm that place its Myths, Landmarks and
 * Barriers, as it's drawn: "dice", "hide" or "show" until a Realm drawn alone
 * is first finished, then "kept" while what's still hidden is kept from this
 * client. The dice's and the kept steps are counted by no one, so their
 * tallies and shortfalls tell nothing of what's hidden.
 * @param {Scene|null|undefined} scene
 * @returns {{way: string|null, handed: boolean}} Null where the Referee places them as on any Realm.
 */
export function drawingSecrets(scene) {
	const way = secretsToSettle(scene) ?? (secretsKeptOn(scene) ? "kept" : null);
	return { way, handed: way === "dice" || way === "kept" };
}

/** The paint brushes that lay or take away a Holding, a Landmark or a Barrier. */
export const LOCKED_BRUSHES = Object.freeze(["holding", "landmark", "barrier"]);

/**
 * Whether a paint brush leaves what it lays on this Realm as it is: played
 * alone, a Holding, Landmark or Barrier brush, once the Realm's secrets are
 * kept. A brush that held back only where something is hidden would show where
 * it is. While a Realm drawn alone waits for the dice to place its Landmarks
 * and Barriers, its Holdings are drawn as any other's; what those brushes laid
 * would be hidden at once, and thrown away as the dice place their own.
 * @param {string} brush One of REALM_BRUSHES.
 * @param {Scene|null} [scene] The one on the canvas by default.
 * @returns {boolean}
 */
export const brushLockedOn = (brush, scene = globalThis.canvas?.scene ?? null) => LOCKED_BRUSHES.includes(brush)
	&& secretsKeptOn(scene)
	&& !(brush === "holding" && secretsToSettle(scene) === "dice");

/**
 * Played alone, refuse a brush that leaves what it lays on this Realm as it
 * is, and say why.
 * @param {string} brush One of REALM_BRUSHES.
 * @param {Scene|null} [scene] The one on the canvas by default.
 * @returns {boolean} Whether it was refused.
 */
export function brushRefused(brush, scene = globalThis.canvas?.scene ?? null) {
	if (!brushLockedOn(brush, scene)) return false;
	ui.notifications.info(t(secretsToSettle(scene) === "dice" ? "solo.brushDice" : "solo.brushLocked"));
	return true;
}

/**
 * @param {object} realm The whole Realm.
 * @param {Scene|null} scene Its Scene, as whether its secrets are kept hangs on it.
 * @returns {object} The Realm as this client may know it.
 */
export const realmKnown = (realm, scene) => (realm && secretsKeptOn(scene) ? soloRealm(realm) : realm);

/**
 * @param {object|null|undefined} myth
 * @param {Scene|null} scene The Realm it's in.
 * @returns {boolean} Whether a Myth is one this client is a Referee playing alone who hasn't yet met it,
 *   so is told of only by its number. Not while they place it by their own hand as they draw its Realm.
 */
export const mythKeptFromMe = (myth, scene) => Boolean(myth) && secretsKeptOn(scene) && !mythKnown(myth);

/** @returns {boolean} Whether this client writes what solo play finds: the active GM's, in a solo world. */
const findsHere = () => Boolean(game.user?.isGM && game.users?.activeGM?.isSelf) && isSolo();

/**
 * The Company in a Myth's hex finds it: its Tile is shown on the map. Asked
 * with the hexes the Company has come to rest in or passed through, once a
 * blind drift or the weather has settled where it really went.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 * @param {object} [options]
 * @param {boolean} [options.quiet] Without a notice for each, as when catching up on a journey already made.
 * @returns {Promise<object[]>} The Myths found.
 */
export async function revealMythsReached(scene, hexes, { quiet = false } = {}) {
	if (!findsHere() || !isRealmScene(scene) || !hexes?.length) return [];
	const found = hiddenTilesIn(centredTiles(scene), sceneGeometry(scene), ["myth"], hexes);
	if (!found.length) return [];
	await scene.updateEmbeddedDocuments("Tile", found.map(({ _id }) => ({ _id, hidden: false })));
	const myths = getRealm(scene)?.realm.myths.filter((myth) => found.some(({ _id }) => _id === myth.id)) ?? [];
	if (!quiet) for (const myth of myths) ui.notifications.info(t("solo.mythFound", { number: myth.number }));
	return myths;
}

/**
 * The Myths in every hex the Company has been to on a Realm, and the one it
 * stands in now, are found: as solo play is turned on partway through, or as
 * a Realm drawn alone has its secrets settled around a Company already set down.
 * @param {Scene} scene
 * @returns {Promise<object[]>} The Myths found.
 */
export function revealMythsBeenTo(scene) {
	const here = companyTokenHex(scene);
	return revealMythsReached(scene, [...visitedMarkHexes(getJourney(scene)), ...(here ? [here] : [])], { quiet: true });
}

/**
 * Solo play turned on partway through: the Myths in hexes the Company has
 * already been to are found, as they would have been had it been on.
 * @returns {Promise<void>}
 */
async function catchUpOnJourneys() {
	await Promise.all([...(game.scenes ?? [])].filter(isRealmScene).map(revealMythsBeenTo));
}

/**
 * The Realm Key names every secret, so a Referee playing alone sees in its
 * place that it's set aside. Whispered before solo play was turned on, it's
 * still in the log.
 * @param {ChatMessage} _message
 * @param {HTMLElement} html
 */
function coverRealmKey(_message, html) {
	const card = html?.querySelector?.(REALM_KEY_SELECTOR);
	if (!card || !keptFromMe()) return;
	const note = html.ownerDocument.createElement("p");
	note.className = "bastionland-card__text";
	note.textContent = t("solo.realmKeyKept");
	card.replaceChildren(note);
}

/** Draw the map's secrets again, and the windows and words that show the Realm, as what's kept from this client changes. */
function redrawSecrets() {
	for (const layer of [canvas?.tiles, canvas?.drawings]) {
		for (const placeable of layer?.placeables ?? []) placeable.renderFlags.set({ refreshState: true });
	}
	for (const app of foundry.applications.instances.values()) {
		if (app.rendered && app.options?.classes?.includes(SYSTEM_ID)) app.render();
	}
	// Foundry v14's Tiles and Drawings lists may name a secret.
	ui.placeables?.render();
	// A Realm Key already in the log is covered, or uncovered, as it's drawn again.
	for (const card of ui.chat?.element?.querySelectorAll?.(REALM_KEY_SELECTOR) ?? []) {
		const message = game.messages?.get(card.closest("[data-message-id]")?.dataset.messageId);
		if (message) ui.chat.updateMessage(message)?.catch?.(() => {});
	}
	// The words under the map name what stands in the hex pointed at.
	import("../canvas/hex-readout.js").then(({ updateHexReadout }) => updateHexReadout({ force: true })).catch(() => {});
}

/**
 * A Realm drawn alone keeps its secrets from the Referee again once its
 * drawing is finished, so the map is drawn again as that happens.
 * @param {Scene} scene
 * @param {object} changes
 */
function noticeDrawingSettled(scene, changes) {
	const flags = changes?.flags?.[SYSTEM_ID];
	if (!flags || scene?.id !== canvas?.scene?.id || !isSolo()) return;
	if (REALM_DRAWING_FLAG in flags || SOLO_SECRETS_FLAG in flags) redrawSecrets();
}

/** Draw the map again, and the windows that show the Realm, when solo play is turned on or off. */
function redrawForSolo() {
	const on = isSolo();
	// The Realm's Myths window shows every Myth, so it's closed rather than drawn again.
	if (on && game.user?.isGM) foundry.applications.instances.get(MYTH_CHOOSER_ID)?.close();
	redrawSecrets();
	// The players list carries the Solo Play tag.
	ui.players?.render();
	if (on && game.user?.isGM) {
		// Playing alone, the Referee is the Company too, and gets its Places and Timeline macros.
		Promise.all([
			import("./places-macro.js").then(({ ensurePlacesHotbar }) => ensurePlacesHotbar()),
			import("./timeline-macro.js").then(({ ensureTimelineHotbar }) => ensureTimelineHotbar())
		]).catch((error) => console.error(`${SYSTEM_ID} | Couldn't give the Company's macros`, error));
		if (findsHere()) catchUpOnJourneys().catch((error) => console.error(`${SYSTEM_ID} | Couldn't find the Myths already reached`, error));
	}
	Hooks.callAll(SOLO_CHANGED_HOOK, on);
}

/** Register the setting and follow the Company. Called during init. */
export function registerSolo() {
	game.settings.register(SYSTEM_ID, SOLO_SETTING, {
		name: "bastionland.solo.setting.name",
		hint: "bastionland.solo.setting.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		onChange: () => {
			soloNow = null;
			redrawForSolo();
		}
	});
	// A Company set down on a Realm stands in its hex as surely as one that walked there.
	// A move is followed in arrivals.js, once the dark and the weather have said where it ended.
	Hooks.on(COMPANY_PLACED_HOOK, (scene, hexes) => {
		revealMythsReached(scene, hexes).catch((error) => console.error(`${SYSTEM_ID} | Couldn't show the Myth the Company found`, error));
	});
	Hooks.on("renderChatMessageHTML", coverRealmKey);
	Hooks.on("updateScene", noticeDrawingSettled);
}
