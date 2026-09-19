import { t } from "../chat/cards.js";
import { slugify } from "../rules/book-art.js";
import { SYSTEM_ID } from "../system-id.js";

const { ImagePopout } = foundry.applications.apps;

/**
 * A picture opened larger in its own window: Foundry's ImagePopout, with Show
 * Players in the header itself rather than the menu, since showing it is what
 * a GM opens one for. Players get the picture with its title, such as a
 * Myth's name.
 */
export class ArtPopout extends ImagePopout {
	static DEFAULT_OPTIONS = {
		classes: ["bastionland-art-popout"],
		// Foundry's own Show is in the menu. This window's is the header button.
		window: { controls: [] },
		actions: { showPlayers: ArtPopout.#onShowPlayers }
	};

	/** @override */
	_getFrameButtons(options) {
		const buttons = super._getFrameButtons(options);
		if (game.user.isGM) buttons.unshift({ action: "showPlayers", icon: "fa-solid fa-eye", label: "bastionland.artPopout.showPlayers" });
		return buttons;
	}

	/** @this {ArtPopout} */
	static #onShowPlayers() {
		if (!game.users.some((user) => user.active && !user.isSelf)) {
			ui.notifications.info(t("artPopout.nobodyToShow"));
			return;
		}
		// Sent directly rather than through shareImage, whose own notice would say the same again.
		game.socket.emit("shareImage", { image: this.options.src, title: this.title, showTitle: true });
		ui.notifications.info(t("artPopout.shown", { name: this.title }));
	}
}

/**
 * Open a picture larger, or bring it forward if it's open already.
 * @param {{src: string, title: string, icon?: string}} art
 * @returns {ArtPopout}
 */
export function openArt({ src, title, icon = "fa-solid fa-image" }) {
	const id = `${SYSTEM_ID}-art-${slugify(src)}`;
	const popout = foundry.applications.instances.get(id) ?? new ArtPopout({ id, src, window: { title, icon } });
	popout.render({ force: true });
	return popout;
}
