/**
 * Draws the pictures a Realm uses until the GM imports the icons from their
 * own Blank Realm PDF or gives their own: every skin in every colour set, each
 * in its own folder. They are simple originals, not the book's art. Run after
 * changing the Realm tables or realm-skins.js:
 *
 *   node scripts/realm-placeholders.js
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REALM_PALETTES, REALM_SKINS, drawRealmSet } from "../module/rules/realm-skins.js";

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
