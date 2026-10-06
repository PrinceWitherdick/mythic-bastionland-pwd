import { isRealmScene } from "../actions/realm.js";

/** The Places window's id, by which the windows that keep things in its chosen hex find it. */
export const PLACES_ID = "bastionland-travels";

/**
 * The hex a GM has chosen in Places while it's open: where the Spark Tables
 * and Flip the Book keep what's rolled, so they follow the hex Places shows.
 * @returns {{scene: Scene, hex: {col: number, row: number}}|null}
 */
export function placesChosenHex() {
	const open = game.user?.isGM ? foundry.applications.instances.get(PLACES_ID) : null;
	const at = open?.rendered ? open.chosen() : null;
	return at && isRealmScene(at.scene) ? at : null;
}
