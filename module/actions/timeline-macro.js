import { hotbarMacro } from "./hotbar-macro.js";
import { isSolo } from "./solo.js";
import { macroIconPath } from "../rules/macro-icons.js";

/**
 * A Timeline macro on each player's hotbar, opening every thread of the
 * campaign's Timeline side by side. A GM opens it from their Toolkit's Time
 * page instead, so only a GM playing alone gets a slot for it.
 */

/** The world setup step that gives a world the macro. */
export const TIMELINE_MACRO_STEP = "timelineMacro";

const { seed: seedTimelineMacro, ensure: ensureTimelineHotbar } = hotbarMacro({
	macroFlag: "timelineMacro",
	hotbarFlag: "timelineHotbar",
	nameKey: "timeline.macro.name",
	img: macroIconPath("timeline"),
	command: "game.system.api.openTimeline();",
	ownership: () => ({ default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }),
	everyone: true,
	forGM: () => isSolo()
});

export { seedTimelineMacro, ensureTimelineHotbar };
