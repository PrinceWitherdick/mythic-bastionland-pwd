/**
 * Builds the charges the heraldry painter offers from the Book of Traceable
 * Heraldic Art: every drawing CHARGES lists is fetched, cleaned down to the two
 * colours the painter tints, and written to assets/heraldry/charges with the
 * credits beside it. Drawings are cached under node_modules/.cache, so running
 * it again works offline. Run after changing CHARGES:
 *
 *   npm run charges              (use the cache)
 *   npm run charges -- --refresh (fetch every drawing again)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { finishFolder, stopIfFailed } from "./lib/asset-folder.js";
import { cleanChargeSvg, fetchDrawing, withNotice } from "./lib/charge-svg.js";
import { CHARGES, CHARGE_CREDITS_FILE, chargeCredits, chargeNotice } from "../module/rules/heraldry-charges.js";

const root = join(import.meta.dirname, "..");
const out = join(root, "assets", "heraldry", "charges");
const refresh = process.argv.includes("--refresh");

mkdirSync(out, { recursive: true });
const written = new Set([CHARGE_CREDITS_FILE]);
const failures = [];
let bytes = 0;
// One at a time, to go easy on the site.
for (const charge of CHARGES) {
	try {
		const { svg: cleaned, notes } = cleanChargeSvg(await fetchDrawing(charge.svg, { agent: "heraldry-charges", refresh }));
		const content = `${withNotice(cleaned, chargeNotice(charge))}\n`;
		const name = `${charge.key}.svg`;
		writeFileSync(join(out, name), content);
		written.add(name);
		bytes += Buffer.byteLength(content);
		console.log(`${name.padEnd(22)} ${(Buffer.byteLength(content) / 1024).toFixed(1).padStart(5)} KB${notes.length ? `  (${notes.join(", ")})` : ""}`);
	} catch (error) {
		failures.push(`${charge.key}: ${charge.svg}: ${error.message}`);
	}
}

stopIfFailed(failures, "charges");
// Charges no longer listed go.
const removed = finishFolder(out, written, CHARGE_CREDITS_FILE, chargeCredits());

console.log(`\nWrote ${CHARGES.length} charges (${(bytes / 1024 / 1024).toFixed(2)} MB) and ${CHARGE_CREDITS_FILE} to ${out}. Removed ${removed} old files.`);
