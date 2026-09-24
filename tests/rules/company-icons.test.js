import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	COMPANY_COLOURS,
	COMPANY_ICONS,
	COMPANY_ICON_FILL,
	COMPANY_ICON_HALO,
	COMPANY_ICON_ROOT,
	COMPANY_IMAGE,
	companyColour,
	companyHalo,
	companyIconCredit,
	companyIconCredits,
	companyIconFile,
	companyIconFromPath,
	companyIconNotice,
	companyIconPath,
	companyPictureChoices,
	tintCompanyIcon
} from "../../module/rules/company-icons.js";

const root = join(import.meta.dirname, "../..");
const gallery = readFileSync(join(root, "templates/dialogs/parts/company-picture.hbs"), "utf8");
const newRealm = readFileSync(join(root, "templates/dialogs/new-realm.hbs"), "utf8");
const chooser = readFileSync(join(root, "templates/dialogs/company-picture.hbs"), "utf8");

describe("the pictures the Company can carry", () => {
	it("carries the first of them when a Referee picks nothing", () => {
		expect(COMPANY_IMAGE).toBe(companyIconPath(COMPANY_ICONS[0].key));
	});

	it("offers every icon, each with a name to show and a file of its own", () => {
		const choices = companyPictureChoices();
		expect(choices.map(({ key }) => key)).toEqual(COMPANY_ICONS.map(({ key }) => key));
		for (const { key, name, path } of choices) {
			expect([key, name.length]).toEqual([key, expect.any(Number)]);
			expect(name).not.toBe("");
			expect(path).toMatch(/\.svg$/);
		}
	});

	it("names each one once", () => {
		const keys = companyPictureChoices().map(({ key }) => key);
		expect(new Set(keys).size).toBe(keys.length);
		const paths = companyPictureChoices().map(({ path }) => path);
		expect(new Set(paths).size).toBe(paths.length);
	});

	it("keeps the icons where the build script writes them", () => {
		for (const { key } of COMPANY_ICONS) expect(companyIconPath(key)).toBe(`${COMPANY_ICON_ROOT}/${key}.svg`);
	});

	it("takes four from the Knight search on game-icons.net, as the Referee asked", () => {
		const icons = COMPANY_ICONS.map(({ icon }) => icon);
		expect(icons).toEqual(expect.arrayContaining([
			"delapouite/knight-banner", "skoll/mounted-knight", "delapouite/black-knight-helm", "skoll/chess-knight"
		]));
	});
});

describe("the colour a Company carries its icon in", () => {
	const shipped = readFileSync(join(root, "assets/icons/company/knight-banner.svg"), "utf8");

	it("offers the ink first, then the heraldic tinctures, so a Company's colour is named as its arms are", () => {
		expect(COMPANY_COLOURS[0]).toEqual({ key: "ink", color: COMPANY_ICON_FILL });
		expect(COMPANY_COLOURS.map(({ key }) => key)).toContain("gules");
		expect(companyColour("gules")).toBe("#b0261e");
		expect(companyColour("nothing of the sort")).toBe(COMPANY_ICON_FILL);
	});

	it("keeps the pale halo behind a dark colour and swaps it for ink behind a light one", () => {
		expect(companyHalo(COMPANY_ICON_FILL)).toBe(COMPANY_ICON_HALO);
		expect(companyHalo("#b0261e")).toBe(COMPANY_ICON_HALO);
		expect(companyHalo("#f4f0e6")).toBe(COMPANY_ICON_FILL);
		expect(companyHalo("#d9a92e")).toBe(COMPANY_ICON_FILL);
	});

	it("recolours a shipped icon, halo and all, leaving the drawing and its credit alone", () => {
		const tinted = tintCompanyIcon(shipped, "#b0261e");
		expect(tinted).toContain('fill="#b0261e"');
		expect(tinted).not.toContain(`fill="${COMPANY_ICON_FILL}"`);
		expect(tinted).toContain(`stroke="${COMPANY_ICON_HALO}"`);
		expect(tinted).toContain(companyIconCredit("knight-banner").page);
		// The drawing itself is untouched: same outlines, same box.
		expect([...tinted.matchAll(/ d="/g)].length).toBe([...shipped.matchAll(/ d="/g)].length);
		expect(tinted).toContain('viewBox="0 0 256 256"');
	});

	it("gives a light colour the ink halo, so it still reads on parchment", () => {
		expect(tintCompanyIcon(shipped, "#f4f0e6")).toContain(`stroke="${COMPANY_ICON_FILL}"`);
	});

	it("refuses anything that isn't a colour, or a picture that isn't one of ours", () => {
		expect(() => tintCompanyIcon(shipped, "red")).toThrow(TypeError);
		expect(() => tintCompanyIcon("<svg></svg>", "#b0261e")).toThrow();
	});

	it("saves one file for each icon and colour, so the same choice twice writes one", () => {
		expect(companyIconFile("knight-banner", "#B0261E")).toBe("knight-banner-b0261e.svg");
	});

	it("reads an icon and its colour back off a path, shipped or recoloured", () => {
		expect(companyIconFromPath(companyIconPath("cavalry"))).toEqual({ key: "cavalry", color: COMPANY_ICON_FILL });
		expect(companyIconFromPath(`mythic-bastionland-art/company/${companyIconFile("cavalry", "#b0261e")}`))
			.toEqual({ key: "cavalry", color: "#b0261e" });
		expect(companyIconFromPath("worlds/mine/my-own-banner.webp")).toBe(null);
		expect(companyIconFromPath("")).toBe(null);
	});
});

describe("the credit each icon carries", () => {
	it("names the artist and the page it came from", () => {
		expect(companyIconCredit("mounted-knight")).toEqual({
			title: "Mounted knight",
			artist: "Skoll",
			url: undefined,
			page: "https://game-icons.net/1x1/skoll/mounted-knight.html"
		});
	});

	it("holds no pair of hyphens, which would break the XML comment it goes in", () => {
		for (const { key } of COMPANY_ICONS) {
			expect([key, companyIconNotice(key).includes("--")]).toEqual([key, false]);
			expect(companyIconNotice(key)).toContain("CC BY 3.0");
		}
	});

	it("lists every icon in the credits file, under the licence they're all shared by", () => {
		const credits = companyIconCredits();
		expect(credits).toContain("[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)");
		for (const { key } of COMPANY_ICONS) expect(credits).toContain(`\`${key}.svg\``);
	});
});

describe("the gallery", () => {
	it("draws each picture as a button that fills the Company picture field", () => {
		expect(gallery).toContain("{{#each pictures}}");
		expect(gallery).toContain('data-company-picture="{{path}}"');
		expect(gallery).toContain('aria-label="{{name}}"');
	});

	it("keeps the field and the browse button, so any other picture can still be given", () => {
		expect(gallery).toContain('name="companyImg"');
		expect(gallery).toContain("data-company-browse");
	});

	it("is shown both while a Realm is being made and when the Company's Token is double clicked", () => {
		for (const template of [newRealm, chooser]) expect(template).toContain('{{> "bastionland.company-picture"}}');
	});

	it("offers the colours beside it, and sends the one chosen back with the picture", () => {
		expect(gallery).toContain("{{#each colours}}");
		expect(gallery).toContain('data-company-colour="{{color}}"');
		expect(gallery).toContain('name="companyColour"');
	});
});
