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
	// The Places rows' marks for a telling and a note.
	{ sheet: "mythic-bastionland.css", selector: ".bastionland-travels__mark" },
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
	 * the whole pixels the d6 results are centred by. The word keeps the Caps
	 * face, centred on its small capitals, where the figures take the body's.
	 */
	it("widens the Myths window's Yours button and changes nothing else of the d6 results' box", () => {
		const own = rule("mythic-bastionland.css", ".bastionland-page .bastionland-chooser__group.bastionland-myth-chooser__own-group");
		expect(Object.keys(own).sort()).toEqual(["font-family", "padding", "width"]);
		expect(own["font-family"]).toBe("var(--bastionland-font-caps)");
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
	/*
	 * IM Fell SC, the Caps face every button is set in, draws lowercase as small
	 * capitals 0.4375em tall, and a label such as "Start from a book Knight" is
	 * mostly those: centred on its capitals, it read 1–2px low (the user's call,
	 * 2026-11-15, measured offline and live). Its line box centres on the small
	 * capitals instead, the same height shared out again.
	 */
	it("gives IM Fell's faces a line box centred on their capitals, and the small-caps face on its small capitals", () => {
		const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => match[1]).filter((body) => body.includes("IMFell"));
		const registered = Object.values(SHEET_FONTS).flat().filter(({ urls }) => urls.some((url) => url.includes("IMFell")));
		expect([faces.length, registered.length]).toEqual([3, 3]);
		const pairsOf = (smallCaps) => new Set([
			...faces.filter((face) => face.includes("IMFellEnglishSC") === smallCaps).map((face) => `${/ascent-override:\s*([\d.]+%)/.exec(face)?.[1]} ${/descent-override:\s*([\d.]+%)/.exec(face)?.[1]}`),
			...registered.filter(({ urls }) => urls[0].includes("IMFellEnglishSC") === smallCaps).map((font) => `${font.ascentOverride} ${font.descentOverride}`)
		]);
		// Chrome's measures of IM Fell, in em: ascent 0.905, descent 0.363, capitals 0.6875; IM Fell SC's small capitals 0.4375.
		for (const [smallCaps, middle] of [[false, 68.75], [true, 43.75]]) {
			const pairs = pairsOf(smallCaps);
			expect([...pairs], "one pair, here and in the register").toHaveLength(1);
			const [ascent, descent] = [...pairs][0].split(" ").map(parseFloat);
			expect(ascent + descent).toBeCloseTo(90.5 + 36.3, 0);
			expect(ascent - descent).toBeCloseTo(middle, 0);
		}
	});

	/*
	 * With the Caps face centred on its small capitals, what stands as tall as a
	 * capital is drawn otherwise: a die's figure in the body face (the same EB
	 * Garamond figures), and a small-caps pill's icon dropped to the small
	 * capitals' middle. A hex chip is a small-caps pill when its name has
	 * lowercase and no figures. Measured offline with centre.mjs: 0 findings.
	 */
	it("draws figures and small-caps pills' icons to suit the Caps face's line box", () => {
		expect(rule("mythic-bastionland.css", ".bastionland-page .bastionland-chooser__group")["font-family"]).toBe("var(--bastionland-font-body)");
		expect(rule("mythic-bastionland.css", ".bastionland-page .bastionland-chooser__group.bastionland-myth-chooser__own-group")["font-family"]).toBe("var(--bastionland-font-caps)");
		expect(rule("chat.css", ".bastionland-session-end__d6")["font-family"]).toBe("var(--bastionland-font-body)");
		expect(css).toMatch(/\.bastionland-pill--small-caps > i \{\s*position: relative;\s*top: 0\.125em;/);
		// A heading is all capitals, so the line beside it rises back to their middle (bullets.mjs: normal headings ≤1.2px).
		expect(css).toMatch(/\.bastionland-heading::after,\s*\.bastionland-oath \.bastionland-heading::before \{\s*position: relative;\s*top: -0\.125em;/);
		expect(readFileSync(join(root, "templates/chat/parts/hex-target.hbs"), "utf8")).toContain("{{#if smallCaps}} bastionland-pill--small-caps{{/if}}");
	});

	/*
	 * Other words all in capitals beside a mark: the Knight Ledger's dates with
	 * their rule line, and the Realm-drawing banner's title with its icon. Each
	 * mark rises by the same 0.125em of the words' size, measured offline
	 * (probe-ledger-date.mjs 3px to ≤1px, probe-banner-ink.mjs 4px to ≤1px).
	 * A banner with a line under its title keeps its icon on the middle of both.
	 */
	it("raises the marks beside other all-capitals Caps words to the capitals' middle", () => {
		expect(rule("chat.css", ".bastionland-ledger-window .bastionland-ledger__date")["text-transform"]).toBe("uppercase");
		expect(rule("chat.css", ".bastionland-ledger__date::after")).toMatchObject({ position: "relative", top: "-0.125em" });
		const title = rule("chat.css", ".bastionland-rail-dialog__title");
		expect(title["text-transform"]).toBe("uppercase");
		const icon = rule("chat.css", ".bastionland-rail-dialog__banner:not(:has(.bastionland-rail-dialog__sub)) > i");
		expect(icon).toMatchObject({ position: "relative", top: `calc(-0.125 * ${title["font-size"]})` });
		expect(rule("chat.css", ".bastionland-rail-dialog__banner > i")).not.toHaveProperty("top");
	});

	/*
	 * The Time page's "This Season: Harvest" is a heading, so all capitals, with
	 * the Season's leaf beside it at 0.75em: the leaf rises by the heading's
	 * 0.125em, 0.1667em of its own size. Measured offline by ink
	 * (probe-season-heading.mjs: 3.1–3.7px low before, ≤1px after, 2026-11-18).
	 */
	it("raises the Season's leaf to the middle of its heading's capitals", () => {
		expect(rule("mythic-bastionland.css", ".bastionland-heading")["text-transform"]).toBe("uppercase");
		const leaf = ".bastionland-gm-toolkit__section.bastionland-gm-toolkit__season > .bastionland-heading i";
		expect(css).toMatch(new RegExp(`${leaf.replace(/[.>]/g, "\\$&")},[^{]*\\{[^}]*font-size: 0\\.75em;`));
		expect(rule("gm-toolkit.css", leaf)).toEqual({ position: "relative", top: "-0.1667em" });
		expect(readFileSync(join(root, "templates/actor/gm-toolkit/time.hbs"), "utf8")).toContain('<h2 class="bastionland-heading"><i class="{{thisSeason.icon}}" inert></i> {{thisSeason.label}}</h2>');
	});

	/*
	 * The Places window's folding heads are headings, so all capitals, with a
	 * chevron before the words and a count after them in the body face: both rise
	 * to the capitals' middle, the same at either heading size. A ride's chevron,
	 * in a disc taller than a line of its words, is centred on their first line,
	 * and a row's title line opens with a strut as tall as the corner beside it,
	 * so the two share a middle when the terrain wraps under the title. Measured
	 * offline with render-tame.mjs's probe at 1×, 1.25× and 1.5× (2026-11-22):
	 * chevrons and head counts ≤0.2px, a filter pill's count 0.5px, a ride's
	 * chevron 0.2px, the corner against the title 0.3px; before, heads sat 0.6
	 * to 1.8px low, the ride's chevron 2.5px and a wrapped row's corner 4.9px.
	 */
	it("raises a folding head's chevron and count to its capitals, and centres a ride's chevron on its first line", () => {
		const fold = rule("mythic-bastionland.css", ".bastionland-page .bastionland-travels__fold");
		expect(fold).toMatchObject({ display: "inline-flex", "align-items": "center", "text-transform": "inherit" });
		expect(rule("mythic-bastionland.css", ".bastionland-travels__fold > i")).toMatchObject({ position: "relative", top: "-0.21rem", "font-size": "0.7rem" });
		expect(rule("mythic-bastionland.css", ".bastionland-travels__fold > .bastionland-travels__count")).toMatchObject({ position: "relative", top: "-0.24rem", "font-family": "var(--bastionland-font-body)" });
		// A filter pill's count is plain words inside the pill's block, moved by nothing.
		const count = rule("mythic-bastionland.css", ".bastionland-travels__count");
		expect(Object.keys(count).filter((name) => /^(display|line-height|padding|vertical-align|top|translate|transform|position)/.test(name))).toEqual([]);
		const ride = rule("mythic-bastionland.css", ".bastionland-travels-journey__ride");
		expect(ride).toMatchObject({ "font-size": "var(--bastionland-font-text)", "line-height": "1.3" });
		expect(rule("mythic-bastionland.css", ".bastionland-page .bastionland-travels-journey__unfold")).toMatchObject({
			"align-self": "start",
			height: "1.5rem",
			"margin-block": `calc((${ride["line-height"]} * ${ride["font-size"]} - 1.5rem) / 2)`
		});
		expect(rule("mythic-bastionland.css", ".bastionland-travels__open > .bastionland-travels__head::before").height)
			.toBe(rule("mythic-bastionland.css", ".bastionland-travels__corner")["min-height"]);
		const list = readFileSync(join(root, "templates/apps/parts/travels-list.hbs"), "utf8");
		expect(list).toContain('<i class="fa-solid fa-chevron-right" inert></i>\n\t\t<span>{{heading}}</span>\n\t\t{{#if count}}<span class="bastionland-travels__count">{{count}}</span>{{/if}}');
	});

	/*
	 * Icon-plus-label rows in the Caps face whose labels are mostly small
	 * capitals, so they centre on its line box as it stands: the welcome
	 * window's places (centred, not on the baseline) and the written Knight's
	 * Frame and No Picture buttons, which are the shared button with no rule of
	 * their own. Measured offline: centre.mjs and probe-own-knight-frame.mjs, 0
	 * findings at 1×/1.25×/1.5×.
	 */
	it("centres the welcome window's places and the written Knight's picture buttons on their small capitals", () => {
		const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));
		const label = (key) => key.split(".").reduce((node, part) => node?.[part], lang) ?? lang[key];
		const smallCaps = (text) => /\p{Ll}/u.test(text) && !/\d/.test(text);

		const where = rule("mythic-bastionland.css", ".bastionland-welcome__where dt");
		expect(where).toMatchObject({ display: "flex", "align-items": "center", "font-family": "var(--bastionland-font-caps)" });
		const welcome = readFileSync(join(root, "templates/apps/welcome.hbs"), "utf8");
		const terms = [...welcome.matchAll(/<dt><i class="[^"]+" inert><\/i> \{\{localize "([^"]+)"\}\}<\/dt>/g)].map((match) => label(match[1]));
		expect(terms).toHaveLength(4);
		expect(terms.filter((term) => !smallCaps(term))).toEqual([]);

		const ownKnight = readFileSync(join(root, "templates/apps/own-knight.hbs"), "utf8");
		for (const name of ["bastionland-own-knight__frame", "bastionland-own-myth__clear"]) {
			const button = new RegExp(`<button type="button" class="bastionland-button ${name}"[^>]*><i class="[^"]+" inert></i> \\{\\{localize "([^"]+)"\\}\\}</button>`).exec(ownKnight);
			expect(button, name).not.toBeNull();
			expect(smallCaps(label(button[1])), name).toBe(true);
			expect(rules.filter(({ selectors }) => selectors.some((selector) => selector.includes(name))), `${name} has no rule of its own`).toEqual([]);
		}
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
		".bastionland-gm-toolkit__fact--quiet",
		// The Domain sheet's "Worthiness proven" tick, on the shared tick row (measured 2026-11-05).
		".bastionland-domain__proven"
	])("leaves %s centred by the shared rule it builds on", (name) => {
		const own = rules.filter(({ selectors }) => selectors.some((selector) => endsWith(selector, name.slice(1))));
		expect(own.length, `no ${name} rule`).toBeGreaterThan(0);
		const moved = own.filter(({ body }) => /(^|;|\s)(display|line-height|padding|padding-(top|bottom|block)|vertical-align):/.test(body));
		expect(moved.map(({ selectors }) => selectors.join(", "))).toEqual([]);
	});

	/*
	 * A choose-one list (pick-one.hbs), such as Courtesy's "Whose Court does … join?",
	 * names each choice in bold with no line under it: measured offline with
	 * probe-radio-rows.mjs on a three-Court list, the radio ≤0.8px off its capitals'
	 * middle at 1×, 1.25× and 1.5× (2026-11-05). Its rows are the shared tick row.
	 */
	it("draws a choose-one list's rows on the shared tick row, the list itself moving no row", () => {
		const list = readFileSync(join(root, "templates/dialogs/parts/pick-list.hbs"), "utf8");
		expect(list).toContain('<label class="bastionland-check">');
		expect(list).toContain('<span class="bastionland-check__label">');
		expect(readFileSync(join(root, "templates/dialogs/pick-one.hbs"), "utf8")).toContain('{{> "bastionland.pick-list"');
		const own = rules.filter(({ selectors }) => selectors.some((selector) => selector.includes("bastionland-choice-list") && selector.includes("bastionland-check")));
		const moved = own.filter(({ body }) => /(^|;|\s)(display|line-height|padding|padding-(top|bottom|block)|vertical-align|margin-block-start):/.test(body));
		expect(moved.map(({ selectors }) => selectors.join(", "))).toEqual([]);
	});

	/*
	 * Ending a Session numbers each situation ("Situation 1") beside its Roll and × buttons.
	 * Measured offline with probe-situations.mjs: the label's capitals sit 0.63px above the
	 * Roll button's at 1×, 1.25× and 1.5× (2026-11-07), centred by the row alone.
	 */
	it("centres an Ending a Session situation's number on its buttons by the row alone", () => {
		expect(rule("chat.css", ".bastionland-session-end__row")["align-items"]).toBe("center");
		const label = rule("chat.css", ".bastionland-session-end__situation");
		expect(Object.keys(label).filter((name) => /^(display|line-height|padding|vertical-align|top|translate|transform|margin)/.test(name))).toEqual([]);
	});

	/*
	 * A written Knight's sheet opens on a bar of its Ready tick, on the shared
	 * tick row, and Start from a book Knight; Choose a Knight's Edit this Knight
	 * button sits under the name. Both buttons are the shared icon button. The
	 * offline gallery draws them (fixture/own-knight, fixture/knight-chooser-own).
	 */
	it("leaves a written Knight's Ready tick and their sheet's and chooser's buttons centred by the shared rules", () => {
		const sheet = readFileSync(join(root, "templates/apps/own-knight.hbs"), "utf8");
		expect(sheet).toContain('<label class="bastionland-check bastionland-own-knight__ready">');
		expect(sheet).toMatch(/<button type="button" class="bastionland-button" data-action="startFromBook"/);
		expect(readFileSync(join(root, "templates/apps/knight-chooser.hbs"), "utf8")).toContain('class="bastionland-button bastionland-knight-chooser__edit"');
		expect(rule("mythic-bastionland.css", ".bastionland-own-knight__bar")["align-items"]).toBe("center");
		expect(Object.keys(rule("mythic-bastionland.css", ".bastionland-page .bastionland-own-knight__bar > .bastionland-button")).sort()).toEqual(["flex", "width"]);
		const own = rules.filter(({ selectors }) => selectors.some((selector) => ["bastionland-own-knight__ready", "bastionland-knight-chooser__edit"].some((name) => endsWith(selector, name))));
		const moved = own.filter(({ body }) => /(^|;|\s)(display|line-height|padding|padding-(top|bottom|block)|vertical-align|margin-block-start):/.test(body));
		expect(moved.map(({ selectors }) => selectors.join(", "))).toEqual([]);
	});

	/*
	 * A Pack card's Join, Roll, Call Off and Open Again buttons are the shared
	 * card action buttons, and its dice still to roll are the Attack card's dice
	 * with an empty face; the Knight sheet's Posts rows are the shared item rows,
	 * with the shared × badge and Take a Seat as the shared icon button. The
	 * offline gallery draws them (fixture/pack-open, fixture/pack-stalled,
	 * fixture/knight-posts): 0 findings at 1×, 1.25× and 1.5× (2026-11-11).
	 * Nothing of their own may move their letters off those rules.
	 */
	it("leaves a Pack card's buttons and dice and a Knight's Posts rows centred by the shared rules", () => {
		const pack = readFileSync(join(root, "templates/chat/pack.hbs"), "utf8");
		const actions = [...pack.matchAll(/<button ([^>]*data-pack-action="[\w-]+"[^>]*)>/g)].map((match) => match[1]);
		expect(actions).toHaveLength(4);
		for (const button of actions) expect(button).not.toMatch(/class=/);
		expect(pack.match(/<div class="bastionland-card__actions">/g)).toHaveLength(2);
		expect(pack).toContain('<span class="bastionland-die is-waiting"');
		const sheet = readFileSync(join(root, "templates/actor/knight-sheet.hbs"), "utf8");
		const posts = /<section class="bastionland-block" data-block="posts"[\s\S]*?<\/section>/.exec(sheet)?.[0] ?? "";
		expect(posts).toContain('<ul class="bastionland-items bastionland-court">');
		expect(posts).toContain('<div class="bastionland-item__line">');
		expect(posts).toMatch(/<button type="button" class="bastionland-icon" data-action="\{\{leave\.action\}\}"/);
		expect(posts).toMatch(/<div class="bastionland-adds">\s*<button type="button" class="bastionland-button" data-action="takeSeat"/);
		const own = rules.filter(({ selectors }) => selectors.some((selector) => /bastionland-card--pack|\.bastionland-die\.is-waiting(?![\w-])|data-block="posts"|data-pack-action/.test(selector)
			|| endsWith(selector, "bastionland-court")));
		const moved = own.filter(({ body }) => /(^|;|\s)(display|line-height|padding|padding-(top|bottom|block)|vertical-align|margin-block-start|top|translate|transform):/.test(body));
		expect(moved.map(({ selectors }) => selectors.join(", "))).toEqual([]);
	});

	/*
	 * Take a Seat stands its Domains' radio lists up to three abreast in a grid, each
	 * row the shared tick row: probe-radio-rows.mjs on fixture/council-seat (four
	 * Domains, three columns) measured every radio ≤0.8px off its capitals' middle
	 * at 1×, 1.25× and 1.5× (2026-11-15). The Successor's × moved to the row's far
	 * right and shows on hover, the shared icon button still: probe-mark-row.mjs on
	 * fixture/knight-successor puts its box's middle 0.01px from the name's, the
	 * ink within the row limit (≤1.5px, as it measured before the move), and a
	 * planted 3px nudge was caught. The grid and the × may only lay out across.
	 */
	it("leaves Take a Seat's grid of radio rows and the Successor's × centred by the shared rules", () => {
		const seat = readFileSync(join(root, "templates/dialogs/council-seat.hbs"), "utf8");
		expect(seat).toContain('<div class="bastionland-council-seat__domains" style="--seat-columns: {{columns}}">');
		expect(seat).toContain('<label class="bastionland-check">');
		const sheet = readFileSync(join(root, "templates/actor/knight-sheet.hbs"), "utf8");
		expect(sheet).toMatch(/<button type="button" class="bastionland-icon bastionland-reveal bastionland-steed__end" data-action="clearSuccessor"/);
		expect(rule("mythic-bastionland.css", ".bastionland-steed")["align-items"]).toBe("center");
		expect(rule("mythic-bastionland.css", ".bastionland-steed__end")).toEqual({ "margin-inline-start": "auto" });
		const own = rules.filter(({ selectors }) => selectors.some((selector) => selector.includes("bastionland-council-seat__domains") || endsWith(selector, "bastionland-steed__end")));
		const moved = own.filter(({ body }) => /(^|;|\s)(line-height|padding|padding-(top|bottom|block)|vertical-align|margin-block-start|align-items|align-self|top|translate|transform):/.test(body));
		expect(moved.map(({ selectors }) => selectors.join(", "))).toEqual([]);
	});

	/*
	 * A Cast member on the Toolkit's Myths page carries a pawn, which brings them
	 * into the fight, beside the × that takes them out of the Cast. The pawn is
	 * drawn by the ×'s rules and nothing else, so it sits where the × does.
	 */
	it("draws a Cast member's pawn by the same rules as their ×, and moves it by none of its own", () => {
		const chip = readFileSync(join(root, "templates/actor/gm-toolkit/cast-actor.hbs"), "utf8");
		expect(chip).toMatch(/<button type="button" class="bastionland-gm-toolkit__cast-bring" data-action="bringCastActor"[^>]*><i class="[^"]+" inert><\/i><\/button>/);
		expect(rule("gm-toolkit.css", ".bastionland-gm-toolkit__cast-actor")["align-items"]).toBe("center");
		// Their shared rules name both in one :is(), so any mention of the class counts.
		const naming = (name) => rules.filter(({ selectors }) => selectors.some((selector) => new RegExp(`\\.${name}(?![\\w-])`).test(selector)));
		const [bring, drop] = ["bastionland-gm-toolkit__cast-bring", "bastionland-gm-toolkit__cast-drop"].map(naming);
		expect(bring.length).toBeGreaterThan(0);
		expect(bring.map(({ body }) => body.trim())).toEqual(drop.map(({ body }) => body.trim()));
	});

	/*
	 * The Toolkit's Sites page had its own Journal and Open the Site buttons,
	 * whose own line height and padding left their words off the middle in
	 * Foundry. They are the sheet's button now, held at their label's width
	 * beside the Site's line, and move their words by nothing of their own.
	 */
	it("draws a Site's Journal and Open the Site buttons as the sheet's own button", () => {
		const places = readFileSync(join(root, "templates/actor/gm-toolkit/places.hbs"), "utf8");
		const buttons = [...places.matchAll(/<button [^>]*bastionland-gm-toolkit__site-open[^>]*>/g)].map(([tag]) => tag);
		expect(buttons).toHaveLength(2);
		for (const tag of buttons) expect(tag).toMatch(/class="bastionland-button bastionland-gm-toolkit__site-open"/);
		expect(rule("gm-toolkit.css", ".bastionland-page .bastionland-gm-toolkit__site-open")).toEqual({ flex: "none" });
		const own = rules.filter(({ selectors }) => selectors.some((selector) => selector.includes("bastionland-gm-toolkit__site-open")));
		const moved = own.filter(({ body }) => /(^|;|\s)(display|height|min-height|line-height|padding|padding-(top|bottom|block)|align-items|vertical-align):/.test(body));
		expect(moved.map(({ selectors }) => selectors.join(", "))).toEqual([]);
	});

	// A Chronicle's or notes' words stand as far from the frame above as at the sides.
	it("insets the words of rich text on a sheet alike at the top and the sides", () => {
		expect(rule("mythic-bastionland.css", ".bastionland-page prose-mirror").padding).toBe("0");
		expect(rule("mythic-bastionland.css", ".bastionland-page .editor-content > :first-child")).toEqual({ "margin-top": "0" });
		expect(rule("mythic-bastionland.css", ".bastionland-page .editor-content > :last-child")).toEqual({ "margin-bottom": "0" });
		const shared = rule("mythic-bastionland.css", ".bastionland-page prose-mirror,\n.bastionland-page .editor-content");
		expect(shared.padding.split(/\s+/)).toHaveLength(1);
	});

	// The Domain's footer is a row, so its button's basis is a width: a third of the window.
	it("lays the Domain's footer button in a row", () => {
		expect(rule("mythic-bastionland.css", ".bastionland-domain__footer")["flex-direction"] ?? "row").toBe("row");
		expect(rule("mythic-bastionland.css", ".bastionland-page .bastionland-domain__footer .bastionland-button").flex).toMatch(/^0 0 /);
	});
});
