import { changeCompanyPicture } from "../apps/company-picture.js";
import { COMPANY_FLAG } from "../actions/company.js";
import { INK_HEX } from "../rules/colour.js";
import { SHIELD_OUTLINE_PATH, SHIELD_PATH } from "../rules/heraldry.js";
import { heraldryBadge, pathSteps } from "../rules/token-heraldry.js";
import { t } from "../chat/cards.js";
import { SYSTEM_ID } from "../system-id.js";
import { onCompanyDoubleClick } from "./travels-click.js";

/** Token flag set when the heraldry badge is hidden on that Token. */
export const HIDE_HERALDRY_FLAG = "hideHeraldry";

/** The sheet's ink (--bastionland-ink), for the shield's border. */

/**
 * Trace a shield path onto a Graphics, already begun with a fill or line.
 * @param {PIXI.Graphics} graphics
 * @param {string} path
 * @param {number} scale
 * @param {{x: number, y: number}} at
 */
function traceShield(graphics, path, scale, at) {
	for (const [command, ...points] of pathSteps(path, scale, at.x, at.y)) {
		if (command === "M") graphics.moveTo(...points);
		else if (command === "L") graphics.lineTo(...points);
		else if (command === "Q") graphics.quadraticCurveTo(...points);
		else if (command === "C") graphics.bezierCurveTo(...points);
		else graphics.closePath();
	}
}

/**
 * The system's Token: a Knight's wears their heraldry on a small shield at the
 * top right of its picture, once they've painted some.
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

	/** The Knight's painting, or "" for anyone else or a Knight who hasn't painted any. */
	get knightHeraldry() {
		const actor = this.actor;
		return actor?.type === "knight" ? (actor.system.heraldry ?? "") : "";
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
		const badge = heraldryBadge(art, Math.min(width, height));

		const outline = this.heraldry.addChild(new PIXI.Graphics());
		outline.beginFill(INK_HEX);
		traceShield(outline, SHIELD_OUTLINE_PATH, badge.scale, badge.outline);
		outline.endFill();

		const painting = this.heraldry.addChild(new PIXI.Sprite(texture));
		painting.position.set(badge.painting.x, badge.painting.y);
		painting.width = badge.painting.width;
		painting.height = badge.painting.height;
		const field = this.heraldry.addChild(new PIXI.Graphics());
		field.beginFill(0xffffff);
		traceShield(field, SHIELD_PATH, badge.scale, badge.field);
		field.endFill();
		painting.mask = field;
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
