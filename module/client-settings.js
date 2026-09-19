import { SYSTEM_ID } from "./system-id.js";

/**
 * The settings each person sets for themselves: how the system's sheets,
 * windows and chat cards read, and whether art is shown larger on hover.
 * They're saved per browser, and offered on the Settings page of a Knight
 * sheet and the GM Toolkit as well as in Foundry's settings window.
 *
 * Each is applied as a class or a CSS variable on the document's root, so
 * every window takes it at once, without being drawn again. styles/settings.css
 * holds what each one changes.
 */

/** How far Text Size goes: 1 is the size the sheets were drawn at. */
export const TEXT_SIZE_RANGE = Object.freeze({ min: 0.9, max: 1.4, step: 0.05 });

/** The typefaces offered, the book's own first. */
export const TYPEFACES = Object.freeze(["book", "serif", "signika"]);

/** Root classes, each marking one setting turned away from its default. */
const HIGH_CONTRAST = "bastionland-high-contrast";
const NO_ITALICS = "bastionland-no-italics";
const REDUCE_MOTION = "bastionland-reduce-motion";
const NO_KEYWORD_TIPS = "bastionland-no-keyword-tips";
const TYPEFACE_CLASS = (typeface) => `bastionland-typeface-${typeface}`;

/** @returns {HTMLElement|null} The page's root, which the settings are applied to. */
const root = () => globalThis.document?.documentElement ?? null;

/**
 * A setting's value, or its default while it can't be read, such as before
 * it's registered.
 * @param {string} key
 * @param {unknown} fallback
 */
export function read(key, fallback) {
	try {
		return game.settings.get(SYSTEM_ID, key) ?? fallback;
	} catch {
		return fallback;
	}
}

/**
 * @param {unknown} value
 * @returns {number} A Text Size the stylesheet can use.
 */
export function textScale(value) {
	const scale = Number(value);
	if (!Number.isFinite(scale)) return 1;
	return Math.min(TEXT_SIZE_RANGE.max, Math.max(TEXT_SIZE_RANGE.min, scale));
}

/** @param {unknown} value */
export function applyTextSize(value) {
	root()?.style.setProperty("--bastionland-text-size", String(textScale(value)));
}

/** @param {unknown} value */
export function applyContrast(value) {
	root()?.classList.toggle(HIGH_CONTRAST, value === "high");
}

/** @param {unknown} value An unknown typeface is the book's own. */
export function applyTypeface(value) {
	const classes = root()?.classList;
	if (!classes) return;
	for (const typeface of TYPEFACES) classes.toggle(TYPEFACE_CLASS(typeface), typeface !== "book" && typeface === value);
}

/** @param {unknown} value */
export function applyNoItalics(value) {
	root()?.classList.toggle(NO_ITALICS, Boolean(value));
}

/** @param {unknown} value */
export function applyReduceMotion(value) {
	root()?.classList.toggle(REDUCE_MOTION, Boolean(value));
}

/**
 * The rule words are always marked, so turning their tips back on needs no
 * window drawn again. With them off, the words read as plain text: the class
 * takes their bold away, and module/rulebook/keyword-tips.js gives no tip.
 * @param {unknown} value
 */
export function applyKeywordTips(value) {
	root()?.classList.toggle(NO_KEYWORD_TIPS, value === false);
}

/** @returns {boolean} Whether this person asked for less movement on screen, here or in their browser. */
export const reducesMotion = () => Boolean(read("reduceMotion", false)) || Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** @returns {ScrollBehavior} How a window scrolls something into view. */
export const scrollBehavior = () => (reducesMotion() ? "auto" : "smooth");

/** @returns {boolean} Whether art is shown larger while the pointer is over it. */
export const showsArtPreviews = () => read("artPreviews", true) !== false;

/** @returns {boolean} Whether hovering a rule word, such as Exposed, says what it means. */
export const showsKeywordTips = () => read("keywordTips", true) !== false;

/**
 * @typedef {object} ClientSetting
 * @property {NumberConstructor|StringConstructor|BooleanConstructor} type
 * @property {unknown} default
 * @property {{min: number, max: number, step: number}} [range]  For a slider.
 * @property {readonly string[]} [choices]  For a list; each is labelled `bastionland.settings.<key>.<choice>`.
 * @property {(value: unknown) => void} [apply]  Puts a value on the page. One read as it's needed has none.
 */

/**
 * Each person's own settings, in the order Foundry's settings window lists
 * them. Labels and hints are `bastionland.settings.<key>.name` and `.hint`.
 * @type {Readonly<Record<string, ClientSetting>>}
 */
const CLIENT_SETTINGS = Object.freeze({
	textSize: { type: Number, range: TEXT_SIZE_RANGE, default: 1, apply: applyTextSize },
	// A choice rather than a tick box, so a light-on-dark palette could join it later.
	contrast: { type: String, choices: ["normal", "high"], default: "normal", apply: applyContrast },
	typeface: { type: String, choices: TYPEFACES, default: "book", apply: applyTypeface },
	noItalics: { type: Boolean, default: false, apply: applyNoItalics },
	reduceMotion: { type: Boolean, default: false, apply: applyReduceMotion },
	keywordTips: { type: Boolean, default: true, apply: applyKeywordTips },
	// Read as each preview is about to show.
	artPreviews: { type: Boolean, default: true }
});

/** Register the settings and apply them. Called during init, so the first window drawn already has them. */
export function registerClientSettings() {
	for (const [key, { type, range, choices, default: fallback, apply }] of Object.entries(CLIENT_SETTINGS)) {
		// Settings are registered before the language files are ready, so these are keys for Foundry to localize.
		const label = `bastionland.settings.${key}`;
		game.settings.register(SYSTEM_ID, key, {
			name: `${label}.name`,
			hint: `${label}.hint`,
			scope: "client",
			config: true,
			type,
			default: fallback,
			...(range && { range: { ...range } }),
			...(choices && { choices: Object.fromEntries(choices.map((choice) => [choice, `${label}.${choice}`])) }),
			...(apply && { onChange: apply })
		});
		apply?.(read(key, fallback));
	}
}
