import { t } from "../chat/cards.js";
import {
	FRAME_FLAG,
	MIN_SHARE,
	boxFromDrag,
	boxToRect,
	clampBox,
	defaultRect,
	frameStyle,
	hitTestBox,
	nudgeBox,
	normalizeFrame,
	normalizeRect,
	rectEq,
	rectToBox,
	resizeBox,
	sameSrc,
	stageFor
} from "../rules/portrait-frame.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export { FRAME_FLAG };

/** @returns {object|null} The frame an actor carries. */
export const actorFrame = (actor) => actor?.getFlag?.(SYSTEM_ID, FRAME_FLAG) ?? null;

/**
 * What a framer frames: a picture, the frame it has, and where a new one is kept.
 * @typedef {object} FrameSubject
 * @property {string} name   Whose picture, for the window's title.
 * @property {string} src    The picture.
 * @property {unknown} frame The frame kept for it, if any.
 * @property {(frame: {src: string, rect: number[]}) => Promise<unknown>} save
 */

/**
 * An actor's picture, framed in its flag.
 * @param {Actor} actor
 * @returns {FrameSubject}
 */
const actorSubject = (actor) => ({
	get name() { return actor.name; },
	get src() { return actor.img; },
	get frame() { return actorFrame(actor); },
	save: (frame) => actor.setFlag(SYSTEM_ID, FRAME_FLAG, frame)
});

/**
 * Choose the part of a Knight's picture their sheet shows, after Stonetop's
 * portrait framer: press inside the box to move it, on a corner to resize it,
 * or outside to draw a new one; arrow keys nudge it and + or - resize it.
 * Nothing is saved until Save, so dragging never floods the server. It frames
 * an actor's picture, or any other subject given it, such as a written Knight's.
 */
