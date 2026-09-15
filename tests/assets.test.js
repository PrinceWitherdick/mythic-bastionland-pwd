import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { realmTextures } from "../module/rules/realm-documents.js";

const root = join(import.meta.dirname, "..");

/** Map a served system path back to the file in this repository. */
const fileFor = (path) => join(root, path.replace(/^systems\/[^/]+\//, ""));

describe("Realm placeholders", () => {
	const textures = realmTextures();
	const paths = [
		...Object.values(textures.terrain),
		...Object.values(textures.holding),
		...Object.values(textures.landmark),
		...Object.values(textures.myth),
		textures.seat,
		...Object.values(textures.river)
	].map(({ src }) => src);

	it.each(paths)("%s exists", (path) => {
		expect(existsSync(fileFor(path))).toBe(true);
	});

	it("ships no picture the Realm doesn't use", () => {
		const used = new Set(paths.map((path) => path.split("/").at(-1)));
		const shipped = readdirSync(join(root, "assets", "realm"));
		expect(shipped.filter((name) => !used.has(name))).toEqual([]);
	});
});
