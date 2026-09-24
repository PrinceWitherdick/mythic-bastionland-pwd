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
	armsWithCharge,
	centredPlacement,
	chargeColors,
	divisionGroupAt,
	divisionOf,
	editableArms,
	fillScale,
	floodFill,
	heraldryStamp,
	hexToRgba,
	isBlank,
	keepOnPainting,
	placementBox,
	placementLimits,
	randomArms,
	readArms,
	readRecentColors,
	rechargeArms,
	redivideArms,
	refieldArms,
	rememberColor,
	retinctureArms,
	rgbaToHex,
	snapLine,
	tinctureColor,
	tinctureOf,
	zoomPlacement
} from "../rules/heraldry.js";
import { CHARGES, CHARGE_GROUPS, chargePath, chargePlacement, tintCharge } from "../rules/heraldry-charges.js";
import { markActive, undoRedoKey } from "./ui.js";
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

/** The actor flag keeping the arms a Knight's heraldry was saved as, to edit again. */
const ARMS_FLAG = "heraldryArms";

const CHARGE_KEYS = Object.freeze(CHARGES.map(({ key }) => key));

/** How many tinted charges the arms being made keep to hand. Each may be a large canvas. */
const TINT_LIMIT = 8;

/** Changes of one kind to the arms this close together, in milliseconds, are one step to undo, such as each notch of the wheel. */
const MERGE_WINDOW = 800;

/**
 * The painting as it was, to undo or redo back to: its pixels, and the arms
 * they show, if they show some. Arms being made keep no pixels, since they're
 * drawn from the arms.
 * @typedef {{pixels: ImageData|null, arms: import("../rules/heraldry.js").Arms|null}} Snapshot
 */

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
 * @param {number[][]} points Corners from 0 to 1.
 * @param {number} width
 * @param {number} height
 * @returns {string} The corners at a size, as an SVG polygon's points.
 */
function polygonPoints(points, width, height) {
	return points.map(([x, y]) => `${x * width},${y * height}`).join(" ");
}

/**
 * @param {string} name
 * @param {Record<string, string>} attributes
 * @param {...SVGElement} children
 * @returns {SVGElement}
 */
function svgElement(name, attributes, ...children) {
	const element = document.createElementNS(SVG_NS, name);
	for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
	element.append(...children);
	return element;
}

/**
 * A small shield with one group of a division's parts to fill in, showing where they lie.
 * The parts to fill carry `data-part`.
 * @param {typeof DIVISIONS[number]|undefined} division Undefined for a plain field.
 * @param {number} group
 * @param {string} clipId
 * @returns {SVGSVGElement}
 */
function partShield(division, group, clipId) {
	const parts = division
		? division.parts
			.filter((part) => part.group === group)
			.map(({ points }) => svgElement("polygon", { points: polygonPoints(points, SHIELD_WIDTH, SHIELD_HEIGHT), "data-part": "" }))
		: [svgElement("path", { d: SHIELD_PATH, "data-part": "" })];
	return svgElement(
		"svg",
		{ class: "bastionland-heraldry-painter__arms-part", viewBox: "-2 -6 140 170", "aria-hidden": "true" },
		svgElement("clipPath", { id: clipId }, svgElement("path", { d: SHIELD_PATH })),
		svgElement("g", { "clip-path": `url(#${clipId})` }, ...parts),
		svgElement("path", { d: SHIELD_PATH, fill: "none", stroke: "currentColor", "stroke-width": "8" })
	);
}

/**
 * Mark the swatch in a row that holds a colour, and set the row's picker to it.
 * The picker is marked instead when the colour was mixed by hand.
 * @param {HTMLElement} row
 * @param {string|null} color Null for none, as a counterchanged charge has no one colour.
 */
function showColor(row, color) {
	for (const swatch of row.querySelectorAll("[data-color]")) markActive(swatch, swatch.dataset.color === color);
	const picker = row.querySelector("[data-arms-picker]");
	if (color) picker.value = color;
	picker.classList.toggle("is-active", Boolean(color) && !tinctureOf(color));
}

/**
 * @param {{parts: {group: number, points: number[][]}[]}} division
 * @param {number} group
 * @returns {Path2D} The parts of a division in one group, at painting size.
 */
function groupPath(division, group) {
	const path = new Path2D();
	for (const part of division.parts) {
		if (part.group !== group) continue;
		const [first, ...rest] = part.points;
		path.moveTo(first[0] * PAINTING.width, first[1] * PAINTING.height);
		for (const [x, y] of rest) path.lineTo(x * PAINTING.width, y * PAINTING.height);
		path.closePath();
	}
	return path;
}

/**
 * @param {string} key A charge's key.
 * @param {string} color
 * @returns {string} What the charge tinted in that colour is kept under.
 */
const tintKey = (key, color) => `${key} ${color}`;

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
 * Randomize makes arms: a field, plain or divided, and perhaps a charge, kept
 * as parts rather than paint, so any part can be changed or rolled again. They
 * stay that way until something is painted over them, and are kept on the
 * Knight beside the heraldry, to edit again the next time the painter opens.
 *
 * The window draws once. Picking a tool or colour updates the buttons in
 * place, since drawing the window again would wipe the painting.
 */
