import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOLKIT_TABS } from "../../module/rules/gm-toolkit.js";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const sheet = read("module/sheets/GmToolkitSheet.js");
const page = read("templates/actor/gm-toolkit/timeline.hbs");
const timePage = read("templates/actor/gm-toolkit/time.hbs");
const windowPage = read("templates/apps/timeline.hbs");

describe("the Referee Toolkit's Timeline page", () => {
	it("is a page on the rail, after Time", () => {
		expect(TOOLKIT_TABS.indexOf("timeline")).toBe(TOOLKIT_TABS.indexOf("time") + 1);
		expect(page).toContain('data-tab="timeline"');
	});

	it("shows the board the Timeline window shows", () => {
		expect(page).toContain('{{~> "bastionland.timeline-board"}}');
		expect(windowPage).toContain('{{~> "bastionland.timeline-board"}}');
		expect(sheet).toMatch(/TimelineTabMixin\(.*\{ board: true \}\)/);
	});

	it("takes the place of the Time page's button", () => {
		expect(timePage).not.toContain("openTimeline");
		expect(sheet).not.toContain("openTimeline");
	});
});
