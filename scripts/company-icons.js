/**
 * Builds the pictures the Referee can give the Company's Token: every
 * game-icons.net icon COMPANY_ICONS lists is fetched and inked, with a pale
 * halo behind it so it reads on a parchment Realm and a midnight one alike,
 * with its credit, in assets/icons/company. The two colours it's painted with
 * are the ones tintCompanyIcon swaps when a Company carries its icon in a
 * colour, so they're taken from the same place. Icons are cached under
 * node_modules/.cache, so running it again works offline. Run after changing
 * COMPANY_ICONS:
 *
 *   npm run company-icons              (use the cache)
 *   npm run company-icons -- --refresh (fetch every icon again)
 */
import { join } from "node:path";
import { buildIconFolder, haloPicture } from "./lib/game-icon.js";
import {
	COMPANY_ICONS,
	COMPANY_ICON_CREDITS_FILE,
	COMPANY_ICON_FILL,
	COMPANY_ICON_HALO,
	companyIconCredits,
	companyIconNotice
} from "../module/rules/company-icons.js";

const root = join(import.meta.dirname, "..");

await buildIconFolder({
	icons: COMPANY_ICONS,
	out: join(root, "assets", "icons", "company"),
	cache: join(root, "node_modules", ".cache", "company-icons"),
	agent: "company-icons",
	refresh: process.argv.includes("--refresh"),
	picture: ({ key, name }, shapes) => haloPicture({
		notice: companyIconNotice(key),
		label: name,
		shapes,
		fill: COMPANY_ICON_FILL,
		halo: COMPANY_ICON_HALO
	}),
	creditsFile: COMPANY_ICON_CREDITS_FILE,
	credits: companyIconCredits
});
