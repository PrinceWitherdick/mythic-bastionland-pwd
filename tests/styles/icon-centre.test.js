import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHEET_FONTS } from "../../module/fonts.js";
import { split } from "../mocks/css.js";

const root = join(import.meta.dirname, "..", "..");
const sheets = Object.fromEntries(
	["mythic-bastionland.css", "chat.css", "gm-toolkit.css", "timeline.css"].map((name) => [
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
	{ sheet: "mythic-bastionland.css", selector: ".bastionland-page :is(.bastionland-chooser__group, .bastionland-knight-chooser__search-toggle)", font: ".bastionland-page .bastionland-chooser__group" },
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
	it.each(BADGES)("sizes $selector in whole pixels", ({ sheet, selector, box = ["width", "height"], font = selector }) => {
		const declarations = rule(sheet, selector);
		for (const side of box) expect(pixels(declarations[side]) % 1, `${side} of ${selector}`).toBe(0);
		// Where badges share their box, each sets its own lettering size.
		expect(pixels(rule(sheet, font)["font-size"]) % 1, `font-size of ${font}`).toBe(0);
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

	/*
	 * The Referee's own Myths take a word, Yours, in the row of d6 results.
	 * Only the width gives way to the word: the height and the lettering stay
	 * the whole pixels the d6 results are centred by.
	 */
	it("widens the Myths window's Yours button and changes nothing else of the d6 results' box", () => {
		const own = rule("mythic-bastionland.css", ".bastionland-page .bastionland-chooser__group.bastionland-myth-chooser__own-group");
		expect(Object.keys(own).sort()).toEqual(["padding", "width"]);
		expect(own.width).toBe("auto");
		expect(own.padding).toMatch(/^0 /);
	});
});

/*
 * Letters off the middle of the chip, button or row that holds them: three
 * causes, each guarded below, over every stylesheet the system loads.
 */
const system = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));
const css = system.styles.map((path) => readFileSync(join(root, path), "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every rule, its selectors split apart. Rules inside @supports and @media come out as their own. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
	selectors: split(match[1].trim()).map((one) => one.trim()),
	body: match[2]
}));

/** Every template and script of the system's, as text. */
const sources = ["templates", "module"].flatMap((dir) =>
	readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(hbs|js)$/.test(entry.name))
		.map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
);

/** The system's own classes in a class attribute, its Handlebars left out. */
const classesIn = (value) => value.replace(/\{\{[^}]*\}\}/g, " ").split(/\s+/).filter((name) => /^bastionland-[\w-]+$/.test(name));

/** Each class's test for a selector whose last element carries it, built once. */
const lastElement = new Map();

/**
 * Whether a selector's last element is the one that carries the class. What
 * follows the class may hold brackets with spaces in them, as `:is(:hover, .a)`
 * does, a bracket within a bracket too.
 */
const endsWith = (selector, name) => {
	if (!selector.includes(name)) return false;
	if (!lastElement.has(name)) lastElement.set(name, new RegExp(`\\.${name}(?![\\w-])(?:[^\\s>+~()]|\\((?:[^()]|\\([^()]*\\))*\\))*$`));
	return lastElement.get(name).test(selector);
};

