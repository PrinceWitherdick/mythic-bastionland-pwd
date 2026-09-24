import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CHARGES, CHARGE_CREDITS_FILE, CHARGE_ROOT, chargeCredits, chargeNotice, chargePath, tintCharge } from "../module/rules/heraldry-charges.js";
import { COMPANY_IMAGE } from "../module/rules/company.js";
import { INK } from "../module/rules/colour.js";
import { SHEET_FONTS } from "../module/fonts.js";
import { realmTextures } from "../module/rules/realm-documents.js";
import { REALM_PALETTES, REALM_SKINS } from "../module/rules/realm-skins.js";
import { GOODS_ICONS, GOODS_ICON_CREDITS_FILE, GOODS_ICON_ROOT, goodsIconCredit, goodsIconCredits, goodsIconPath } from "../module/rules/goods-icons.js";
import { MACRO_ICONS, MACRO_ICON_CREDITS_FILE, MACRO_ICON_ROOT, macroIconCredit, macroIconCredits, macroIconPath } from "../module/rules/macro-icons.js";
import { SQUIRE_IMAGE } from "../module/rules/squires.js";
import { checkChargeSvg, withNotice } from "../scripts/lib/charge-svg.js";
import { drawRealmSet } from "../scripts/lib/realm-drawings.js";

const root = join(import.meta.dirname, "..");

/** Map a served system path back to the file in this repository. */
const fileFor = (path) => join(root, path.replace(/^systems\/[^/]+\//, ""));

describe("The Company", () => {
	it("ships the pennant its Token is drawn with", () => {
		expect(existsSync(fileFor(COMPANY_IMAGE))).toBe(true);
	});
});

describe("Squires", () => {
	// The portrait, and the same figure alone as the Property tab's icon while a Squire serves.
	const files = [fileFor(SQUIRE_IMAGE), join(root, "assets/icons/squire-glyph.svg")];

	it.each(files)("ships %s, crediting the drawing it's made from", (file) => {
		expect(existsSync(file)).toBe(true);
		const svg = readFileSync(file, "utf8");
		expect(svg).toContain("game-icons.net/1x1/delapouite/kneeling.html");
		expect(svg).toContain("CC BY 3.0");
	});

	it.each(files)("keeps the comments in %s to what a browser loading it as a picture will parse", (file) => {
		// A pair of hyphens inside an XML comment breaks the whole picture.
		const comments = [...readFileSync(file, "utf8").matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]);
		expect(comments.length).toBeGreaterThan(0);
		for (const comment of comments) expect(comment).not.toContain("--");
	});
});

describe("Item, beast and structure pictures", () => {
	const folder = fileFor(GOODS_ICON_ROOT);

	it("ships a picture for every icon listed, each crediting the drawing it's made from", () => {
		for (const key of Object.keys(GOODS_ICONS)) {
			const file = fileFor(goodsIconPath(key));
			expect([key, existsSync(file)]).toEqual([key, true]);
			const svg = readFileSync(file, "utf8");
			expect(svg).toContain(goodsIconCredit(key).page);
			expect(svg).toContain("CC BY 3.0");
			// A pair of hyphens inside an XML comment breaks the whole picture.
			for (const [, comment] of svg.matchAll(/<!--([\s\S]*?)-->/g)) expect(comment).not.toContain("--");
		}
	});

	it("ships the credits, and nothing that isn't listed", () => {
		expect(readFileSync(join(folder, GOODS_ICON_CREDITS_FILE), "utf8")).toBe(goodsIconCredits());
		const listed = new Set([GOODS_ICON_CREDITS_FILE, ...Object.keys(GOODS_ICONS).map((key) => `${key}.svg`)]);
		expect(readdirSync(folder).filter((name) => !listed.has(name))).toEqual([]);
	});
});

describe("Macro pictures", () => {
	const folder = fileFor(MACRO_ICON_ROOT);

	it("ships a picture for every macro, each crediting the drawing it's made from", () => {
		for (const { key } of MACRO_ICONS) {
			const file = fileFor(macroIconPath(key));
			expect([key, existsSync(file)]).toEqual([key, true]);
			const svg = readFileSync(file, "utf8");
			expect(svg).toContain(macroIconCredit(key).page);
			expect(svg).toContain("CC BY 3.0");
			// A pair of hyphens inside an XML comment breaks the whole picture.
			for (const [, comment] of svg.matchAll(/<!--([\s\S]*?)-->/g)) expect(comment).not.toContain("--");
		}
	});

	// A hotbar button is small and sits among Foundry's dark furniture, where parchment goes muddy.
	it("draws every one in white on an ink tile, with no disc around it", () => {
		for (const { key } of MACRO_ICONS) {
			const svg = readFileSync(fileFor(macroIconPath(key)), "utf8");
			expect([key, svg.includes('fill="#fff"')]).toEqual([key, true]);
			expect(svg).toContain(`<path d="M0 0h512v512H0z" fill="${INK}"/>`);
			expect(svg).not.toContain("<circle");
		}
	});

	it("ships the credits, and nothing that isn't listed", () => {
		expect(readFileSync(join(folder, MACRO_ICON_CREDITS_FILE), "utf8")).toBe(macroIconCredits());
		const listed = new Set([MACRO_ICON_CREDITS_FILE, ...MACRO_ICONS.map(({ key }) => `${key}.svg`)]);
		expect(readdirSync(folder).filter((name) => !listed.has(name))).toEqual([]);
	});
});

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
			...(textures.lake ? [textures.lake.water, ...Object.values(textures.lake.shore), textures.lake.mouth] : []),
			...(textures.valley ? [textures.valley.floor, ...Object.values(textures.valley.river)] : [])
		].map(({ src }) => src);
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

