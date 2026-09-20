/**
 * Knight folders: each Knight made gets a folder of their own in the Actors
 * directory, inside one for the whole Company, and what they ride and who
 * serves them are kept in it. Pure, so it can be tested without Foundry.
 */
import { LINKED_ACTORS } from "../config.js";

/**
 * Whether an actor being made should be given a folder of its own: a Knight,
 * not a Squire (who is kept in their Knight's), made at the top of the
 * directory rather than in a folder somebody chose.
 * @param {{type: string, folder?: string|null, system?: {isSquire?: boolean}}} data The new actor's source data.
 * @returns {boolean}
 */
export const wantsOwnFolder = (data) => data.type === "knight" && !data.system?.isSquire && !data.folder;

/** The linked fields whose actor is kept in the Knight's folder. */
const KEPT = LINKED_ACTORS.filter((link) => link.kept).map((link) => link.key);

/**
 * Who is kept in a Knight's folder: their steed and, for a Knight, their
 * Squire. A Squire's Knight is not, since the Squire is kept in theirs.
 * @param {{steed?: string, squire?: string, isSquire?: boolean}} system
 * @returns {string[]} UUIDs.
 */
export function keptWith(system) {
	// A Squire's own Squire field names the Knight they serve, who keeps them instead.
	return KEPT.filter((key) => key !== "squire" || !system.isSquire).map((key) => system[key]).filter(Boolean);
}

/**
 * Whether an update changes who is kept in a Knight's folder.
 * @param {object} changes An actor update's changes.
 * @returns {boolean}
 */
export const changesKept = (changes) => KEPT.some((key) => changes.system?.[key]);
