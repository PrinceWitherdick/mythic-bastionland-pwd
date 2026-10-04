import { isRealmScene, sceneGeometry } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import {
	VISITED_MARKS_SETTING,
	VISITED_MARK_COLOURS_SETTING,
	VISITED_MARK_STYLE_SETTING,
	setVisitedMarksShown,
	storedVisitedMarkColours,
	visitedMarkLook,
	visitedMarksShown
} from "../canvas/visited-marks.js";
import { HEX_COLOR } from "../rules/colour.js";
import { hexVertices, realmGeometry } from "../rules/realm-geometry.js";
import {
	DEFAULT_VISITED_MARK_COLOURS,
	VISITED_MARK_STYLES,
	strokesPath,
	visitedMarkPen,
	visitedMarkStrokes
} from "../rules/visited-mark-style.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The settings the window shows, so a change made elsewhere is shown in it. */
const KEYS = Object.freeze([VISITED_MARKS_SETTING, VISITED_MARK_STYLE_SETTING, VISITED_MARK_COLOURS_SETTING]);

/** The hex the samples are drawn on. */
const SAMPLE_HEX = Object.freeze({ col: 1, row: 1 });

/**
 * Each mark drawn on one hex, the way the map draws it: on the Realm in view's
 * own hexes where there is one, so pointed tops stay pointed.
 * @returns {object[]}
 */
export function visitedMarkSamples(g, colours, chosen) {
	const corners = hexVertices(g, SAMPLE_HEX);
	const xs = corners.map(({ x }) => x);
	const ys = corners.map(({ y }) => y);
	const pad = g.size * 0.06;
	const viewBox = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad]
		.map((n) => Math.round(n * 10) / 10).join(" ");
	const outline = strokesPath([{ points: corners, closed: true }]);
	return VISITED_MARK_STYLES.map((style) => {
		const pen = visitedMarkPen(g, style);
		return {
			style,
			label: t(`travels.marks.styles.${style}.label`),
			detail: t(`travels.marks.styles.${style}.detail`),
			colourLabel: t("travels.marks.colourOf", { mark: t(`travels.marks.styles.${style}.label`) }),
			colour: colours[style],
			selected: style === chosen,
			viewBox,
			outline,
			outlineWidth: Math.max(1, g.size * 0.012),
			path: strokesPath(visitedMarkStrokes(g, SAMPLE_HEX, style)),
			width: pen.width,
			alpha: pen.alpha,
			halo: pen.halo
		};
	});
}

/**
 * Choose how the hexes the Company has been to are marked, in this browser:
 * whether they are, which of the four marks, and each one's colour. Every
 * change is written as it's made, so the map follows behind the window. Opened
 * by right-clicking the footprints beside the sidebar, from the Settings page,
 * or from Foundry's own settings list.
 */
export class VisitedMarks extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-visited-marks",
		classes: [SYSTEM_ID, "bastionland", "bastionland-dialog", "bastionland-visited-marks-window"],
		position: { width: 440, height: "auto" },
		window: { title: "bastionland.travels.marks.title", icon: "fa-solid fa-shoe-prints" },
		actions: {
			resetColours: VisitedMarks.#onResetColours
		}
	};

	static PARTS = {
		marks: { template: templatePath("apps/visited-marks.hbs") }
	};

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const scene = globalThis.canvas?.scene;
		const g = isRealmScene(scene) ? sceneGeometry(scene) : realmGeometry({ cols: 1, rows: 1 });
		return Object.assign(context, {
			shown: visitedMarksShown(),
			samples: visitedMarkSamples(g, storedVisitedMarkColours(), visitedMarkLook().style)
		});
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		const page = this.element.querySelector(".bastionland-visited-marks");
		if (!page) return;
		// A colour is shown on its sample as it's dragged, and written when it's let go.
		page.addEventListener("input", (event) => {
			const input = event.target;
			if (input.dataset?.colour && HEX_COLOR.test(input.value)) showSampleColour(page, input.dataset.colour, input.value);
		});
		page.addEventListener("change", (event) => onChange(event.target));
	}

	/** Put each mark's colour back as it came. */
	static async #onResetColours() {
		await game.settings.set(SYSTEM_ID, VISITED_MARK_COLOURS_SETTING, { ...DEFAULT_VISITED_MARK_COLOURS });
	}
}

/**
 * @param {HTMLElement} page
 * @param {string} style
 * @param {string} colour
 */
function showSampleColour(page, style, colour) {
	page.querySelector(`[data-sample="${CSS.escape(style)}"]`)?.style.setProperty("--bastionland-mark", colour);
}

/**
 * Write the setting a control stands for.
 * @param {HTMLInputElement} input
 * @returns {Promise<unknown>|null}
 */
function onChange(input) {
	if (input.name === "shown") return setVisitedMarksShown(input.checked);
	if (input.name === "style" && input.checked) return game.settings.set(SYSTEM_ID, VISITED_MARK_STYLE_SETTING, input.value);
	const style = input.dataset?.colour;
	if (style && HEX_COLOR.test(input.value)) {
		return game.settings.set(SYSTEM_ID, VISITED_MARK_COLOURS_SETTING, { ...storedVisitedMarkColours(), [style]: input.value.toLowerCase() });
	}
	return null;
}

/**
 * Show the settings as they are in an open window, changed here or elsewhere,
 * without drawing it again: a redraw would shut a colour picker still open.
 * @param {HTMLElement} page
 */
function showSettings(page) {
	const shown = page.querySelector('input[name="shown"]');
	if (shown) shown.checked = visitedMarksShown();
	const { style } = visitedMarkLook();
	for (const radio of page.querySelectorAll('input[name="style"]')) radio.checked = radio.value === style;
	for (const [key, colour] of Object.entries(storedVisitedMarkColours())) {
		const input = page.querySelector(`input[data-colour="${CSS.escape(key)}"]`);
		if (input && input.value.toLowerCase() !== colour) input.value = colour;
		showSampleColour(page, key, colour);
	}
}

/** @returns {VisitedMarks} */
export const openVisitedMarks = singletonOpener(VisitedMarks);

/** Put the window among the system's settings, for everyone, and keep it up to date. Called during init. */
export function registerVisitedMarksMenu() {
	game.settings.registerMenu(SYSTEM_ID, "visitedMarks", {
		name: "bastionland.travels.marks.title",
		label: "bastionland.travels.marks.open",
		hint: "bastionland.travels.marks.hint",
		icon: "fa-solid fa-shoe-prints",
		type: VisitedMarks,
		restricted: false
	});
	Hooks.on("clientSettingChanged", (id) => {
		if (!KEYS.some((key) => id === `${SYSTEM_ID}.${key}`)) return;
		const page = document.querySelector("#bastionland-visited-marks .bastionland-visited-marks");
		if (page) showSettings(page);
	});
}
