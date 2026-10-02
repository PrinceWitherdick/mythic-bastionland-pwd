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
	floodReach,
	heraldryStamp,
	hexToRgba,
	insertLayer,
	isBlank,
	keepOnPainting,
	moveLayer,
	paintReached,
	placementBox,
	placementLimits,
	randomArms,
	readArms,
	readLayers,
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

/** Arrow keys move a picture or charge one of the sheet's pixels, or ten with Shift. */
const NUDGES = Object.freeze({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });

/** Tinctures the division previews show their groups in, in group order. */
const PREVIEW_TINCTURES = Object.freeze(["argent", "gules", "azure"].map(tinctureColor));

/** How far a painted part reaches past its own lines, in the painting's pixels, so no pale seam shows between neighbours. */
const DIVISION_OVERLAP = 2;

const SVG_NS = "http://www.w3.org/2000/svg";

/** The user flag holding the colours they've mixed or taken from a painting, most recent first. */
const RECENT_COLORS_FLAG = "recentColors";

/** The actor flag keeping the layers a Knight's heraldry was saved as, to take up again. */
const LAYERS_FLAG = "heraldryLayers";

/** The actor flag arms were kept in before layers were. It's read, and cleared on the next save. */
const ARMS_FLAG = "heraldryArms";

const CHARGE_KEYS = Object.freeze(CHARGES.map(({ key }) => key));

/** How many tinted charges are kept to hand beyond those on show. Each may be a large canvas. */
const TINT_LIMIT = 8;

/** Changes of one kind this close together, in milliseconds, are one step to undo, such as each notch of the wheel. */
const MERGE_WINDOW = 800;

/**
 * A picture is kept at most this many times the painting's size, however large
 * its file: enough to stay sharp when enlarged, without holding a photograph's
 * every pixel.
 */
const PICTURE_LIMIT = 2;

/** Where the arms' charge lies, for working out the tints arms want before they're on the shield. */
const ARMS_CHARGE_LAYERS = Object.freeze([{ kind: "armsCharge" }]);

/**
 * One layer of the painting. A paint layer is painted on in place; every other
 * layer is only ever replaced, so a step to undo can keep it as it is.
 * @typedef {{id: number, kind: "paint", canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, version: number, kept: {version: number, pixels: ImageData}|null}} PaintLayer
 * @typedef {{id: number, kind: "charge", key: string, color: string, placement: import("../rules/heraldry.js").Placement, flip: boolean}} ChargeLayer
 * @typedef {{id: number, kind: "picture", image: HTMLCanvasElement, placement: import("../rules/heraldry.js").Placement, flip: boolean}} PictureLayer
 * @typedef {{id: number, kind: "field"|"armsCharge"}} ArmsLayer
 * @typedef {PaintLayer|ChargeLayer|PictureLayer|ArmsLayer} Layer
 */

/**
 * The painting as it was, to undo or redo back to: its layers, with each paint
 * layer's pixels as they were, the arms, the layer picked, and which parts of
 * the division in hand were painted.
 * @typedef {{
 *   layers: (Layer|{id: number, kind: "paint", version: number, pixels: ImageData})[],
 *   arms: import("../rules/heraldry.js").Arms|null,
 *   selected: number|null,
 *   painted: Set<number>
 * }} Snapshot
 */

const TOOL_ICONS = Object.freeze({
	brush: "fa-solid fa-paintbrush",
	line: "fa-solid fa-slash",
	fill: "fa-solid fa-fill-drip",
	eraser: "fa-solid fa-eraser",
	eyedropper: "fa-solid fa-eye-dropper"
});

/** Icons for the layers that don't show a charge or the field. */
const LAYER_ICONS = Object.freeze({ paint: "fa-solid fa-paintbrush", picture: "fa-solid fa-image" });

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
 * rasterized again each time it's drawn, which a charge dragged about the
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
 * A picture drawn onto a canvas no larger than it needs to be. Only its shape
 * decides where it's placed, so shrinking it moves nothing.
 * @param {HTMLImageElement|HTMLCanvasElement} image
 * @returns {HTMLCanvasElement}
 */
function pictureCanvas(image) {
	const width = image.naturalWidth ?? image.width;
	const height = image.naturalHeight ?? image.height;
	const shrink = Math.min(1, (PAINTING.width * PICTURE_LIMIT) / width, (PAINTING.height * PICTURE_LIMIT) / height);
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(width * shrink));
	canvas.height = Math.max(1, Math.round(height * shrink));
	softwareContext(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
	return canvas;
}

/**
 * The painting's canvases are kept in memory rather than on the graphics card,
 * since the painter reads their pixels often. Canvases drawn onto them are kept
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
	return smallShield(parts, clipId, { class: "bastionland-heraldry-painter__arms-part" });
}

/**
 * A small shield showing the arms' field in its colours.
 * @param {import("../rules/heraldry.js").Arms} arms
 * @param {string} clipId
 * @returns {SVGSVGElement}
 */
function fieldShield(arms, clipId) {
	const division = divisionOf(arms.division);
	const parts = division
		? division.parts.map(({ group, points }) => svgElement("polygon", { points: polygonPoints(points, SHIELD_WIDTH, SHIELD_HEIGHT), fill: arms.field[group] }))
		: [svgElement("path", { d: SHIELD_PATH, fill: arms.field[0] })];
	return smallShield(parts, clipId);
}

/**
 * A small outlined shield with shapes clipped inside it.
 * @param {SVGElement[]} parts
 * @param {string} clipId
 * @param {Record<string, string>} [attributes] More for the svg element.
 * @returns {SVGSVGElement}
 */
