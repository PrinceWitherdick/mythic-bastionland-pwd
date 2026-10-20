import { SYSTEM_PATH } from "./system-id.js";

/** Where the faces the stylesheet declares are served from. */
export const FONT_ROOT = `${SYSTEM_PATH}/assets/fonts`;

/** IM Fell's line box, centred on its capitals as its `@font-face` rules have it. */
const FELL_CENTRED = Object.freeze({ ascentOverride: "97.8%", descentOverride: "29%" });

/**
 * The faces the stylesheet draws the sheets with. Foundry keeps its own
 * register of fonts, and offers only what is in it from the Chronicle's font
 * menu, from Drawings and from Scene text, so the stylesheet's `@font-face`
 * rules are spelled out a second time here.
 *
 * The order within a family follows the stylesheet's: EB Garamond's figures
 * come last, so its lining digits win over IM Fell's old-style ones, and the
 * Display family's second face lends it nothing but a legible lowercase k.
 *
 * Foundry adds these faces after the stylesheet's, so they are the ones drawn,
 * and IM Fell's carry the same line box as the stylesheet gives them, centred
 * on the capitals (see the note on its `@font-face` rules).
 */
export const SHEET_FONTS = Object.freeze({
	"Bastionland Display": [
		{ urls: [`${FONT_ROOT}/UnifrakturCook-Bold.ttf`] },
		{ urls: [`${FONT_ROOT}/PirataOne-Regular.ttf`], unicodeRange: "U+006B", sizeAdjust: "97.5%" }
	],
	"Bastionland Body": [
		{ urls: [`${FONT_ROOT}/IMFellEnglish-Regular.ttf`], ...FELL_CENTRED },
		{ urls: [`${FONT_ROOT}/IMFellEnglish-Italic.ttf`], style: "italic", ...FELL_CENTRED },
		{ urls: [`${FONT_ROOT}/EBGaramond-Figures.ttf`], unicodeRange: "U+0030-0039" }
	],
	"Bastionland Caps": [
		{ urls: [`${FONT_ROOT}/IMFellEnglishSC-Regular.ttf`], ...FELL_CENTRED },
		{ urls: [`${FONT_ROOT}/EBGaramond-Figures.ttf`], unicodeRange: "U+0030-0039" }
	]
});

/** Offer the system's faces wherever Foundry lists fonts, the Chronicle's menu among them. */
export function registerFonts() {
	for (const [family, fonts] of Object.entries(SHEET_FONTS)) CONFIG.fontDefinitions[family] = { editor: true, fonts };
}
