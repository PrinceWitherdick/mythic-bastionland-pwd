/**
 * The Scenes a Referee links to a Myth's Omens: dragged from the Scenes
 * sidebar onto an Omen in the GM Toolkit or in a written Myth's sheet, and
 * activated from there, or from the Wilderness card that shows the Omen, when
 * the Company meets it. A Myth of the book keeps them with its notes on the
 * Realm; a Myth the Referee wrote keeps them on its own entry, so they go
 * wherever it's used.
 */
import { registerCardButtons, warn } from "../chat/cards.js";
import { mythScenesFor } from "../rules/myth-notes.js";
import { emptyOmenScenes, withOmenScene, withoutMissingScenes, withoutOmenScene } from "../rules/omen-scenes.js";
import { isOwnMyth } from "../rules/own-myths.js";
import { editMythNote, getMythNotes } from "./myth-notes.js";
import { editOwnMythScenes, ownMythById, readOwnMyth } from "./own-myths.js";

/**
 * @param {Scene} realm The Realm the Myth is one of.
 * @param {{number: number, d6: number|null, d12: number|null, own?: string}} myth
 * @param {object} [known] What the caller has already read, so it isn't read again.
 * @param {object|null} [known.entry] The Myth's index entry; a written Myth's carries its Scenes as `omenScenes`.
 * @param {object} [known.notes] The Realm's Myth notes.
 * @returns {import("../rules/omen-scenes.js").OmenScenes} The Scene ids linked to each of its Omens.
 */
export function omenSceneIds(realm, myth, { entry, notes } = {}) {
	if (!myth) return emptyOmenScenes();
	if (isOwnMyth(myth)) {
		if (entry?.omenScenes) return entry.omenScenes;
		const own = ownMythById(myth.own);
		return own ? readOwnMyth(own).scenes : emptyOmenScenes();
	}
	return mythScenesFor(notes ?? getMythNotes(realm), myth);
}

/**
 * @param {string[]} ids
 * @returns {{id: string, name: string}[]} The Scenes the world still has, to be shown; one since deleted is left out.
 */
export function omenSceneChips(ids) {
	return (ids ?? []).flatMap((id) => {
		const scene = game.scenes?.get(id);
		return scene ? [{ id, name: scene.name }] : [];
	});
}

/**
 * Change one Myth's links where that Myth keeps them.
 * @param {Scene} realm
 * @param {object} myth
 * @param {(scenes: import("../rules/omen-scenes.js").OmenScenes) => import("../rules/omen-scenes.js").OmenScenes} change
 * @returns {Promise<boolean>} Whether anything was written.
 */
function editOmenScenes(realm, myth, change) {
	if (!game.user.isGM || !myth) return Promise.resolve(false);
	// A Scene deleted since it was linked goes with the change.
	const tidied = (scenes) => change(withoutMissingScenes(scenes, (id) => game.scenes.has(id)));
	if (isOwnMyth(myth)) {
		const entry = ownMythById(myth.own);
		return entry ? editOwnMythScenes(entry, tidied) : Promise.resolve(false);
	}
	// Read in the notes' turn, so a link made just before isn't written over.
	return editMythNote(realm, myth, (notes) => {
		const before = mythScenesFor(notes, myth);
		const after = tidied(before);
		return after === before ? {} : { scenes: after };
	});
}

/**
 * @param {Scene} realm
 * @param {object} myth
 * @param {number} omen From 1.
 * @param {Scene} scene A world Scene.
 * @returns {Promise<boolean>}
 */
export const linkOmenScene = (realm, myth, omen, scene) => editOmenScenes(realm, myth, (scenes) => withOmenScene(scenes, omen, scene.id));

/**
 * @param {Scene} realm
 * @param {object} myth
 * @param {number} omen From 1.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export const unlinkOmenScene = (realm, myth, omen, id) => editOmenScenes(realm, myth, (scenes) => withoutOmenScene(scenes, omen, id));

/**
 * @param {Scene|null} scene
 * @returns {Scene|null} The Scene, if it's the world's. One from a compendium
 *   can't be activated, so the Referee is told to import it.
 */
export function linkableScene(scene) {
	if (!scene?.pack) return scene ?? null;
	warn("omenScenes.fromCompendium", { scene: scene.name });
	return null;
}

/**
 * The Scene a drag carries, if it carries a world Scene. The drop is taken
 * before anything is awaited, so the browser doesn't also drop the drag's text.
 * @param {DragEvent} event
 * @returns {Promise<Scene|null>}
 */
export async function droppedScene(event) {
	const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
	if (data?.type !== "Scene" || !data.uuid) return null;
	event.preventDefault();
	event.stopPropagation();
	return linkableScene(await fromUuid(data.uuid).catch(() => null));
}

/**
 * @param {string} id
 * @returns {Scene|null} The linked Scene, or null with word that it's gone.
 */
function linkedScene(id) {
	const scene = id ? game.scenes.get(id) : null;
	if (!scene) warn("omenScenes.gone");
	return scene ?? null;
}

/**
 * Activate a linked Scene, taking everyone there.
 * @param {string} id
 * @returns {Promise<unknown>|null}
 */
export const activateOmenScene = (id) => (game.user.isGM ? linkedScene(id)?.activate() ?? null : null);

/**
 * Show a linked Scene to the Referee alone.
 * @param {string} id
 * @returns {Promise<unknown>|null}
 */
export const viewOmenScene = (id) => linkedScene(id)?.view() ?? null;

/**
 * The buttons a Wilderness card carries for the Scenes linked to the Omen it
 * shows. The card is whispered to the Referee, and only a GM keeps the buttons.
 * Called during init.
 */
export function registerOmenSceneCards() {
	registerCardButtons({
		selector: "[data-omen-scene]",
		gmOnly: true,
		handler: (button) => activateOmenScene(button.dataset.omenScene)
	});
}
