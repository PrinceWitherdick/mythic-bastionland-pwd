import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(root, "styles", "timeline.css"), "utf8");

/** The body of the rule whose selector list ends with `selector`. */
const ruleOf = (selector) => {
	const at = css.indexOf(`${selector} {`);
	return at === -1 ? null : css.slice(at, css.indexOf("\n}", at));
};

describe("the corner over the Season column, read down", () => {
	// User, 2026-10-10: on the page's sheen the corner stood out as a box in the top left.
	// User, 2026-10-12: but a plain page didn't match the other tabs. So the page keeps its sheen,
	// and the backings wear it too, laid where the page's lies behind them.
	it("is painted the page's own colour, sheen and all", () => {
		expect(ruleOf(".bastionland-timeline__corner,\n.bastionland-timeline__board > .bastionland-timeline__lane-head")).toMatch(/background: var\(--timeline-backing\);/);
		for (const backing of [".bastionland-timeline__swim-age", ".bastionland-timeline__swim-lane-head"]) expect(ruleOf(backing)).toMatch(/background: var\(--timeline-backing\);/);
		// The one sheen the page wears, so retuning it retunes the backings too.
		expect(ruleOf(".bastionland-timeline__canvas")).toContain("--timeline-backing: var(--bastionland-page-sheen) 0 0 / 0 0 no-repeat, var(--bastionland-paper);");
		expect(readFileSync(join(root, "styles", "mythic-bastionland.css"), "utf8")).toMatch(/\.bastionland-page \{[^}]*background:\s*var\(--bastionland-page-sheen\),\s*var\(--bastionland-paper\);/);
	});

	it("sits on a page with the sheen every other page has", () => {
		expect(ruleOf(".bastionland-gm-toolkit .bastionland-gm-toolkit__page.bastionland-timeline")).not.toMatch(/background/);
		expect(ruleOf(".bastionland-timeline--tab .bastionland-timeline__scroll")).not.toMatch(/background/);
	});
});

describe("the scrub under the board", () => {
	// Review, 2026-10-12: pulled up by its page's own gap, not a copy of each host's.
	it("is pulled up by the gap its page parts its rows by", () => {
		expect(ruleOf(".bastionland-timeline__scroll + .bastionland-timeline__scrub")).toContain("margin-top: calc(-1 * var(--bastionland-page-gap, 1rem));");
		expect(css).toContain(".bastionland-timeline--tab {\n\tgap: var(--bastionland-page-gap, 1rem);\n}");
		expect(readFileSync(join(root, "styles", "gm-toolkit.css"), "utf8")).toMatch(/\.bastionland-gm-toolkit__page \{\s*--bastionland-page-gap: [\d.]+rem;/);
	});
});

describe("the Down and Across buttons", () => {
	// User, 2026-10-10: which way the Timeline is laid wasn't plain to see; the pressed one wore
	// the base button's own deep paper, with only its glyph turned red.
	it("fill the one in use with ink, and leave the other on the plain page", () => {
		expect(ruleOf('.bastionland-timeline__layout > .bastionland-button[aria-pressed="true"]')).toMatch(/background: var\(--bastionland-ink\);[\s\S]*color: var\(--bastionland-paper\);/);
		expect(ruleOf(".bastionland-timeline__layout > .bastionland-button")).toMatch(/background: var\(--bastionland-paper\);/);
	});
});
