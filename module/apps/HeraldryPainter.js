import { ensureDirectories, uploadFile } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { canvasToBlob } from "../book-art/pdf.js";
import { WEBP_QUALITY, slugify } from "../rules/book-art.js";
import {
	BRUSH,
	DIVISIONS,
	IMAGE_SCALE,
	IMAGE_ZOOM_STEP,
	MAX_INLINE_LENGTH,
	PAINT_SCALE,
	PAINT_TOOLS,
	PAINTING_HEIGHT,
	PAINTING_WIDTH,
	SHIELD_HEIGHT,
	SHIELD_PATH,
	SHIELD_WIDTH,
	TINCTURES,
	UNDO_LIMIT,
	centredPlacement,
	divisionGroupAt,
	fillScale,
	floodFill,
	hexToRgba,
	isBlank,
	keepOnPainting,
	placementBox,
	placementLimits,
	readRecentColors,
	rememberColor,
	rgbaToHex,
	snapLine,
	tinctureColor,
	zoomPlacement
} from "../rules/heraldry.js";
import { CHARGES, CHARGE_GROUPS, chargePath, chargePlacement, tintCharge } from "../rules/heraldry-charges.js";
import { undoRedoKey } from "./ui.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The painting's size in pixels, margin included. Heraldry saved before the
 * margin had none, and is stretched to this size when it loads, which moves
 * its edge behind the border too.
 */
const PAINTING = Object.freeze({ width: PAINTING_WIDTH * PAINT_SCALE, height: PAINTING_HEIGHT * PAINT_SCALE });

/** Arrow keys move a picture being placed one of the sheet's pixels, or ten with Shift. */
const NUDGES = Object.freeze({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });

/** Tinctures the division previews show their groups in, in group order. */
const PREVIEW_TINCTURES = Object.freeze(["argent", "gules", "azure"].map(tinctureColor));

/** How far a painted part reaches past its own lines, in the painting's pixels, so no pale seam shows between neighbours. */
const DIVISION_OVERLAP = 2;

const SVG_NS = "http://www.w3.org/2000/svg";

/** The user flag holding the colours they've mixed or taken from a painting, most recent first. */
const RECENT_COLORS_FLAG = "recentColors";

const TOOL_ICONS = Object.freeze({
	brush: "fa-solid fa-paintbrush",
	line: "fa-solid fa-slash",
	fill: "fa-solid fa-fill-drip",
	eraser: "fa-solid fa-eraser",
	eyedropper: "fa-solid fa-eye-dropper"
});

/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement|null>} The loaded picture, or null after warning that it couldn't be read.
 */
function loadImage(src) {
	return new Promise((resolve) => {
		const image = new Image();
		image.addEventListener("load", () => resolve(image), { once: true });
		image.addEventListener("error", () => {
			console.warn(`Could not load heraldry from ${src.slice(0, 120)}`);
			ui.notifications.warn(t("heraldry.unreadable"));
			resolve(null);
		}, { once: true });
		image.src = src;
	});
}

/** @type {Map<string, Promise<string|null>>} Each charge's file, fetched once for every painter. */
const chargeFiles = new Map();

/**
 * @param {string} key
 * @returns {Promise<string|null>} The charge's file as shipped, or null when it can't be fetched.
 */
function loadChargeFile(key) {
	if (!chargeFiles.has(key)) {
		const request = fetch(foundry.utils.getRoute(chargePath(key)))
			.then((response) => (response.ok ? response.text() : null))
			.catch(() => null)
			.then((svg) => {
				// Forget a failure, so picking the charge again tries again.
				if (!svg) chargeFiles.delete(key);
				return svg;
			});
		chargeFiles.set(key, request);
	}
	return chargeFiles.get(key);
}

/**
 * @param {string} svg
 * @returns {Promise<HTMLImageElement|null>} The SVG as a picture to draw.
 */
