import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
});
