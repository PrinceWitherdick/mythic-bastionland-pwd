import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { realmGeometry } from "../../module/rules/realm-geometry.js";
import { DEFAULT_VISITED_MARK_COLOURS, VISITED_MARK_STYLES } from "../../module/rules/visited-mark-style.js";

class FakeApplication {}
globalThis.foundry = { applications: { api: { ApplicationV2: FakeApplication, HandlebarsApplicationMixin: (Base) => class extends Base {} } } };
globalThis.game = { i18n: { localize: (key) => key, format: (key, data) => `${key} ${JSON.stringify(data)}` } };

vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: () => false, sceneGeometry: () => null }));
vi.mock("../../module/canvas/travels-controls.js", () => ({ refreshTravelsButtons: () => {} }));

const { visitedMarkSamples } = await import("../../module/apps/VisitedMarks.js");

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

describe("the Visited Marks window", () => {
	it("shows each mark on a hex of its own, in its colour, with the chosen one picked", () => {
		const samples = visitedMarkSamples(realmGeometry({ cols: 1, rows: 1 }), { ...DEFAULT_VISITED_MARK_COLOURS, cross: "#010203" }, "cross");
		expect(samples.map((sample) => sample.style)).toEqual(VISITED_MARK_STYLES);
		expect(samples.filter((sample) => sample.selected).map((sample) => sample.style)).toEqual(["cross"]);
		const cross = samples.find((sample) => sample.style === "cross");
		expect(cross.colour).toBe("#010203");
		expect(cross.path.match(/M/g)).toHaveLength(2);
		expect(cross.halo).toBeGreaterThan(0);
		expect(samples.find((sample) => sample.style === "edge").path).toMatch(/Z$/);
		// Every sample sits in one view of the same hex.
		expect(new Set(samples.map((sample) => sample.viewBox)).size).toBe(1);
	});

	it("is offered on the Settings page, and by right-clicking the footprints", () => {
		expect(read("module/rules/settings-tab.js")).toContain('menus: ["visitedMarks"]');
		expect(read("module/canvas/travels-controls.js")).toContain("}, openVisitedMarks),");
		const lang = JSON.parse(read("languages/en.json")).bastionland.travels.marks;
		for (const style of VISITED_MARK_STYLES) expect(lang.styles[style].label).toBeTruthy();
	});
});
