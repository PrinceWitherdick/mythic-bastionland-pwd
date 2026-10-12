import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = join(import.meta.dirname, "..", "..", "styles");
const read = (name) => readFileSync(join(styles, name), "utf8");
const MAIN = read("mythic-bastionland.css");
const SETTINGS = read("settings.css");
const CHAT = read("chat.css");
const TOOLKIT = read("gm-toolkit.css");
const TIMELINE = read("timeline.css");
const REPORT = readFileSync(join(import.meta.dirname, "..", "..", "templates", "chat", "report.hbs"), "utf8");

/** The twelve colours every scheme sets. */
const COLOURS = [
	"paper", "paper-deep", "ink", "ink-soft", "ink-faint", "rule",
	"blood", "rubric", "verdigris", "spring", "harvest", "winter"
];

/**
 * Each innermost rule in a stylesheet: the selectors in its list, written on
 * one line each, and the custom properties it declares, by name without the
 * `--bastionland-`.
 * @param {string} css
 * @returns {{selectors: string[], tokens: Record<string, string>}[]}
 */
function rules(css) {
	const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
	return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, list, body]) => {
		const selectors = [];
		let depth = 0;
		let current = "";
		for (const char of list) {
			if (char === "," && depth === 0) {
				selectors.push(current);
				current = "";
				continue;
			}
			if (char === "(") depth += 1;
			if (char === ")") depth -= 1;
			current += char;
		}
		selectors.push(current);
		return {
			selectors: selectors.map((selector) => selector.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim()),
			tokens: Object.fromEntries([...body.matchAll(/--bastionland-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
		};
	});
}

/**
 * The custom properties a selector is given, from every rule that lists it,
 * the later over the earlier.
 * @param {string} css
 * @param {string} selector One of a rule's selectors, on one line.
 * @returns {Record<string, string>}
 */
function block(css, selector) {
	const given = rules(css).filter((rule) => rule.selectors.includes(selector));
	expect(given.length, `${selector} is in the stylesheet`).toBeGreaterThan(0);
	return Object.assign({}, ...given.map((rule) => rule.tokens));
}

const ROOT = block(MAIN, ":root");
const DARK = block(SETTINGS, ":root.bastionland-dark");
const MIDNIGHT = block(SETTINGS, ":root.bastionland-dark.bastionland-scheme-midnight");
const ASHEN = block(SETTINGS, ":root.bastionland-dark.bastionland-scheme-ashen");
const DARK_HIGH = block(SETTINGS, ":root.bastionland-dark.bastionland-high-contrast");
const MIDNIGHT_HIGH = block(SETTINGS, ":root.bastionland-dark.bastionland-scheme-midnight.bastionland-high-contrast");
const ASHEN_HIGH = block(SETTINGS, ":root.bastionland-dark.bastionland-scheme-ashen.bastionland-high-contrast");
const PARCHMENT_HIGH = block(SETTINGS, ":root.bastionland-high-contrast");

/** Each scheme as a page drawn in it has it: the blocks that apply, the later over the earlier. */
const SCHEMES = {
	lamplit: { ...ROOT, ...DARK },
	midnight: { ...ROOT, ...DARK, ...MIDNIGHT },
	ashen: { ...ROOT, ...DARK, ...ASHEN }
};
const HIGH = {
	parchment: { ...ROOT, ...PARCHMENT_HIGH },
	lamplit: { ...SCHEMES.lamplit, ...DARK_HIGH },
	midnight: { ...SCHEMES.midnight, ...DARK_HIGH, ...MIDNIGHT_HIGH },
	ashen: { ...SCHEMES.ashen, ...DARK_HIGH, ...ASHEN_HIGH }
};

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex) {
	const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
		.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two #rrggbb colours. */
function contrast(a, b) {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

/**
 * Each ink against the page and against the raised surface of a button or a
 * box. The ink is 7:1, the reading guideline's enhanced level; soft ink and the
 * coloured inks 4.5:1; rules, which are lines and not words, 3:1. High Contrast
 * asks more of each. The placeholder ink is meant to look unfilled, and has no floor.
 */
const FLOORS = { ink: 7, "ink-soft": 4.5, rule: 3, blood: 4.5, rubric: 4.5, verdigris: 4.5, spring: 4.5, harvest: 4.5, winter: 4.5 };
const HIGH_FLOORS = { ink: 12, "ink-soft": 7, rule: 4.5, blood: 7, rubric: 7, verdigris: 7, spring: 7, harvest: 7, winter: 7 };

/** @returns {string[]} Every ink in the scheme that reads below its floor, with the ratio it reads at. */
function shortfalls(scheme, floors) {
	const short = [];
	for (const [ink, floor] of Object.entries(floors)) {
		for (const ground of ["paper", "paper-deep"]) {
			const ratio = contrast(scheme[ink], scheme[ground]);
			if (ratio < floor) short.push(`${ink} on ${ground}: ${ratio.toFixed(2)}`);
		}
	}
	return short;
}

describe("the dark colour schemes", () => {
	it("each set all twelve colours, so nothing is left at parchment's", () => {
		for (const scheme of [DARK, MIDNIGHT, ASHEN, DARK_HIGH, MIDNIGHT_HIGH, ASHEN_HIGH]) {
			for (const colour of COLOURS) expect(scheme[colour], colour).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it("turn the browser's own controls, the shading and the sheen with the page", () => {
		expect(ROOT).toMatchObject({ "color-scheme": "light", "shade-rgb": "0 0 0", sheen: "1" });
		expect(DARK).toMatchObject({ "color-scheme": "dark", "shade-rgb": "255 255 255" });
		expect(Number(DARK.sheen)).toBeLessThan(0.5);
	});

	it.each(Object.keys(SCHEMES))("%s reads clearly, on the page and on a raised surface", (name) => {
		expect(shortfalls(SCHEMES[name], FLOORS)).toEqual([]);
	});

	it.each(Object.keys(HIGH))("%s with High Contrast reads more clearly still", (name) => {
		const floors = name === "parchment" ? { ink: 12, "ink-soft": 7 } : HIGH_FLOORS;
		expect(shortfalls(HIGH[name], floors)).toEqual([]);
	});

	it("each keeps a page darker than its raised surface, so a button still stands up off it", () => {
		for (const scheme of [...Object.values(SCHEMES), ...Object.values(HIGH).slice(1)]) {
			expect(luminance(scheme["paper-deep"])).toBeGreaterThan(luminance(scheme.paper));
		}
	});
});

describe("cards painted in their own colours", () => {
	const DAYLIGHT = ["morning", "afternoon", "spring", "harvest", "winter"];

	it("keep parchment's coloured inks under a dark scheme, so none of the pale ones lands on their light paper", () => {
		const own = ["paper", "ink", "ink-soft", "rule"];
		for (const name of DAYLIGHT) {
			const card = block(CHAT, `.bastionland-card--${name}`);
			expect(Object.keys(card).filter((token) => COLOURS.includes(token)).sort(), name).toEqual([...own].sort());
		}
		// The rest are given them from the very rule that gives the page parchment's, so there is no copy to drift:
		// every card report.hbs paints in a tone but the Night's, and whatever else is marked painted.
		const pinned = rules(MAIN).find((rule) => rule.selectors.includes(":root") && "blood" in rule.tokens);
		expect(pinned.selectors).toEqual([
			":root",
			":root.bastionland-dark :is(.bastionland-painted, .bastionland-card--painted):not(.bastionland-card--night)",
			":root.bastionland-dark .chat-message:has(.bastionland-card--painted:not(.bastionland-card--night))"
		]);
		expect(REPORT).toContain("bastionland-card--painted bastionland-card--{{tone}}");
		for (const colour of COLOURS.filter((name) => !own.includes(name))) expect(pinned.tokens[colour], colour).toBe(ROOT[colour]);
		expect(pinned.tokens).toMatchObject({ "color-scheme": "light", "shade-rgb": "0 0 0", "sheen-rgb": "255 255 255", sheen: "1" });
		// Nothing later in the cascade gives them anything else.
		const others = [CHAT, TOOLKIT, SETTINGS, TIMELINE].flatMap(rules).filter((rule) => rule.selectors.some((selector) => DAYLIGHT.some((name) => selector.includes(`card--${name}`))));
		for (const rule of others) expect(Object.keys(rule.tokens).filter((token) => COLOURS.includes(token) && !own.includes(token))).toEqual([]);
	});

	it("give the Night card Midnight's coloured inks, which read on its dark paper in any scheme", () => {
		const night = { ...block(CHAT, ".bastionland-card--night"), ...block(SETTINGS, ".bastionland-card--night") };
		expect(night).toEqual({ ...block(CHAT, ".chat-message:has(.bastionland-card--night)"), ...block(SETTINGS, ".chat-message:has(.bastionland-card--night)") });
		for (const colour of COLOURS) expect(night[colour], colour).toMatch(/^#[0-9a-f]{6}$/);
		// Its inks come from Midnight's own rule, and its light from the dark schemes' own.
		const midnight = rules(SETTINGS).find((rule) => rule.selectors.includes(":root.bastionland-dark.bastionland-scheme-midnight") && "blood" in rule.tokens);
		expect(midnight.selectors).toContain(".bastionland-card--night");
		for (const colour of ["paper-deep", "ink", "ink-soft", "ink-faint", "blood", "rubric", "verdigris", "spring", "harvest", "winter"]) {
			expect(night[colour], colour).toBe(MIDNIGHT[colour]);
		}
		expect(night).toMatchObject({ "color-scheme": "dark", "shade-rgb": DARK["shade-rgb"], "sheen-rgb": MIDNIGHT["sheen-rgb"], sheen: DARK.sheen });
		for (const colour of ["blood", "rubric", "verdigris"]) expect(contrast(night[colour], night.paper)).toBeGreaterThanOrEqual(4.5);
	});
});

describe("colours the stylesheets no longer write out", () => {
	const ALL = { "mythic-bastionland.css": MAIN, "chat.css": CHAT, "gm-toolkit.css": TOOLKIT, "timeline.css": TIMELINE };

	/*
	 * Copies of a token's value, which wouldn't turn with the scheme, and white
	 * or black washes laid over the page, which only read on light paper. Each
	 * is written from the tokens now: color-mix() for a token, and
	 * --bastionland-shade-rgb or --bastionland-sheen for a wash.
	 */
	const STALE = [
		/rgb\(138 125 106\b/,
		/rgb\(154 53 32\b/,
		/rgb\(139 30 30\b/,
		/var\(--bastionland-[\w-]+,\s*#/,
		/background:\s*rgb\((0 0 0|255 255 255)\b/,
		/--table-[\w-]+:\s*rgb\(0 0 0\b/,
		/\bcolor-scheme:\s*light\b/,
		/color-mix\([^)]*\b(black|white)\)/
	];

	it.each(Object.keys(ALL))("%s takes them from the tokens", (name) => {
		const lines = ALL[name].split("\n");
		const found = lines.flatMap((line, at) => (STALE.some((pattern) => pattern.test(line)) && !/^\s*--bastionland-color-scheme:/.test(line) ? [`${at + 1}: ${line.trim()}`] : []));
		expect(found).toEqual([]);
	});
});
