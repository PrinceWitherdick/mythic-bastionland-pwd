import { changeCompanyPicture } from "../apps/company-picture.js";
import { COMPANY_FLAG } from "../actions/company.js";
import { heraldryBadge } from "../rules/token-heraldry.js";
import { drawShield } from "./shield-graphics.js";
import { t } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";
import { onCompanyDoubleClick } from "./travels-click.js";
import { isKnight } from "../rules/knight-types.js";
import { ROUND_FLAG, ROUND_FLAG_PATH, isRoundPicture } from "../rules/round-tokens.js";
import { circleTexture } from "./round-tokens.js";

/** Token flag set when the heraldry badge is hidden on that Token. */
export const HIDE_HERALDRY_FLAG = "hideHeraldry";

/**
 * The system's Token: its picture is cropped to a circle unless its Round
 * picture tick is off, and a Knight's wears their heraldry on a small shield at
 * the top right of its picture, once they've painted some.
 */
export class BastionlandToken extends foundry.canvas.placeables.Token {
	/**
	 * The heraldry badge, empty when there's none to show.
	 * @type {PIXI.Container}
	 */
	heraldry;

	/** What the badge was last drawn for: the painting and the picture's box, or "" for nothing. */
	#heraldryDrawn = "";

	/** Counts draws, so a slow load that's been overtaken is dropped. */
	#heraldryDraws = 0;

	/** The circle the picture is cut to, or null while it's shown whole. */
	#roundMask = null;

	/** Whether the picture is cropped to a circle. */
	get isRoundPicture() {
		return isRoundPicture({
			round: this.document.getFlag(SYSTEM_ID, ROUND_FLAG),
			ringEnabled: this.document.ring?.enabled,
			isCompany: this.isCompany
		});
	}

