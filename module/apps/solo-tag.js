import { SOLO_SETTING, keptFromMe } from "../actions/solo.js";
import { t } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";
import { confirmDialog } from "./ui.js";

/** Marks the tag, so a redraw of the players list doesn't add a second. */
const TAG_CLASS = "bastionland-solo-tag";

/**
 * Say what solo play keeps from the Referee, and offer to turn it off so
 * friends can join with the Referee seeing the whole Realm again.
 * @returns {Promise<boolean>} Whether solo play was turned off.
 */
export async function openSoloHelp() {
	const off = await confirmDialog({
		title: t("solo.tag.title"),
		icon: "fa-solid fa-eye-slash",
		message: ["solo.tag.what", "solo.tag.changes", "solo.tag.friends"].map((key) => t(key)),
		yes: { label: t("solo.tag.turnOff"), icon: "fa-solid fa-user-group" },
		no: { label: t("solo.tag.keep"), icon: "fa-solid fa-user" }
	});
	if (!off) return false;
	await game.settings.set(SYSTEM_ID, SOLO_SETTING, false);
	ui.notifications.info(t("solo.tag.turnedOff"));
	return true;
}

/**
 * Put a small "Solo Play" tag over the players list for a Referee playing
 * alone, since what they see of the Realm has changed. Called as the list is drawn.
 * @param {HTMLElement} element The players list.
 */
export function addSoloTag(element) {
	element.querySelector(`.${TAG_CLASS}`)?.remove();
	if (!keptFromMe()) return;
	const tag = document.createElement("button");
	tag.type = "button";
	tag.className = TAG_CLASS;
	tag.dataset.tooltipText = t("solo.tag.hint");
	tag.dataset.tooltipDirection = "RIGHT";
	const glyph = document.createElement("i");
	glyph.className = "fa-solid fa-eye-slash";
	glyph.inert = true;
	const label = document.createElement("span");
	label.textContent = t("solo.tag.label");
	tag.append(glyph, label);
	tag.addEventListener("click", () => {
		openSoloHelp().catch((error) => console.error(`${SYSTEM_ID} | Couldn't turn solo play off`, error));
	});
	const active = element.querySelector("#players-active");
	if (active) active.prepend(tag);
	else element.prepend(tag);
}
