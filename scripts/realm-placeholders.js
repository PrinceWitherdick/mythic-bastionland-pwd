/**
 * Draws the pictures a Realm uses, unless the GM gives their own: every skin in
 * every colour set, each in its own folder. The Blank Realm skin is drawn from
 * the sheet's legend as traced by realm-sheet-art.py; the other skins are
 * simple originals. Run after changing the Realm tables, the colour sets in
 * realm-skins.js, or lib/realm-drawings.js:
 *
 *   node scripts/realm-placeholders.js
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REALM_PALETTES, REALM_SKINS } from "../module/rules/realm-skins.js";
import { drawRealmSet } from "./lib/realm-drawings.js";

const out = join(import.meta.dirname, "..", "assets", "realm");
const written = new Set();

for (const skin of REALM_SKINS) {
	for (const { key } of REALM_PALETTES) {
		const dir = join(out, skin, key);
		mkdirSync(dir, { recursive: true });
		for (const [name, content] of Object.entries(drawRealmSet(skin, key))) {
			writeFileSync(join(dir, name), content);
			written.add(relative(out, join(dir, name)));
		}
	}
}
// Pictures a skin, colour set or table no longer draws. Files only: some drives refuse to remove folders.
const stale = readdirSync(out, { recursive: true, withFileTypes: true })
	.filter((entry) => entry.isFile())
	.map((entry) => relative(out, join(entry.parentPath, entry.name)))
	.filter((path) => !written.has(path));
for (const path of stale) rmSync(join(out, path));

console.log(`Removed ${stale.length} old pictures. Wrote ${written.size} pictures to ${out}`);
