import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const template = readFileSync(join(root, "templates/apps/realm-panel.hbs"), "utf8");
const app = readFileSync(join(root, "module/apps/RealmPanel.js"), "utf8");
const styles = readFileSync(join(root, "styles/mythic-bastionland.css"), "utf8");

describe("the Realm's Hex panel", () => {
	it("keeps Undo and Redo at the foot of the panel, under everything else", () => {
		const history = template.indexOf("bastionland-realm-panel__history");
		expect(history).toBeGreaterThan(-1);
		// Below the palette the Realm is painted from and below the one hex's own fields.
		for (const above of ["bastionland-realm-panel__palette", "bastionland-realm-panel__barriers", "bastionland-realm-panel__actions"]) {
			expect(template.lastIndexOf(above)).toBeLessThan(history);
		}
		// And held there, however tall the window is dragged.
		expect(styles).toMatch(/\.bastionland-realm-panel__history \{[^}]*margin-top: auto;/);
	});

	it("names the barred edges on one line, and leaves the laying to the brush", () => {
		expect(template).toMatch(/<p class="bastionland-realm-panel__barriers">/);
		expect(template).not.toContain("cycleBarrier");
		expect(app).not.toContain("cycleBarrier");
		// The one hex only reports them, so the edges that are clear are not listed.
		expect(app).toContain("barriersAround(known, g, hex, { showHidden: true })");
	});

	it("leaves the Company to the map and the Toolkit", () => {
		expect(template).not.toContain('data-action="company"');
		expect(app).not.toContain("companyHere");
	});

	it("rolls a Myth the Realm hasn't got, and leaves the fields beside the die to set one by hand", () => {
		expect(app).toContain("const roll = rollFreeMyth(createRandom(randomSeed()), getRealm(this.scene)?.realm?.myths);");
		// The d6 and d12 fields are still the GM's to type into, duplicate or not.
		expect(template).toContain('<input id="{{partId}}-d6" type="number" name="d6"');
	});

	it("lets the GM size the window, and fills it when they have", () => {
		expect(app).toMatch(/window: \{[^}]*resizable: true/);
		expect(styles).toMatch(/\.bastionland-realm-panel-window\.is-sized \.window-content \{[^}]*max-height: none;/);
		// The width is only set as the panel changes between one hex and the palette, so a size of the GM's own stands.
		expect(app).toMatch(/if \(this\.#shown === this\.mode\) return;/);
	});
});