export class HeraldryPainter extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-heraldry-window"],
		// Wide enough for a row of every tincture beside the shield, for arms.
		position: { width: 640, height: "auto" },
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
			randomize: HeraldryPainter.#onRandomize,
			editArms: HeraldryPainter.#onEditArms,
			doneArms: HeraldryPainter.#onDoneArms,
			rollArms: HeraldryPainter.#onRollArms,
			armsDivision: HeraldryPainter.#onArmsDivision,
			armsColor: HeraldryPainter.#onArmsColor,
			armsCounterchange: HeraldryPainter.#onArmsCounterchange,
			changeArmsCharge: HeraldryPainter.#onChangeArmsCharge,
			removeArmsCharge: HeraldryPainter.#onRemoveArmsCharge,
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

	/** @type {Snapshot[]} The painting before each change, most recent last. */
	#undo = [];

	/** @type {Snapshot[]} The painting before each undo, most recent last. A new change forgets them. */
	#redo = [];

	/**
	 * The last change to the arms being made that the next may join as one
	 * step to undo, and when it was.
	 * @type {{merge: string, at: number}|null}
	 */
	#lastChange = null;

	/**
	 * The arms being made: drawn from their parts each time one changes, with
	 * their own controls in place of the paints.
	 * @type {import("../rules/heraldry.js").Arms|null}
	 */
	#arms = null;

	/**
	 * Arms the painting shows exactly, having been put down to paint, or
	 * saved. They can be taken up again until something is painted.
	 * @type {import("../rules/heraldry.js").Arms|null}
	 */
	#bakedArms = null;

	/** @type {Map<string, HTMLCanvasElement>} Charges tinted for the arms, by key and colour, the latest used last. */
	#tints = new Map();

	/** Whether the pointer is over the shield, where a frame shows round the arms' charge. */
	#hovering = false;

	/**
	 * The pointer dragging a picture being placed, or the arms' charge: where
	 * the pointer and the picture's middle started, and the arms before it moved.
	 * @type {{pointerId: number, from: {x: number, y: number}, start: {x: number, y: number}, before: import("../rules/heraldry.js").Arms|null}|null}
	 */
	#drag = null;

	/**
	 * The stroke in progress. For a line, `last` is where it started and `backdrop` a copy of the painting underneath it.
	 * @type {{pointerId: number, last: {x: number, y: number}, backdrop: HTMLCanvasElement|null}|null}
	 */
	#stroke = null;

	/**
	 * The picture being placed, over the painting as it was before it arrived:
	 * `before` to undo to, and `backdrop` a copy to redraw the picture over.
	 * `charge` is the charge it was tinted from, to tint again when the colour changes.
	 * @type {{
	 *   image: HTMLImageElement|HTMLCanvasElement,
	 *   natural: {width: number, height: number},
	 *   limits: {min: number, max: number},
	 *   before: Snapshot,
	 *   backdrop: HTMLCanvasElement,
	 *   placement: import("../rules/heraldry.js").Placement,
	 *   flip: boolean,
	 *   charge: {key: string, svg: string}|null
	 * }|null}
	 */
	#placing = null;

	/** Whether the gallery of charges shows in place of the paints. */
	#browsing = false;

	/** Counts charges picked and arms randomized, so only the latest one arrives when several load at once. */
	#pickRequest = 0;

	/**
	 * Whether a charge is being tinted, for a picture being placed or the arms.
	 * One tint runs at a time, and the colour picker moving meanwhile asks for one more.
	 */
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
			plain: { shield: SHIELD_PATH, color: PREVIEW_TINCTURES[0] },
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
		// Arms kept from the last save can be taken up again, as long as the heraldry is still that save's.
		if (this.#saved) this.#bakedArms = readArms(this.#actor.getFlag(SYSTEM_ID, ARMS_FLAG), heraldry, CHARGE_KEYS);
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
		canvas.addEventListener("pointerenter", () => this.#hover(true));
		canvas.addEventListener("pointerleave", () => {
			this.#highlightGroup(null);
			this.#hover(false);
		});
		for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
			canvas.addEventListener(type, (event) => {
				if (event.pointerId === this.#stroke?.pointerId) this.#stroke = null;
				if (event.pointerId === this.#drag?.pointerId) this.#endDrag();
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
		const arms = this.element.querySelector("[data-arms-controls]");
		arms.querySelector('[data-arms-part="charge"]').append(this.#swatches());
		arms.addEventListener("input", (event) => this.#onArmsInput(event.target));
		// A colour mixed for the arms is kept among the recent colours too, once the picker closes on it.
		arms.addEventListener("change", (event) => {
			if (event.target.type === "color") this.#rememberColor(event.target.value);
		});

		this.#recent = readRecentColors(game.user.getFlag(SYSTEM_ID, RECENT_COLORS_FLAG));
		this.#renderRecent();

		// Keys only reach the window while something in it has focus.
		canvas.focus({ preventScroll: true });

		if (this.#saved) this.#drawImage(this.#saved, { x: 0, y: 0, ...PAINTING });
		this.#saved = null;
		this.#showSide();
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
		const movable = this.#movable();
		if (movable) {
			const { x, y } = movable.placement;
			this.#canvas.setPointerCapture(event.pointerId);
			this.#drag = { pointerId: event.pointerId, from: point, start: { x, y }, before: this.#arms };
			return;
		}
		// Arms being made are changed from their controls, and nothing is painted over them.
		if (this.#arms) return;
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
		const drag = this.#drag;
		if (drag && event.pointerId === drag.pointerId) {
			const point = this.#point(event);
			const movable = this.#movable();
			if (movable) {
				this.#movePlacing({
					...movable.placement,
					x: drag.start.x + point.x - drag.from.x,
					y: drag.start.y + point.y - drag.from.y
				});
			}
			return;
		}
		if (this.#tool === "divide" && !this.#placing && !this.#arms) {
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

	/** @param {WheelEvent} event Scrolling over a picture being placed, or the arms' charge, resizes it about the pointer. */
	#onWheel(event) {
		const movable = this.#movable();
		if (!movable || !event.deltaY) return;
		event.preventDefault();
		const { placement, limits } = movable;
		const factor = event.deltaY < 0 ? IMAGE_ZOOM_STEP : 1 / IMAGE_ZOOM_STEP;
		this.#movePlacing(zoomPlacement(placement, placement.scale * factor, limits, this.#point(event)), { step: "size" });
	}

	/**
	 * The pointer let go of what it was dragging. A drag of the arms' charge is one step to undo.
	 */
	#endDrag() {
		const { before } = this.#drag;
		this.#drag = null;
		if (before && this.#arms && this.#arms !== before) this.#remember({ pixels: null, arms: before });
	}

	/**
	 * The pointer came onto the shield or left it. A frame shows round the arms'
	 * charge while it's over the shield, to show the charge can be dragged.
	 * @param {boolean} hovering
	 */
	#hover(hovering) {
		this.#hovering = hovering;
		if (this.#arms?.charge) this.#queueDraw();
	}

	/**
	 * @returns {{placement: import("../rules/heraldry.js").Placement, limits: {min: number, max: number}}|null}
	 *   What dragging on the shield moves: a picture being placed, or the arms'
	 *   charge once it has been tinted, since its size comes from the picture.
	 */
	#movable() {
		if (this.#saving) return null;
		if (this.#placing) return this.#placing;
		const charge = this.#arms?.charge;
		const image = charge && this.#tintOf(charge.key);
		return image ? { placement: charge.placement, limits: placementLimits(image, PAINTING) } : null;
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
		if (this.#arms && this.#onMoveKey(event)) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		const way = undoRedoKey(event);
		if (!way) return;
		event.preventDefault();
		event.stopPropagation();
		if (this.#stroke || this.#drag || this.#saving) return;
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
		this.#remember();
		this.#fillGroup(this.#division, group, this.#color);
	}

	/**
	 * Paint every part of a division in one group, inside the shield.
	 * @param {typeof DIVISIONS[number]} division
	 * @param {number} group
	 * @param {string} color
	 */
	#fillGroup(division, group, color) {
		const path = groupPath(division, group);
		const context = this.#context;
		context.save();
		context.clip(this.#shield);
		context.fillStyle = color;
		context.strokeStyle = color;
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
	 * Draw a charge taking another tincture over each group of the field. The
	 * first is drawn whole beneath the others, so no hairline of the field
	 * shows where the charge crosses a line.
	 * @param {typeof DIVISIONS[number]|undefined} division
	 * @param {HTMLCanvasElement[]} images The charge in its tincture over each group, in group order.
	 * @param {{x: number, y: number, width: number, height: number}} box
	 * @param {boolean} flip
	 */
	#drawCounterchanged(division, images, box, flip) {
		const [first] = images;
		this.#drawImage(first, box, { flip });
		for (const [group, image] of images.entries()) {
			if (image === first) continue;
			this.#context.save();
			this.#context.clip(groupPath(division, group));
			this.#drawImage(image, box, { flip });
			this.#context.restore();
		}
	}

	/**
	 * Draw the arms being made from their parts.
	 * @param {object} [options]
	 * @param {boolean} [options.frame] Draw a dashed frame round the charge. Off for the painting as it's kept.
	 * @param {import("../rules/heraldry.js").Arms} [options.arms] The arms to draw, if not those being made.
	 */
	#drawArms({ frame = this.#hovering && !this.#saving, arms = this.#arms } = {}) {
		const context = this.#context;
		const division = divisionOf(arms.division);
		context.clearRect(0, 0, PAINTING.width, PAINTING.height);
		if (division) arms.field.forEach((color, group) => this.#fillGroup(division, group, color));
		else {
			context.save();
			context.fillStyle = arms.field[0];
			context.fill(this.#shield);
			context.restore();
		}
		const { charge } = arms;
		if (!charge) return;
		const tinted = chargeColors(arms).map((color) => this.#tints.get(tintKey(charge.key, color)));
		// A colour still being tinted shows in one already tinted meanwhile, rather than leaving a gap.
		if (!tinted.every(Boolean)) this.#retint();
		const stand = this.#tintOf(charge.key);
		if (!stand) return;
		const images = tinted.map((image) => image ?? stand);
		const box = placementBox(images[0], PAINTING, charge.placement);
		this.#drawCounterchanged(division, images, box, charge.flip);
		if (frame) this.#drawFrame(box);
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
		if (key === "Escape" || ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "z")) this.#finishPlacing(false);
		// Enter on a button presses that button instead.
		else if (key === "Enter" && target.tagName !== "BUTTON") this.#finishPlacing(true);
		else if (!this.#onMoveKey(event)) return;
		event.preventDefault();
		event.stopPropagation();
	}

	/**
	 * On the shield, arrow keys move a picture being placed, or the arms'
	 * charge, and + and − resize it.
	 * @param {KeyboardEvent} event
	 * @returns {boolean} Whether the key did so.
	 */
	#onMoveKey(event) {
		const { key } = event;
		const movable = this.#movable();
		if (!movable || event.target !== this.#canvas) return false;
		const { placement, limits } = movable;
		if (NUDGES[key]) {
			const [across, down] = NUDGES[key];
			const step = PAINT_SCALE * (event.shiftKey ? 10 : 1);
			this.#movePlacing({ ...placement, x: placement.x + across * step, y: placement.y + down * step }, { step: "move" });
		} else if (["+", "=", "-"].includes(key)) {
			const factor = key === "-" ? 1 / IMAGE_ZOOM_STEP : IMAGE_ZOOM_STEP;
			this.#movePlacing(zoomPlacement(placement, placement.scale * factor, limits), { step: "size" });
		} else return false;
		return true;
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
		this.#dropArms();
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
		// The picture floats over arms being made as they'd be kept, and discarding it takes them up again.
		if (this.#arms) this.#drawArms({ frame: false });
		const before = this.#snapshot();
		this.#arms = null;
		this.#bakedArms = null;
		const natural = { width: image.naturalWidth ?? image.width, height: image.naturalHeight ?? image.height };
		const limits = placementLimits(natural, PAINTING);
		this.#placing = {
			image,
			natural,
			limits,
			before,
			backdrop: copyCanvas(this.#canvas),
			placement,
			flip: false,
			charge
		};
		this.element.querySelector("[data-image-size]").max = String(Math.ceil(limits.max * 100));
		this.#showSide();
		this.#drawPlacing();
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Tint the charge being placed in the colour in hand, keeping where it is,
	 * or the arms' charge in the colours they want. While the colour picker is
	 * dragged, colours that arrive during a tint are skipped for the latest one.
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
				const arms = this.#arms;
				if (placing?.charge) {
					const image = await loadTintedCharge(placing.charge.svg, this.#color);
					if (!image || this.#placing !== placing) continue;
					placing.image = image;
				} else if (arms?.charge) {
					const loaded = await this.#loadTints(arms);
					// A charge that can't be fetched is taken off, rather than tried again each time the arms are drawn.
					if (loaded === null && this.#arms === arms && this.rendered) {
						ui.notifications.warn(t("heraldry.unreadable"));
						this.#setArms({ ...arms, charge: null });
					}
					if (!loaded) continue;
				} else return;
				this.#queueDraw();
			} while (this.#tintAgain);
		} finally {
			this.#tinting = false;
		}
	}

	/**
	 * Tint the arms' charge before they show, for an action that may have been
	 * overtaken by another while the charge loaded.
	 * @param {import("../rules/heraldry.js").Arms} arms
	 * @param {() => boolean} still Whether the action is still wanted once it has loaded.
	 * @param {{quiet?: boolean}} [options] Say nothing of a charge that can't be read.
	 * @returns {Promise<boolean|null>} True when the arms are ready; false when the charge
	 *   can't be read, said so unless quiet; null when the action was overtaken.
	 */
	async #tintFor(arms, still, { quiet = false } = {}) {
		const request = ++this.#pickRequest;
		const tinted = await this.#loadTints(arms);
		if (request !== this.#pickRequest || !this.rendered || !still()) return null;
		if (tinted !== null) return true;
		if (!quiet) ui.notifications.warn(t("heraldry.unreadable"));
		return false;
	}

	/**
	 * Tint a charge in each colour the arms want that it hasn't been tinted in yet.
	 * @param {import("../rules/heraldry.js").Arms} arms
	 * @returns {Promise<number|null>} How many tints were added, or null when the charge can't be fetched.
	 */
	async #loadTints(arms) {
		const { charge } = arms;
		if (!charge) return 0;
		const missing = [...new Set(chargeColors(arms))].filter((color) => !this.#tints.has(tintKey(charge.key, color)));
		if (!missing.length) return 0;
		const svg = await loadChargeFile(charge.key);
		if (!svg) return null;
		const images = await Promise.all(missing.map((color) => loadTintedCharge(svg, color)));
		let added = 0;
		for (const [index, image] of images.entries()) {
			if (!image) continue;
			const key = tintKey(charge.key, missing[index]);
			this.#tints.delete(key);
			this.#tints.set(key, image);
			added++;
		}
		// The first kept are the oldest. Those these arms want stay.
		const wanted = new Set(chargeColors(arms).map((color) => tintKey(charge.key, color)));
		for (const key of this.#tints.keys()) {
			if (this.#tints.size <= TINT_LIMIT) break;
			if (!wanted.has(key)) this.#tints.delete(key);
		}
		return added;
	}

	/**
	 * @param {string} key
	 * @returns {HTMLCanvasElement|undefined} The charge in whichever colour was tinted last, to size it by, or show while another tint loads.
	 */
	#tintOf(key) {
		let found;
		for (const [each, image] of this.#tints) if (each.startsWith(`${key} `)) found = image;
		return found;
	}

	/**
	 * Move or resize a picture being placed, or the arms' charge.
	 * @param {import("../rules/heraldry.js").Placement} placement
	 * @param {object} [options]
	 * @param {string|null} [options.step] For the arms' charge, a kind of change to undo as one step,
	 *   joining changes of that kind just before it. Dragging makes its step when it's let go.
	 */
	#movePlacing(placement, { step = null } = {}) {
		const kept = keepOnPainting(placement, PAINTING);
		if (this.#placing) {
			this.#placing.placement = kept;
			this.#queueDraw();
			return;
		}
		const charge = this.#arms?.charge;
		if (!charge) return;
		const arms = { ...this.#arms, charge: { ...charge, placement: kept } };
		if (step) this.#changeArms(arms, { merge: step });
		else {
			// A drag only moves the charge, so the controls needn't be drawn again each time it moves.
			this.#arms = arms;
			this.#queueDraw();
		}
	}

	/** Redraw the picture being placed, or the arms, on the next frame, once however many times they changed before then. */
	#queueDraw() {
		if (this.#drawQueued) return;
		this.#drawQueued = true;
		requestAnimationFrame(() => {
			this.#drawQueued = false;
			if (!this.rendered) return;
			if (this.#placing) this.#drawPlacing();
			else if (this.#arms) this.#drawArms();
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
		if (frame) this.#drawFrame(box);
	}

	/** @param {{x: number, y: number, width: number, height: number}} box Where a picture that can be dragged lies. */
	#drawFrame(box) {
		const context = this.#context;
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
		const { before, charge } = this.#placing;
		this.#placing = null;
		this.#drag = null;
		if (keep) this.#remember(before);
		else {
			this.#restore(before);
			if (charge) this.#browsing = true;
		}
		this.#showSide();
	}

	/**
	 * Show the controls for what's in hand beside the shield: a picture being
	 * placed, the gallery of charges, the arms being made, or the paints.
	 */
	#showSide() {
		const placing = Boolean(this.#placing);
		const browsing = !placing && this.#browsing;
		const arming = !placing && !browsing && Boolean(this.#arms);
		this.element.querySelector("[data-paint-controls]").hidden = placing || browsing || arming;
		this.element.querySelector("[data-place-controls]").hidden = !placing;
		this.element.querySelector("[data-charge-controls]").hidden = !browsing;
		this.element.querySelector("[data-arms-controls]").hidden = !arming;
		this.element.querySelector("[data-charge-colors]").hidden = !this.#placing?.charge;
		markActive(this.element.querySelector('[data-action="browseCharges"]'), browsing);
		this.#canvas.classList.toggle("is-placing", placing || Boolean(this.#arms?.charge));
		// The division in hand's lines would only get in the way of arms.
		this.element.querySelector("[data-division-guides]").hidden = !this.#division || Boolean(this.#arms);
		if (this.#arms) this.#renderArms();
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

	/** @returns {Snapshot} The painting as it is now: the arms being made, or its pixels and the arms they show. */
	#snapshot() {
		if (this.#arms) return { pixels: null, arms: this.#arms };
		return { pixels: this.#context.getImageData(0, 0, PAINTING.width, PAINTING.height), arms: this.#bakedArms };
	}

	/**
	 * Put the painting back as it was: arms kept without pixels are taken up
	 * to edit again, and pixels are painted back.
	 * @param {Snapshot} snapshot
	 */
	#restore({ pixels, arms }) {
		if (pixels) {
			this.#arms = null;
			this.#bakedArms = arms;
			this.#context.putImageData(pixels, 0, 0);
		} else {
			this.#arms = arms;
			this.#bakedArms = null;
			this.#queueDraw();
		}
		this.#showSide();
	}

	/**
	 * Keep a copy of the painting to undo back to. A new change can't be redone
	 * past. Something is about to change, so the painting no longer shows
	 * arms put down to paint.
	 * @param {Snapshot} [snapshot] The painting before the change. Defaults to how it is now.
	 */
	#remember(snapshot = this.#snapshot()) {
		this.#undo.push(snapshot);
		if (this.#undo.length > UNDO_LIMIT) this.#undo.shift();
		this.#redo = [];
		this.#bakedArms = null;
		this.#lastChange = null;
		this.#refreshHistory();
	}

	/**
	 * Undo or redo: go back to the latest copy in one history, keeping the painting as it is now in the other.
	 * @param {Snapshot[]} from
	 * @param {Snapshot[]} to
	 */
	#step(from, to) {
		const snapshot = from.pop();
		if (!snapshot) return;
		to.push(this.#snapshot());
		this.#lastChange = null;
		this.#restore(snapshot);
	}

	/**
	 * Take up arms to make: drawn from their parts, with their controls beside the shield.
	 * @param {import("../rules/heraldry.js").Arms} arms
	 */
	#setArms(arms) {
		this.#arms = arms;
		this.#bakedArms = null;
		this.#queueDraw();
		this.#showSide();
	}

	/**
	 * Change the arms being made, or make new ones, as a step to undo.
	 * @param {import("../rules/heraldry.js").Arms} arms
	 * @param {object} [options]
	 * @param {string|null} [options.merge] A kind of change, such as a colour picker moving or the wheel
	 *   turning. One of the same kind just before joins it, so the two are undone together.
	 */
	#changeArms(arms, { merge = null } = {}) {
		const last = this.#lastChange;
		const now = Date.now();
		const joins = merge && this.#arms && last?.merge === merge && now - last.at < MERGE_WINDOW;
		if (!joins) this.#remember();
		this.#lastChange = merge ? { merge, at: now } : null;
		this.#setArms(arms);
	}

	/**
	 * Put the arms being made down to paint by hand. They stay ready to take
	 * up again until something is painted.
	 */
	#bakeArms() {
		const arms = this.#arms;
		if (!arms) return;
		this.#drawArms({ frame: false });
		this.#bakedArms = arms;
		this.#arms = null;
		this.#drag = null;
		this.#showSide();
		// A colour still loading was drawn in a stand-in: paint it in once loaded, unless painted over by then.
		this.#loadTints(arms).then((added) => {
			if (added && this.rendered && this.#bakedArms === arms && !this.#arms && !this.#placing) this.#drawArms({ arms, frame: false });
		});
	}

	/** Draw the arms being made as they're kept: without the frame round the charge, and in every colour they want. */
	async #paintArms() {
		if (!this.#arms) return;
		await this.#loadTints(this.#arms);
		if (this.#arms && this.rendered) this.#drawArms({ frame: false });
	}

	/** Let go of the arms being made, as whatever changes next paints over them. */
	#dropArms() {
		if (!this.#arms) return;
		this.#arms = null;
		this.#drag = null;
		this.#showSide();
	}

	/**
	 * Colour one part of the arms being made.
	 * @param {string|undefined} part A group of the field's parts, by number, or "charge".
	 * @param {string} color
	 * @param {object} [options]
	 * @param {string|null} [options.merge] See #changeArms.
	 */
	#colorArms(part, color, { merge = null } = {}) {
		const arms = this.#arms;
		if (!arms || !color) return;
		if (part === "charge") {
			const { charge } = arms;
			if (!charge || (charge.color === color && !charge.counterchanged)) return;
			this.#changeArms({ ...arms, charge: { ...charge, color, counterchanged: false } }, { merge });
			return;
		}
		const group = Number(part);
		if (!(group in arms.field) || arms.field[group] === color) return;
		this.#changeArms({ ...arms, field: arms.field.map((each, index) => (index === group ? color : each)) }, { merge });
	}

	/** @param {HTMLElement} target A control in the arms' panel that changed, as a colour picker or slider moves. */
	#onArmsInput(target) {
		if (!this.#arms || this.#saving) return;
		if (target.matches("[data-arms-size]")) {
			const movable = this.#movable();
			if (movable) this.#movePlacing(zoomPlacement(movable.placement, Number(target.value) / 100, movable.limits), { step: "size" });
			return;
		}
		if (!target.matches("[data-arms-picker]")) return;
		const part = target.closest("[data-arms-part]")?.dataset.armsPart;
		this.#colorArms(part, target.value.toLowerCase(), { merge: `color-${part}` });
	}

	/** Show the arms being made in their controls. The rows of tinctures are only built again when the field's parts change. */
	#renderArms() {
		const arms = this.#arms;
		const panel = this.element.querySelector("[data-arms-controls]");
		for (const button of panel.querySelectorAll('[data-action="armsDivision"]')) markActive(button, (button.dataset.division || null) === arms.division);

		const rows = panel.querySelector("[data-arms-field]");
		const layout = arms.division ?? "";
		if (rows.dataset.layout !== layout) {
			rows.dataset.layout = layout;
			const division = divisionOf(arms.division);
			rows.replaceChildren(...arms.field.map((_, group) => {
				const row = document.createElement("div");
				row.className = "bastionland-heraldry-painter__arms-row";
				row.dataset.armsPart = String(group);
				row.append(partShield(division, group, `${this.id}-arms-part-${group}`), this.#swatches());
				return row;
			}));
		}
		for (const [group, color] of arms.field.entries()) {
			const row = rows.children[group];
			showColor(row, color);
			for (const part of row.querySelectorAll("[data-part]")) part.setAttribute("fill", color);
		}

		const { charge } = arms;
		panel.querySelector("[data-arms-charge]").hidden = !charge;
		panel.querySelector("[data-arms-no-charge]").hidden = Boolean(charge);
		if (!charge) return;
		const image = panel.querySelector("[data-arms-charge-image]");
		const src = chargePath(charge.key);
		if (image.getAttribute("src") !== src) image.setAttribute("src", src);
		panel.querySelector("[data-arms-charge-name]").textContent = CHARGES.find(({ key }) => key === charge.key)?.name ?? charge.key;
		const divided = arms.field.length > 1;
		showColor(panel.querySelector('[data-arms-part="charge"]'), charge.counterchanged && divided ? null : charge.color);
		const counterchange = panel.querySelector('[data-action="armsCounterchange"]');
		markActive(counterchange, charge.counterchanged && divided);
		counterchange.disabled = !divided;
		markActive(panel.querySelector('[data-action="flipImage"]'), charge.flip);
		const size = panel.querySelector("[data-arms-size]");
		size.max = String(Math.ceil((this.#movable()?.limits ?? IMAGE_SCALE).max * 100));
		size.value = String(Math.round(charge.placement.scale * 100));
	}

	/** @returns {HTMLUListElement} Every tincture to colour a part of the arms, then a picker for any other colour. */
	#swatches() {
		return this.element.querySelector("[data-arms-swatches]").content.firstElementChild.cloneNode(true);
	}

	/**
	 * Undo, redo and clear wait while a picture is being placed. Edit arms is
	 * offered while the painting shows arms put down, so anything painted takes it away.
	 */
	#refreshHistory() {
		const placing = Boolean(this.#placing);
		const undo = this.element?.querySelector('[data-action="undo"]');
		const redo = this.element?.querySelector('[data-action="redo"]');
		const clear = this.element?.querySelector('[data-action="clear"]');
		const editArms = this.element?.querySelector('[data-action="editArms"]');
		if (undo) undo.disabled = placing || !this.#undo.length;
		if (redo) redo.disabled = placing || !this.#redo.length;
		if (clear) clear.disabled = placing;
		if (editArms) editArms.hidden = !this.#bakedArms;
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
		const buttons = this.element?.querySelectorAll([
			".bastionland-heraldry-painter__footer button",
			"[data-arms-controls] :is(button, input)",
			'[data-action="browseCharges"]',
			'[data-action="randomize"]',
			'[data-action="editArms"]'
		].join(", ")) ?? [];
		for (const button of buttons) button.disabled = saving;
		// Counterchanging stays off for a plain field. A save closes the window before this.
		if (!saving && this.#arms && this.rendered) this.#renderArms();
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

	/**
	 * Picking up a tool paints in a picture being placed, puts the charges away,
	 * and puts arms being made down to paint over.
	 * @this {HeraldryPainter}
	 */
	static #onSetTool(_event, target) {
		this.#finishPlacing(true);
		this.#bakeArms();
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
		this.#bakeArms();
		const division = divisionOf(target.dataset.division);
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
		if (this.#placing || this.#drag) return;
		this.#remember();
		this.#dropArms();
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
		if (this.#placing) this.#movePlacing(this.#placing.charge ? chargePlacement(PAINTING) : centredPlacement(PAINTING));
		else if (this.#arms?.charge) this.#movePlacing(chargePlacement(PAINTING), { step: "fit" });
	}

	/** @this {HeraldryPainter} */
	static #onFillImage() {
		if (this.#placing) this.#movePlacing(centredPlacement(PAINTING, fillScale(this.#placing.natural, PAINTING)));
	}

	/** @this {HeraldryPainter} */
	static #onFlipImage() {
		if (this.#placing) {
			this.#placing.flip = !this.#placing.flip;
			this.#drawPlacing();
			return;
		}
		const charge = this.#arms?.charge;
		if (charge) this.#changeArms({ ...this.#arms, charge: { ...charge, flip: !charge.flip } });
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
	 * Place a charge in the colour in hand, or, while arms are being made, make it theirs.
	 * @this {HeraldryPainter}
	 */
	static async #onPickCharge(_event, target) {
		const charge = CHARGES.find(({ key }) => key === target.dataset.charge);
		if (!charge || this.#saving) return;
		const arms = this.#arms;
		if (arms) {
			const next = armsWithCharge(arms, charge.key, chargePlacement(PAINTING));
			if (!(await this.#tintFor(next, () => Boolean(this.#arms)))) return;
			this.#browsing = false;
			// The arms may have changed while the charge loaded, so it joins them as they are now.
			this.#changeArms(this.#arms === arms ? next : armsWithCharge(this.#arms, charge.key, chargePlacement(PAINTING)));
			this.#canvas.focus({ preventScroll: true });
			return;
		}
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
	 * Make random arms over the whole shield, as one change to undo: a field,
	 * plain or divided, and perhaps a charge, in tinctures that read well. A
	 * picture being placed is painted in first, as every tool does, so Undo
	 * brings it back. The arms' controls come into view, to change any part.
	 * @this {HeraldryPainter}
	 */
	static async #onRandomize() {
		if (this.#saving) return;
		const arms = editableArms(randomArms({ charges: CHARGE_KEYS }), chargePlacement(PAINTING));
		// The charge is tinted before the arms show, so they arrive whole. One that won't load leaves the field bare.
		const tinted = await this.#tintFor(arms, () => true, { quiet: true });
		if (tinted === null) return;
		this.#finishPlacing(true);
		this.#browsing = false;
		this.#stroke = null;
		this.#changeArms(tinted ? arms : { ...arms, charge: null });
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Take up again the arms the painting shows, to change any part.
	 * @this {HeraldryPainter}
	 */
	static async #onEditArms() {
		const arms = this.#bakedArms;
		if (!arms || this.#saving) return;
		if (!(await this.#tintFor(arms, () => this.#bakedArms === arms))) return;
		this.#browsing = false;
		this.#stroke = null;
		this.#setArms(arms);
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Put the arms being made down, and bring back the paints.
	 * @this {HeraldryPainter}
	 */
	static #onDoneArms() {
		this.#bakeArms();
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Roll part of the arms again: the whole field, its tinctures, or the charge.
	 * @this {HeraldryPainter}
	 */
	static async #onRollArms(_event, target) {
		const arms = this.#arms;
		if (!arms || this.#saving) return;
		const roll = target.dataset.roll;
		let next = arms;
		if (roll === "field") next = refieldArms(arms);
		else if (roll === "tinctures") next = retinctureArms(arms);
		else if (roll === "charge") next = rechargeArms(arms, CHARGE_KEYS, chargePlacement(PAINTING));
		if (next === arms) return;
		if (!(await this.#tintFor(next, () => this.#arms === arms))) return;
		this.#changeArms(next);
	}

	/**
	 * Divide the arms' field another way, or make it plain.
	 * @this {HeraldryPainter}
	 */
	static #onArmsDivision(_event, target) {
		const arms = this.#arms;
		const key = target.dataset.division || null;
		if (!arms || key === arms.division) return;
		this.#changeArms(redivideArms(arms, key));
	}

	/**
	 * Colour a part of the arms in a tincture.
	 * @this {HeraldryPainter}
	 */
	static #onArmsColor(_event, target) {
		this.#colorArms(target.closest("[data-arms-part]")?.dataset.armsPart, target.dataset.color);
	}

	/**
	 * Counterchange the arms' charge over a divided field, or give it one colour again.
	 * @this {HeraldryPainter}
	 */
	static #onArmsCounterchange() {
		const arms = this.#arms;
		const charge = arms?.charge;
		if (!charge || arms.field.length < 2) return;
		// Given one colour again, the charge keeps the one it had over the first part.
		const color = charge.counterchanged ? chargeColors(arms)[0] : charge.color;
		this.#changeArms({ ...arms, charge: { ...charge, color, counterchanged: !charge.counterchanged } });
	}

	/** @this {HeraldryPainter} */
	static #onChangeArmsCharge() {
		this.#browse(true, { focus: true });
	}

	/** @this {HeraldryPainter} */
	static #onRemoveArmsCharge() {
		if (this.#arms?.charge) this.#changeArms({ ...this.#arms, charge: null });
	}

	/**
	 * Save the painting to the user's computer as a PNG, full size, to open in a painter again later.
	 * @this {HeraldryPainter}
	 */
	static async #onDownload() {
		if (this.#saving) return;
		// A picture still being placed is downloaded where it is.
		this.#finishPlacing(true);
		await this.#paintArms();
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
		// A charge or random arms still loading would paint over the shield while it's being stored.
		this.#pickRequest++;
		this.#setSaving(true);
		try {
			// Nothing draws the frame round the charge again while saving.
			await this.#paintArms();
			const { data } = this.#context.getImageData(0, 0, PAINTING.width, PAINTING.height);
			const heraldry = isBlank(data) ? "" : await this.#store();
			if (heraldry === null) return;
			// Arms the painting shows are kept beside it, to take up again next time.
			const arms = heraldry ? (this.#arms ?? this.#bakedArms) : null;
			await this.#actor.update({
				"system.heraldry": heraldry,
				[`flags.${SYSTEM_ID}.${ARMS_FLAG}`]: arms ? { ...arms, stamp: heraldryStamp(heraldry) } : null
			});
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
