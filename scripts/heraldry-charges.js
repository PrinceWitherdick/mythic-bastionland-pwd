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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cleanChargeSvg, withNotice } from "./lib/charge-svg.js";
import { CHARGES, CHARGE_CREDITS_FILE, HERALDIC_ART, chargeCredits, chargeNotice } from "../module/rules/heraldry-charges.js";

const root = join(import.meta.dirname, "..");
const out = join(root, "assets", "heraldry", "charges");
const cache = join(root, "node_modules", ".cache", "heraldry-charges");
const refresh = process.argv.includes("--refresh");

/**
 * @param {string} svg The drawing's path on the site.
 * @returns {Promise<string>}
 */
async function fetchDrawing(svg) {
	const path = join(cache, ...svg.split("/"));
	if (!refresh && existsSync(path)) return readFileSync(path, "utf8");
	const response = await fetch(`${HERALDIC_ART}${svg}`, { headers: { "User-Agent": "mythic-bastionland-pwd heraldry-charges" } });
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const text = await response.text();
	if (!text.includes("<svg")) throw new Error("Not an SVG");
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
	return text;
}

mkdirSync(out, { recursive: true });
const written = new Set([CHARGE_CREDITS_FILE]);
const failures = [];
let bytes = 0;
// One at a time, to go easy on the site.
for (const charge of CHARGES) {
	try {
		const { svg: cleaned, notes } = cleanChargeSvg(await fetchDrawing(charge.svg));
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

if (failures.length) {
	console.error(`\n${failures.length} charges failed, and nothing was removed:\n${failures.join("\n")}`);
	process.exit(1);
}

writeFileSync(join(out, CHARGE_CREDITS_FILE), chargeCredits());
// Charges no longer listed. Files only: some drives refuse to remove folders.
const stale = readdirSync(out, { withFileTypes: true }).filter((entry) => entry.isFile() && !written.has(entry.name));
for (const entry of stale) rmSync(join(out, entry.name));

console.log(`\nWrote ${CHARGES.length} charges (${(bytes / 1024 / 1024).toFixed(2)} MB) and ${CHARGE_CREDITS_FILE} to ${out}. Removed ${stale.length} old files.`);
