import { loadArtIndex } from "../book-art/art-index.js";
import { confirmDialog } from "../apps/ui.js";
import { statLabels, t, warn } from "../chat/cards.js";
import { seerAutoFill, seerForKnight, seerInfo } from "../rules/creation.js";
import { escapeHTML } from "../rules/text.js";

/**
 * Fill in a Knight's Seer from Import PDF's index: their name, portrait and
 * what the book says of them, found by the Seer's name or the Knight's own.
 * For Knights made before the Seer page, or written in by hand. The Knight's
 * notes on their Seer are never touched.
 * @param {Actor} knight
 * @returns {Promise<boolean>} Whether the Seer was filled in.
 */
export async function readSeerFromBook(knight) {
	const index = await loadArtIndex();
	if (!index) {
		warn("seer.noIndex");
		return false;
	}
	const seer = seerForKnight(index, knight.system);
	if (!seer) {
		warn("seer.notFound");
		return false;
	}
	const info = seerInfo(seer, statLabels());
	const { system } = knight;
	// Only ask before writing over what someone typed or picked that the book wouldn't have.
	const replacesInfo = system.seerInfo && system.seerInfo !== info;
	const replacesImg = seer.path && system.seerImg && system.seerImg !== seer.path;
	if (replacesInfo || replacesImg) {
		const confirmed = await confirmDialog({
			title: t("seer.fromBook"),
			icon: "fa-solid fa-eye",
			message: t("seer.replaceInfo", { seer: escapeHTML(seer.name ?? "") })
		});
		if (!confirmed) return false;
	}
	await knight.update({
		"system.seer": seer.name ?? system.seer,
		"system.seerImg": seer.path ?? system.seerImg,
		"system.seerInfo": info || system.seerInfo
	});
	return true;
}

/**
 * Quietly fill in a Knight's Seer from Import PDF's index, as seerAutoFill
 * allows, so every Knight's Seer page carries its picture and what the book
 * says without anyone asking. Does nothing before Import PDF.
 * @param {Actor} knight
 * @returns {Promise<boolean>} Whether anything was filled in.
 */
export async function fillSeerFromBook(knight) {
	if (!knight?.isOwner || knight.system.isSquire) return false;
	const index = await loadArtIndex();
	const update = seerAutoFill(index, knight.system, statLabels());
	if (foundry.utils.isEmpty(update)) return false;
	await knight.update(update);
	return true;
}