describe("centring the letters", () => {
	/*
	 * IM Fell's line box sat 0.07em under the middle of its capitals, so
	 * whatever was centred by it (a flex button, an icon and its words, a
	 * bullet and its label) came out a pixel or two high. Each face shares the
	 * same height out so the line box centres on the capitals, in the
	 * stylesheet and in the register Foundry draws from.
	 */
	it("gives every IM Fell face a line box centred on its capitals", () => {
		const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => match[1]).filter((body) => body.includes("IMFell"));
		const registered = Object.values(SHEET_FONTS).flat().filter(({ urls }) => urls.some((url) => url.includes("IMFell")));
		expect([faces.length, registered.length]).toEqual([3, 3]);
		const pairs = new Set([
			...faces.map((face) => `${/ascent-override:\s*([\d.]+%)/.exec(face)?.[1]} ${/descent-override:\s*([\d.]+%)/.exec(face)?.[1]}`),
			...registered.map((font) => `${font.ascentOverride} ${font.descentOverride}`)
		]);
		expect([...pairs], "one pair, on every face").toHaveLength(1);
		// Chrome's measures of IM Fell, in em: ascent 0.905, descent 0.363, capitals 0.6875.
		const [ascent, descent] = [...pairs][0].split(" ").map(parseFloat);
		expect(ascent + descent).toBeCloseTo(90.5 + 36.3, 0);
		expect(ascent - descent).toBeCloseTo(68.75, 0);
	});

	/*
	 * A pill centres its letters by trimming its line box to them, which only
	 * a block can do. A button pill left as Foundry's flex box (the Chart's
	 * filters) kept the trim's padding without the trim, and its words rode
	 * high. The shared rule makes every button pill a block; no pill's own rule
	 * may turn it back into a flex box or a grid.
	 */
	it("never lays a pill out as a flex box or a grid", () => {
		const pillClasses = new Set(["bastionland-pill"]);
		for (const text of sources) {
			for (const match of text.matchAll(/class="([^"]*\bbastionland-pill\b[^"]*)"/g)) {
				for (const name of classesIn(match[1])) if (!name.startsWith("bastionland-pill")) pillClasses.add(name);
			}
		}
		expect(pillClasses.size).toBeGreaterThan(5);
		const flexed = rules.flatMap(({ selectors, body }) =>
			/(^|;|\s)display:\s*(inline-)?(flex|grid)/.test(body)
				? selectors.filter((selector) => [...pillClasses].some((name) => endsWith(selector, name)))
				: []
		);
		expect(flexed).toEqual([]);
		expect(css).toMatch(/button\.bastionland-pill[,\s][^{]*\{\s*display: inline-block;/);
	});

	/*
	 * Foundry's margin under every list entry but the last made a row of them
	 * taller than its last entry, which then sat lower than the rest: the
	 * Chart's key. Every list drawn across sets its entries' margin aside: a
	 * flex box that isn't a column, one a modifier turns into a row (NPC age
	 * pills), or a grid whose entries flow into columns (a single thread's
	 * Timeline).
	 */
	it("sets Foundry's entry margin aside in every list drawn as a row", () => {
		const lists = new Set();
		for (const text of sources) {
			for (const match of text.matchAll(/<(?:ul|ol)\b[^>]*class="([^"]*)"/g)) for (const name of classesIn(match[1])) lists.add(name);
		}
		const across = [...lists].filter((name) => {
			const own = rules.filter(({ selectors }) => selectors.some((selector) => endsWith(selector, name) && !/\s(li|>\s*li)\b/.test(selector)));
			const flexRow = own.some(({ body }) => /display:\s*(inline-)?flex/.test(body)) && !own.some(({ body }) => /flex-direction:\s*column/.test(body));
			return flexRow || own.some(({ body }) => /flex-direction:\s*row|grid-auto-flow:\s*column/.test(body));
		});
		expect(across.length).toBeGreaterThan(5);
		const shared = /:is\(([^)]*)\)\s*>\s*li\s*\{\s*margin: 0;/.exec(css);
		expect(shared, "the shared rule for lists drawn across").not.toBeNull();
		const named = new Set(shared[1].split(",").map((one) => one.trim().slice(1)));
		expect(across.filter((name) => !named.has(name))).toEqual([]);
	});

	/*
	 * A code or key box on the paper (the Keep Realm seed, a path, a note's key)
	 * is centred by its line box alone, as the offline audit measured it: no rule
	 * may pad it more above than below, set one side, or lay it out as a flex box
	 * or a grid.
	 */
	it("pads every code and key box alike above and below, and never as a flex box or a grid", () => {
		const boxes = rules.filter(({ selectors }) => selectors.some((selector) => /(?:^|[\s>])(?:code|kbd|:is\([^()]*\b(?:code|kbd)\b[^()]*\))$/.test(selector)));
		expect(boxes.length).toBeGreaterThan(3);
		const uneven = boxes.filter(({ body }) => {
			if (/padding-(top|bottom|block)/.test(body) || /(^|;|\s)display:\s*(inline-)?(flex|grid)/.test(body)) return true;
			const sides = /(?:^|;|\s)padding:\s*([^;]+)/.exec(body)?.[1].trim().split(/\s+/);
			return Boolean(sides) && (sides[2] ?? sides[0]) !== sides[0];
		});
		expect(uneven.map(({ selectors }) => selectors.join(", "))).toEqual([]);
	});

	/*
	 * A shared button's or blank's flex basis (8rem, 10rem) is a width in a row,
	 * but straight down a column it became the box's height, and the words sat
	 * in the middle of a box 128px tall. The offline gallery measures these
	 * (fixture/item-read-uses, fixture/timeline-invite); each keeps its own size.
	 */
	it.each([
		["mythic-bastionland.css", ".bastionland-page--item > .bastionland-button"],
		["mythic-bastionland.css", ".bastionland-page .bastionland-structure__carries input"],
		["timeline.css", ".bastionland-timeline__invite > .bastionland-button"]
	])("keeps %s's %s to its own height in a column", (sheet, selector) => {
		expect(rule(sheet, selector).flex).toBe("none");
	});

	/*
	 * Buttons of Foundry's own dressed in the parchment's caps (a journal's Add
	 * Page and Save), and Edit this hex's buttons stretched to the dice boxes
	 * beside them, keep Foundry's flex box, which centres the words however tall
	 * the button grows: no rule on them sets its display, its line height or its
	 * padding above or below. The offline gallery measures them
	 * (fixture/hex-journal, fixture/journal-page-edit, fixture/hex-edit).
	 */
	it.each([
		".mythic-bastionland-journal .journal-sidebar button:not(.icon)",
		".mythic-bastionland-journal .form-footer button",
		".bastionland-hex-edit .form-fields > button"
	])("leaves %s centred by Foundry's flex box", (selector) => {
		const own = rules.filter(({ selectors }) => selectors.includes(selector));
		expect(own.length, `no ${selector} rule`).toBeGreaterThan(0);
		const moved = own.filter(({ body }) => /(^|;|\s)(display|line-height|padding|padding-(top|bottom|block)):/.test(body));
		expect(moved.map(({ body }) => body.trim())).toEqual([]);
		for (const { body } of own) {
			const font = /font-family:\s*([^;]+)/.exec(body)?.[1].trim();
			// The caps and body faces are IM Fell, whose line box is centred on its capitals (above).
			if (font) expect(["var(--bastionland-font-caps)", "var(--bastionland-font-body)"]).toContain(font);
		}
	});

	it("centres a radio or tick box on the first line of a two-line choice, with no fixed nudge", () => {
		// The body font's line box is centred on its capitals, so the box's middle on the line's
		// middle is its capitals' too. A fixed em nudge set it 2–3px low (measured 2026-10-25).
		const input = rule("chat.css", ".bastionland-check:has(.bastionland-check__detail) > input");
		expect(input["line-height"]).toBe("inherit");
		expect(input["margin-block-start"]).toBe("calc((1lh - var(--checkbox-size)) / 2)");
	});

	/*
	 * The Domain's Landmarks, the Realm Appearance's arms tick and the Toolkit's
	 * "isn't on this Realm's map" button were measured offline (bullets.mjs,
	 * probe-radio-rows.mjs, probe-left-off.mjs: ≤0.8px at 1×, 1.25× and 1.5×,
	 * 2026-10-29) as they are drawn: the browser's own disc beside IM Fell, the
	 * shared tick row, and the banner's shared fact button. None may move its
	 * words off what was measured.
	 */
	it("keeps the Domain's Landmarks on the browser's own disc, down a column", () => {
		const list = rule("mythic-bastionland.css", ".bastionland-domain__landmarks");
		expect(list["list-style"]).toBe("disc");
		expect(list.display).toBeUndefined();
		const drawn = rules.filter(({ selectors }) => selectors.some((selector) => selector.includes("bastionland-domain__landmarks") && /::?(before|after|marker)/.test(selector)));
		expect(drawn.map(({ selectors }) => selectors.join(", "))).toEqual([]);
	});

	it.each([
		".bastionland-realm-appearance__arms",
		".bastionland-gm-toolkit__fact--quiet"
	])("leaves %s centred by the shared rule it builds on", (name) => {
		const own = rules.filter(({ selectors }) => selectors.some((selector) => endsWith(selector, name.slice(1))));
		expect(own.length, `no ${name} rule`).toBeGreaterThan(0);
		const moved = own.filter(({ body }) => /(^|;|\s)(display|line-height|padding|padding-(top|bottom|block)|vertical-align):/.test(body));
		expect(moved.map(({ selectors }) => selectors.join(", "))).toEqual([]);
	});

	// The Domain's footer is a row, so its button's basis is a width: a third of the window.
	it("lays the Domain's footer button in a row", () => {
		expect(rule("mythic-bastionland.css", ".bastionland-domain__footer")["flex-direction"] ?? "row").toBe("row");
		expect(rule("mythic-bastionland.css", ".bastionland-page .bastionland-domain__footer .bastionland-button").flex).toMatch(/^0 0 /);
	});
});