async function loadSvgImage(svg) {
	const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
	try {
		return await loadImage(url);
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * A charge in a colour, drawn once onto a canvas. An SVG picture may be
 * rasterized again each time it's drawn, which a picture dragged about the
 * shield is, many times a second.
 * @param {string} svg The charge's file, as shipped.
 * @param {string} color
 * @returns {Promise<HTMLCanvasElement|null>}
 */
async function loadTintedCharge(svg, color) {
	const image = await loadSvgImage(tintCharge(svg, color));
	if (!image) return null;
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	softwareContext(canvas).drawImage(image, 0, 0);
	return canvas;
}

/**
 * @param {HTMLCanvasElement} source
 * @returns {HTMLCanvasElement} A copy, to draw back quickly: drawing a canvas is cheaper than putting its pixels.
 */
function copyCanvas(source) {
	const canvas = document.createElement("canvas");
	canvas.width = source.width;
	canvas.height = source.height;
	softwareContext(canvas).drawImage(source, 0, 0);
	return canvas;
}

/**
 * The painting's canvas is kept in memory rather than on the graphics card,
 * since the painter reads its pixels often. Canvases drawn onto it are kept
 * there too, so drawing one doesn't mean copying it back off the card.
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D}
 */
const softwareContext = (canvas) => canvas.getContext("2d", { willReadFrequently: true });

/** @returns {Path2D} Where paint may go at painting size: the shield, stretched out to the painting's edges. */
function shieldPath() {
	// Stretched about its middle: a point on the outline lands at the same share of the painting.
	const path = new Path2D();
	path.addPath(new Path2D(SHIELD_PATH), new DOMMatrix().scale(PAINTING.width / SHIELD_WIDTH, PAINTING.height / SHIELD_HEIGHT));
	return path;
}

/**
 * Which pixels lie inside the shield, so a fill stops at its edge.
 * @param {Path2D} shield
 * @returns {Uint8Array}
 */
function shieldMask(shield) {
	const canvas = document.createElement("canvas");
	canvas.width = PAINTING.width;
	canvas.height = PAINTING.height;
	const context = canvas.getContext("2d");
	context.fill(shield);
	const { data } = context.getImageData(0, 0, PAINTING.width, PAINTING.height);
	const mask = new Uint8Array(PAINTING.width * PAINTING.height);
	for (let index = 0; index < mask.length; index++) mask[index] = data[index * 4 + 3] >= 128 ? 1 : 0;
	return mask;
}

/** @type {{path: Path2D, mask: Uint8Array}|null} */
let shield = null;

/** @returns {{path: Path2D, mask: Uint8Array}} The shield's path and mask, worked out once for every painter. */
function paintableShield() {
	if (!shield) {
		const path = shieldPath();
		shield = { path, mask: shieldMask(path) };
	}
	return shield;
}

/**
 * @param {HTMLElement} button
 * @param {boolean} active
 */
function markActive(button, active) {
	button.classList.toggle("is-active", active);
	button.setAttribute("aria-pressed", String(active));
}

/**
 * @param {number[][]} points Corners from 0 to 1.
 * @param {number} width
 * @param {number} height
 * @returns {string} The corners at a size, as an SVG polygon's points.
 */
function polygonPoints(points, width, height) {
	return points.map(([x, y]) => `${x * width},${y * height}`).join(" ");
}

/**
 * @param {DataTransfer|null} transfer
 * @returns {File|undefined} The first picture among files dropped.
 */
function droppedImage(transfer) {
	return [...(transfer?.files ?? [])].find((file) => file.type.startsWith("image/"));
}

/**
 * Paint a Knight's heraldry inside their shield with the tinctures of
 * heraldry, a brush, a line, a paint bucket, an eraser and an eyedropper.
 * Colours a user mixes or takes from a painting are kept on their User, to
 * use again on any Knight. Saving uploads the painting when the user may
 * upload files, and otherwise keeps it on the Knight itself.
 *
 * A picture dropped on the shield or chosen from the files floats
 * over the painting until it's placed: dragged into position, resized and
 * flipped, then painted in, or discarded. The file itself isn't kept, only the
 * painting. A picture the painting's own size is taken for a design downloaded
 * from a painter, and opens as the painting itself. A charge picked from the gallery is placed the same way, in the
 * colour in hand, and picking a tincture while it floats recolours it.
 *
 * The window draws once. Picking a tool or colour updates the buttons in
 * place, since drawing the window again would wipe the painting.
 */
export class HeraldryPainter extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-heraldry-window"],
		position: { width: 600, height: "auto" },
		window: { icon: "fa-solid fa-shield-halved" },
		actions: {
			setTool: HeraldryPainter.#onSetTool,
			setColor: HeraldryPainter.#onSetColor,
			setDivision: HeraldryPainter.#onSetDivision,
			undo: HeraldryPainter.#onUndo,
			redo: HeraldryPainter.#onRedo,
			clear: HeraldryPainter.#onClear,
			chooseImage: HeraldryPainter.#onChooseImage,
			fitImage: HeraldryPainter.#onFitImage,
			fillImage: HeraldryPainter.#onFillImage,
			flipImage: HeraldryPainter.#onFlipImage,
			browseCharges: HeraldryPainter.#onBrowseCharges,
			closeCharges: HeraldryPainter.#onCloseCharges,
			pickCharge: HeraldryPainter.#onPickCharge,
			download: HeraldryPainter.#onDownload,
			placeImage: HeraldryPainter.#onPlaceImage,
			discardImage: HeraldryPainter.#onDiscardImage,
			save: HeraldryPainter.#onSave
		}
	};

	static PARTS = {
		painter: { template: templatePath("apps/heraldry-painter.hbs") }
	};

	/**
	 * @param {Actor} actor
	 * @returns {string} The window's id. Each Knight has one painter.
	 */
	static idFor(actor) {
		return `${SYSTEM_ID}-heraldry-${actor.uuid.replaceAll(".", "-")}`;
	}

	/** @type {Actor} */
	#actor;

	#tool = "brush";

	/** The tool the eyedropper hands back to once it has taken a colour. */
	#previousTool = "brush";

	/**
	 * The division in hand while the tool is "divide": clicking a part of the
	 * shield paints that part, and the others sharing its tincture.
	 * @type {typeof DIVISIONS[number]|null}
	 */
	#division = null;

	#color = tinctureColor("gules");

	/** @type {string[]} Colours mixed or taken from a painting, most recent first. */
	#recent = [];

	/** Brush width in the sheet's pixels. */
	#size = BRUSH.initial;

	/** @type {HTMLCanvasElement|null} */
	#canvas = null;

	/** @type {CanvasRenderingContext2D|null} */
	#context = null;

	/** @type {Path2D|null} */
	#shield = null;

	/** @type {Uint8Array|null} */
	#inside = null;

	/** @type {ImageData[]} The painting before each change, most recent last. */
	#undo = [];

	/** @type {ImageData[]} The painting before each undo, most recent last. A new change forgets them. */
	#redo = [];

	/**
	 * The stroke in progress. For a line, `last` is where it started and `backdrop` a copy of the painting underneath it.
	 * @type {{pointerId: number, last: {x: number, y: number}, backdrop: HTMLCanvasElement|null}|null}
	 */
	#stroke = null;

	/**
	 * The picture being placed, over the painting as it was before it arrived:
	 * `before` to undo to, and `backdrop` a copy to redraw the picture over.
	 * `drag` is the pointer moving it: where the pointer and the picture's middle started.
	 * `charge` is the charge it was tinted from, to tint again when the colour changes.
	 * @type {{
	 *   image: HTMLImageElement|HTMLCanvasElement,
	 *   natural: {width: number, height: number},
	 *   limits: {min: number, max: number},
	 *   before: ImageData,
	 *   backdrop: HTMLCanvasElement,
	 *   placement: import("../rules/heraldry.js").Placement,
	 *   flip: boolean,
	 *   charge: {key: string, svg: string}|null,
	 *   drag: {pointerId: number, from: {x: number, y: number}, start: {x: number, y: number}}|null
	 * }|null}
	 */
	#placing = null;

	/** Whether the gallery of charges shows in place of the paints. */
	#browsing = false;

	/** Counts charges picked, so only the latest one picked arrives when several load at once. */
	#pickRequest = 0;

	/** Whether a charge is being tinted. One tint runs at a time, and the colour picker moving meanwhile asks for one more. */
	#tinting = false;

	/** Whether the colour changed while a charge was being tinted. */
	#tintAgain = false;

	/** Whether a redraw of the picture being placed is waiting for the next frame. */
	#drawQueued = false;

	#saving = false;

	/** @type {HTMLImageElement|null} The Knight's heraldry as last saved, loaded before the window first draws. */
	#saved = null;

	/**
	 * @param {object} options
	 * @param {Actor} options.actor The Knight whose heraldry this is.
	 */
	constructor({ actor, ...options }) {
		super({ id: HeraldryPainter.idFor(actor), ...options });
		this.#actor = actor;
	}

	/** @override */
	get title() {
		return t("heraldry.title", { name: this.#actor.name });
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const hints = { line: t("heraldry.lineHint"), eyedropper: t("heraldry.eyedropperHint") };
		return Object.assign(context, {
			width: PAINTING.width,
			height: PAINTING.height,
			tools: PAINT_TOOLS.map((key) => ({
				key,
				icon: TOOL_ICONS[key],
				label: t(`heraldry.tools.${key}`),
				hint: hints[key] ?? null,
				active: key === this.#tool
			})),
			tinctures: TINCTURES.map(({ key, color }) => ({
				key,
				color,
				label: t(`heraldry.tinctures.${key}.label`),
				hint: t(`heraldry.tinctures.${key}.hint`),
				active: color === this.#color
			})),
			divisions: DIVISIONS.map(({ key, parts }) => ({
				key,
				label: t(`heraldry.divisions.${key}`),
				clipId: `${this.id}-division-${key}`,
				shield: SHIELD_PATH,
				parts: parts.map(({ group, points }) => ({
					points: polygonPoints(points, SHIELD_WIDTH, SHIELD_HEIGHT),
					color: PREVIEW_TINCTURES[group]
				}))
			})),
			color: this.#color,
			brush: { ...BRUSH, value: this.#size },
			imageSize: {
				min: Math.round(IMAGE_SCALE.min * 100),
				max: Math.round(IMAGE_SCALE.max * 100),
				value: Math.round(IMAGE_SCALE.initial * 100)
			},
			chargeGroups: CHARGE_GROUPS.map((group) => ({
				key: group,
				label: t(`heraldry.charges.groups.${group}`),
				charges: CHARGES.filter((charge) => charge.group === group).map(({ key, name, sources }) => ({
					key,
					src: chargePath(key),
					tooltip: t("heraldry.charges.tooltip", { name, source: sources.join("; ") })
				}))
			})),
			canChooseImage: game.user.can("FILES_BROWSE")
		});
	}

	/**
	 * Foundry puts the window on the page before its first-render step and only
	 * positions it after that step finishes. Waiting for the picture there would
	 * leave the window unplaced at the far left while the picture loads, so it
	 * loads here, before the window arrives.
	 * @override
	 */
	async _preFirstRender(context, options) {
		await super._preFirstRender(context, options);
		const { heraldry } = this.#actor.system;
		this.#saved = heraldry ? await loadImage(heraldry) : null;
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		const canvas = this.element.querySelector(".bastionland-heraldry-painter__canvas");
		this.#canvas = canvas;
		this.#context = softwareContext(canvas);
		({ path: this.#shield, mask: this.#inside } = paintableShield());

		canvas.addEventListener("pointerdown", (event) => this.#onPointerDown(event));
		canvas.addEventListener("pointermove", (event) => this.#onPointerMove(event));
		canvas.addEventListener("pointerleave", () => this.#highlightGroup(null));
		for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
			canvas.addEventListener(type, (event) => {
				if (event.pointerId === this.#stroke?.pointerId) this.#stroke = null;
				if (event.pointerId === this.#placing?.drag?.pointerId) this.#placing.drag = null;
			});
		}
		// The page mustn't scroll while the wheel resizes a picture.
		canvas.addEventListener("wheel", (event) => this.#onWheel(event), { passive: false });

		const shieldBox = this.element.querySelector(".bastionland-heraldry-painter__shield");
		shieldBox.addEventListener("dragover", (event) => {
			if (!event.dataTransfer?.types.includes("Files") || this.#saving) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
		});
		shieldBox.addEventListener("drop", (event) => {
			const file = droppedImage(event.dataTransfer);
			if (!file || this.#saving) return;
			event.preventDefault();
			event.stopPropagation();
			this.#placeFile(file);
		});
		this.element.querySelector("[data-image-size]").addEventListener("input", (event) => {
			if (!this.#placing) return;
			this.#movePlacing(zoomPlacement(this.#placing.placement, Number(event.currentTarget.value) / 100, this.#placing.limits));
		});
		this.element.querySelector("[data-charge-group]").addEventListener("change", (event) => {
			const group = event.currentTarget.value;
			for (const list of this.element.querySelectorAll("[data-charge-list]")) list.hidden = list.dataset.chargeList !== group;
		});
		this.element.addEventListener("keydown", (event) => this.#onKeyDown(event));
		this.element.querySelector("[data-brush-size]").addEventListener("input", (event) => {
			this.#size = Number(event.currentTarget.value) || BRUSH.initial;
		});
		const custom = this.element.querySelector("[data-custom-color]");
		// The colour follows the picker as it moves, and is kept once the picker closes on it.
		custom.addEventListener("input", (event) => this.#pickColor(event.currentTarget.value));
		custom.addEventListener("change", (event) => this.#rememberColor(event.currentTarget.value));

		this.#recent = readRecentColors(game.user.getFlag(SYSTEM_ID, RECENT_COLORS_FLAG));
		this.#renderRecent();

		// Keys only reach the window while something in it has focus.
		canvas.focus({ preventScroll: true });

		if (this.#saved) this.#drawImage(this.#saved, { x: 0, y: 0, ...PAINTING });
		this.#saved = null;
	}

	/**
	 * @param {PointerEvent} event
	 * @returns {{x: number, y: number}} Where the pointer is on the painting, in its pixels.
	 */
	#point(event) {
		const box = this.#canvas.getBoundingClientRect();
		return {
			x: ((event.clientX - box.left) * PAINTING.width) / box.width,
			y: ((event.clientY - box.top) * PAINTING.height) / box.height
		};
	}

	/** @param {PointerEvent} event */
	#onPointerDown(event) {
		if (event.button !== 0 || this.#saving) return;
		event.preventDefault();
		this.#canvas.focus({ preventScroll: true });
		const point = this.#point(event);
		if (this.#placing) {
			const { x, y } = this.#placing.placement;
			this.#canvas.setPointerCapture(event.pointerId);
			this.#placing.drag = { pointerId: event.pointerId, from: point, start: { x, y } };
			return;
		}
		// Alt-click takes a colour whatever tool is in hand.
		if (this.#tool === "eyedropper" || event.altKey) {
			this.#sample(point);
			return;
		}
		if (this.#tool === "fill") {
			this.#fill(point);
			return;
		}
		if (this.#tool === "divide") {
			this.#paintDivision(point);
			return;
		}
		this.#remember();
		this.#canvas.setPointerCapture(event.pointerId);
		this.#stroke = {
			pointerId: event.pointerId,
			last: point,
			// A line is drawn again over the painting as it was each time the pointer moves.
			backdrop: this.#tool === "line" ? copyCanvas(this.#canvas) : null
		};
		this.#paint(point, point);
	}

	/** @param {PointerEvent} event */
	#onPointerMove(event) {
		const drag = this.#placing?.drag;
		if (drag && event.pointerId === drag.pointerId) {
			const point = this.#point(event);
			this.#movePlacing({
				...this.#placing.placement,
				x: drag.start.x + point.x - drag.from.x,
				y: drag.start.y + point.y - drag.from.y
			});
			return;
		}
		if (this.#tool === "divide" && !this.#placing) {
			this.#highlightGroup(this.#groupAt(this.#point(event)));
			return;
		}
		if (event.pointerId !== this.#stroke?.pointerId) return;
		const { backdrop } = this.#stroke;
		if (backdrop) {
			const start = this.#stroke.last;
			const point = this.#point(event);
			this.#context.clearRect(0, 0, PAINTING.width, PAINTING.height);
			this.#context.drawImage(backdrop, 0, 0);
			this.#paint(start, event.shiftKey ? snapLine(start, point) : point);
			return;
		}
		// A fast stroke sends several positions per frame. Following them all keeps curves smooth.
		const events = event.getCoalescedEvents?.() ?? [];
		for (const each of events.length ? events : [event]) {
			const point = this.#point(each);
			this.#paint(this.#stroke.last, point);
			this.#stroke.last = point;
		}
	}

	/** @param {WheelEvent} event Scrolling over a picture being placed resizes it about the pointer. */
	#onWheel(event) {
		if (!this.#placing || !event.deltaY) return;
		event.preventDefault();
		const { placement, limits } = this.#placing;
		const factor = event.deltaY < 0 ? IMAGE_ZOOM_STEP : 1 / IMAGE_ZOOM_STEP;
		this.#movePlacing(zoomPlacement(placement, placement.scale * factor, limits, this.#point(event)));
	}

	/**
	 * Ctrl+Z undoes, and Ctrl+Y or Ctrl+Shift+Z redoes, with Cmd in place of Ctrl
	 * on a Mac. The key stops here, or Foundry's own Undo would also take back a
	 * change on the Scene behind the window.
	 * @param {KeyboardEvent} event
	 */
	#onKeyDown(event) {
		if (this.#placing) {
			this.#onPlacingKey(event);
			return;
		}
		// Escape puts the gallery of charges away, rather than closing the window.
		if (this.#browsing && event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			this.#browse(false, { focus: true });
			return;
		}
		const way = undoRedoKey(event);
		if (!way) return;
		event.preventDefault();
		event.stopPropagation();
		if (this.#stroke || this.#saving) return;
		if (way === "redo") this.#step(this.#redo, this.#undo);
		else this.#step(this.#undo, this.#redo);
	}

	/**
	 * Take the colour under a point and keep it among the recent colours. The
	 * eyedropper then hands back to the tool used before it. Bare shield has no
	 * colour, so the eyedropper stays in hand to try again.
	 * @param {{x: number, y: number}} point
	 */
	#sample(point) {
		const x = Math.min(PAINTING.width - 1, Math.max(0, Math.floor(point.x)));
		const y = Math.min(PAINTING.height - 1, Math.max(0, Math.floor(point.y)));
		const { data } = this.#context.getImageData(x, y, 1, 1);
		if (!data[3]) return;
		if (this.#tool === "eyedropper") this.#pickTool(this.#previousTool);
		const color = rgbaToHex(data);
		this.#pickColor(color);
		this.#rememberColor(color);
	}

	/**
	 * Brush or erase from one point to another, inside the shield.
	 * @param {{x: number, y: number}} from
	 * @param {{x: number, y: number}} to
	 */
	#paint(from, to) {
		const context = this.#context;
		const width = this.#size * PAINT_SCALE;
		context.save();
		context.clip(this.#shield);
		context.globalCompositeOperation = this.#tool === "eraser" ? "destination-out" : "source-over";
		context.fillStyle = this.#color;
		context.strokeStyle = this.#color;
		context.beginPath();
		if (from.x === to.x && from.y === to.y) {
			context.arc(to.x, to.y, width / 2, 0, Math.PI * 2);
			context.fill();
		} else {
			context.lineWidth = width;
			context.lineCap = "round";
			context.lineJoin = "round";
			context.moveTo(from.x, from.y);
			context.lineTo(to.x, to.y);
			context.stroke();
		}
		context.restore();
	}

	/** @param {{x: number, y: number}} point */
	#fill(point) {
		const image = this.#context.getImageData(0, 0, PAINTING.width, PAINTING.height);
		const before = new ImageData(image.data.slice(), PAINTING.width, PAINTING.height);
		if (!floodFill(image.data, PAINTING.width, PAINTING.height, point.x, point.y, hexToRgba(this.#color), { inside: this.#inside })) return;
		this.#remember(before);
		this.#context.putImageData(image, 0, 0);
	}

	/**
	 * @param {{x: number, y: number}} point On the painting.
	 * @returns {number|null} The group of the division's part under the point.
	 */
	#groupAt(point) {
		return this.#division ? divisionGroupAt(this.#division, point.x / PAINTING.width, point.y / PAINTING.height) : null;
	}

	/**
	 * Paint the part of the division under a point, and every part sharing its tincture, in the colour in hand.
	 * @param {{x: number, y: number}} point
	 */
	#paintDivision(point) {
		const group = this.#groupAt(point);
		if (group === null) return;
		const path = new Path2D();
		for (const part of this.#division.parts) {
			if (part.group !== group) continue;
			const [first, ...rest] = part.points;
			path.moveTo(first[0] * PAINTING.width, first[1] * PAINTING.height);
			for (const [x, y] of rest) path.lineTo(x * PAINTING.width, y * PAINTING.height);
			path.closePath();
		}
		this.#remember();
		const context = this.#context;
		context.save();
		context.clip(this.#shield);
		context.fillStyle = this.#color;
		context.strokeStyle = this.#color;
		context.lineWidth = DIVISION_OVERLAP * 2;
		context.lineJoin = "round";
		context.fill(path);
		context.stroke(path);
		context.restore();
	}

	/** Draw the division in hand's lines over the shield, or hide them when there's none. */
	#renderGuides() {
		const guides = this.element.querySelector("[data-division-guides]");
		const polygons = (this.#division?.parts ?? []).map(({ group, points }) => {
			const polygon = document.createElementNS(SVG_NS, "polygon");
			polygon.setAttribute("points", polygonPoints(points, PAINTING.width, PAINTING.height));
			polygon.dataset.group = String(group);
			return polygon;
		});
		guides.replaceChildren(...polygons);
		guides.toggleAttribute("hidden", !this.#division);
		guides.style.color = this.#color;
	}

	/** @param {number|null} group The group of parts to show the colour in hand over, or null for none. */
	#highlightGroup(group) {
		const guides = this.element.querySelector("[data-division-guides]");
		for (const polygon of guides.children) polygon.classList.toggle("is-hovered", polygon.dataset.group === String(group));
	}

	/**
	 * @param {HTMLImageElement} image
	 * @param {{x: number, y: number, width: number, height: number}} box
	 * @param {object} [options]
	 * @param {boolean} [options.flip] Mirror the picture left to right within its box.
	 */
	#drawImage(image, box, { flip = false } = {}) {
		const context = this.#context;
		context.save();
		context.clip(this.#shield);
		if (flip) {
			context.translate(box.x + box.width, box.y);
			context.scale(-1, 1);
			context.drawImage(image, 0, 0, box.width, box.height);
		} else {
			context.drawImage(image, box.x, box.y, box.width, box.height);
		}
		context.restore();
	}

	/**
	 * Enter places the picture and Escape or Ctrl+Z discards it. On the shield,
	 * arrow keys move it and + and − resize it. Keys stop here, so Escape doesn't
	 * also close the window.
	 * @param {KeyboardEvent} event
	 */
	#onPlacingKey(event) {
		const { key, target } = event;
		const onShield = target === this.#canvas;
		const { placement, limits } = this.#placing;
		if (key === "Escape" || ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "z")) this.#finishPlacing(false);
		// Enter on a button presses that button instead.
		else if (key === "Enter" && target.tagName !== "BUTTON") this.#finishPlacing(true);
		else if (onShield && NUDGES[key]) {
			const [across, down] = NUDGES[key];
			const step = PAINT_SCALE * (event.shiftKey ? 10 : 1);
			this.#movePlacing({ ...placement, x: placement.x + across * step, y: placement.y + down * step });
		} else if (onShield && ["+", "=", "-"].includes(key)) {
			const factor = key === "-" ? 1 / IMAGE_ZOOM_STEP : IMAGE_ZOOM_STEP;
			this.#movePlacing(zoomPlacement(placement, placement.scale * factor, limits));
		} else return;
		event.preventDefault();
		event.stopPropagation();
	}

	/**
	 * Read a picture from the user's computer and start placing it.
	 * @param {File} file
	 */
	async #placeFile(file) {
		if (!file.type.startsWith("image/")) {
			ui.notifications.warn(t("heraldry.unreadable"));
			return;
		}
		const url = URL.createObjectURL(file);
		try {
			const image = await loadImage(url);
			if (image && this.rendered) this.#openImage(image);
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	/**
	 * Open a design downloaded from a painter as the painting, or start placing any other picture.
	 * @param {HTMLImageElement} image
	 */
	#openImage(image) {
		if (image.naturalWidth !== PAINTING.width || image.naturalHeight !== PAINTING.height) {
			this.#startPlacing(image);
			return;
		}
		this.#finishPlacing(true);
		this.#stroke = null;
		this.#remember();
		this.#context.clearRect(0, 0, PAINTING.width, PAINTING.height);
		this.#drawImage(image, { x: 0, y: 0, ...PAINTING });
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Float a picture over the painting, fitted inside it unless placed otherwise,
	 * to be moved and resized. A picture already being placed is painted in first.
	 * @param {HTMLImageElement|HTMLCanvasElement} image
	 * @param {object} [options]
	 * @param {{key: string, svg: string}|null} [options.charge] The charge the picture was tinted from.
	 * @param {import("../rules/heraldry.js").Placement} [options.placement]
	 */
	#startPlacing(image, { charge = null, placement = centredPlacement(PAINTING) } = {}) {
		this.#finishPlacing(true);
		this.#stroke = null;
		this.#browsing = false;
		const natural = { width: image.naturalWidth ?? image.width, height: image.naturalHeight ?? image.height };
		const limits = placementLimits(natural, PAINTING);
		this.#placing = {
			image,
			natural,
			limits,
			before: this.#context.getImageData(0, 0, PAINTING.width, PAINTING.height),
			backdrop: copyCanvas(this.#canvas),
			placement,
			flip: false,
			charge,
			drag: null
		};
		this.element.querySelector("[data-image-size]").max = String(Math.ceil(limits.max * 100));
		this.#showSide();
		this.#drawPlacing();
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Tint the charge being placed in the colour in hand, keeping where it is.
	 * While the colour picker is dragged, colours that arrive during a tint are
	 * skipped for the latest one.
	 */
	async #retint() {
		if (this.#tinting) {
			this.#tintAgain = true;
			return;
		}
		this.#tinting = true;
		try {
			do {
				this.#tintAgain = false;
				const placing = this.#placing;
				if (!placing?.charge) return;
				const image = await loadTintedCharge(placing.charge.svg, this.#color);
				if (!image || this.#placing !== placing) continue;
				placing.image = image;
				this.#queueDraw();
			} while (this.#tintAgain);
		} finally {
			this.#tinting = false;
		}
	}

	/** @param {import("../rules/heraldry.js").Placement} placement */
	#movePlacing(placement) {
		this.#placing.placement = keepOnPainting(placement, PAINTING);
		this.#queueDraw();
	}

	/** Redraw the picture being placed on the next frame, once however many times it moved before then. */
	#queueDraw() {
		if (this.#drawQueued) return;
		this.#drawQueued = true;
		requestAnimationFrame(() => {
			this.#drawQueued = false;
			if (this.#placing && this.rendered) this.#drawPlacing();
		});
	}

	/**
	 * Draw the painting with the picture over it, and a dashed frame round the
	 * picture while it's still being placed.
	 * @param {{frame?: boolean}} [options]
	 */
	#drawPlacing({ frame = true } = {}) {
		const { image, natural, backdrop, placement, flip } = this.#placing;
		const box = placementBox(natural, PAINTING, placement);
		const context = this.#context;
		context.clearRect(0, 0, PAINTING.width, PAINTING.height);
		context.drawImage(backdrop, 0, 0);
		this.#drawImage(image, box, { flip });
		this.element.querySelector("[data-image-size]").value = String(Math.round(placement.scale * 100));
		if (!frame) return;
		context.save();
		context.lineWidth = PAINT_SCALE;
		context.setLineDash([4 * PAINT_SCALE, 3 * PAINT_SCALE]);
		// Dark dashes with pale ones between, so the frame shows on any colour.
		for (const [color, offset] of [["#1d1a17", 0], ["#f4f0e6", 4 * PAINT_SCALE]]) {
			context.strokeStyle = color;
			context.lineDashOffset = offset;
			context.strokeRect(box.x, box.y, box.width, box.height);
		}
		context.restore();
	}

	/**
	 * Paint the picture being placed into the painting, or put the painting back
	 * as it was. A charge put back returns to the gallery, to pick another.
	 * @param {boolean} keep
	 */
	#finishPlacing(keep) {
		if (!this.#placing) return;
		if (keep) this.#drawPlacing({ frame: false });
		else this.#context.putImageData(this.#placing.before, 0, 0);
		const { before, charge } = this.#placing;
		this.#placing = null;
		if (keep) this.#remember(before);
		else if (charge) this.#browsing = true;
		this.#showSide();
	}

	/**
	 * Show the controls for what's in hand beside the shield: a picture being
	 * placed, the gallery of charges, or the paints.
	 */
	#showSide() {
		const placing = Boolean(this.#placing);
		const browsing = !placing && this.#browsing;
		this.element.querySelector("[data-paint-controls]").hidden = placing || browsing;
		this.element.querySelector("[data-place-controls]").hidden = !placing;
		this.element.querySelector("[data-charge-controls]").hidden = !browsing;
		this.element.querySelector("[data-charge-colors]").hidden = !this.#placing?.charge;
		markActive(this.element.querySelector('[data-action="browseCharges"]'), browsing);
		this.#canvas.classList.toggle("is-placing", placing);
		this.#refreshHistory();
	}

	/**
	 * Open the gallery of charges, painting in any picture being placed, or put it away.
	 * @param {boolean} open
	 * @param {object} [options]
	 * @param {boolean} [options.focus] Move focus into the gallery, or back to its button.
	 */
	#browse(open, { focus = false } = {}) {
		if (open) this.#finishPlacing(true);
		this.#browsing = open;
		this.#showSide();
		if (!focus) return;
		const target = open ? "[data-charge-group]" : '[data-action="browseCharges"]';
		this.element.querySelector(target)?.focus({ preventScroll: true });
	}

	/**
	 * Keep a copy of the painting to undo back to. A new change can't be redone past.
	 * @param {ImageData} [snapshot] The painting before the change. Defaults to how it is now.
	 */
	#remember(snapshot = this.#context.getImageData(0, 0, PAINTING.width, PAINTING.height)) {
		this.#undo.push(snapshot);
		if (this.#undo.length > UNDO_LIMIT) this.#undo.shift();
		this.#redo = [];
		this.#refreshHistory();
	}

	/**
	 * Undo or redo: go back to the latest copy in one history, keeping the painting as it is now in the other.
	 * @param {ImageData[]} from
	 * @param {ImageData[]} to
	 */
	#step(from, to) {
		const snapshot = from.pop();
		if (!snapshot) return;
		to.push(this.#context.getImageData(0, 0, PAINTING.width, PAINTING.height));
		this.#context.putImageData(snapshot, 0, 0);
		this.#refreshHistory();
	}

	/** Undo, redo and clear wait while a picture is being placed. */
	#refreshHistory() {
		const placing = Boolean(this.#placing);
		const undo = this.element?.querySelector('[data-action="undo"]');
		const redo = this.element?.querySelector('[data-action="redo"]');
		const clear = this.element?.querySelector('[data-action="clear"]');
		if (undo) undo.disabled = placing || !this.#undo.length;
		if (redo) redo.disabled = placing || !this.#redo.length;
		if (clear) clear.disabled = placing;
	}

	/** @param {string} tool */
	#pickTool(tool) {
		const dividing = tool === "divide" && this.#division;
		if (!PAINT_TOOLS.includes(tool) && !dividing) return;
		if (tool === "eyedropper" && this.#tool !== "eyedropper") this.#previousTool = this.#tool;
		this.#tool = tool;
		// The eyedropper hands back to the division in hand, so it stays in hand while taking a colour.
		if (tool !== "divide" && tool !== "eyedropper") this.#division = null;
		for (const button of this.element.querySelectorAll('[data-action="setTool"]')) markActive(button, button.dataset.tool === tool);
		for (const button of this.element.querySelectorAll('[data-action="setDivision"]')) {
			markActive(button, button.dataset.division === this.#division?.key);
		}
		this.#renderGuides();
	}

	/**
	 * @param {string} color Such as "#b0261e". Picking a colour while erasing picks up the brush, and recolours a charge being placed.
	 */
	#pickColor(color) {
		this.#color = color.toLowerCase();
		if (this.#tool === "eraser") this.#pickTool("brush");
		for (const button of this.element.querySelectorAll('[data-action="setColor"]')) markActive(button, button.dataset.color === this.#color);
		this.element.querySelector("[data-custom-color]").value = this.#color;
		this.element.querySelector("[data-division-guides]").style.color = this.#color;
		if (this.#placing?.charge) this.#retint();
	}

	/**
	 * Keep a colour among the recent ones, on this user so it's there for any Knight.
	 * @param {string} color
	 */
	#rememberColor(color) {
		const recent = rememberColor(this.#recent, color);
		if (recent === this.#recent) return;
		this.#recent = recent;
		this.#renderRecent();
		game.user.setFlag(SYSTEM_ID, RECENT_COLORS_FLAG, recent).catch((error) => console.error(error));
	}

	/** Draw the recent colours as swatches, hiding the row while there are none. */
	#renderRecent() {
		const row = this.element.querySelector(".bastionland-heraldry-painter__recent");
		const swatches = this.#recent.map((color) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "bastionland-heraldry-painter__recent-swatch";
			button.dataset.action = "setColor";
			button.dataset.color = color;
			button.dataset.tooltip = color;
			button.setAttribute("aria-label", color);
			button.style.background = color;
			markActive(button, color === this.#color);
			const item = document.createElement("li");
			item.append(button);
			return item;
		});
		row.querySelector("ul").replaceChildren(...swatches);
		row.hidden = !swatches.length;
	}

	/** @param {boolean} saving */
	#setSaving(saving) {
		this.#saving = saving;
		const buttons = this.element?.querySelectorAll('.bastionland-heraldry-painter__footer button, [data-action="browseCharges"]') ?? [];
		for (const button of buttons) button.disabled = saving;
	}

	/**
	 * Upload the painting, or turn it into a data URL when uploading isn't allowed or fails.
	 * @returns {Promise<string|null>} What to keep as the Knight's heraldry, or null if it's too large to keep.
	 */
	async #store() {
		const blob = await canvasToBlob(this.#canvas, "image/webp", WEBP_QUALITY);
		if (blob && game.user.can("FILES_UPLOAD")) {
			const dir = `worlds/${game.world.id}/heraldry`;
			await ensureDirectories([dir]);
			// Browsers without WebP encoding hand back a PNG instead.
			const extension = blob.type.split("/")[1] || "png";
			const name = `${this.#actor.uuid.replaceAll(".", "-")}.${extension}`;
			const path = await uploadFile(dir, new File([blob], name, { type: blob.type }));
			// Each save overwrites the same file, so a version on the end makes browsers fetch the new one.
			if (path) return `${path}?v=${Date.now()}`;
		}
		const dataUrl = this.#canvas.toDataURL("image/webp", WEBP_QUALITY);
		if (dataUrl.length <= MAX_INLINE_LENGTH) return dataUrl;
		ui.notifications.warn(t("heraldry.tooLarge"));
		return null;
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {HeraldryPainter} Picking up a tool paints in a picture being placed, and puts the charges away. */
	static #onSetTool(_event, target) {
		this.#finishPlacing(true);
		this.#browse(false);
		this.#pickTool(target.dataset.tool);
	}

	/** @this {HeraldryPainter} */
	static #onSetColor(_event, target) {
		this.#pickColor(target.dataset.color);
	}

	/**
	 * Take up a division to paint its parts, or put it down again for the brush.
	 * @this {HeraldryPainter}
	 */
	static #onSetDivision(_event, target) {
		this.#finishPlacing(true);
		const division = DIVISIONS.find(({ key }) => key === target.dataset.division);
		if (!division || (this.#tool === "divide" && this.#division === division)) {
			this.#pickTool("brush");
			return;
		}
		this.#division = division;
		this.#pickTool("divide");
	}

	/** @this {HeraldryPainter} */
	static #onUndo() {
		this.#step(this.#undo, this.#redo);
	}

	/** @this {HeraldryPainter} */
	static #onRedo() {
		this.#step(this.#redo, this.#undo);
	}

	/** @this {HeraldryPainter} */
	static #onClear() {
		if (this.#placing) return;
		this.#remember();
		this.#context.clearRect(0, 0, PAINTING.width, PAINTING.height);
	}

	/** @this {HeraldryPainter} */
	static #onChooseImage() {
		const FilePicker = foundry.applications.apps.FilePicker.implementation;
		const picker = new FilePicker({
			type: "image",
			callback: async (path) => {
				const image = await loadImage(path);
				if (image && this.rendered) this.#openImage(image);
			}
		});
		return picker.render({ force: true });
	}

	/** @this {HeraldryPainter} A charge fits clear of the shield's point, where it arrived. */
	static #onFitImage() {
		if (!this.#placing) return;
		this.#movePlacing(this.#placing.charge ? chargePlacement(PAINTING) : centredPlacement(PAINTING));
	}

	/** @this {HeraldryPainter} */
	static #onFillImage() {
		if (this.#placing) this.#movePlacing(centredPlacement(PAINTING, fillScale(this.#placing.natural, PAINTING)));
	}

	/** @this {HeraldryPainter} */
	static #onFlipImage() {
		if (!this.#placing) return;
		this.#placing.flip = !this.#placing.flip;
		this.#drawPlacing();
	}

	/** @this {HeraldryPainter} The gallery's button opens it, or puts it away again. */
	static #onBrowseCharges() {
		this.#browse(!this.#browsing, { focus: true });
	}

	/** @this {HeraldryPainter} */
	static #onCloseCharges() {
		this.#browse(false, { focus: true });
	}

	/**
	 * Place a charge in the colour in hand.
	 * @this {HeraldryPainter}
	 */
	static async #onPickCharge(_event, target) {
		const charge = CHARGES.find(({ key }) => key === target.dataset.charge);
		if (!charge || this.#saving) return;
		const request = ++this.#pickRequest;
		const svg = await loadChargeFile(charge.key);
		if (request !== this.#pickRequest || !this.rendered) return;
		if (!svg) {
			ui.notifications.warn(t("heraldry.unreadable"));
			return;
		}
		const color = this.#color;
		const image = await loadTintedCharge(svg, color);
		if (!image || request !== this.#pickRequest || !this.rendered) return;
		this.#startPlacing(image, { charge: { key: charge.key, svg }, placement: chargePlacement(PAINTING) });
		// The colour may have changed while the charge loaded.
		if (color !== this.#color) this.#retint();
	}

	/**
	 * Save the painting to the user's computer as a PNG, full size, to open in a painter again later.
	 * @this {HeraldryPainter}
	 */
	static async #onDownload() {
		if (this.#saving) return;
		// A picture still being placed is downloaded where it is.
		this.#finishPlacing(true);
		const blob = await canvasToBlob(this.#canvas, "image/png");
		if (!blob) {
			ui.notifications.warn(t("heraldry.downloadFailed"));
			return;
		}
		const name = `${slugify(this.#actor.name) || "knight"}-heraldry.png`;
		foundry.utils.saveDataToFile(blob, blob.type, name);
	}

	/** @this {HeraldryPainter} */
	static #onPlaceImage() {
		this.#finishPlacing(true);
		this.#canvas.focus({ preventScroll: true });
	}

	/** @this {HeraldryPainter} */
	static #onDiscardImage() {
		this.#finishPlacing(false);
		this.#canvas.focus({ preventScroll: true });
	}

	/** @this {HeraldryPainter} */
	static async #onSave() {
		if (this.#saving) return;
		// A picture still being placed is saved where it is.
		this.#finishPlacing(true);
		this.#setSaving(true);
		try {
			const { data } = this.#context.getImageData(0, 0, PAINTING.width, PAINTING.height);
			const heraldry = isBlank(data) ? "" : await this.#store();
			if (heraldry === null) return;
			await this.#actor.update({ "system.heraldry": heraldry });
			await this.close();
		} finally {
			this.#setSaving(false);
		}
	}
}

/**
 * Open a Knight's heraldry painter, bringing it forward if it's already open.
 * @param {Actor} actor
 */
export function openHeraldryPainter(actor) {
	const open = foundry.applications.instances.get(HeraldryPainter.idFor(actor));
	if (open) return open.bringToFront();
	return new HeraldryPainter({ actor }).render({ force: true });
}
