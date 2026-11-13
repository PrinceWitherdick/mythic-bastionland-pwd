import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { realmTextures } from "../module/rules/realm-documents.js";
import { REALM_PALETTES, REALM_SKINS } from "../module/rules/realm-skins.js";
import { drawRealmSet } from "../scripts/lib/realm-drawings.js";
import { fileFor, root } from "./repo-files.js";

// Apart from assets.test.js so redrawing every skin runs beside the other pictures' checks.

describe("Realm pictures", () => {
	const looks = REALM_SKINS.flatMap((skin) => REALM_PALETTES.map(({ key }) => ({ skin, palette: key })));
	const paths = looks.flatMap((look) => {
		const textures = realmTextures(look);
		return [
			...Object.values(textures.terrain),
			...Object.values(textures.holding),
			...Object.values(textures.landmark),
			...Object.values(textures.myth),
			textures.seat,
			...Object.values(textures.river),
			...(textures.lake ? [textures.lake.water, ...Object.values(textures.lake.shore), textures.lake.mouth] : [])
		].flatMap(({ src, pictures, joined }) => [...(pictures ?? [src]), ...(joined ?? [])]);
	});

	it("ships every picture of every skin in every colour set", () => {
		expect(paths.filter((path) => !existsSync(fileFor(path)))).toEqual([]);
	});

	it("ships no picture the Realm doesn't use", () => {
		const used = new Set(paths.map((path) => relative(join(root, "assets", "realm"), fileFor(path))));
		const shipped = readdirSync(join(root, "assets", "realm"), { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => relative(join(root, "assets", "realm"), join(entry.parentPath, entry.name)));
		expect(shipped.filter((name) => !used.has(name))).toEqual([]);
	});

	it.each(looks)("$skin in $palette matches what the script draws", ({ skin, palette }) => {
		const stale = Object.entries(drawRealmSet(skin, palette))
			.filter(([name, content]) => readFileSync(join(root, "assets", "realm", skin, palette, name), "utf8") !== content)
			.map(([name]) => name);
		expect(stale).toEqual([]);
	});
});