describe("Heraldic charges", () => {
	const folder = fileFor(CHARGE_ROOT);

	it("ships every charge the painter offers, and nothing else", () => {
		const shipped = readdirSync(folder).sort();
		const expected = [...CHARGES.map(({ key }) => `${key}.svg`), CHARGE_CREDITS_FILE].sort();
		expect(shipped).toEqual(expected);
	});

	it("ships the credits the script writes", () => {
		expect(readFileSync(join(folder, CHARGE_CREDITS_FILE), "utf8")).toBe(chargeCredits());
	});

	it.each(CHARGES)("$key is a small, safe drawing the painter can tint", ({ key }) => {
		const file = fileFor(chargePath(key));
		const svg = readFileSync(file, "utf8").trimEnd();
		expect(() => checkChargeSvg(svg)).not.toThrow();
		expect(Buffer.byteLength(svg)).toBeLessThan(120 * 1024);
		// Tinting reaches every colour in the drawing.
		expect(tintCharge(svg, "#b0261e")).not.toMatch(/#f3f3f3|"#000"/);
	});

	it.each(CHARGES)("$key carries its own credit", (charge) => {
		const svg = readFileSync(fileFor(chargePath(charge.key)), "utf8");
		const desc = withNotice("<svg>", chargeNotice(charge)).slice("<svg>".length);
		expect(svg).toMatch(/^<svg\b[^>]*><desc>/);
		expect(svg).toContain(desc);
	});
});
describe("Fonts", () => {
	const urls = Object.values(SHEET_FONTS).flatMap((fonts) => fonts.flatMap(({ urls: faces }) => faces));

	it("ships every face it registers", () => {
		expect(urls.filter((url) => !existsSync(fileFor(url)))).toEqual([]);
	});

	/*
	 * Foundry offers a font from the Chronicle's menu only if it is registered,
	 * so a face added to the stylesheet has to be added to the register as well.
	 */
	it("registers every face the stylesheet declares", () => {
		const css = readFileSync(join(root, "styles", "mythic-bastionland.css"), "utf8");
		const declared = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((rule) => ({
			family: rule[1].match(/font-family:\s*"([^"]+)"/)[1],
			url: rule[1].match(/src:\s*url\("\.\.\/([^"]+)"/)[1]
		}));
		expect(declared.length).toBeGreaterThan(0);
		const registered = new Set(
			Object.entries(SHEET_FONTS).flatMap(([family, fonts]) =>
				fonts.flatMap(({ urls: faces }) => faces.map((url) => `${family}|${fileFor(url)}`))
			)
		);
		expect(declared.filter(({ family, url }) => !registered.has(`${family}|${join(root, url)}`))).toEqual([]);
	});
});
