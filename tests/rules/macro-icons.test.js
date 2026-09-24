import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MACRO_ICONS, MACRO_ICON_ROOT, macroIconCredit, macroIconCredits, macroIconNotice, macroIconPath } from "../../module/rules/macro-icons.js";
import { GM_TOOLKIT_IMAGE } from "../../module/actions/gm-toolkit.js";

const root = join(import.meta.dirname, "../..");

/** Every module that declares one of the system's macros, and the picture it gives it. */
const MACRO_FILES = [
	["module/actions/luck-macro.js", "luck-roll"],
	["module/actions/site-macro.js", "new-site"],
	["module/rulebook/macro.js", "rulebook"],
	["module/actions/toolkit-macro.js", "gm-toolkit"]
];

describe("the pictures the system's macros wear", () => {
	it("gives each one a file of its own where the build script writes it", () => {
		for (const { key } of MACRO_ICONS) expect(macroIconPath(key)).toBe(`${MACRO_ICON_ROOT}/${key}.svg`);
		const keys = MACRO_ICONS.map(({ key }) => key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("names each one, for anyone reading the hotbar aloud", () => {
		for (const { key, name } of MACRO_ICONS) expect([key, name]).toEqual([key, expect.stringMatching(/\S/)]);
	});

	it.each(MACRO_FILES)("is what %s gives its macro", (file, key) => {
		expect(readFileSync(join(root, file), "utf8")).toContain(`img: macroIconPath("${key}")`);
	});

	// Foundry's own art is painted, and a hotbar mixing it with this system's
	// marks reads as two sets. Asking for the picture by key rather than by path
	// keeps the system's own id in one place, so neither can be written out here.
	it.each(MACRO_FILES)("names no file of its own in %s", (file) => {
		expect(readFileSync(join(root, file), "utf8")).not.toMatch(/img: "/);
	});

	// The toolkit's portrait keeps its disc; only the hotbar button is a tile.
	it("draws the GM Toolkit's own mark for the bar, leaving its portrait alone", () => {
		expect(MACRO_ICONS.find(({ key }) => key === "gm-toolkit").icon).toBe("skoll/read");
		expect(macroIconPath("gm-toolkit")).not.toBe(GM_TOOLKIT_IMAGE);
		expect(readFileSync(join(root, GM_TOOLKIT_IMAGE.replace(/^systems\/[^/]+\//, "")), "utf8")).toContain("<circle");
	});

	it("throws for a picture it doesn't have, rather than naming a file that isn't there", () => {
		expect(() => macroIconNotice("no-such-macro")).toThrow();
	});
});

describe("the credit each picture carries", () => {
	it("names the artist and the page it came from", () => {
		expect(macroIconCredit("rulebook")).toEqual({
			title: "Open book",
			artist: "Lorc",
			url: "https://lorcblog.blogspot.com",
			page: "https://game-icons.net/1x1/lorc/open-book.html"
		});
	});

	it("holds no pair of hyphens, which would break the XML comment it goes in", () => {
		for (const { key } of MACRO_ICONS) {
			expect([key, macroIconNotice(key).includes("--")]).toEqual([key, false]);
			expect(macroIconNotice(key)).toContain("CC BY 3.0");
		}
	});

	it("lists every picture in the credits file, under the licence they're all shared by", () => {
		const credits = macroIconCredits();
		expect(credits).toContain("[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)");
		for (const { key } of MACRO_ICONS) expect(credits).toContain(`\`${key}.svg\``);
	});
});
