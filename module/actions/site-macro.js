import { hotbarMacro } from "./hotbar-macro.js";

/**
 * A New Site macro on each GM's hotbar, doing what New Site does in the
 * Journal and Roll Tables directories. Only GMs make Sites, so players are
 * given neither the macro nor a slot for it.
 */

/** The world setup step that gives a world the macro. */
export const SITE_MACRO_STEP = "newSiteMacro";

const { seed: seedSiteMacro, ensure: ensureSiteHotbar } = hotbarMacro({
	macroFlag: "newSiteMacro",
	hotbarFlag: "newSiteHotbar",
	nameKey: "sites.newSite",
	img: "icons/environment/wilderness/tomb-entrance.webp",
	command: "game.system.api.newSite();"
});

export { seedSiteMacro, ensureSiteHotbar };