	/**
	 * Cut the picture to a circle filling the Token, or to the picture itself
	 * when it's scaled down smaller than the Token; or show it whole again.
	 */
	refreshRoundPicture() {
		const mesh = this.mesh;
		if (!mesh || mesh.destroyed) return;
		if (!this.isRoundPicture) {
			this.#dropRoundMask();
			return;
		}
		if (!this.#roundMask || this.#roundMask.destroyed) this.#roundMask = this.addChild(new PIXI.Sprite(circleTexture()));
		const { width, height } = this.document.getSize();
		const { scaleX, scaleY } = this.document.texture;
		const shrink = Math.min(1, Math.abs(scaleX), Math.abs(scaleY));
		this.#roundMask.width = width * shrink;
		this.#roundMask.height = height * shrink;
		this.#roundMask.position.set((width - this.#roundMask.width) / 2, (height - this.#roundMask.height) / 2);
		if (mesh.mask !== this.#roundMask) mesh.mask = this.#roundMask;
	}

	/** Show the picture whole, and let go of the circle. */
	#dropRoundMask() {
		const mask = this.#roundMask;
		this.#roundMask = null;
		if (this.mesh && !this.mesh.destroyed && this.mesh.mask && this.mesh.mask === mask) this.mesh.mask = null;
		if (mask && !mask.destroyed) {
			mask.parent?.removeChild(mask);
			mask.destroy();
		}
	}

	/** The Knight's painting, or "" for anyone else or a Knight who hasn't painted any. */
	get knightHeraldry() {
		const actor = this.actor;
		return isKnight(actor) ? (actor.system.heraldry ?? "") : "";
	}

	/** The painting this Token should show: its Knight's, or "" when there's none or it's hidden. */
	get heraldrySrc() {
		return this.document.getFlag(SYSTEM_ID, HIDE_HERALDRY_FLAG) ? "" : this.knightHeraldry;
	}

	/**
	 * The box the Token's picture fills, in the Token's own pixels. A tall
	 * picture fitted to a square Token is narrower than the Token.
	 * @returns {{x: number, y: number, width: number, height: number}}
	 */
	get artBox() {
		const { width, height } = this.document.getSize();
		const artWidth = Math.min(Math.abs(this.mesh?.width || width), width);
		const artHeight = Math.min(Math.abs(this.mesh?.height || height), height);
		return { x: (width - artWidth) / 2, y: (height - artHeight) / 2, width: artWidth, height: artHeight };
	}

	/** @inheritDoc */
	async _draw(options) {
		// The mesh outlives a redraw, so it mustn't keep a circle the redraw throws away.
		this.#dropRoundMask();
		await super._draw(options);
		this.heraldry ||= this.addChild(new PIXI.Container());
		// The refresh after every draw sizes the picture, then draws the badge to it.
		this.#heraldryDrawn = null;
	}

	/** Draw the badge again if the heraldry or the picture has changed since it was last drawn. */
	refreshHeraldry() {
		if (!this.heraldry || this.heraldry.destroyed) return;
		const src = this.heraldrySrc;
		const art = this.artBox;
		const key = src && `${src} ${art.x} ${art.y} ${art.width} ${art.height}`;
		if (key === this.#heraldryDrawn) return;
		this.#heraldryDrawn = key;
		this.#drawHeraldry(src, art);
	}

	async #drawHeraldry(src, art) {
		const draw = ++this.#heraldryDraws;
		const texture = src ? await foundry.canvas.loadTexture(src) : null;
		if (draw !== this.#heraldryDraws || this.destroyed || this.heraldry.destroyed) return;

		this.heraldry.removeChildren().forEach((child) => child.destroy());
		if (!texture) return;

		const { width, height } = this.document.getSize();
		drawShield(this.heraldry, texture, heraldryBadge(art, Math.min(width, height)));
	}

	/** Whether this is the one Token standing for the whole Company (p7). */
	get isCompany() {
		return Boolean(this.document.getFlag(SYSTEM_ID, COMPANY_FLAG));
	}

	/**
	 * Foundry asks this before it lets a double click through, and warns that
	 * the Token's Actor is missing when there is none. The Company's Token has
	 * none on purpose, so the warning would be wrong: everyone is let through,
	 * on the Token tools, to the hex it stands in.
	 * @inheritDoc
	 */
	_canView(user, event) {
		if (!this.isCompany) return super._canView(user, event);
		return Boolean(this.layer.active && !this.isPreview && !this.layer._draggedToken);
	}

	/**
	 * A double click opens an Actor's sheet, and the Company's Token has no
	 * Actor on purpose, so it opens the hex the Company stands in, in Places,
	 * as one on open ground opens that hex. Its picture is in the Token HUD.
	 * @inheritDoc
	 */
	_onClickLeft2(event) {
		if (!this.isCompany) return super._onClickLeft2(event);
		if (!this._propagateLeftClick(event)) event.stopPropagation();
		onCompanyDoubleClick(this);
	}

	/** @inheritDoc */
	_refreshState() {
		super._refreshState();
		if (this.heraldry) this.heraldry.visible = !this.document.isSecret;
	}

	/** @inheritDoc */
	_refreshSize() {
		super._refreshSize();
		this.refreshHeraldry();
	}

	/** @inheritDoc */
	_applyRenderFlags(flags) {
		super._applyRenderFlags(flags);
		// The circle follows the Token's size and its picture's scale. A full refresh changes both; it's cut once.
		if (flags.refreshSize || flags.refreshMesh) this.refreshRoundPicture();
	}

	/** @inheritDoc */
	_onUpdate(changed, options, userId) {
		super._onUpdate(changed, options, userId);
		if (foundry.utils.hasProperty(changed, ROUND_FLAG_PATH)) this.renderFlags.set({ refreshMesh: true });
	}

	/** @inheritDoc */
	_destroy(options) {
		this.#dropRoundMask();
		super._destroy(options);
	}
}

/**
 * Add a button to the left column of the Token HUD a right click opens.
 * @param {HTMLElement} element The HUD.
 * @param {object} options
 * @param {string} options.icon Its Font Awesome icon, such as "fa-flag".
 * @param {string} options.label What it says to a screen reader.
 * @param {boolean} [options.active] Whether it shows as switched on.
 * @param {(event: MouseEvent) => unknown} options.onClick
 */
function addHudButton(element, { icon, label, active = false, onClick }) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = `control-icon${active ? " active" : ""}`;
	button.dataset.tooltip = "";
	button.ariaLabel = label;
	button.innerHTML = `<i class="fa-solid ${icon}" inert></i>`;
	button.addEventListener("click", (event) => {
		event.preventDefault();
		onClick(event);
	});
	element.querySelector(".col.left")?.append(button);
}

/**
 * Put a Hide/Show heraldry button in the Token HUD, for a Knight who has
 * painted heraldry and a user who owns the Token.
 * @param {TokenHUD} hud
 * @param {HTMLElement} element
 */
function addHeraldryButton(hud, element) {
	const token = hud.object;
	if (!token?.knightHeraldry || !token.document.isOwner) return;
	const hidden = Boolean(token.document.getFlag(SYSTEM_ID, HIDE_HERALDRY_FLAG));
	addHudButton(element, {
		icon: "fa-shield-halved",
		label: t(hidden ? "heraldry.showOnToken" : "heraldry.hideOnToken"),
		active: hidden,
		onClick: async () => {
			await token.document.setFlag(SYSTEM_ID, HIDE_HERALDRY_FLAG, !hidden);
			hud.render();
		}
	});
}

/**
 * Put a Company picture button in the Token HUD a right click opens on the
 * Company's Token, for the Referee. It's the only way to change the picture
 * once the Realm is made.
 * @param {TokenHUD} hud
 * @param {HTMLElement} element
 */
function addCompanyPictureButton(hud, element) {
	const token = hud.object;
	if (!token?.isCompany || !game.user.isGM) return;
	addHudButton(element, {
		icon: "fa-flag",
		label: t("company.picture"),
		onClick: () => {
			hud.close();
			changeCompanyPicture(token.document);
		}
	});
}

/** Keep every Knight's badge in step with their heraldry as it's painted or hidden, and offer the HUD buttons. */
export function registerTokenHeraldryHooks() {
	Hooks.on("updateActor", (actor, changes) => {
		if (!foundry.utils.hasProperty(changes, "system.heraldry")) return;
		for (const token of actor.getActiveTokens()) token.refreshHeraldry?.();
	});
	Hooks.on("updateToken", (document, changes) => {
		const touches = ["actorId", "delta.system.heraldry", `flags.${SYSTEM_ID}.${HIDE_HERALDRY_FLAG}`];
		if (touches.some((path) => foundry.utils.hasProperty(changes, path))) document.object?.refreshHeraldry?.();
	});
	Hooks.on("renderTokenHUD", addHeraldryButton);
	Hooks.on("renderTokenHUD", addCompanyPictureButton);
}
