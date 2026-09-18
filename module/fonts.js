import { SYSTEM_PATH } from "./system-id.js";

/** Where the faces the stylesheet declares are served from. */
export const FONT_ROOT = `${SYSTEM_PATH}/assets/fonts`;

/**
 * The faces the stylesheet draws the sheets with. Foundry keeps its own
 * register of fonts, and offers only what is in it from the Chronicle's font
 * menu, from Drawings and from Scene text, so the stylesheet's `@font-face`
 * rules are spelled out a second time here.
 *
 * The order within a family follows the stylesheet's: EB Garamond's figures
 * come last, so its lining digits win over IM Fell's old-style ones.
 */
export const SHEET_FONTS = Object.freeze({
	"Bastionland Display": [{ urls: [`${FONT_ROOT}/UnifrakturCook-Bold.ttf`] }],
	"Bastionland Body": [
		{ urls: [`${FONT_ROOT}/IMFellEnglish-Regular.ttf`] },
		{ urls: [`${FONT_ROOT}/IMFellEnglish-Italic.ttf`], style: "italic" },
		{ urls: [`${FONT_ROOT}/EBGaramond-Figures.ttf`], unicodeRange: "U+0030-0039" }
	],
	"Bastionland Caps": [
		{ urls: [`${FONT_ROOT}/IMFellEnglishSC-Regular.ttf`] },
		{ urls: [`${FONT_ROOT}/EBGaramond-Figures.ttf`], unicodeRange: "U+0030-0039" }
	]
});

/** Offer the system's faces wherever Foundry lists fonts, the Chronicle's menu among them. */
export function registerFonts() {
	for (const [family, fonts] of Object.entries(SHEET_FONTS)) CONFIG.fontDefinitions[family] = { editor: true, fonts };
}