function smallShield(parts, clipId, attributes = {}) {
	return svgElement(
		"svg",
		{ ...attributes, viewBox: "-2 -6 140 170", "aria-hidden": "true" },
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
 * @param {string} key
 * @returns {string} The charge's name, as the gallery gives it.
 */
const chargeName = (key) => CHARGES.find((charge) => charge.key === key)?.name ?? key;

/** @param {Layer|{kind: string}|null|undefined} layer */
const isArmsLayer = (layer) => layer?.kind === "field" || layer?.kind === "armsCharge";

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
 * The painting is made of layers, listed under the shield front first, each
 * of which can be brought forward, sent back or removed. Painting by hand goes
 * onto a paint layer. A charge picked from the gallery, in the colour in hand,
 * and a picture dropped on the shield or chosen from the files each lie on a
 * layer of their own, and can be dragged, resized, flipped or recoloured
 * whenever their layer is picked. A picture the painting's own size is taken
 * for a design downloaded from a painter, and opens as the painting itself.
 *
 * Randomize makes arms: a field, plain or divided, and perhaps a charge, kept
 * as parts rather than paint, so any part can be changed or rolled again. The
 * field and its charge lie on layers of their own, and picking either brings
 * back the arms' controls.
 *
 * The layers are kept on the Knight beside the heraldry, to take up again the
 * next time the painter opens.
 *
 * The window draws once. Picking a tool, colour or layer updates the controls
 * in place, since drawing the window again would wipe the painting.
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
			rollArms: HeraldryPainter.#onRollArms,
			armsDivision: HeraldryPainter.#onArmsDivision,
			armsColor: HeraldryPainter.#onArmsColor,
			armsCounterchange: HeraldryPainter.#onArmsCounterchange,
			changeArmsCharge: HeraldryPainter.#onChangeArmsCharge,
			removeArmsCharge: HeraldryPainter.#onRemoveArmsCharge,
			download: HeraldryPainter.#onDownload,
			doneLayer: HeraldryPainter.#onDoneLayer,
			removeSelected: HeraldryPainter.#onRemoveSelected,
			selectLayer: HeraldryPainter.#onSelectLayer,
			layerForward: HeraldryPainter.#onLayerForward,
			layerBack: HeraldryPainter.#onLayerBack,
			removeLayer: HeraldryPainter.#onRemoveLayer,
			addLayer: HeraldryPainter.#onAddLayer,
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

	/** @type {Set<number>} The groups of the division in hand painted since it was taken up. Once all are, its lines are hidden. */
	#painted = new Set();

	#color = tinctureColor("gules");

	/** @type {string[]} Colours mixed or taken from a painting, most recent first. */
	#recent = [];

	/** Brush width in the sheet's pixels. */
	#size = BRUSH.initial;

	/** @type {HTMLCanvasElement|null} The shield on screen, where every layer is drawn together. */
	#canvas = null;

	/** @type {CanvasRenderingContext2D|null} */
	#context = null;

	/** @type {Path2D|null} */
	#shield = null;

	/** @type {Uint8Array|null} */
	#inside = null;

	/** @type {Layer[]} The painting's layers, back first. */
	#layers = [];

	/**
	 * The layer picked, whose controls show beside the shield. With none picked,
	 * the paints show, and paint goes onto the front layer if it's a paint layer,
	 * or a new one in front.
	 * @type {number|null}
	 */
	#selected = null;

	/** The last layer's id handed out. */
	#layerIds = 0;

	/** Counts changes to paint layers, so a layer's pixels are only copied to undo when they've changed. */
	#versions = 0;

	/**
	 * The arms, drawn from their parts: their field on one layer, and their
	 * charge on another, with their own controls in place of the paints while
	 * either is picked.
	 * @type {import("../rules/heraldry.js").Arms|null}
	 */
	#arms = null;

	/** @type {Snapshot[]} The painting before each change, most recent last. */
	#undo = [];

	/** @type {Snapshot[]} The painting before each undo, most recent last. A new change forgets them. */
	#redo = [];

	/**
	 * The last change that the next may join as one step to undo, and when it was.
	 * @type {{merge: string, at: number}|null}
	 */
	#lastChange = null;

	/** @type {Map<string, HTMLCanvasElement>} Charges tinted, by key and colour, the latest used last. */
	#tints = new Map();

	/** @type {Set<string>} Charges whose file couldn't be fetched, so they aren't asked for again each time the shield is drawn. */
	#unreadable = new Set();

	/** Whether the pointer is over the shield, where a frame shows round the arms' charge while their field is picked. */
	#hovering = false;

	/**
	 * The pointer dragging a picture or charge: where the pointer and the
	 * picture's middle started, the painting before it moved, and whether it has.
	 * @type {{pointerId: number, from: {x: number, y: number}, start: {x: number, y: number}, before: Snapshot, moved: boolean}|null}
	 */
	#drag = null;

	/**
	 * The stroke in progress, on a paint layer. For a line, `last` is where it
	 * started and `backdrop` a copy of the layer underneath it.
	 * @type {{pointerId: number, layer: PaintLayer, last: {x: number, y: number}, backdrop: HTMLCanvasElement|null}|null}
	 */
	#stroke = null;

	/**
	 * Whether the gallery of charges shows in place of the other controls: to
	 * add a charge on a layer of its own, or to give the arms another.
	 * @type {"add"|"arms"|null}
	 */
	#browsing = null;

	/** Counts charges picked and arms randomized, so only the latest one arrives when several load at once. */
	#pickRequest = 0;

	/**
	 * Whether charges are being tinted for the shield. One tint runs at a time,
	 * and the colour picker moving meanwhile asks for one more.
	 */
	#tinting = false;

	/** Whether the colours wanted changed while charges were being tinted. */
	#tintAgain = false;

	/** Whether a redraw of the shield is waiting for the next frame. */
	#drawQueued = false;

	#saving = false;

	/** @type {Set<string>} Folders made ready for uploads, so each layer saved doesn't ask again. */
	#folders = new Set();

	/**
	 * The painting as last saved, loaded before the window first draws.
	 * @type {{arms: import("../rules/heraldry.js").Arms|null, layers: (import("../rules/heraldry.js").KeptLayer & {image?: HTMLImageElement})[]}|null}
	 */
	#opening = null;

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
	 * positions it after that step finishes. Waiting for the pictures there would
	 * leave the window unplaced at the far left while they load, so they load
	 * here, before the window arrives.
	 * @override
	 */
	async _preFirstRender(context, options) {
		await super._preFirstRender(context, options);
		this.#opening = await this.#readSaved();
	}

	/**
	 * The painting as last saved: its layers when they were kept with it, the
	 * arms when only they were, or else the heraldry itself on one layer.
	 * @returns {Promise<{arms: import("../rules/heraldry.js").Arms|null, layers: (import("../rules/heraldry.js").KeptLayer & {image?: HTMLImageElement})[]}>}
	 */
	async #readSaved() {
		const { heraldry } = this.#actor.system;
		if (!heraldry) return { arms: null, layers: [] };
		const kept = readLayers(this.#actor.getFlag(SYSTEM_ID, LAYERS_FLAG), heraldry, CHARGE_KEYS);
		if (kept) {
			// The charges are tinted while the pictures load, which they don't wait on.
			const [layers] = await Promise.all([
				Promise.all(kept.layers.map(async (layer) => (layer.src ? { ...layer, image: await loadImage(layer.src) } : layer))),
				this.#loadTints(this.#wantedTints(kept.arms, kept.layers))
			]);
			// A layer's file gone missing leaves the heraldry itself to open instead.
			if (layers.every((layer) => !layer.src || layer.image)) return { arms: kept.arms, layers };
		}
		// Arms kept before layers were, which the heraldry showed and nothing else.
		const arms = readArms(this.#actor.getFlag(SYSTEM_ID, ARMS_FLAG), heraldry, CHARGE_KEYS);
		if (arms) {
			await this.#loadTints(this.#wantedTints(arms, ARMS_CHARGE_LAYERS));
			return { arms, layers: [{ kind: "field" }, ...(arms.charge ? ARMS_CHARGE_LAYERS : [])] };
		}
		const image = await loadImage(heraldry);
		return { arms: null, layers: image ? [{ kind: "paint", src: heraldry, image }] : [] };
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
		this.element.querySelector("[data-image-size]").addEventListener("input", (event) => this.#resizeFromSlider(event.currentTarget));
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

		const { arms: saved, layers } = this.#opening;
		this.#opening = null;
		this.#arms = saved;
		this.#layers = layers.map((layer) => this.#layerFrom(layer));
		this.#showSide();
		this.#compose();
	}

	/**
	 * @param {import("../rules/heraldry.js").KeptLayer & {image?: HTMLImageElement}} kept A layer as kept on the Knight, its picture loaded.
	 * @returns {Layer}
	 */
	#layerFrom(kept) {
		const id = ++this.#layerIds;
		switch (kept.kind) {
			case "paint": {
				const layer = this.#newPaintLayer(id);
				if (kept.image) this.#drawImage(layer.context, kept.image, { x: 0, y: 0, ...PAINTING });
				return layer;
			}
			case "picture":
				return { id, kind: "picture", image: pictureCanvas(kept.image), placement: kept.placement, flip: kept.flip };
			case "charge":
				return { id, kind: "charge", key: kept.key, color: kept.color, placement: kept.placement, flip: kept.flip };
			default:
				return { id, kind: kept.kind };
		}
	}

	/**
	 * @param {number} [id]
	 * @returns {PaintLayer} An empty layer to paint on.
	 */
	#newPaintLayer(id = ++this.#layerIds) {
		const canvas = document.createElement("canvas");
		canvas.width = PAINTING.width;
		canvas.height = PAINTING.height;
		return { id, kind: "paint", canvas, context: softwareContext(canvas), version: ++this.#versions, kept: null };
	}

	/* -------------------------------------------- */
	/*  Layers                                      */
	/* -------------------------------------------- */

	/** @returns {Layer|null} */
	#selectedLayer() {
		return this.#layerById(this.#selected);
	}

	/**
	 * @param {number|null} id
	 * @returns {Layer|null}
	 */
	#layerById(id) {
		return id === null ? null : (this.#layers.find((layer) => layer.id === id) ?? null);
	}

	/** @returns {number|null} Where the layer picked lies, back first, for a new layer to go straight above it. */
	#selectedIndex() {
		const index = this.#layers.findIndex((layer) => layer.id === this.#selected);
		return index === -1 ? null : index;
	}

	/** @returns {boolean} Whether painting by hand is in hand: a paint layer is picked, or no layer. */
	#paintingSelected() {
		const layer = this.#selectedLayer();
		return !layer || layer.kind === "paint";
	}

	/** @returns {boolean} Whether the arms' controls show: their field or their charge is picked. */
	#armsSelected() {
		return Boolean(this.#arms) && isArmsLayer(this.#selectedLayer());
	}

	/**
	 * Put a new layer straight above another.
	 * @template {Layer} T
	 * @param {T} layer
	 * @param {number|null} above See insertLayer.
	 * @returns {T}
	 */
	#addLayer(layer, above) {
		this.#layers = insertLayer(this.#layers, layer, above);
		return layer;
	}

	/** @param {Layer} layer A layer in place of the one with its id. */
	#replaceLayer(layer) {
		this.#layers = this.#layers.map((each) => (each.id === layer.id ? layer : each));
	}

	/**
	 * Pick a layer, bringing up its controls, or none to bring up the paints.
	 * @param {number|null} id
	 */
	#select(id) {
		this.#selected = id;
		this.#browsing = null;
		this.#showSide();
	}

	/** A paint tool was taken up, so a layer picked that can't be painted on is let go. */
	#takeUpPaint() {
		if (!this.#paintingSelected()) this.#select(null);
	}

	/**
	 * Take the arms up or put them down, as part of a change: their field goes
	 * straight above the layer picked, and their charge straight above their
	 * field. Layers they already lie on stay where they are.
	 * @param {import("../rules/heraldry.js").Arms|null} arms
	 */
	#putArms(arms) {
		this.#arms = arms;
		let layers = this.#layers;
		if (!arms) layers = layers.filter((layer) => !isArmsLayer(layer));
		else {
			if (!layers.some((layer) => layer.kind === "field")) layers = insertLayer(layers, { id: ++this.#layerIds, kind: "field" }, this.#selectedIndex());
			const hasCharge = layers.some((layer) => layer.kind === "armsCharge");
			if (arms.charge && !hasCharge) {
				const field = layers.findIndex((layer) => layer.kind === "field");
				layers = insertLayer(layers, { id: ++this.#layerIds, kind: "armsCharge" }, field);
			} else if (!arms.charge && hasCharge) layers = layers.filter((layer) => layer.kind !== "armsCharge");
		}
		this.#layers = layers;
		// The arms' charge taken off leaves their field picked.
		if (!this.#selectedLayer()) this.#selected = this.#fieldLayer()?.id ?? null;
	}

	/** @returns {ArmsLayer|undefined} */
	#fieldLayer() {
		return this.#layers.find((layer) => layer.kind === "field");
	}

	/**
	 * Bring a layer forward, or send it back.
	 * @param {number} id
	 * @param {number} by
	 */
	#moveLayer(id, by) {
		const moved = moveLayer(this.#layers, this.#layers.findIndex((layer) => layer.id === id), by);
		if (moved === this.#layers) return;
		this.#change(() => {
			this.#layers = moved;
		});
	}

	/**
	 * Remove a layer, as a step to undo. The arms' field takes the arms with it.
	 * @param {number} id
	 */
	#removeLayer(id) {
		const layer = this.#layerById(id);
		if (!layer || this.#drag || this.#stroke) return;
		if (layer.kind === "field") this.#changeArms(null);
		else if (layer.kind === "armsCharge") this.#changeArms({ ...this.#arms, charge: null });
		else {
			this.#change(() => {
				this.#layers = this.#layers.filter((each) => each !== layer);
				if (this.#selected === id) this.#selected = null;
			});
		}
	}

	/* -------------------------------------------- */
	/*  Pointer and keys                            */
	/* -------------------------------------------- */

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
			this.#drag = { pointerId: event.pointerId, from: point, start: { x, y }, before: this.#snapshot(), moved: false };
			return;
		}
		// The arms' field is changed from its controls, and nothing is painted on it.
		if (!this.#paintingSelected()) return;
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
		const layer = this.#beginPaint();
		this.#canvas.setPointerCapture(event.pointerId);
		this.#stroke = {
			pointerId: event.pointerId,
			layer,
			last: point,
			// A line is drawn again over the layer as it was each time the pointer moves.
			backdrop: this.#tool === "line" ? copyCanvas(layer.canvas) : null
		};
		this.#paint(layer, point, point);
	}

	/** @param {PointerEvent} event */
	#onPointerMove(event) {
		const drag = this.#drag;
		if (drag && event.pointerId === drag.pointerId) {
			const point = this.#point(event);
			const movable = this.#movable();
			if (movable) {
				this.#moveSelected({
					...movable.placement,
					x: drag.start.x + point.x - drag.from.x,
					y: drag.start.y + point.y - drag.from.y
				});
			}
			return;
		}
		if (this.#tool === "divide" && this.#paintingSelected()) {
			this.#highlightGroup(this.#groupAt(this.#point(event)));
			return;
		}
		if (event.pointerId !== this.#stroke?.pointerId) return;
		const { backdrop, layer } = this.#stroke;
		if (backdrop) {
			const start = this.#stroke.last;
			const point = this.#point(event);
			layer.context.clearRect(0, 0, PAINTING.width, PAINTING.height);
			layer.context.drawImage(backdrop, 0, 0);
			this.#paint(layer, start, event.shiftKey ? snapLine(start, point) : point);
			return;
		}
		// A fast stroke sends several positions per frame. Following them all keeps curves smooth.
		const events = event.getCoalescedEvents?.() ?? [];
		for (const each of events.length ? events : [event]) {
			const point = this.#point(each);
			this.#paint(layer, this.#stroke.last, point);
			this.#stroke.last = point;
		}
	}

	/** @param {WheelEvent} event Scrolling over the shield resizes the picture or charge picked about the pointer. */
	#onWheel(event) {
		const movable = this.#movable();
		if (!movable || !event.deltaY) return;
		event.preventDefault();
		const { placement, limits } = movable;
		const factor = event.deltaY < 0 ? IMAGE_ZOOM_STEP : 1 / IMAGE_ZOOM_STEP;
		this.#moveSelected(zoomPlacement(placement, placement.scale * factor, limits, this.#point(event)), { step: "size" });
	}

	/** The pointer let go of what it was dragging. A drag that moved it is one step to undo. */
	#endDrag() {
		const { before, moved } = this.#drag;
		this.#drag = null;
		if (moved) this.#remember(before);
	}

	/**
	 * The pointer came onto the shield or left it. A frame shows round the arms'
	 * charge while it's over the shield with their field picked, to show the charge can be dragged.
	 * @param {boolean} hovering
	 */
	#hover(hovering) {
		this.#hovering = hovering;
		this.#renderFrame();
	}

	/**
	 * @returns {ChargeLayer|PictureLayer|ArmsLayer|null} What dragging on the
	 *   shield moves: the picture or charge picked, or the arms' charge while
	 *   their field is picked.
	 */
	#movableLayer() {
		const layer = this.#selectedLayer();
		if (layer?.kind === "charge" || layer?.kind === "picture") return layer;
		if (isArmsLayer(layer) && this.#arms?.charge) return this.#layers.find((each) => each.kind === "armsCharge") ?? null;
		return null;
	}

	/**
	 * @returns {{placement: import("../rules/heraldry.js").Placement, limits: {min: number, max: number}, natural: {width: number, height: number}}|null}
	 *   Where the layer dragging moves lies, and the sizes it may take. A charge
	 *   can't move until it has been tinted, since its size comes from the picture.
	 */
	#movable() {
		if (this.#saving) return null;
		const layer = this.#movableLayer();
		let placement;
		let natural;
		if (layer?.kind === "picture") ({ placement, image: natural } = layer);
		else if (layer?.kind === "charge") {
			placement = layer.placement;
			natural = this.#tintOf(layer.key);
		} else if (layer?.kind === "armsCharge") {
			placement = this.#arms.charge.placement;
			natural = this.#tintOf(this.#arms.charge.key);
		}
		return natural ? { placement, limits: placementLimits(natural, PAINTING), natural } : null;
	}

	/**
	 * Escape puts the gallery of charges away, or lets go of the layer picked,
	 * and Enter on the shield does the same. On the shield, Delete removes a
	 * picture or charge picked. Ctrl+Z undoes, and Ctrl+Y or Ctrl+Shift+Z
	 * redoes, with Cmd in place of Ctrl on a Mac. Keys stop here, so Escape
	 * doesn't also close the window, nor Foundry's own Undo take back a change
	 * on the Scene behind it.
	 * @param {KeyboardEvent} event
	 */
	#onKeyDown(event) {
		const { key } = event;
		const onShield = event.target === this.#canvas;
		const layer = this.#selectedLayer();
		let handled = true;
		if (this.#browsing && key === "Escape") this.#browse(false, { focus: true });
		else if (layer && layer.kind !== "paint" && (key === "Escape" || (key === "Enter" && onShield))) this.#select(null);
		else if ((layer?.kind === "charge" || layer?.kind === "picture") && onShield && (key === "Delete" || key === "Backspace")) this.#removeLayer(layer.id);
		else handled = this.#onMoveKey(event);
		if (handled) {
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
	 * On the shield, arrow keys move the picture or charge picked, and + and − resize it.
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
			this.#moveSelected({ ...placement, x: placement.x + across * step, y: placement.y + down * step }, { step: "move" });
		} else if (["+", "=", "-"].includes(key)) {
			const factor = key === "-" ? 1 / IMAGE_ZOOM_STEP : IMAGE_ZOOM_STEP;
			this.#moveSelected(zoomPlacement(placement, placement.scale * factor, limits), { step: "size" });
		} else return false;
		return true;
	}

	/* -------------------------------------------- */
	/*  Painting by hand                            */
	/* -------------------------------------------- */

	/**
	 * Get ready to paint by hand, as a step to undo: onto the paint layer
	 * picked, or with none picked, onto the front layer if it's a paint layer,
	 * or else a new one in front.
	 * @returns {PaintLayer}
	 */
	#beginPaint() {
		this.#remember();
		let layer = this.#selectedLayer();
		if (!layer) {
			const front = this.#layers.at(-1);
			layer = front?.kind === "paint" ? front : this.#addLayer(this.#newPaintLayer(), null);
			this.#selected = layer.id;
			this.#renderLayers();
		}
		layer.version = ++this.#versions;
		return layer;
	}

	/**
	 * Take the colour under a point, as the shield shows it, and keep it among
	 * the recent colours. The eyedropper then hands back to the tool used before
	 * it. Bare shield has no colour, so the eyedropper stays in hand to try again.
	 * @param {{x: number, y: number}} point
	 */
	#sample(point) {
		this.#compose();
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
	 * Brush or erase from one point to another on a paint layer, inside the shield.
	 * @param {PaintLayer} layer
	 * @param {{x: number, y: number}} from
	 * @param {{x: number, y: number}} to
	 */
	#paint(layer, from, to) {
		const { context } = layer;
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
		this.#queueDraw();
	}

	/**
	 * Fill the area around a point as the shield shows it, every layer
	 * together, so a fill stops at a charge's outline. The paint goes onto the
	 * paint layer.
	 * @param {{x: number, y: number}} point
	 */
	#fill(point) {
		this.#compose();
		const shown = this.#context.getImageData(0, 0, PAINTING.width, PAINTING.height);
		const color = hexToRgba(this.#color);
		const reached = floodReach(shown.data, PAINTING.width, PAINTING.height, point.x, point.y, color, { inside: this.#inside });
		if (!reached) return;
		const layer = this.#beginPaint();
		const image = layer.context.getImageData(0, 0, PAINTING.width, PAINTING.height);
		paintReached(image.data, reached, color);
		layer.context.putImageData(image, 0, 0);
		this.#queueDraw();
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
		const layer = this.#beginPaint();
		this.#fillGroup(layer.context, this.#division, group, this.#color);
		this.#painted.add(group);
		this.#showGuides();
		this.#queueDraw();
	}

	/**
	 * Paint every part of a division in one group, inside the shield.
	 * @param {CanvasRenderingContext2D} context
	 * @param {typeof DIVISIONS[number]} division
	 * @param {number} group
	 * @param {string} color
	 */
	#fillGroup(context, division, group, color) {
		const path = groupPath(division, group);
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
		guides.style.color = this.#color;
		this.#showGuides();
	}

	/**
	 * Show the division in hand's lines, unless there's none, a layer that
	 * can't be painted on is picked, or every part is painted, when the colours
	 * show the lines already.
	 */
	#showGuides() {
		const division = this.#division;
		const painted = division && division.parts.every(({ group }) => this.#painted.has(group));
		// An SVG element has no `hidden` property, only the attribute.
		this.element.querySelector("[data-division-guides]").toggleAttribute("hidden", !division || !this.#paintingSelected() || painted);
	}

	/** @param {number|null} group The group of parts to show the colour in hand over, or null for none. */
	#highlightGroup(group) {
		const guides = this.element.querySelector("[data-division-guides]");
		for (const polygon of guides.children) polygon.classList.toggle("is-hovered", polygon.dataset.group === String(group));
	}

	/* -------------------------------------------- */
	/*  Drawing the shield                          */
	/* -------------------------------------------- */

	/** Draw every layer onto the shield, back to front. */
	#compose() {
		const context = this.#context;
		context.clearRect(0, 0, PAINTING.width, PAINTING.height);
		for (const layer of this.#layers) this.#drawLayer(context, layer);
		this.#renderFrame();
	}

	/** Redraw the shield on the next frame, once however many times it changed before then. */
	#queueDraw() {
		if (this.#drawQueued) return;
		this.#drawQueued = true;
		requestAnimationFrame(() => {
			this.#drawQueued = false;
			if (this.rendered) this.#compose();
		});
	}

	/**
	 * @param {CanvasRenderingContext2D} context
	 * @param {Layer} layer
	 */
	#drawLayer(context, layer) {
		switch (layer.kind) {
			case "paint":
				context.drawImage(layer.canvas, 0, 0);
				break;
			case "picture":
				this.#drawImage(context, layer.image, placementBox(layer.image, PAINTING, layer.placement), { flip: layer.flip });
				break;
			case "charge": {
				const image = this.#tint(layer.key, layer.color);
				if (image) this.#drawImage(context, image, placementBox(image, PAINTING, layer.placement), { flip: layer.flip });
				break;
			}
			case "field":
				this.#drawField(context, this.#arms);
				break;
			case "armsCharge":
				this.#drawArmsCharge(context, this.#arms);
				break;
		}
	}

	/**
	 * @param {CanvasRenderingContext2D} context
	 * @param {import("../rules/heraldry.js").Arms} arms
	 */
	#drawField(context, arms) {
		const division = divisionOf(arms.division);
		if (division) {
			arms.field.forEach((color, group) => this.#fillGroup(context, division, group, color));
			return;
		}
		context.save();
		context.fillStyle = arms.field[0];
		context.fill(this.#shield);
		context.restore();
	}

	/**
	 * Draw the arms' charge, taking another tincture over each group of the
	 * field when counterchanged. The first is drawn whole beneath the others, so
	 * no hairline shows where the charge crosses a line.
	 * @param {CanvasRenderingContext2D} context
	 * @param {import("../rules/heraldry.js").Arms} arms
	 */
	#drawArmsCharge(context, arms) {
		const { charge } = arms;
		if (!charge) return;
		const images = chargeColors(arms).map((color) => this.#tint(charge.key, color));
		if (!images.every(Boolean)) return;
		const [first] = images;
		const box = placementBox(first, PAINTING, charge.placement);
		const division = divisionOf(arms.division);
		this.#drawImage(context, first, box, { flip: charge.flip });
		for (const [group, image] of images.entries()) {
			if (image === first) continue;
			context.save();
			context.clip(groupPath(division, group));
			this.#drawImage(context, image, box, { flip: charge.flip });
			context.restore();
		}
	}

	/**
	 * @param {CanvasRenderingContext2D} context
	 * @param {HTMLImageElement|HTMLCanvasElement} image
	 * @param {{x: number, y: number, width: number, height: number}} box
	 * @param {object} [options]
	 * @param {boolean} [options.flip] Mirror the picture left to right within its box.
	 */
	#drawImage(context, image, box, { flip = false } = {}) {
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
	 * A dashed frame round the picture or charge dragging moves, over the
	 * shield rather than on it, so it's never kept in the painting. It shows
	 * round the arms' charge only while the pointer is over the shield.
	 */
	#renderFrame() {
		const frame = this.element?.querySelector("[data-frame]");
		if (!frame) return;
		const movable = this.#movable();
		this.#canvas.classList.toggle("is-placing", Boolean(movable));
		const show = movable && (this.#hovering || this.#selectedLayer()?.kind !== "field");
		frame.toggleAttribute("hidden", !show);
		if (!show) return;
		const box = placementBox(movable.natural, PAINTING, movable.placement);
		for (const rect of frame.children) {
			rect.setAttribute("x", String(box.x));
			rect.setAttribute("y", String(box.y));
			rect.setAttribute("width", String(box.width));
			rect.setAttribute("height", String(box.height));
		}
	}

	/* -------------------------------------------- */
	/*  Charges and pictures                        */
	/* -------------------------------------------- */

	/**
	 * Read a picture from the user's computer and put it on the shield.
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
	 * Open a design downloaded from a painter as the painting, in place of every
	 * layer, or put any other picture on a layer of its own, fitted inside the
	 * shield, straight above the layer picked.
	 * @param {HTMLImageElement} image
	 */
	#openImage(image) {
		this.#stroke = null;
		this.#browsing = null;
		const design = image.naturalWidth === PAINTING.width && image.naturalHeight === PAINTING.height;
		this.#change(() => {
			if (design) {
				const layer = this.#newPaintLayer();
				this.#drawImage(layer.context, image, { x: 0, y: 0, ...PAINTING });
				this.#layers = [layer];
				this.#arms = null;
				this.#selected = layer.id;
				return;
			}
			const layer = { id: ++this.#layerIds, kind: "picture", image: pictureCanvas(image), placement: centredPlacement(PAINTING), flip: false };
			this.#selected = this.#addLayer(layer, this.#selectedIndex()).id;
		});
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Move or resize the picture or charge dragging moves.
	 * @param {import("../rules/heraldry.js").Placement} placement
	 * @param {object} [options]
	 * @param {string|null} [options.step] A kind of change to undo as one step, joining
	 *   changes of that kind just before it. Dragging makes its step when it's let go.
	 */
	#moveSelected(placement, { step = null } = {}) {
		const layer = this.#movableLayer();
		if (!layer) return;
		const kept = keepOnPainting(placement, PAINTING);
		const apply = () => {
			if (layer.kind === "armsCharge") this.#arms = { ...this.#arms, charge: { ...this.#arms.charge, placement: kept } };
			else this.#replaceLayer({ ...layer, placement: kept });
		};
		if (step) {
			this.#change(apply, { merge: `${step}-${layer.id}` });
			return;
		}
		// A drag only moves the layer, so the controls needn't be drawn again each time it moves.
		apply();
		if (this.#drag) this.#drag.moved = true;
		this.#queueDraw();
	}

	/** @param {HTMLInputElement} slider A size slider moved, resizing the picture or charge dragging moves. */
	#resizeFromSlider(slider) {
		const movable = this.#movable();
		if (movable) this.#moveSelected(zoomPlacement(movable.placement, Number(slider.value) / 100, movable.limits), { step: "size" });
	}

	/**
	 * The charges the shield wants, in each colour it wants them in.
	 * @param {import("../rules/heraldry.js").Arms|null} [arms]
	 * @param {{kind: string, key?: string, color?: string}[]} [layers]
	 * @returns {Map<string, Set<string>>} Colours by charge.
	 */
	#wantedTints(arms = this.#arms, layers = this.#layers) {
		const wanted = new Map();
		const want = (key, color) => {
			if (!wanted.has(key)) wanted.set(key, new Set());
			wanted.get(key).add(color);
		};
		for (const layer of layers) {
			if (layer.kind === "charge") want(layer.key, layer.color);
			else if (layer.kind === "armsCharge" && arms?.charge) for (const color of chargeColors(arms)) want(arms.charge.key, color);
		}
		return wanted;
	}

	/**
	 * Tint each charge wanted in each colour it hasn't been tinted in yet.
	 * @param {Map<string, Set<string>>} wanted
	 * @returns {Promise<{added: number, failed: string[]}>} How many tints were added, and the charges that couldn't be fetched.
	 */
	async #loadTints(wanted) {
		let added = 0;
		const failed = [];
		await Promise.all([...wanted].map(async ([key, colors]) => {
			const missing = [...colors].filter((color) => !this.#tints.has(tintKey(key, color)));
			if (!missing.length) return;
			const svg = await loadChargeFile(key);
			if (!svg) {
				failed.push(key);
				return;
			}
			const images = await Promise.all(missing.map((color) => loadTintedCharge(svg, color)));
			for (const [index, image] of images.entries()) {
				if (!image) continue;
				const each = tintKey(key, missing[index]);
				this.#tints.delete(each);
				this.#tints.set(each, image);
				added++;
			}
		}));
		// The first kept are the oldest. Those wanted, or on show, stay.
		const keep = new Set();
		for (const tints of [wanted, this.#wantedTints()]) {
			for (const [key, colors] of tints) for (const color of colors) keep.add(tintKey(key, color));
		}
		for (const each of this.#tints.keys()) {
			if (this.#tints.size <= TINT_LIMIT + keep.size) break;
			if (!keep.has(each)) this.#tints.delete(each);
		}
		return { added, failed };
	}

	/**
	 * Tint the charges the shield wants that it hasn't got, and draw them once
	 * they're ready. While the colour picker is dragged, colours that arrive
	 * during a tint are skipped for the latest one.
	 */
	async #ensureTints() {
		if (this.#tinting) {
			this.#tintAgain = true;
			return;
		}
		this.#tinting = true;
		try {
			do {
				this.#tintAgain = false;
				const wanted = this.#wantedTints();
				for (const key of this.#unreadable) wanted.delete(key);
				const { added, failed } = await this.#loadTints(wanted);
				if (!this.rendered) return;
				// A charge that can't be fetched is said so once, rather than tried again each time the shield is drawn.
				if (failed.length) ui.notifications.warn(t("heraldry.unreadable"));
				for (const key of failed) this.#unreadable.add(key);
				if (added) this.#queueDraw();
			} while (this.#tintAgain);
		} finally {
			this.#tinting = false;
		}
	}

	/**
	 * Tint charges before they show, for an action that may have been overtaken
	 * by another while they loaded.
	 * @param {Map<string, Set<string>>} wanted
	 * @param {() => boolean} still Whether the action is still wanted once they've loaded.
	 * @param {{quiet?: boolean}} [options] Say nothing of a charge that can't be read.
	 * @returns {Promise<boolean|null>} True when they're ready; false when a charge
	 *   can't be read, said so unless quiet; null when the action was overtaken.
	 */
	async #tintFor(wanted, still, { quiet = false } = {}) {
		const request = ++this.#pickRequest;
		const { failed } = await this.#loadTints(wanted);
		if (request !== this.#pickRequest || !this.rendered || !still()) return null;
		if (!failed.length) return true;
		if (!quiet) ui.notifications.warn(t("heraldry.unreadable"));
		return false;
	}

	/**
	 * @param {string} key
	 * @param {string} color
	 * @returns {HTMLCanvasElement|undefined} The charge in that colour, or while it's
	 *   being tinted, in whichever colour was tinted last, rather than leaving a gap.
	 */
	#tint(key, color) {
		const image = this.#tints.get(tintKey(key, color));
		if (image) return image;
		this.#ensureTints();
		return this.#tintOf(key);
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

	/* -------------------------------------------- */
	/*  Controls beside the shield                  */
	/* -------------------------------------------- */

	/**
	 * Show the controls for what's in hand beside the shield: the gallery of
	 * charges, the arms, the picture or charge picked, or the paints. The
	 * layers under the shield follow.
	 */
	#showSide() {
		const kind = this.#selectedLayer()?.kind;
		const browsing = Boolean(this.#browsing);
		const arming = !browsing && this.#armsSelected();
		const placing = !browsing && (kind === "charge" || kind === "picture");
		this.element.querySelector("[data-paint-controls]").hidden = browsing || arming || placing;
		this.element.querySelector("[data-place-controls]").hidden = !placing;
		this.element.querySelector("[data-charge-controls]").hidden = !browsing;
		this.element.querySelector("[data-arms-controls]").hidden = !arming;
		markActive(this.element.querySelector('[data-action="browseCharges"]'), this.#browsing === "add");
		this.#showGuides();
		if (arming) this.#renderArms();
		if (placing) this.#renderPlacing();
		this.#renderLayers();
		this.#refreshHistory();
		this.#renderFrame();
	}

	/** Show the picture or charge picked in its controls. */
	#renderPlacing() {
		const layer = this.#selectedLayer();
		const panel = this.element.querySelector("[data-place-controls]");
		const charge = layer.kind === "charge";
		panel.querySelector("[data-place-title]").textContent = charge ? chargeName(layer.key) : t("heraldry.placing.title");
		const colors = panel.querySelector("[data-charge-colors]");
		colors.hidden = !charge;
		for (const swatch of colors.querySelectorAll("[data-color]")) markActive(swatch, charge && swatch.dataset.color === layer.color);
		markActive(panel.querySelector('[data-action="flipImage"]'), layer.flip);
		this.#showSize(panel.querySelector("[data-image-size]"), layer.placement);
	}

	/**
	 * Set a size slider to a placement, as far as the picked layer may grow.
	 * @param {HTMLInputElement} size
	 * @param {{scale: number}} placement
	 */
	#showSize(size, placement) {
		size.max = String(Math.ceil((this.#movable()?.limits ?? IMAGE_SCALE).max * 100));
		size.value = String(Math.round(placement.scale * 100));
	}

	/**
	 * List the layers under the shield, front first, each with buttons to bring
	 * it forward, send it back or remove it. A button that had focus keeps it.
	 */
	#renderLayers() {
		const list = this.element.querySelector("[data-layer-list]");
		const focused = list.contains(document.activeElement) ? document.activeElement : null;
		const refocus = focused && { id: focused.closest("[data-layer-id]")?.dataset.layerId, action: focused.dataset.action };
		const template = this.element.querySelector("[data-layer-row]").content.firstElementChild;
		let painted = 0;
		const rows = this.#layers.map((layer, index) => {
			const row = template.cloneNode(true);
			row.dataset.layerId = String(layer.id);
			const active = layer.id === this.#selected;
			row.classList.toggle("is-active", active);
			markActive(row.querySelector('[data-action="selectLayer"]'), active);
			const { icon, name } = this.#describeLayer(layer, layer.kind === "paint" ? ++painted : 0);
			row.querySelector("[data-layer-icon]").replaceChildren(icon);
			row.querySelector("[data-layer-name]").textContent = name;
			row.querySelector('[data-action="layerForward"]').disabled = this.#saving || index === this.#layers.length - 1;
			row.querySelector('[data-action="layerBack"]').disabled = this.#saving || index === 0;
			for (const button of row.querySelectorAll('[data-action="selectLayer"], [data-action="removeLayer"]')) button.disabled = this.#saving;
			return row;
		});
		list.replaceChildren(...rows.reverse());
		list.hidden = !rows.length;
		this.element.querySelector("[data-layers-empty]").hidden = Boolean(rows.length);
		if (!refocus) return;
		const again = list.querySelector(`[data-layer-id="${refocus.id}"] [data-action="${refocus.action}"]`);
		// A layer that can go no further hands focus to the button beside it.
		(again?.disabled ? again.closest("li").querySelector('[data-action="selectLayer"]') : again)?.focus({ preventScroll: true });
	}

	/**
	 * @param {Layer} layer
	 * @param {number} number Which paint layer it is, counting from the back.
	 * @returns {{icon: Element, name: string}} What the layer's row shows.
	 */
	#describeLayer(layer, number) {
		const glyph = (kind) => {
			const icon = document.createElement("i");
			icon.className = LAYER_ICONS[kind];
			icon.inert = true;
			return icon;
		};
		const picture = (key) => {
			const image = document.createElement("img");
			image.src = chargePath(key);
			image.alt = "";
			image.draggable = false;
			return image;
		};
		switch (layer.kind) {
			case "paint":
				return { icon: glyph("paint"), name: t("heraldry.layers.paint", { number }) };
			case "picture":
				return { icon: glyph("picture"), name: t("heraldry.placing.title") };
			case "charge":
				return { icon: picture(layer.key), name: chargeName(layer.key) };
			case "field": {
				const division = this.#arms.division ? t(`heraldry.divisions.${this.#arms.division}`) : t("heraldry.arms.plain");
				return { icon: fieldShield(this.#arms, `${this.id}-layer-field`), name: t("heraldry.layers.field", { division }) };
			}
			default:
				return { icon: picture(this.#arms.charge.key), name: t("heraldry.layers.armsCharge", { name: chargeName(this.#arms.charge.key) }) };
		}
	}

	/**
	 * Open the gallery of charges, or put it away.
	 * @param {boolean} open
	 * @param {object} [options]
	 * @param {boolean} [options.focus] Move focus into the gallery, or back to its button.
	 * @param {boolean} [options.forArms] Pick a charge for the arms, rather than add one on a layer of its own.
	 */
	#browse(open, { focus = false, forArms = false } = {}) {
		this.#browsing = open ? (forArms ? "arms" : "add") : null;
		this.#showSide();
		if (!focus) return;
		const target = open ? "[data-charge-group]" : '[data-action="browseCharges"]';
		this.element.querySelector(target)?.focus({ preventScroll: true });
	}

	/* -------------------------------------------- */
	/*  Undo                                        */
	/* -------------------------------------------- */

	/** @returns {Snapshot} The painting as it is now. */
	#snapshot() {
		return {
			layers: this.#layers.map((layer) => (layer.kind === "paint"
				? { id: layer.id, kind: "paint", version: layer.version, pixels: this.#pixelsOf(layer) }
				: layer)),
			arms: this.#arms,
			selected: this.#selected,
			painted: new Set(this.#painted)
		};
	}

	/**
	 * @param {PaintLayer} layer
	 * @returns {ImageData} The layer's pixels, copied once each time it changes.
	 */
	#pixelsOf(layer) {
		if (layer.kept?.version !== layer.version) {
			layer.kept = { version: layer.version, pixels: layer.context.getImageData(0, 0, PAINTING.width, PAINTING.height) };
		}
		return layer.kept.pixels;
	}

	/**
	 * Put the painting back as it was. Paint layers whose pixels haven't changed since are left be.
	 * @param {Snapshot} snapshot
	 */
	#restore({ layers, arms, selected, painted }) {
		const live = new Map(this.#layers.map((layer) => [layer.id, layer]));
		this.#layers = layers.map((was) => {
			if (was.kind !== "paint") return was;
			let layer = live.get(was.id);
			if (layer?.kind !== "paint") layer = this.#newPaintLayer(was.id);
			if (layer.version !== was.version) {
				layer.context.putImageData(was.pixels, 0, 0);
				layer.version = was.version;
				layer.kept = { version: was.version, pixels: was.pixels };
			}
			return layer;
		});
		this.#arms = arms;
		this.#selected = layers.some((layer) => layer.id === selected) ? selected : null;
		this.#painted = new Set(painted);
		this.#drag = null;
		this.#showSide();
		this.#queueDraw();
	}

	/**
	 * Keep a copy of the painting to undo back to. A new change can't be redone past.
	 * @param {Snapshot} [snapshot] The painting before the change. Defaults to how it is now.
	 */
	#remember(snapshot = this.#snapshot()) {
		this.#undo.push(snapshot);
		if (this.#undo.length > UNDO_LIMIT) this.#undo.shift();
		this.#redo = [];
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
	 * Change the layers or arms as a step to undo, then show the change.
	 * @param {() => void} apply
	 * @param {object} [options]
	 * @param {string|null} [options.merge] A kind of change, such as a colour picker moving or the wheel
	 *   turning. One of the same kind just before joins it, so the two are undone together.
	 */
	#change(apply, { merge = null } = {}) {
		const last = this.#lastChange;
		const now = Date.now();
		const joins = merge && last?.merge === merge && now - last.at < MERGE_WINDOW;
		if (!joins) this.#remember();
		this.#lastChange = merge ? { merge, at: now } : null;
		apply();
		// A gesture carried on, such as a slider or a picker dragged, changes the one layer it began on and adds no step,
		// so only that layer's controls follow it rather than the whole side being drawn again at each step.
		if (joins) this.#showPicked();
		else this.#showSide();
		this.#queueDraw();
	}

	/** Show the picked layer's controls, and the field's icon in the list of layers, as a change to it goes on. */
	#showPicked() {
		if (!this.#browsing && this.#armsSelected()) {
			this.#renderArms();
			const field = this.#layers.find((layer) => layer.kind === "field");
			const icon = field && this.element.querySelector(`[data-layer-id="${field.id}"] [data-layer-icon]`);
			icon?.replaceChildren(this.#describeLayer(field, 0).icon);
		} else if (!this.#browsing && ["charge", "picture"].includes(this.#selectedLayer()?.kind)) this.#renderPlacing();
		this.#renderFrame();
	}

	/**
	 * Change the arms, or make new ones, as a step to undo.
	 * @param {import("../rules/heraldry.js").Arms|null} arms
	 * @param {object} [options]
	 * @param {string|null} [options.merge] See #change.
	 */
	#changeArms(arms, { merge = null } = {}) {
		this.#change(() => this.#putArms(arms), { merge });
	}

	/* -------------------------------------------- */
	/*  Arms                                        */
	/* -------------------------------------------- */

	/**
	 * Colour one part of the arms.
	 * @param {string|undefined} part A group of the field's parts, by number, or "charge".
	 * @param {string} color
	 * @param {object} [options]
	 * @param {string|null} [options.merge] See #change.
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
		if (!this.#armsSelected() || this.#saving) return;
		if (target.matches("[data-arms-size]")) {
			this.#resizeFromSlider(target);
			return;
		}
		if (!target.matches("[data-arms-picker]")) return;
		const part = target.closest("[data-arms-part]")?.dataset.armsPart;
		this.#colorArms(part, target.value.toLowerCase(), { merge: `color-${part}` });
	}

	/** Show the arms in their controls. The rows of tinctures are only built again when the field's parts change. */
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
		panel.querySelector("[data-arms-charge-name]").textContent = chargeName(charge.key);
		const divided = arms.field.length > 1;
		showColor(panel.querySelector('[data-arms-part="charge"]'), charge.counterchanged && divided ? null : charge.color);
		const counterchange = panel.querySelector('[data-action="armsCounterchange"]');
		markActive(counterchange, charge.counterchanged && divided);
		counterchange.disabled = !divided;
		markActive(panel.querySelector('[data-action="flipImage"]'), charge.flip);
		this.#showSize(panel.querySelector("[data-arms-size]"), charge.placement);
	}

	/** @returns {HTMLUListElement} Every tincture to colour a part of the arms, then a picker for any other colour. */
	#swatches() {
		return this.element.querySelector("[data-arms-swatches]").content.firstElementChild.cloneNode(true);
	}

	/** Undo and redo wait for something to go back or forward to. Edit arms is offered while the arms' controls are away. */
	#refreshHistory() {
		const undo = this.element?.querySelector('[data-action="undo"]');
		const redo = this.element?.querySelector('[data-action="redo"]');
		const editArms = this.element?.querySelector('[data-action="editArms"]');
		if (undo) undo.disabled = !this.#undo.length;
		if (redo) redo.disabled = !this.#redo.length;
		if (editArms) editArms.hidden = !this.#arms || this.#armsSelected();
	}

	/* -------------------------------------------- */
	/*  Tools and colours                           */
	/* -------------------------------------------- */

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
	 * @param {string} color Such as "#b0261e". Picking a colour while erasing picks up the brush, and recolours a charge picked.
	 */
	#pickColor(color) {
		this.#color = color.toLowerCase();
		if (this.#tool === "eraser") this.#pickTool("brush");
		for (const button of this.element.querySelectorAll('[data-action="setColor"]')) markActive(button, button.dataset.color === this.#color);
		this.element.querySelector("[data-custom-color]").value = this.#color;
		this.element.querySelector("[data-division-guides]").style.color = this.#color;
		const layer = this.#selectedLayer();
		if (layer?.kind === "charge" && layer.color !== this.#color) {
			this.#change(() => this.#replaceLayer({ ...layer, color: this.#color }), { merge: `color-${layer.id}` });
		}
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

	/* -------------------------------------------- */
	/*  Saving                                      */
	/* -------------------------------------------- */

	/** @param {boolean} saving */
	#setSaving(saving) {
		this.#saving = saving;
		const buttons = this.element?.querySelectorAll([
			".bastionland-heraldry-painter__footer button",
			"[data-arms-controls] :is(button, input)",
			"[data-place-controls] :is(button, input)",
			"[data-layers] button",
			'[data-action="browseCharges"]',
			'[data-action="randomize"]',
			'[data-action="editArms"]'
		].join(", ")) ?? [];
		for (const button of buttons) button.disabled = saving;
		// Counterchanging stays off for a plain field, and the ends of the layers can go no further. A save closes the window before this.
		if (!saving && this.rendered) this.#showSide();
		else this.#renderFrame();
	}

	/** Draw the shield as it's kept, every charge in every colour it wants. */
	async #composeWhole() {
		await this.#loadTints(this.#wantedTints());
		this.#compose();
	}

	/**
	 * Upload a picture, or turn it into a data URL when uploading isn't allowed or fails.
	 * @param {HTMLCanvasElement} canvas
	 * @param {string} dir Folder under Data.
	 * @param {string} name The file's name, without its extension.
	 * @returns {Promise<string>} Where the picture is, or the picture itself.
	 */
	async #storeCanvas(canvas, dir, name) {
		const blob = game.user.can("FILES_UPLOAD") ? await canvasToBlob(canvas, "image/webp", WEBP_QUALITY) : null;
		if (blob) {
			const needed = [`worlds/${game.world.id}/heraldry`, dir].filter((each) => !this.#folders.has(each));
			await ensureDirectories(needed);
			for (const each of needed) this.#folders.add(each);
			// Browsers without WebP encoding hand back a PNG instead.
			const extension = blob.type.split("/")[1] || "png";
			const path = await uploadFile(dir, new File([blob], `${name}.${extension}`, { type: blob.type }));
			// Each save overwrites the same file, so a version on the end makes browsers fetch the new one.
			if (path) return `${path}?v=${Date.now()}`;
		}
		return canvas.toDataURL("image/webp", WEBP_QUALITY);
	}

	/**
	 * Store the painting.
	 * @returns {Promise<string|null>} What to keep as the Knight's heraldry, or null if it's too large to keep.
	 */
	async #store() {
		const heraldry = await this.#storeCanvas(this.#canvas, `worlds/${game.world.id}/heraldry`, this.#actor.uuid.replaceAll(".", "-"));
		if (!heraldry.startsWith("data:") || heraldry.length <= MAX_INLINE_LENGTH) return heraldry;
		ui.notifications.warn(t("heraldry.tooLarge"));
		return null;
	}

	/**
	 * The layers as kept beside the heraldry, to take up again: each paint and
	 * picture layer stored as a file of its own, or on the Knight when files
	 * can't be uploaded.
	 * @param {string} heraldry The heraldry as just stored.
	 * @returns {Promise<{stamp: string, arms: import("../rules/heraldry.js").Arms|null, layers: import("../rules/heraldry.js").KeptLayer[]}|null>}
	 *   Null when they're too large to keep on the Knight, which leaves the heraldry itself to open next time.
	 */
	async #keepLayers(heraldry) {
		const dir = `worlds/${game.world.id}/heraldry/layers`;
		const name = this.#actor.uuid.replaceAll(".", "-");
		// The layers' pictures are stored all at once rather than one after another.
		const layers = await Promise.all(this.#layers.map(async (layer, index) => {
			if (isArmsLayer(layer)) return { kind: layer.kind };
			if (layer.kind === "charge") {
				const { key, color, placement, flip } = layer;
				return { kind: "charge", key, color, placement, flip };
			}
			const blank = layer.kind === "paint" && isBlank(this.#pixelsOf(layer).data);
			const src = blank ? null : await this.#storeCanvas(layer.kind === "paint" ? layer.canvas : layer.image, dir, `${name}-${index}`);
			return layer.kind === "paint" ? { kind: "paint", src } : { kind: "picture", src, placement: layer.placement, flip: layer.flip };
		}));
		const inline = layers.reduce((total, { src }) => total + (src?.startsWith("data:") ? src.length : 0), 0);
		if (inline > MAX_INLINE_LENGTH) {
			ui.notifications.warn(t("heraldry.layersTooLarge"));
			return null;
		}
		return { stamp: heraldryStamp(heraldry), arms: this.#arms, layers };
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * Picking up a tool puts the charges away, and lets go of a layer that
	 * can't be painted on.
	 * @this {HeraldryPainter}
	 */
	static #onSetTool(_event, target) {
		this.#browse(false);
		this.#takeUpPaint();
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
		this.#takeUpPaint();
		const division = divisionOf(target.dataset.division);
		if (!division || (this.#tool === "divide" && this.#division === division)) {
			this.#pickTool("brush");
			return;
		}
		this.#division = division;
		this.#painted.clear();
		this.#pickTool("divide");
	}

	/** @this {HeraldryPainter} */
	static #onUndo() {
		if (!this.#stroke && !this.#drag) this.#step(this.#undo, this.#redo);
	}

	/** @this {HeraldryPainter} */
	static #onRedo() {
		if (!this.#stroke && !this.#drag) this.#step(this.#redo, this.#undo);
	}

	/**
	 * Clear the shield: every layer, and the arms.
	 * @this {HeraldryPainter}
	 */
	static #onClear() {
		if (this.#drag || this.#stroke || !this.#layers.length) return;
		this.#change(() => {
			this.#layers = [];
			this.#arms = null;
			this.#selected = null;
			this.#painted.clear();
		});
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
		const layer = this.#movableLayer();
		if (layer) this.#moveSelected(layer.kind === "picture" ? centredPlacement(PAINTING) : chargePlacement(PAINTING), { step: "fit" });
	}

	/** @this {HeraldryPainter} */
	static #onFillImage() {
		const movable = this.#movable();
		if (movable) this.#moveSelected(centredPlacement(PAINTING, fillScale(movable.natural, PAINTING)), { step: "fill" });
	}

	/** @this {HeraldryPainter} */
	static #onFlipImage() {
		const layer = this.#movableLayer();
		if (!layer) return;
		if (layer.kind === "armsCharge") {
			const { charge } = this.#arms;
			this.#changeArms({ ...this.#arms, charge: { ...charge, flip: !charge.flip } });
		} else this.#change(() => this.#replaceLayer({ ...layer, flip: !layer.flip }));
	}

	/** @this {HeraldryPainter} The gallery's button opens it to add a charge, or puts it away again. */
	static #onBrowseCharges() {
		this.#browse(this.#browsing !== "add", { focus: true });
	}

	/** @this {HeraldryPainter} */
	static #onCloseCharges() {
		this.#browse(false, { focus: true });
	}

	/**
	 * Put a charge on a layer of its own in the colour in hand, straight above
	 * the layer picked, or give it to the arms when the gallery was opened for them.
	 * @this {HeraldryPainter}
	 */
	static async #onPickCharge(_event, target) {
		const charge = CHARGES.find(({ key }) => key === target.dataset.charge);
		if (!charge || this.#saving) return;
		const arms = this.#arms;
		if (this.#browsing === "arms" && arms) {
			const next = armsWithCharge(arms, charge.key, chargePlacement(PAINTING));
			if (!(await this.#tintFor(this.#wantedTints(next, ARMS_CHARGE_LAYERS), () => Boolean(this.#arms)))) return;
			this.#browsing = null;
			// The arms may have changed while the charge loaded, so it joins them as they are now.
			this.#changeArms(this.#arms === arms ? next : armsWithCharge(this.#arms, charge.key, chargePlacement(PAINTING)));
			this.#canvas.focus({ preventScroll: true });
			return;
		}
		const color = this.#color;
		if (!(await this.#tintFor(new Map([[charge.key, new Set([color])]]), () => true))) return;
		this.#browsing = null;
		this.#change(() => {
			const layer = { id: ++this.#layerIds, kind: "charge", key: charge.key, color: this.#color, placement: chargePlacement(PAINTING), flip: false };
			this.#selected = this.#addLayer(layer, this.#selectedIndex()).id;
		});
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Make random arms over the whole shield, as one change to undo: a field,
	 * plain or divided, and perhaps a charge, in tinctures that read well. Arms
	 * already made are rolled again where they lie; new ones go straight above
	 * the layer picked. The arms' controls come into view, to change any part.
	 * @this {HeraldryPainter}
	 */
	static async #onRandomize() {
		if (this.#saving) return;
		const arms = editableArms(randomArms({ charges: CHARGE_KEYS }), chargePlacement(PAINTING));
		// The charge is tinted before the arms show, so they arrive whole. One that won't load leaves the field bare.
		const tinted = await this.#tintFor(this.#wantedTints(arms, ARMS_CHARGE_LAYERS), () => true, { quiet: true });
		if (tinted === null) return;
		this.#browsing = null;
		this.#stroke = null;
		this.#change(() => {
			this.#putArms(tinted ? arms : { ...arms, charge: null });
			this.#selected = this.#fieldLayer().id;
		});
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Pick the arms' field, bringing up their controls.
	 * @this {HeraldryPainter}
	 */
	static #onEditArms() {
		const field = this.#fieldLayer();
		if (!field || this.#saving) return;
		this.#select(field.id);
		this.#canvas.focus({ preventScroll: true });
	}

	/**
	 * Let go of the layer picked, and bring back the paints.
	 * @this {HeraldryPainter}
	 */
	static #onDoneLayer() {
		this.#select(null);
		this.#canvas.focus({ preventScroll: true });
	}

	/** @this {HeraldryPainter} */
	static #onRemoveSelected() {
		if (this.#selected !== null) this.#removeLayer(this.#selected);
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
		if (!(await this.#tintFor(this.#wantedTints(next, ARMS_CHARGE_LAYERS), () => this.#arms === arms))) return;
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
		this.#browse(true, { focus: true, forArms: true });
	}

	/** @this {HeraldryPainter} */
	static #onRemoveArmsCharge() {
		if (this.#arms?.charge) this.#changeArms({ ...this.#arms, charge: null });
	}

	/**
	 * @param {HTMLElement} target A button in a layer's row.
	 * @returns {number} The layer's id.
	 */
	static #layerIdOf(target) {
		return Number(target.closest("[data-layer-id]").dataset.layerId);
	}

	/** @this {HeraldryPainter} Picking the layer already picked lets go of it. */
	static #onSelectLayer(_event, target) {
		const id = HeraldryPainter.#layerIdOf(target);
		this.#select(this.#selected === id ? null : id);
	}

	/** @this {HeraldryPainter} */
	static #onLayerForward(_event, target) {
		this.#moveLayer(HeraldryPainter.#layerIdOf(target), 1);
	}

	/** @this {HeraldryPainter} */
	static #onLayerBack(_event, target) {
		this.#moveLayer(HeraldryPainter.#layerIdOf(target), -1);
	}

	/** @this {HeraldryPainter} */
	static #onRemoveLayer(_event, target) {
		this.#removeLayer(HeraldryPainter.#layerIdOf(target));
	}

	/**
	 * Add an empty paint layer straight above the layer picked, and pick it.
	 * @this {HeraldryPainter}
	 */
	static #onAddLayer() {
		if (this.#saving) return;
		this.#browsing = null;
		this.#change(() => {
			this.#selected = this.#addLayer(this.#newPaintLayer(), this.#selectedIndex()).id;
		});
	}

	/**
	 * Save the painting to the user's computer as a PNG, full size, to open in a painter again later.
	 * @this {HeraldryPainter}
	 */
	static async #onDownload() {
		if (this.#saving) return;
		await this.#composeWhole();
		const blob = await canvasToBlob(this.#canvas, "image/png");
		if (!blob) {
			ui.notifications.warn(t("heraldry.downloadFailed"));
			return;
		}
		const name = `${slugify(this.#actor.name) || "knight"}-heraldry.png`;
		foundry.utils.saveDataToFile(blob, blob.type, name);
	}

	/** @this {HeraldryPainter} */
	static async #onSave() {
		if (this.#saving) return;
		// A charge or random arms still loading would change the shield while it's being stored.
		this.#pickRequest++;
		this.#setSaving(true);
		try {
			await this.#composeWhole();
			const { data } = this.#context.getImageData(0, 0, PAINTING.width, PAINTING.height);
			const heraldry = isBlank(data) ? "" : await this.#store();
			if (heraldry === null) return;
			// The layers are kept beside the heraldry, to take up again next time.
			const layers = heraldry ? await this.#keepLayers(heraldry) : null;
			await this.#actor.update({
				"system.heraldry": heraldry,
				[`flags.${SYSTEM_ID}.${LAYERS_FLAG}`]: layers,
				[`flags.${SYSTEM_ID}.${ARMS_FLAG}`]: null
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
