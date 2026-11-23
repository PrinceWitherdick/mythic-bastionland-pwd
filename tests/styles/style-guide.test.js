import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const system = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));
const stylesheets = system.styles.map((path) => [path, readFileSync(join(root, path), "utf8")]);

/** @returns {string[]} Every file under a folder with the extension, by its path from the root. */
function files(folder, extension) {
	return readdirSync(join(root, folder), { recursive: true, encoding: "utf8" })
		.filter((path) => path.endsWith(extension))
		.map((path) => `${folder}/${path.replaceAll("\\", "/")}`);
}

/** @returns {string[]} Each line of every stylesheet that matches, as `path:line text`. */
function lines(pattern) {
	return stylesheets.flatMap(([path, source]) =>
		source.split("\n").flatMap((line, index) => (pattern.test(line) ? [`${path}:${index + 1} ${line.trim()}`] : []))
	);
}

/** @returns {{ path: string, selector: string, body: string }[]} Every plain rule of every stylesheet, comments dropped. */
function rules() {
	return stylesheets.flatMap(([path, source]) =>
		[...source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ path, selector: match[1].trim(), body: match[2] }))
	);
}

/**
 * What STYLE-GUIDE.md asks of every stylesheet and template, where reading the
 * files can tell. Each of these was found broken somewhere before it was written
 * down (the 2026-11-19 audit).
 */
describe("the style guide", () => {
	it("sizes words by token, the page's own size among them", () => {
		expect(stylesheets[0][1]).toMatch(/^\t--bastionland-font-text:\s*15px;/m);
		expect(lines(/font-size:\s*1[45]px/)).toEqual([]);
	});

	it("rounds a corner on the page by 3px, never Foundry's 4px", () => {
		expect(lines(/border-radius:[^;]*\b4px/)).toEqual([]);
	});

	it("draws small capitals from the Caps face, not by shrinking the body face's capitals", () => {
		expect(lines(/font-variant:\s*small-caps/)).toEqual([]);
	});

	/**
	 * A shadow is for what floats, and comes from one of the two tokens. The
	 * rail hangs off a window's side and throws its own sideways, and the
	 * portrait framer darkens the picture outside its box with one.
	 */
	it("casts a shadow only from the two tokens", () => {
		const own = ["box-shadow: 3px 3px 8px rgb(0 0 0 / 0.3);", "box-shadow: -3px 3px 8px rgb(0 0 0 / 0.3);", "box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.45);"];
		const raw = lines(/box-shadow:[^;]*rgb\(/).filter((line) => !own.some((value) => line.endsWith(value)));
		expect(raw).toEqual([]);
		expect(stylesheets[0][1]).toMatch(/^\t--bastionland-lift:/m);
		expect(stylesheets[0][1]).toMatch(/^\t--bastionland-float:/m);
	});

	/** The rubric is a heading's and an icon's resting colour; a pointed-at word turns blood. */
	it("reddens a pointed-at word in blood, not rubric", () => {
		const rubric = rules()
			.filter(({ selector, body }) => selector.includes(":hover") && /(^|[\s;])color:\s*var\(--bastionland-rubric\)/.test(body))
			.map(({ path, selector }) => `${path} ${selector}`);
		expect(rubric).toEqual([]);
	});

	it("gives a button with no class of its own the sheet's hand", () => {
		const bare = rules().find(({ selector }) => selector === ":where(.bastionland-page, .bastionland-dialog .window-content) :where(button, a.button)");
		expect(bare, "the rule for a plain button").toBeDefined();
		expect(bare.body).toMatch(/font-family:\s*var\(--bastionland-font-caps\)/);
		expect(bare.body).toMatch(/border-radius:\s*3px/);
	});

	it("draws headings and hints the Knight sheet's way", () => {
		const hint = rules().find(({ path, selector }) => path.endsWith("mythic-bastionland.css") && selector === ".bastionland-hint");
		expect(hint.body).toMatch(/font-style:\s*italic/);
		for (const { selector, body } of rules()) {
			if (/(__heading|__section-title|__due-title|legend)$/.test(selector)) expect(body, selector).not.toMatch(/font-weight:\s*bold/);
		}
	});

	/**
	 * An icon says nothing a screen reader should read, so every one is inert.
	 * The one that isn't carries a tooltip of its own, which an inert element
	 * would never show.
	 */
	it("marks every icon inert", () => {
		const bare = [];
		for (const path of files("templates", ".hbs")) {
			for (const [tag] of readFileSync(join(root, path), "utf8").matchAll(/<i\s[^>]*>/g)) {
				if (!/\binert\b/.test(tag) && !tag.includes("data-tooltip")) bare.push(`${path} ${tag}`);
			}
		}
		expect(bare).toEqual([]);
	});

	/** Solid icons only, but for the empty circle and the empty box, whose outline is what they say. */
	it("draws its icons solid", () => {
		const hollow = [];
		for (const path of [...files("templates", ".hbs"), ...files("module", ".js")]) {
			for (const [, icon] of readFileSync(join(root, path), "utf8").matchAll(/fa-regular (fa-[\w-]+)/g)) {
				if (!["fa-circle", "fa-square"].includes(icon)) hollow.push(`${path} ${icon}`);
			}
		}
		expect(hollow).toEqual([]);
	});
});
