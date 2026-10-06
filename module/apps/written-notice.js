import { t } from "../chat/cards.js";
import { HEX_JOURNAL_FLAG, HEX_LAYOUT } from "../rules/hex-journal.js";
import { parseHexKey } from "../rules/realm-geometry.js";
import { SITE_JOURNAL_FLAG, SITE_LAYOUT } from "../rules/site-journal.js";
import { SYSTEM_ID } from "../system-id.js";
import { openHex } from "./TravelsPlaces.js";

/**
 * A page of a hex's or a Site's Journal entry that the system writes again
 * opens with a word, to those who can edit it, that edits made there will be
 * lost; a hex's gives a GM a button to the hex in the Lay of the Land, where
 * it's changed. It's drawn as the page shows, never written into the page, so
 * the words the system compares are only its own.
 */

/**
 * @param {JournalEntryPage} page
 * @returns {{notice: string, scene?: string, hex?: string}|null} The notice's key, and a hex's Realm and key; null for any other page.
 */
function writtenOver(page) {
	const role = page.getFlag?.(SYSTEM_ID, "role");
	const flags = page.parent?.flags?.[SYSTEM_ID];
	const hex = flags?.[HEX_JOURNAL_FLAG];
	if (hex && HEX_LAYOUT.written.includes(role)) return { notice: "hexJournal.writtenOver", scene: hex.scene, hex: hex.hex };
	if (flags?.[SITE_JOURNAL_FLAG] && SITE_LAYOUT.written.includes(role)) return { notice: "siteJournal.writtenOver" };
	return null;
}

/**
 * @param {string} sceneId
 * @param {string} key
 * @returns {HTMLElement|null} A GM's button to the hex in the Lay of the Land, while its Realm is there.
 */
function layLink(sceneId, key) {
	const scene = game.scenes?.get(sceneId);
	const hex = parseHexKey(key ?? "");
	if (!game.user.isGM || !scene || !hex) return null;
	const button = document.createElement("button");
	button.type = "button";
	button.className = "bastionland-lay-link";
	const icon = document.createElement("i");
	icon.className = "fa-solid fa-feather";
	icon.setAttribute("inert", "");
	button.append(icon, ` ${t("hexLore.open")}`);
	button.addEventListener("click", (event) => {
		event.preventDefault();
		openHex({ scene, hex });
	});
	return button;
}

/**
 * Set the notice atop a written page as it shows. It takes Foundry's look for
 * a secret, which is who sees it: the page's owners.
 * @param {foundry.applications.sheets.journal.JournalEntryPageTextSheet} sheet
 * @param {HTMLElement} element
 */
export function addWrittenNotice(sheet, element) {
	const page = sheet.document;
	if (!sheet.isView || !page?.isOwner) return;
	const kept = writtenOver(page);
	if (!kept) return;
	const notice = document.createElement("section");
	notice.className = "secret bastionland-written-notice";
	const words = document.createElement("p");
	const em = document.createElement("em");
	em.textContent = t(kept.notice);
	words.append(em);
	notice.append(words);
	const link = kept.hex ? layLink(kept.scene, kept.hex) : null;
	if (link) {
		const line = document.createElement("p");
		line.append(link);
		notice.append(line);
	}
	(element.querySelector(".journal-page-content") ?? element).prepend(notice);
}

/** Called during init. */
export function registerWrittenNotices() {
	Hooks.on("renderJournalEntryPageTextSheet", addWrittenNotice);
}
