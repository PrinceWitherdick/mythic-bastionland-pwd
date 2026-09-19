/**
 * The Knighthood window's sections, in the rail's order: the heading each is
 * listed under and the Font Awesome glyph beside it. Each has a panel of the
 * same key in templates/dialogs/knighthood.hbs.
 */
export const KNIGHTHOOD_SECTIONS = Object.freeze([
	{ key: "knighthood", icon: "fa-chess-knight", label: "knighthood.introLabel" },
	{ key: "virtues", icon: "fa-heart-pulse", label: "knighthood.virtuesLabel" },
	{ key: "squire", icon: "fa-horse-head", label: "squire.label" },
	{ key: "glory", icon: "fa-star", label: "glory.label" },
	{ key: "rank", icon: "fa-crown", label: "rank.label" }
]);

/**
 * The section to open at: the one last read, or the first.
 * @param {string} [key]
 * @returns {string}
 */
export function knighthoodSection(key) {
	return KNIGHTHOOD_SECTIONS.some((section) => section.key === key) ? key : KNIGHTHOOD_SECTIONS[0].key;
}
