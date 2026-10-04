import { deletionEntry, replacementEntry } from "../compat.js";
import { changedHexes } from "../rules/journey.js";
import { serialWrites } from "../rules/queue.js";
import { SYSTEM_ID } from "../system-id.js";
import { isRealmScene } from "./realm.js";

/**
 * How a Scene flag that keeps something for each hex of a Realm, such as the
 * Lay of the Land's notes or the Company's visits, is changed: one write at a
 * time, and only the hexes that changed, each written whole or taken out, so a
 * change to another hex, or to the Realm itself, isn't written over, and what
 * was rubbed out of a hex really goes. GMs only.
 * @param {object} options
 * @param {string} options.flag The flag, under the system's own.
 * @param {number} options.version Written beside the hexes.
 * @param {(scene: Scene) => {hexes: Record<string, object>}} options.read The flag as it stands.
 * @param {(after: object) => object} [options.besides] Other keys of the flag to write, by their own names.
 * @returns {(scene: Scene, edit: (before: object) => object) => Promise<boolean>} Changes the
 *   flag on a Realm Scene by `edit`, which hands back what it was given where nothing changes,
 *   and a new record only for the hexes it changes. Says whether anything was written.
 */
export function hexFlagEditor({ flag, version, read, besides = () => ({}) }) {
	const queue = serialWrites();
	const flagPath = (...parts) => `flags.${SYSTEM_ID}.${flag}.${parts.join(".")}`;
	return (scene, edit) => {
		if (!game.user.isGM || !isRealmScene(scene)) return Promise.resolve(false);
		return queue(async () => {
			const before = read(scene);
			const after = edit(before);
			const keys = after === before ? [] : changedHexes(before, after);
			if (!keys.length) return false;
			const update = { [flagPath("version")]: version };
			for (const [key, value] of Object.entries(besides(after))) update[flagPath(key)] = value;
			// A hex forgotten is a key taken out, rather than an empty record left behind.
			for (const key of keys) {
				const record = after.hexes[key];
				const [path, value] = record ? replacementEntry(flagPath("hexes", key), record) : deletionEntry(flagPath("hexes", key));
				update[path] = value;
			}
			await scene.update(update);
			return true;
		});
	};
}
