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
	it("is painted the page's own colour", () => {
		expect(ruleOf(".bastionland-timeline__corner,\n.bastionland-timeline__board > .bastionland-timeline__lane-head")).toMatch(/background: var\(--bastionland-paper\);/);
	});

	// User, 2026-10-10: on the page's sheen the corner stood out as a box in the top left.
	// Stonetop's page is plain, so its corner can't be seen until something slides under it.
	it("sits on a page with no sheen, so it can't be told from the page", () => {
		const page = ruleOf(".bastionland-gm-toolkit .bastionland-gm-toolkit__page.bastionland-timeline");
		expect(page).toMatch(/background: var\(--bastionland-paper\);/);
		expect(page).not.toMatch(/gradient/);
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
