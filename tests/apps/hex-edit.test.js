import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const template = read("templates/apps/parts/hex-edit.hbs");
const gm = read("templates/apps/parts/hex-gm.hbs");
const gmPart = read("module/apps/hex-gm-part.js");
const places = read("module/apps/TravelsPlaces.js");
const app = read("module/apps/hex-edit.js");
const editor = read("module/apps/HexEditor.js");
const detail = read("templates/apps/parts/travels-hex-detail.hbs");
const layer = read("module/canvas/RealmLayer.js");
const toolkit = read("module/sheets/GmToolkitSheet.js");
const hooks = read("module/canvas/realm-hooks.js");
const styles = read("styles/mythic-bastionland.css");
const boot = read("mythic-bastionland.js");

describe("Edit this hex, opened from the pen beside a hex in Places", () => {
	it("is what Inspect and Show on the map open, with no window of its own beside Places", () => {
		expect(existsSync(join(root, "module/apps/HexLore.js"))).toBe(false);
		expect(existsSync(join(root, "templates/apps/hex-lore.hbs"))).toBe(false);
		expect(layer).toMatch(/if \(this\.tool === "inspect"\) \{[\s\S]*?if \(hex\) openHex\(\{ scene, hex \}\);/);
		expect(toolkit).toContain("if (await viewAndShowHex(scene, hex)) openHex({ scene, hex });");
		expect(toolkit).not.toContain("openRealmPanel");
		// Old macros that opened the window open the hex in Places.
		expect(boot).toContain("openHexLore: openHex,");
	});

	it("is a window of its own, no longer a fold of the Lay of the Land", () => {
		expect(boot).not.toContain('"bastionland.hex-edit"');
		expect(gm).not.toContain("bastionland.hex-edit");
		expect(gmPart).not.toContain("hexEditContext");
		expect(template).not.toContain("<details");
		expect(editor).toContain('body: { template: templatePath("apps/parts/hex-edit.hbs") }');
		expect(editor).toMatch(/export async function openHexEditor\(\{ scene, hex \}\) \{\s*if \(!game\.user\?\.isGM/);
		// Only a GM's Places builds the pen, as only a GM's builds the Lay of the Land.
		expect(gmPart).toMatch(/export function hexGmContext\([^)]*\) \{\s*if \(!game\.user\?\.isGM\) return null;/);
	});

	it("is opened by a pen beside the hex's terrain, shown on hover", () => {
		expect(detail).toMatch(/<button type="button" class="bastionland-icon bastionland-travels-hex__edit bastionland-reveal" data-action="editHex"/);
		expect(detail).toContain('<div class="bastionland-hex-lore__here{{#if gm}} bastionland-reveal-host{{/if}}">');
		// A hex the players don't know has the pen beside the line saying so.
		expect(detail).toContain('<div class="bastionland-hex-lore__row{{#if gm}} bastionland-reveal-host{{/if}}">');
		expect(gmPart).toContain("editHex: ({ scene, hex }) => openHexEditor({ scene, hex }),");
		expect(places).toContain("hexGm = hexGmState();");
	});

	it("has an action for every button it draws", () => {
		const drawn = new Set([...template.matchAll(/data-action="([^"]+)"/g)].map(([, action]) => action));
		// Its own, or those it shares with the Lay of the Land.
		const shared = app.slice(app.indexOf("export const HEX_FEATURE_ACTIONS"));
		expect(editor).toContain("...Object.fromEntries(Object.entries(HEX_FEATURE_ACTIONS).map(");
		expect(gmPart).toContain("...HEX_FEATURE_ACTIONS,");
		for (const action of drawn) expect(`${editor}\n${shared}`, action).toMatch(new RegExp(`\\b${action}: (HexEditor\\.#at\\(|\\(\\{ scene, hex \\})`));
	});

	it("names its fields so they never clash with the note or the Landmark's name", () => {
		expect(template).toContain('name="holdingName"');
		expect(template).not.toMatch(/name="name"/);
		// The Landmark's name stays in the Lay of the Land's own box, with its die.
		expect(gm).toContain('name="landmarkName"');
		expect(app).toContain('case "holdingName":');
		expect(app).toContain("if (!HEX_EDIT_FIELDS.includes(name) || !game.user.isGM) return;");
		expect(editor).toContain("const written = await writeHexEditField(scene, this.hex, field);");
	});

	it("names the barred edges on one line, and leaves the laying to the brush", () => {
		expect(template).toMatch(/<p class="bastionland-hex-edit__barriers">/);
		expect(app).toContain("barriersAround(known, g, hex, { showHidden: true })");
	});

	it("rolls a Myth the Realm hasn't got, and leaves the fields beside the die to set one by hand", () => {
		expect(app).toContain("const roll = rollFreeMyth(createRandom(randomSeed()), getRealm(scene)?.realm?.myths);");
		expect(template).toContain('<input id="{{@root.partId}}-d6" type="number" name="d6"');
	});

	it("moves a Myth here from another hex once all six stand, asking which on a radio list", () => {
		expect(app).toMatch(/if \(kind !== "myth" \|\| !realm \|\| featureAt\(realm, hex\)\.myth \|\| unusedMythNumbers\(realm\)\.length\) return writeHexField\(scene, hex, "kind", kind\);/);
		expect(app).toContain('return editRealm(scene, (realm, g) => placeFeature(realm, g, hex, { kind: "myth", number }));');
		const dialog = read("templates/dialogs/move-myth.hbs");
		// The book's radio list, with no blank one to choose.
		expect(dialog).toContain('{{> "bastionland.pick-list" name="myth" choices=myths legend=');
		expect(dialog).not.toContain("blankLabel");
		// Shut unchosen, the select goes back to what stands in the hex.
		expect(editor).toContain('if (field.name === "kind" && !written) field.value = field.querySelector("option[selected]")?.value ?? "none";');
	});

	it("keeps Undo and Redo last in the window, and current as the Realm's history moves", () => {
		const history = template.indexOf("bastionland-hex-edit__history");
		expect(history).toBeGreaterThan(template.indexOf("bastionland-hex-edit__barriers"));
		expect(hooks).toMatch(/Hooks\.on\(REALM_HISTORY_HOOK, \(sceneId\) => \{[^}]*refreshHexEditor\(sceneId\);/);
		expect(styles).toMatch(/\.bastionland-hex-edit__history \{/);
	});

	it("is drawn again as the Realm changes, and Places while it is drawn by hand", () => {
		expect(hooks).toMatch(/refreshMythChooser\(sceneId\);\s*refreshHexEditor\(sceneId\);/);
		expect(hooks).toMatch(/if \(isDrawingRealm\(game\.scenes\.get\(sceneId\)\)\) refreshPlaces\(sceneId\);\s*else Hooks\.callAll\(TRAVELS_CHANGED_HOOK, sceneId\);/);
	});
});

describe("Forgetting what's kept in a hex, from the Journey page and the visits line", () => {
	const forget = read("module/apps/hex-forget.js");
	const list = read("templates/apps/parts/travels-list.hbs");

	it("has no fold of its own in the Lay of the Land, nor a window", () => {
		expect(existsSync(join(root, "module/apps/HexVisits.js"))).toBe(false);
		expect(existsSync(join(root, "templates/apps/hex-visits.hbs"))).toBe(false);
		expect(gm).not.toContain("data-hex-forget");
		expect(gm).not.toContain("forgetVisit");
		expect(gmPart).toContain("forget: hexForgetContext(scene, hex)");
		expect(gmPart).not.toContain("state.forget");
		expect(places).not.toContain("hexGm.forget");
		expect(styles).not.toContain("bastionland-hex-forget");
	});

	it("forgets every visit, or everything, from two icons on the visits line", () => {
		for (const action of ["forgetVisits", "forgetAll"]) {
			expect(forget).toMatch(new RegExp(`\\b${action}\\b`));
			expect(detail).toContain(`data-action="${action}"`);
		}
		expect(forget).not.toMatch(/\bforgetVisit\b/);
		expect(detail).toMatch(/\{\{#with gm\.forget\}\}\s*<span class="bastionland-travels-hex__forget">/);
		expect(gmPart).toContain("...HEX_FORGET_ACTIONS");
	});

	it("forgets one line of the journey by its ×, for a GM in Places alone", () => {
		expect(list).toMatch(/\{\{#with forget\}\}\s*<button type="button" class="bastionland-icon bastionland-travels-journey__forget bastionland-reveal" data-action="forgetJourney"/);
		expect(places).toContain("forgetJourney: forgetJourneyLine,");
		expect(places).toMatch(/function forgetJourneyLine\(_event, target\) \{\s*if \(!game\.user\.isGM\) return;/);
		for (const kind of ["arrived", "told", "met", "noted"]) expect(places).toMatch(new RegExp(`\\b${kind}[(:]`));
		expect(read("module/actions/travels.js")).toContain("journeyContext(journeyLog(sources, viewOf), Boolean(gmPart))");
	});
});
