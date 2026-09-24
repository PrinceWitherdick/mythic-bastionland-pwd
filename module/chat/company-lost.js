/**
 * The Company's Token deleted. Foundry deletes a Token on the Delete key
 * without asking, and this one has no Actor to reopen it from, so its going
 * is noticed here: the Realm remembers where it stood, and the GMs are
 * whispered a card that puts it back in that hex with the picture it carried.
 */
import { COMPANY_FLAG, lastCompanyHex, rememberCompany, standCompanyAgain } from "../actions/company.js";
import { isRealmScene } from "../actions/realm.js";
import { SYSTEM_ID } from "../system-id.js";
import { onCardClick, postCard, t } from "./cards.js";

const BUTTONS = "[data-company-restore]";

/**
 * Notice the Company's Token going. Only the GM keeping the world does the
 * work, so one card is posted however many are logged in, and a player who
 * can move the Company doesn't write to the Scene.
 * @param {TokenDocument} token
 */
async function noticeCompanyDeleted(token) {
	const scene = token?.parent;
	if (!token.getFlag(SYSTEM_ID, COMPANY_FLAG) || !isRealmScene(scene)) return;
	if (!game.users.activeGM?.isSelf) return;

	await rememberCompany(scene, token);
	const hex = lastCompanyHex(scene);
	await postCard(null, "company-lost", {
		scene: scene.id,
		text: hex ? t("company.lost.text", { hex: t("realm.hex", hex) }) : t("company.lost.textAway"),
		title: t("company.lost.title"),
		label: t("company.lost.button"),
		// Nowhere to put them back, so the card only says they've gone.
		restorable: Boolean(hex)
	}, { mode: "gm", speaker: { alias: game.system.title } });
}

/**
 * Wire up the card's button, for GMs.
 * @param {ChatMessage} _message
 * @param {HTMLElement} html
 */
function activateCompanyLost(_message, html) {
	if (!game.user.isGM || !html.querySelector(BUTTONS)) return;
	onCardClick(html, BUTTONS, async (button) => {
		const scene = game.scenes.get(button.dataset.companyRestore);
		const token = await standCompanyAgain(scene);
		if (token) ui.notifications.info(t("company.lost.back", { hex: t("realm.hex", lastCompanyHex(scene)) }));
		else ui.notifications.warn(t("company.lost.cannot"));
	});
}

/** Called during init. */
export function registerCompanyLostCard() {
	Hooks.on("deleteToken", noticeCompanyDeleted);
	Hooks.on("renderChatMessageHTML", activateCompanyLost);
}
