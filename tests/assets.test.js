import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CHARGES, CHARGE_CREDITS_FILE, CHARGE_ROOT, chargeCredits, chargeNotice, chargePath, tintCharge } from "../module/rules/heraldry-charges.js";
import { realmTextures } from "../module/rules/realm-documents.js";
import { REALM_PALETTES, REALM_SKINS, drawRealmSet } from "../module/rules/realm-skins.js";
import { checkChargeSvg, withNotice } from "../scripts/lib/charge-svg.js";

const root = join(import.meta.dirname, "..");

/** Map a served system path back to the file in this repository. */
const fileFor = (path) => join(root, path.replace(/^systems\/[^/]+\//, ""));

describe("Realm pictures", () => {
	const looks = REALM_SKINS.flatMap((skin) => REALM_PALETTES.map(({ key }) => ({ skin, palette: key })));
	const paths = looks.flatMap((look) => {
		const textures = realmTextures(null, look);
		return [
			...Object.values(textures.terrain),
			...Object.values(textures.holding),
			...Object.values(textures.landmark),
			...Object.values(textures.myth),
			textures.seat,
			...Object.values(textures.river)
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
