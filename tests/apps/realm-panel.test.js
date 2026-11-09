import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BOOK_LANDMARK_TYPES, LANDMARK_TYPES, isBlogLandmark } from "../../module/rules/realm.js";

const root = join(import.meta.dirname, "..", "..");
const template = readFileSync(join(root, "templates/apps/realm-panel.hbs"), "utf8");
const app = readFileSync(join(root, "module/apps/RealmPanel.js"), "utf8");
const styles = readFileSync(join(root, "styles/mythic-bastionland.css"), "utf8");

describe("the Realm's paint palette", () => {
	it("keeps Undo and Redo at the foot of the palette, under everything else", () => {
		const history = template.indexOf("bastionland-realm-panel__history");
		expect(history).toBeGreaterThan(-1);
		expect(template.lastIndexOf("bastionland-realm-panel__palette")).toBeLessThan(history);
		// And held there, however tall the window is dragged.
		expect(styles).toMatch(/\.bastionland-realm-panel__history \{[^}]*margin-top: auto;/);
	});

	it("is only the palette: one hex is changed in the Lay of the Land", () => {
		expect(template).not.toContain("hexMode");
		expect(app).not.toContain("openHexLore");
		expect(app).not.toMatch(/mode === "terrain"/);
		expect(app).toContain("export function openRealmPanel({ scene })");
	});

	it("lets the GM size the window, and fills it when they have", () => {
		expect(app).toMatch(/window: \{[^}]*resizable: true/);
		expect(styles).toMatch(/\.bastionland-realm-panel-window\.is-sized \.window-content \{[^}]*max-height: none;/);
	});

	it("never lays a blog Landmark once the setting is off, though the palette wasn't drawn again", () => {
		// The map's brush reads the Landmark in hand through the one check, not the bare field.
		const layer = readFileSync(join(root, "module/canvas/RealmLayer.js"), "utf8");
		expect(layer).toContain("type: RealmPanel.landmarkInHand()");
		expect(layer).not.toMatch(/RealmPanel\.landmark\b(?!InHand)/);
	});
});

describe("the Landmark in hand", () => {
	let blog;
	let RealmPanel;

	beforeAll(async () => {
		globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (base) => class extends base {} } } };
		vi.doMock("../../module/actions/blog-landmarks.js", () => ({
			offeredLandmarks: () => (blog ? [...LANDMARK_TYPES] : LANDMARK_TYPES.filter((type) => !isBlogLandmark(type)))
		}));
		({ RealmPanel } = await import("../../module/apps/RealmPanel.js"));
	});

	afterAll(() => {
		delete globalThis.foundry;
		vi.doUnmock("../../module/actions/blog-landmarks.js");
	});

	it("keeps a blog Landmark while the setting is on", () => {
		blog = true;
		RealmPanel.landmark = "willow";
		expect(RealmPanel.landmarkInHand()).toBe("willow");
	});

	it("goes back to the first of the book's once the setting is off", () => {
		blog = true;
		RealmPanel.landmark = "pond";
		blog = false;
		expect(RealmPanel.landmarkInHand()).toBe(BOOK_LANDMARK_TYPES[0]);
		expect(RealmPanel.landmark).toBe(BOOK_LANDMARK_TYPES[0]);
	});

	it("keeps a book Landmark and the Referee's own either way", () => {
		blog = false;
		RealmPanel.landmark = "other";
		expect(RealmPanel.landmarkInHand()).toBe("other");
		RealmPanel.landmark = "ruin";
		expect(RealmPanel.landmarkInHand()).toBe("ruin");
	});
});
