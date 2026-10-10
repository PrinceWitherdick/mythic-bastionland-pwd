import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = join(import.meta.dirname, "..", "..", "styles");
const read = (name) => readFileSync(join(styles, name), "utf8");
const MAIN = read("mythic-bastionland.css");
const SETTINGS = read("settings.css");
const CHAT = read("chat.css");
const TOOLKIT = read("gm-toolkit.css");

/** The twelve colours every scheme sets. */
const COLOURS = [
	"paper", "paper-deep", "ink", "ink-soft", "ink-faint", "rule",
	"blood", "rubric", "verdigris", "spring", "harvest", "winter"
];

/**
 * The custom properties a rule declares, by name without the `--bastionland-`.
 * @param {string} css
 * @param {string} selector Exactly as the stylesheet writes it.
 * @returns {Record<string, string>}
 */
function block(css, selector) {
	const start = css.indexOf(`${selector} {`);
	expect(start, `${selector} is in the stylesheet`).toBeGreaterThanOrEqual(0);
	const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
	return Object.fromEntries([...body.matchAll(/--bastionland-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
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
	it("keep parchment's coloured inks under a dark scheme, so none of the pale ones lands on their light paper", () => {
		const start = CHAT.indexOf(":root.bastionland-dark :is(\n\t.bastionland-card--morning");
		expect(start).toBeGreaterThanOrEqual(0);
		const body = CHAT.slice(CHAT.indexOf("{", CHAT.indexOf(")) {", start)) + 1, CHAT.indexOf("}", CHAT.indexOf(")) {", start)));
		const pinned = Object.fromEntries([...body.matchAll(/--bastionland-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
		for (const colour of COLOURS.filter((name) => !["paper", "ink", "ink-soft", "rule"].includes(name))) {
			expect(pinned[colour], colour).toBe(ROOT[colour]);
		}
		expect(pinned).toMatchObject({ "color-scheme": "light", "shade-rgb": ROOT["shade-rgb"], "sheen-rgb": ROOT["sheen-rgb"], sheen: ROOT.sheen });
	});

	it("give the Night card Midnight's coloured inks, which read on its dark paper in any scheme", () => {
		const night = block(CHAT, ".bastionland-card--night,\n.chat-message:has(.bastionland-card--night)");
		for (const colour of ["paper-deep", "ink-faint", "blood", "rubric", "verdigris", "spring", "harvest", "winter"]) {
			expect(night[colour], colour).toBe(MIDNIGHT[colour]);
		}
		for (const colour of ["blood", "rubric", "verdigris"]) expect(contrast(night[colour], night.paper)).toBeGreaterThanOrEqual(4.5);
	});
});

describe("colours the stylesheets no longer write out", () => {
	const ALL = { "mythic-bastionland.css": MAIN, "chat.css": CHAT, "gm-toolkit.css": TOOLKIT };

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
