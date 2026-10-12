import { ensureDirectories, uploadFile } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { ART_ROOT } from "../rules/book-art.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * Where the world keeps the pointer to its rulebook.
 *
 * The reader fetches by URL, so the file has to be somewhere this Foundry
 * serves, which means the Data folder. Anyone signed into the world can fetch
 * a file from there if they know the path: that's the GM's call to make about
 * their own table, so the setup window says so plainly rather than leaving it
 * to be discovered. Only the path is stored; no part of the book is shipped.
 */

/** World setting holding the path to the GM's copy. */
const PATH_SETTING = "rulebookPdf";

/** World setting: whether players get the book offered to them as well. */
const PLAYERS_SETTING = "rulebookForPlayers";

/**
 * Top-level folder under Data a copied book lands in, outside `systems/`, so a
 * system update or reinstall can't take the GM's book with it. It's the folder
 * the art read out of the book goes to as well, so everything that came from
 * the GM's copy sits in the one place.
 */
export const RULEBOOK_DIR = ART_ROOT;

/** The copy is named for the system rather than for whatever the GM's file is called, so re-picking overwrites it instead of leaving a 60 MB orphan behind. */
const RULEBOOK_FILE = "mythic-bastionland.pdf";

/**
 * Where every world's copy lands. The folder is shared by the whole Foundry,
 * so a book kept by one world is there for the next one made.
 */
export const KEPT_RULEBOOK = `${RULEBOOK_DIR}/${RULEBOOK_FILE}`;

/**
 * World setting: what became of a book this world found kept by another.
 * "" when it found none, "pending" until its art and tables are imported
 * here, "done" after.
 */
const FOUND_SETTING = "rulebookFound";

/**
 * World setting: whether the GM sent this world's book away with Forget, so the
 * copy another world kept, still on the server, isn't taken up again next load.
 */
const FORGOTTEN_SETTING = "rulebookForgotten";

/** Called on every client when the world's copy changes. */
export const RULEBOOK_HOOK = `${SYSTEM_ID}.rulebookChanged`;

/** Register the rulebook's settings. Called during init. */
export function registerRulebookSettings() {
	game.settings.register(SYSTEM_ID, PATH_SETTING, {
		scope: "world",
		config: false,
		type: String,
		default: "",
		onChange: () => Hooks.callAll(RULEBOOK_HOOK)
	});
	game.settings.register(SYSTEM_ID, FOUND_SETTING, {
		scope: "world",
		config: false,
		type: String,
		default: "",
		onChange: () => Hooks.callAll(RULEBOOK_HOOK)
	});
	game.settings.register(SYSTEM_ID, FORGOTTEN_SETTING, {
		scope: "world",
		config: false,
		type: Boolean,
		default: false
	});
	game.settings.register(SYSTEM_ID, PLAYERS_SETTING, {
		name: "bastionland.rulebook.settings.forPlayers.name",
		hint: "bastionland.rulebook.settings.forPlayers.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		onChange: () => Hooks.callAll(RULEBOOK_HOOK)
	});
}

/**
 * @returns {string} Where this world's copy lives, or "" if it has none.
 *   Tolerant of a setting that isn't registered yet, since a sidebar can draw
 *   before the world is ready and "no book" is the right answer then.
 */
export function rulebookPath() {
	try {
		const path = game.settings.get(SYSTEM_ID, PATH_SETTING);
		return typeof path === "string" ? path.trim() : "";
	} catch {
		return "";
	}
}

/** @returns {boolean} Whether the world has been pointed at a copy. */
export function hasRulebook() {
	return !!rulebookPath();
}

/**
 * Record where the book lives. A book chosen again undoes a Forget.
 * @param {string} path
 */
export async function saveRulebookPath(path) {
	const kept = String(path ?? "").trim();
	await game.settings.set(SYSTEM_ID, PATH_SETTING, kept);
	if (kept && wasRulebookForgotten()) await game.settings.set(SYSTEM_ID, FORGOTTEN_SETTING, false);
}

/**
 * Send the world's book away. The copy stays on the server, so the world
 * remembers it was sent away, or the next load would take it up again. A
 * found book still waiting to be imported waits no more.
 */
export async function forgetRulebook() {
	await game.settings.set(SYSTEM_ID, PATH_SETTING, "");
	await game.settings.set(SYSTEM_ID, FORGOTTEN_SETTING, true);
	if (foundRulebook() === "pending") await setFoundRulebook("");
}