export class PortraitFrame extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-portrait-frame-window"],
		position: { width: 760, height: "auto" },
		window: { icon: "fa-solid fa-crop-simple", resizable: true },
		actions: {
			save: PortraitFrame.#onSave,
			reset: PortraitFrame.#onReset
		}
	};

	static PARTS = {
		frame: { template: templatePath("apps/portrait-frame.hbs") }
	};

	/** @param {{subject: FrameSubject}} options */
	constructor(options) {
		super(options);
		/** @type {FrameSubject} */
		this.subject = options.subject;
	}

	/** The picture on the stage, which is the one a saved frame names. */
	#src = "";

	/** @type {number[]|null} */
	#rect = null;

	/** @type {{w: number, h: number}|null} */
	#stage = null;

	/** @type {{pw: number, ph: number}|null} */
	#natural = null;

	/** The drag under way, if any. */
	#drag = null;

	/** The cursor last set on the stage, so it's only written when it changes. */
	#cursor = "";

	/** The preview picture, looked up once rather than on every pointer move. */
	#previewImg = null;

	/** @override */
	get title() {
		return t("portrait.frameTitle", { name: this.subject.name });
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return Object.assign(context, { src: this.subject.src });
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		this.#bindPointer();
		this.#bindKeys();
		await this.#load();
	}

	/** @returns {HTMLElement|null} */
	get #stageEl() {
		return this.element.querySelector(".bastionland-frame__stage");
	}

	/** Put the picture on the stage and the stored frame, or the sheet's usual crop, over it. */
	async #load() {
		const src = this.subject.src;
		const img = new Image();
		try {
			img.src = src;
			await img.decode();
		} catch {
			return this.#fail(t("portrait.loadFailed"));
		}
		const pw = img.naturalWidth;
		const ph = img.naturalHeight;
		if (!(pw > 0 && ph > 0)) return this.#fail(t("portrait.loadFailed"));
		this.#src = src;
		this.#natural = { pw, ph };
		this.#stage = stageFor(pw, ph, { maxH: Math.min(560, window.innerHeight * 0.66) });

		const stage = this.#stageEl;
		stage.style.width = `${this.#stage.w}px`;
		stage.style.height = `${this.#stage.h}px`;
		stage.querySelector("img").hidden = false;

		const stored = normalizeFrame(this.subject.frame);
		this.#rect = stored && sameSrc(stored.src, src) ? stored.rect : defaultRect(pw, ph);
		this.#paint();
		this.setPosition({ height: "auto" });
		stage.focus();
	}

	/** @param {string} message */
	#fail(message) {
		const error = this.element.querySelector(".bastionland-frame__error");
		error.textContent = message;
		error.hidden = false;
		for (const button of this.element.querySelectorAll("[data-action]")) button.disabled = true;
	}

	/** @returns {object|null} The frame in stage pixels. */
	#box() {
		return this.#stage ? rectToBox(this.#rect, this.#stage.w, this.#stage.h) : null;
	}

	/** Take a box as the frame, and redraw. */
	#commit(box) {
		if (!box || !this.#stage) return;
		this.#rect = normalizeRect(boxToRect(box, this.#stage.w, this.#stage.h)) ?? this.#rect;
		this.#paint();
	}

	/** Draw the box and the preview from the frame. */
	#paint() {
		this.#drawBox(this.#box(), false);
		this.#preview(this.#rect);
	}

	/** @param {number[]|null} rect */
	#preview(rect) {
		if (!this.#previewImg?.isConnected) this.#previewImg = this.element.querySelector(".bastionland-frame__preview img");
		if (this.#previewImg) this.#previewImg.style.cssText = frameStyle(rect);
	}

	/**
	 * @param {object|null} box
	 * @param {boolean} ghost Whether it's a drag not yet let go.
	 */
	#drawBox(box, ghost) {
		const layer = this.element.querySelector(".bastionland-frame__layer");
		if (!box) {
			layer.replaceChildren();
			return;
		}
		// A drag draws on every pointer move, so the box already there is moved rather than made again.
		let el = layer.firstElementChild;
		if (!el || el.classList.contains("is-ghost") !== ghost) {
			el = document.createElement("div");
			if (!ghost) {
				for (const corner of ["nw", "ne", "sw", "se"]) {
					const grip = document.createElement("span");
					grip.className = `bastionland-frame__grip bastionland-frame__grip--${corner}`;
					el.append(grip);
				}
			}
			el.className = `bastionland-frame__box${ghost ? " is-ghost" : ""}`;
			layer.replaceChildren(el);
		}
		el.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.w}px;height:${box.h}px`;
	}

	/** The pointer in stage pixels, held to the stage so a drag off its edge follows the edge. */
	#at(event) {
		const r = this.#drag?.rect ?? this.#stageEl.getBoundingClientRect();
		return {
			x: Math.min(Math.max(event.clientX - r.left, 0), this.#stage.w),
			y: Math.min(Math.max(event.clientY - r.top, 0), this.#stage.h)
		};
	}

	#bindPointer() {
		const stage = this.#stageEl;
		stage.addEventListener("pointerdown", (event) => {
			if (!this.#stage || event.button !== 0) return;
			const rect = stage.getBoundingClientRect();
			this.#drag = { rect };
			const { x, y } = this.#at(event);
			const start = this.#box();
			Object.assign(this.#drag, { x0: x, y0: y, start, box: null, ...hitTestBox(x, y, start) });
			stage.setPointerCapture(event.pointerId);
			event.preventDefault();
		});

		stage.addEventListener("pointermove", (event) => {
			if (!this.#stage) return;
			const { x, y } = this.#at(event);
			const { w, h } = this.#stage;
			const drag = this.#drag;
			if (!drag) {
				// The cursor says what a press here would do.
				const hit = hitTestBox(x, y, this.#box());
				const cursor = hit.mode === "move" ? "move"
					: hit.mode === "resize" ? (["nw", "se"].includes(hit.corner) ? "nwse-resize" : "nesw-resize")
						: "crosshair";
				if (cursor !== this.#cursor) stage.style.cursor = this.#cursor = cursor;
				return;
			}
			drag.box = drag.mode === "move"
				? clampBox({ ...drag.start, left: x - drag.dx, top: y - drag.dy }, w, h)
				: drag.mode === "resize"
					? resizeBox(drag.corner, drag.start, x, y, w, h)
					: boxFromDrag(drag.x0, drag.y0, x, y, w, h);
			this.#drawBox(drag.box, true);
			this.#preview(normalizeRect(boxToRect(drag.box, w, h)));
		});

		const end = () => {
			const drag = this.#drag;
			this.#drag = null;
			if (!drag) return;
			const { w, h } = this.#stage;
			// A click, or a box too small to mean anything, leaves the frame as it was.
			if (!drag.box) return this.#paint();
			if (drag.mode === "draw" && drag.box.w < Math.min(w, h) * MIN_SHARE) return this.#paint();
			this.#commit(drag.box);
		};
		stage.addEventListener("pointerup", end);
		stage.addEventListener("pointercancel", end);
	}

	#bindKeys() {
		this.element.addEventListener("keydown", (event) => {
			if (!this.#stage || event.target.closest?.("input, textarea, select, button")) return;
			const next = nudgeBox(this.#box(), event.key, { shift: event.shiftKey }, this.#stage.w, this.#stage.h);
			if (!next) return;
			event.preventDefault();
			this.#commit(next);
		});
	}

	/** @this {PortraitFrame} */
	static #onReset() {
		if (!this.#natural) return;
		this.#rect = defaultRect(this.#natural.pw, this.#natural.ph);
		this.#paint();
	}

	/** @this {PortraitFrame} */
	static async #onSave() {
		const frame = normalizeFrame({ src: this.#src, rect: this.#rect });
		if (!frame) return;
		const stored = normalizeFrame(this.subject.frame);
		const unchanged = stored && sameSrc(stored.src, frame.src) && rectEq(stored.rect, frame.rect);
		if (!unchanged) await this.subject.save(frame);
		await this.close();
	}
}

/**
 * Open the framer on a picture, or bring it forward.
 * @param {string} id Unique to what's framed.
 * @param {FrameSubject} subject
 * @returns {PortraitFrame}
 */
export function openFrameFor(id, subject) {
	const app = foundry.applications.instances.get(`${SYSTEM_ID}-frame-${id}`) ?? new PortraitFrame({ id: `${SYSTEM_ID}-frame-${id}`, subject });
	app.render({ force: true });
	return app;
}

/**
 * Open the framer on an actor's picture, or bring it forward.
 * @param {Actor} actor
 * @returns {PortraitFrame|null}
 */
export const openPortraitFrame = (actor) => (actor?.isOwner ? openFrameFor(`actor-${actor.id}`, actorSubject(actor)) : null);
