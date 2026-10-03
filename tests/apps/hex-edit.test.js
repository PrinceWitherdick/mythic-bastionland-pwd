import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const template = read("templates/apps/parts/hex-edit.hbs");
const lore = read("templates/apps/hex-lore.hbs");
const loreApp = read("module/apps/HexLore.js");
const app = read("module/apps/hex-edit.js");
const layer = read("module/canvas/RealmLayer.js");
const toolkit = read("module/sheets/GmToolkitSheet.js");
const hooks = read("module/canvas/realm-hooks.js");
const styles = read("styles/mythic-bastionland.css");
const boot = read("mythic-bastionland.js");

describe("Edit this hex, in the Lay of the Land", () => {
	it("is what Inspect and Show on the map open, with no Hex panel beside it", () => {
		expect(layer).toMatch(/if \(this\.tool === "inspect"\) \{[\s\S]*?if \(hex\) openHexLore\(\{ scene, hex \}\);/);
		expect(layer).not.toContain("followHexLore");
		expect(loreApp).not.toContain("followHexLore");
		expect(toolkit).toMatch(/await showHexOnMap\(scene, hex\);\s*openHexLore\(\{ scene, hex \}\);/);
		expect(toolkit).not.toContain("openRealmPanel");
	});

	it("is a fold of the Lay of the Land, the GM's alone, open while the Realm is drawn", () => {
		expect(boot).toContain('"bastionland.hex-edit": templatePath("apps/parts/hex-edit.hbs")');
		expect(lore).toContain('{{#with edit}}{{> "bastionland.hex-edit"}}{{/with}}');
		expect(template).toMatch(/<details class="bastionland-hex-edit" data-hex-edit \{\{#if open\}\}open\{\{\/if\}\}>/);
		expect(loreApp).toContain("const edit = game.user.isGM ? hexEditContext({ scene, realm, known, g, hex, index: this.#index }) : null;");
		expect(loreApp).toContain("edit.open = this.#editOpen ?? isDrawingRealm(scene);");
	});

	it("keeps the fold as the GM left it, not as the browser's own toggle on drawing it open", () => {
		expect(loreApp).toContain("let shown = Boolean(context.edit?.open);");
		expect(loreApp).toMatch(/if \(fold\.open === shown\) return;\s*shown = fold\.open;\s*this\.#editOpen = fold\.open;/);
	});

	it("names its fields so they never clash with the note or the Landmark's name", () => {
		expect(template).toContain('name="holdingName"');
		expect(template).not.toMatch(/name="name"/);
		// The Landmark's name stays in the Lay of the Land's own box, with its die.
		expect(lore).toContain('name="landmarkName"');
		expect(app).toContain('case "holdingName":');
		expect(loreApp).toContain("HEX_EDIT_FIELDS.includes(field) && game.user.isGM");
	});

	it("names the barred edges on one line, and leaves the laying to the brush", () => {
		expect(template).toMatch(/<p class="bastionland-hex-edit__barriers">/);
		expect(app).toContain("barriersAround(known, g, hex, { showHidden: true })");
	});

	it("rolls a Myth the Realm hasn't got, and leaves the fields beside the die to set one by hand", () => {
		expect(app).toContain("const roll = rollFreeMyth(createRandom(randomSeed()), getRealm(scene)?.realm?.myths);");
		expect(template).toContain('<input id="{{@root.partId}}-d6" type="number" name="d6"');
	});

	it("keeps Undo and Redo last in the fold, and current as the Realm's history moves", () => {
		const history = template.indexOf("bastionland-hex-edit__history");
		expect(history).toBeGreaterThan(template.indexOf("bastionland-hex-edit__barriers"));
		expect(hooks).toMatch(/Hooks\.on\(REALM_HISTORY_HOOK, \(sceneId\) => \{[^}]*refreshHexLore\(sceneId\);/);
		expect(styles).toMatch(/\.bastionland-hex-edit__history \{/);
	});
});
