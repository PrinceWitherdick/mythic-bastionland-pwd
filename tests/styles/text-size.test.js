import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const system = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));

/**
 * The smallest any writing in the system is set, and the size the pages, the
 * dialogs and the chat cards set their own text in. Both are declared on the
 * root in mythic-bastionland.css; the test reads them from there rather than
 * trusting these, and keeps them only to say what the floor is for.
 */
const FLOOR = 14;
const BASE = 15;

/** Foundry's root size, which `rem` is measured against. */
const REM = 16;

/**
 * Selectors that size a glyph rather than words: an icon, or a fold's
 * triangle. There is nothing to read in one, so the floor doesn't apply.
 */
const GLYPHS = [
	/\bi$/,
	/::(before|after)$/,
	".bastionland-icon",
	".bastionland-knighthood-help",
	".bastionland-score__die",
	".bastionland-item__equip",
	".bastionland-move__icon",
	".bastionland-site__bar-close",
	".bastionland-realm-appearance__own-tools button",
];

/** @returns {boolean} Whether the selector sizes a glyph instead of writing. */
function glyph(selector) {
	return GLYPHS.some((pattern) => (typeof pattern === "string" ? selector.endsWith(pattern) : pattern.test(selector)));
}

/**
 * A `font-size` value in pixels. `em` is measured against the pages' own size
 * rather than the element's parent, which is as close as reading the file can
 * get: anything nested inside something already reduced only comes out smaller.
 * @param {string} value As the stylesheet writes it.
 * @param {Record<string, string>} tokens The sizes declared on the root.
 * @returns {number|undefined} The size in pixels, or nothing for a value this can't read.
 */
function pixels(value, tokens) {
	const token = /^var\(\s*(--[\w-]+)/.exec(value);
	if (token) {
		/** Foundry names its own sizes after the pixels they stand for. */
		const foundry = /^--font-size-(\d+)$/.exec(token[1]);
		if (foundry) return Number(foundry[1]);
		return tokens[token[1]] ? pixels(tokens[token[1]], tokens) : undefined;
	}
	const size = /^([0-9.]+)(rem|em|px)$/.exec(value);
	if (!size) return undefined;
	const amount = Number(size[1]);
	if (size[2] === "rem") return amount * REM;
	if (size[2] === "em") return amount * BASE;
	return amount;
}

/**
 * The selectors a rule lists. The commas inside an `:is(…)` belong to the one
 * selector that holds it, so only the commas outside the brackets divide.
 * @param {string} selectors
 * @returns {string[]}
 */
function split(selectors) {
	const each = [""];
	let depth = 0;
	for (const character of selectors) {
		if (character === "(") depth += 1;
		else if (character === ")") depth -= 1;
		if (character === "," && depth === 0) each.push("");
		else each[each.length - 1] += character;
	}
	return each;
}

/**
 * Every size a stylesheet sets, with the selector it sets it on. A selector
 * runs over as many lines as it lists, so the lines above the declaration are
 * gathered back to the blank line or the comment that precedes them.
 * @param {string} source
 * @returns {{ selector: string, value: string, line: number }[]}
 */
function sizes(source) {
	const lines = source.split("\n");
	const found = [];
	lines.forEach((line, index) => {
		const declaration = /^\s*font-size:\s*([^;]+);/.exec(line);
		if (!declaration) return;
		let start = index;
		while (start > 0 && !lines[start].trim().endsWith("{")) start -= 1;
		const selector = [];
		for (let above = start; above >= 0; above -= 1) {
			const text = lines[above].trim();
			if (!text || text.endsWith("}") || text.endsWith("*/")) break;
			selector.unshift(text);
		}
		for (const one of split(selector.join(" ").replace(/\{$/, ""))) {
			found.push({ selector: one.trim(), value: declaration[1].trim(), line: index + 1 });
		}
	});
	return found;
}

const stylesheets = system.styles.map((path) => [path, readFileSync(join(root, path), "utf8")]);
const tokens = Object.fromEntries([...stylesheets[0][1].matchAll(/^\t(--bastionland-font-[a-z]+):\s*([^;]+);/gm)].map((match) => [match[1], match[2]]));

describe("text size", () => {
	it("declares the floor and the size small print takes", () => {
		expect(pixels(tokens["--bastionland-font-floor"], tokens)).toBe(FLOOR);
		expect(pixels(tokens["--bastionland-font-note"], tokens)).toBe(BASE);
	});

	it("sets nothing anyone has to read below the floor", () => {
		const small = [];
		for (const [path, source] of stylesheets) {
			for (const { selector, value, line } of sizes(source)) {
				if (glyph(selector)) continue;
				const size = pixels(value, tokens);
				if (size !== undefined && size < FLOOR) small.push(`${path}:${line} ${selector} — ${value}`);
			}
		}
		expect(small).toEqual([]);
	});

	it("reads the sizes it went looking for", () => {
		const read = stylesheets.flatMap(([, source]) => sizes(source)).filter(({ value }) => pixels(value, tokens) !== undefined);
		expect(read.length).toBeGreaterThan(100);
	});
});
