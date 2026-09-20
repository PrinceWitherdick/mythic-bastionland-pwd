import { pickImageInto } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { slugify } from "../rules/book-art.js";
import { SYSTEM_ID } from "../system-id.js";
import { openPortraitFrame } from "./PortraitFrame.js";

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

/**
 * A Knight's picture, opened from their sheet after Stonetop's portrait
 * window: the whole picture, with Change Picture and Frame in the header for
 * those who may edit it. It follows the actor, so a picture changed here,
 * on the sheet or by someone else shows at once.
 */
export class PortraitPopout extends ArtPopout {
	static DEFAULT_OPTIONS = {
		actions: {
			changePicture: PortraitPopout.#onChangePicture,
			framePortrait: PortraitPopout.#onFramePortrait
		}
	};

	/** @type {Actor} */
	actor;

	/** @type {number|null} */
	#hook = null;

	/** @param {object} options */
	constructor(options) {
		super(options);
		this.actor = options.actor;
	}

	/** @override */
	_getFrameButtons(options) {
		const buttons = super._getFrameButtons(options);
		if (this.actor?.isOwner) {
			buttons.unshift(
				{ action: "changePicture", icon: "fa-solid fa-image", label: "bastionland.portrait.change" },
				{ action: "framePortrait", icon: "fa-solid fa-crop-simple", label: "bastionland.portrait.frame" }
			);
		}
		return buttons;
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		this.#hook = Hooks.on("updateActor", (actor, changes) => {
			if (actor === this.actor && "img" in changes) this.#show(actor.img);
		});
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		if (this.#hook !== null) Hooks.off("updateActor", this.#hook);
		this.#hook = null;
	}

	/**
	 * Show a new picture in place, keeping where the window was put.
	 * @param {string} src
	 */
	#show(src) {
		this.options.src = src;
		const media = this.element?.querySelector(".window-content img, .window-content video");
		if (media?.tagName === "IMG" && !foundry.helpers.media.VideoHelper.hasVideoExtension(src)) media.src = src;
		else this.render();
	}

	/** @this {PortraitPopout} */
	static #onChangePicture() {
		return pickImageInto(this.actor);
	}

	/** @this {PortraitPopout} */
	static #onFramePortrait() {
		if (foundry.helpers.media.VideoHelper.hasVideoExtension(this.actor.img)) {
			ui.notifications.warn(t("portrait.video"));
			return;
		}
		return openPortraitFrame(this.actor);
	}
}

/**
 * Open an actor's picture larger, or bring it forward.
 * @param {Actor} actor
 * @returns {PortraitPopout}
 */
export function openPortrait(actor) {
	const id = `${SYSTEM_ID}-portrait-${actor.id}`;
	const popout = foundry.applications.instances.get(id)
		?? new PortraitPopout({ id, actor, src: actor.img, window: { title: actor.name, icon: "fa-solid fa-chess-knight" } });
	popout.render({ force: true });
	return popout;
}
