// A Knight sheet's Property page holds what the Knight owns, their Steed and
// their Squire. Its tab on the rail shows whatever carries it all: the steed
// they ride, else the Squire who serves them, else their own back.

/** Classes for the tab's icon, by what carries the Knight's things. */
export const CARRIER_ICONS = Object.freeze({
	steed: "fa-solid fa-horse",
	// The figure from the Squire's portrait, which Font Awesome has nothing like; see styles/mythic-bastionland.css.
	squire: "bastionland-glyph bastionland-glyph--squire",
	back: "fa-solid fa-backpack"
});

/**
 * What carries a Knight's things.
 * @param {{steed?: unknown, squire?: unknown}} [bearers] The steed they ride and the Squire who serves them, where there's one.
 * @returns {"steed"|"squire"|"back"}
 */
export function carrierOf({ steed, squire } = {}) {
	if (steed) return "steed";
	return squire ? "squire" : "back";
}

/**
 * @param {{steed?: unknown, squire?: unknown}} [bearers]
 * @returns {string} The classes for the Property tab's icon.
 */
export const propertyTabIcon = (bearers) => CARRIER_ICONS[carrierOf(bearers)];