/** @returns {boolean} Whether the GM sent this world's book away with Forget. */
export function wasRulebookForgotten() {
	try {
		return game.settings.get(SYSTEM_ID, FORGOTTEN_SETTING) === true;
	} catch {
		return false;
	}
}

/** @returns {boolean} Whether this user is offered the book at all. */
export function canReadRulebook() {
	if (game.user?.isGM) return true;
	try {
		return game.settings.get(SYSTEM_ID, PLAYERS_SETTING) === true;
	} catch {
		return false;
	}
}

/**
 * @returns {boolean} Whether this user can keep a book: both halves of the
 *   gesture, since copying the file in without being allowed to write the
 *   world setting leaves a 60 MB file nothing points at.
 */
export function canKeepRulebook() {
	if (game.user?.isGM) return true;
	return !!(game.user?.can("FILES_UPLOAD") && game.user?.can("SETTINGS_MODIFY"));
}

/** @returns {boolean} Whether this user can browse for a book already on the server. */
export function canBrowseRulebooks() {
	return !!(game.user?.isGM || game.user?.can("FILES_BROWSE"));
}

/**
 * Copy a file the user picked off their own computer into the world's data,
 * then record where it landed. Nothing is recorded until the copy is there: a
 * refused upload doesn't throw, it just answers null, and a path to a file
 * nobody wrote opens a reader that shows nothing and says why.
 * @param {File} file
 * @returns {Promise<string|null>} The stored path, or null if nothing was kept.
 */
export async function keepRulebook(file) {
	if (!file) return null;

	ui.notifications.info(t("rulebook.copying"));
	let path = null;
	try {
		await ensureDirectories([RULEBOOK_DIR]);
		path = await uploadFile(RULEBOOK_DIR, new File([file], RULEBOOK_FILE, { type: "application/pdf" }));
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't copy the rulebook into the world`, error);
	}
	if (!path) {
		ui.notifications.error(t("rulebook.copyFailed"));
		return null;
	}

	try {
		await saveRulebookPath(path);
	} catch (error) {
		console.error(`${SYSTEM_ID} | Copied the rulebook in but couldn't record where it went`, error);
		ui.notifications.error(t("rulebook.keepFailed"));
		return null;
	}
	ui.notifications.info(t("rulebook.copied"));
	return path;
}

/** @returns {""|"pending"|"done"} What became of a book this world found kept by another. */
export function foundRulebook() {
	try {
		const found = game.settings.get(SYSTEM_ID, FOUND_SETTING);
		return found === "pending" || found === "done" ? found : "";
	} catch {
		return "";
	}
}

/**
 * @param {""|"pending"|"done"} state
 * @returns {Promise<unknown>}
 */
export const setFoundRulebook = (state) => game.settings.set(SYSTEM_ID, FOUND_SETTING, state);

/**
 * @returns {Promise<boolean>} Whether a copy kept by some world is on the server.
 */
async function keptRulebookThere() {
	try {
		const response = await fetch(foundry.utils.getRoute(KEPT_RULEBOOK), { method: "HEAD", cache: "no-cache" });
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Point a world with no book at the one another world already kept, so its GM
 * isn't asked for the PDF again, and leave its import pending. Run by the
 * active GM on every load, before world setup, so a new world's welcome cards
 * know not to ask either, and so a world made before any world kept a book
 * takes it up too. A book the GM sent away with Forget stays away.
 * @returns {Promise<boolean>} Whether this world took up the kept copy.
 */
export async function findKeptRulebook() {
	if (hasRulebook() || wasRulebookForgotten()) return false;
	if (!(await keptRulebookThere())) return false;
	await saveRulebookPath(KEPT_RULEBOOK);
	await setFoundRulebook("pending");
	return true;
}

/**
 * Fetch the world's copy back as a file, to import it the way a chosen one is.
 * @returns {Promise<File|null>} Null if it can't be fetched.
 */
export async function fetchRulebook() {
	const path = rulebookPath();
	if (!path) return null;
	try {
		const response = await fetch(foundry.utils.getRoute(path), { cache: "no-cache" });
		if (!response.ok) return null;
		return new File([await response.blob()], RULEBOOK_FILE, { type: "application/pdf" });
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't fetch the rulebook from ${path}`, error);
		return null;
	}
}
