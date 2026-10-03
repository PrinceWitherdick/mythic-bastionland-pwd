/**
 * The New Realm dialog's Map size preview, opened larger in a window of its
 * own: the GM's map as large as the window allows, with the Realm's hexes over
 * it, and the numbers and the Fewer and More hexes buttons beside it. What's set
 * there is set on the page, and the other way about, as it's done.
 */
import { t } from "../chat/cards.js";
import { templatePath } from "../system-id.js";
import { uncleanedContent } from "./ui.js";
import { wireMapSizeMirror } from "./map-size-fields.js";

/** @type {foundry.applications.api.DialogV2|null} The one window, while it's open. */
let open = null;

/**
 * Open the Map size page's map larger, or bring it forward if it's open.
 * @param {import("./map-size-fields.js").MapSizeControls} controls The page's, from wireMapSizeFields.
 * @returns {Promise<void>}
 */
export async function openMapSizeWindow(controls) {
	if (open?.rendered) {
		open.bringToFront();
		return;
	}
	const content = uncleanedContent(await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/map-size-window.hbs"), {}));
	let stop = () => {};
	const dialog = new foundry.applications.api.DialogV2({
		window: { title: t("realm.picture.sizeWindow.title"), icon: "fa-solid fa-ruler-combined", resizable: true },
		classes: ["bastionland-dialog", "bastionland-map-size-window"],
		position: {
			width: Math.max(480, Math.min(1100, window.innerWidth - 80)),
			height: Math.max(420, window.innerHeight - 120)
		},
		content,
		// Nothing to send: the numbers are already the page's.
		buttons: [{ action: "done", label: t("realm.picture.sizeWindow.done"), icon: "fa-solid fa-check", default: true }]
	});
	// Only DialogV2.wait takes a render callback; a dialog made with `new` is listened to.
	dialog.addEventListener("render", () => {
		stop();
		stop = wireMapSizeMirror(dialog.element, controls);
	});
	dialog.addEventListener("close", () => {
		stop();
		if (open === dialog) open = null;
	});
	open = dialog;
	await dialog.render({ force: true });
}

/** Close the larger window, as the New Realm dialog it belongs to closes. */
export function closeMapSizeWindow() {
	open?.close();
	open = null;
}
