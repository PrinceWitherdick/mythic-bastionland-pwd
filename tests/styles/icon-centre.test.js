import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const sheets = Object.fromEntries(
	["mythic-bastionland.css", "chat.css", "gm-toolkit.css"].map((name) => [
		name,
		readFileSync(join(root, "styles", name), "utf8")
	])
);

/** Foundry's root size, which `rem` is measured against. */
const REM = 16;

/**
 * Every badge that holds a glyph or a figure in the middle of a box of its own.
 * A box and a lettering size that both land on whole pixels leave the browser
 * nothing to round, which is what keeps the two centres together; see the
 * comment on `.bastionland-icon`.
 */
const BADGES = [
	{ sheet: "mythic-bastionland.css", selector: ".bastionland-icon" },
	{ sheet: "mythic-bastionland.css", selector: ".bastionland-page .bastionland-knighthood-help" },
	{ sheet: "mythic-bastionland.css", selector: ".bastionland-page .bastionland-heraldry-painter__arms-counterchange" },
	{ sheet: "mythic-bastionland.css", selector: ".bastionland-site__step-number" },
	{ sheet: "mythic-bastionland.css", selector: ".bastionland-page .bastionland-chooser__group" },
	{ sheet: "mythic-bastionland.css", selector: ".bastionland-page .bastionland-welcome__read", box: ["height"] },
	{ sheet: "chat.css", selector: ".bastionland-save__die" },
	{ sheet: "chat.css", selector: ".bastionland-card__roll", box: ["min-width", "height"] }
];

/**
 * A `rem` length in pixels.
 * @param {string} value As the stylesheet writes it.
 * @returns {number}
 */
function pixels(value) {
	const length = /^([0-9.]+)rem$/.exec(value);
	expect(length, `${value} is not written in rem`).not.toBeNull();
	return Number(length[1]) * REM;
}

/**
 * The declarations of one rule, by its exact selector.
 * @param {string} sheet The stylesheet's file name.
 * @param {string} selector
 * @returns {Record<string, string>}
 */
function rule(sheet, selector) {
	const pattern = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{\r?\n([\\s\\S]*?)\\}`, "m");
	const found = pattern.exec(sheets[sheet]);
	expect(found, `no ${selector} rule in ${sheet}`).not.toBeNull();
	return Object.fromEntries(
		[...found[1].matchAll(/^\t([\w-]+):\s*([^;]+);/gm)].map((match) => [match[1], match[2].trim()])
	);
}

describe("the badges that centre a glyph or a figure", () => {
	/*
	 * A disc of 25.6px around a glyph of 12.8px left the browser rounding the
	 * glyph a pixel and a half above the middle of the circle, which showed on
	 * the Knight sheet's Recovery rows. Whole pixels leave nothing to round.
	 */
	it.each(BADGES)("sizes $selector in whole pixels", ({ sheet, selector, box = ["width", "height"] }) => {
		const declarations = rule(sheet, selector);
		for (const side of box) expect(pixels(declarations[side]) % 1, `${side} of ${selector}`).toBe(0);
		expect(pixels(declarations["font-size"]) % 1, `font-size of ${selector}`).toBe(0);
	});

	/*
	 * A Site's points were numbered in a box that grew with its digits, which
	 * drew the ring around them as an ellipse. Only the bar's dropdown, which
	 * has a caret to house, is allowed to stretch.
	 */
	it("draws a Site point's number in a true circle", () => {
		const number = rule("mythic-bastionland.css", ".bastionland-site__number");
		expect(number.width).toBe(number.height);
		expect(number["border-radius"]).toBe("50%");
		expect(number["min-width"]).toBeUndefined();
		const stretched = [...sheets["mythic-bastionland.css"].matchAll(/^([^\n{]*\.bastionland-site__number) \{/gm)]
			.map((match) => match[1])
			.filter((selector) => selector !== ".bastionland-site__number");
		for (const selector of stretched) expect(selector).toContain("select.bastionland-site__number");
	});

	it("keeps the round icon buttons square, with room around the glyph", () => {
		const icon = rule("mythic-bastionland.css", ".bastionland-icon");
		expect(icon.width).toBe(icon.height);
		expect(pixels(icon.width) - pixels(icon["font-size"])).toBeGreaterThanOrEqual(8);
	});
});
