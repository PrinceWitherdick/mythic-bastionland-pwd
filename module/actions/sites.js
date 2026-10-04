import { addDirectoryButton } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { emptySite, normaliseSite, siteChanges } from "../rules/sites.js";
import { SYSTEM_ID } from "../system-id.js";
import { JOURNAL_FOLDER_COLOR, flaggedFolder } from "./folders.js";

/** The flag a Site's Journal entry keeps the Site under. */
export const SITE_FLAG = "site";

/**
 * The sheet a Site's Journal entry opens with, named the way Foundry names a
 * registered sheet: the scope, then the class's name. Renaming the class would
 * quietly leave every Site opening as a blank Journal entry, so the boot test
 * holds the two together.
 */
export const SITE_SHEET_CLASS = `${SYSTEM_ID}.SiteSheet`;

/** Marks the Journal folder Sites are filed in, so it's found again whatever it's renamed to. */
const FOLDER_FLAG = "sitesFolder";

/**
 * @param {JournalEntry} entry
 * @returns {boolean} Whether the entry holds a Site.
 */
export const isSiteEntry = (entry) => Boolean(entry?.flags?.[SYSTEM_ID]?.[SITE_FLAG]);

/**
 * @param {JournalEntry} entry
 * @returns {import("../rules/sites.js").Site}
 */
export const readSite = (entry) => normaliseSite(entry?.flags?.[SYSTEM_ID]?.[SITE_FLAG]);

/**
 * @param {import("../rules/sites.js").Site} before
 * @param {import("../rules/sites.js").Site} after
 * @returns {Record<string, unknown>} An update for the Site's Journal entry that writes only what changed.
 */
export const siteUpdate = (before, after) => Object.fromEntries(Object.entries(siteChanges(before, after))
	.map(([path, value]) => [`flags.${SYSTEM_ID}.${SITE_FLAG}.${path}`, value]));

/**
 * The Journal folder Sites are filed in, made the first time it's wanted.
 * @returns {Promise<Folder|null>} Null when it couldn't be made, so the Site goes at the top level instead.
 */
const sitesFolder = () => flaggedFolder("JournalEntry", FOLDER_FLAG, true, { name: t("sites.folder"), color: JOURNAL_FOLDER_COLOR });

/**
 * Make a Journal entry for a new, empty Site and open it on the map. GMs only.
 * If it's closed with nothing drawn or written, the entry is deleted again.
 * @returns {Promise<JournalEntry|null>}
 */
export async function newSite() {
	if (!game.user.isGM) return null;
	const folder = await sitesFolder();
	const entry = await foundry.utils.getDocumentClass("JournalEntry").create({
		name: t("sites.defaultName"),
		folder: folder?.id ?? null,
		flags: {
			core: { sheetClass: SITE_SHEET_CLASS },
			[SYSTEM_ID]: { [SITE_FLAG]: emptySite() }
		}
	});
	if (!entry) return null;
	entry.sheet.discardIfBlank = true;
	await entry.sheet.render({ force: true });
	return entry;
}

/**
 * Put New Site in the Journal directory's header, for GMs.
 * @param {HTMLElement} element The directory.
 */
export function addNewSiteButton(element) {
	if (!game.user.isGM) return;
	addDirectoryButton(element, {
		className: "bastionland-new-site",
		icon: "fa-solid fa-dungeon",
		label: t("sites.newSite"),
		onClick: () => newSite()
	});
}
