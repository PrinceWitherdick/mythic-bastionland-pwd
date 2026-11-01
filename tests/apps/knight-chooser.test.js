import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const app = read("module/apps/KnightChooser.js");
const template = read("templates/apps/knight-chooser.hbs");
const realm = read("module/actions/realm.js");
const newKnight = read("module/actions/new-knight.js");
const styles = read("styles/mythic-bastionland.css");
const lang = JSON.parse(read("languages/en.json"));

describe("the Start a new Knight's chooser opens on", () => {
	it("is remembered on the Realm, whether or not the Company is put on the map, and drawn by hand too (p6)", () => {
		expect(realm).toContain("...(begins ? startFlags(begins, drawing) : {}),");
		expect(realm).toContain("[`flags.${SYSTEM_ID}.${COMPANY_START_FLAG}`]: start,");
		expect(realm).toContain("const start = !draw && COMPANY_STARTS.includes(data.start) ? data.start : firstStart;");
		expect(realm).toContain("if (begins && !drawing) await announceStart(scene, begins);");
		// Drawn by hand, the Company's page sets it, and Finish announces it.
		expect(realm).toContain("await scene.update(startFlags(start, isDrawingRealm(scene)));");
		expect(realm).toContain("...(drawing ? { [`flags.${SYSTEM_ID}.${START_DUE_FLAG}`]: start } : {})");
		expect(read("module/apps/RealmDrawing.js")).toContain("(start) => setRealmStart(canvas.scene, start)");
		expect(read("templates/apps/realm-drawing.hbs")).toContain('name="companyStart"');
	});

	it("is the Start the Realms remember, or the book's \"if unsure\" where none does", () => {
		expect(app).toContain("this.#start = isNpcKnight(this.actor) ? NPC_KNIGHT_START : replacement ? DEFAULT_START : companyStartKey();");
		expect(app).toContain(".filter((scene) => scene.getFlag(SYSTEM_ID, COMPANY_START_FLAG))");
		expect(app).toContain("viewed: scene.id === viewed, active: scene.active");
		expect(app).toContain("return realmStart(realms) ?? DEFAULT_START;");
	});

	it("is Wanderer for a Knight made in place of one who fell, a Young Knight-Errant (p195)", () => {
		expect(newKnight).toContain("openKnightChooser(created, { fresh: true, companyGlory, replacement });");
		expect(app).toContain("new KnightChooser({ actor, fresh, knighting, companyGlory, replacement })");
	});
});

describe("the Glory a Knight made in place of one who fell may start with (p195)", () => {
	it("comes from the fallen Knight's card through to the chooser", () => {
		expect(newKnight).toContain("openKnightChooser(created, { fresh: true, companyGlory, replacement });");
		expect(app).toContain("new KnightChooser({ actor, fresh, knighting, companyGlory, replacement })");
	});

	it("is offered against the Start chosen, and never to a Squire just Knighted", () => {
		expect(app).toContain("return this.#knighting ? null : replacementGlory(this.#companyGlory, startFor(this.#start).glory);");
	});

	it("shows a Glory box under the Starts only where it's offered", () => {
		expect(template).toMatch(/\{\{#if glory\}\}[\s\S]*name="glory" value="\{\{glory\.value\}\}"[\s\S]*\{\{glory\.hint\}\}[\s\S]*\{\{\/if\}\}\s*<\/section>/);
		expect(styles).toContain(".bastionland-chooser__glory {");
		expect(lang.bastionland.chooser.glory.hint).toContain("{glory}");
		expect(lang.bastionland.chooser.glory.hint).toContain("(p195)");
	});

	it("keeps what's typed, and goes back to what's suggested when it's cleared", () => {
		expect(app).toContain('if ("glory" in formData.object) {');
		expect(app).toContain("this.#glory = Number.isFinite(glory) ? Math.max(0, Math.trunc(glory)) : null;");
	});

	it("is given to the Knight in place of the Start's Glory", () => {
		expect(app).toContain('if (offer) update["system.glory"] = this.#glory ?? offer.suggested;');
		// Set before the Knight is made or filled in, which both take the one update.
		expect(app.indexOf('update["system.glory"]')).toBeLessThan(app.indexOf("createKnightWithCompanions({ name, update, items })"));
	});
});

describe("10 is average (p177)", () => {
	it("is said under the Virtues", () => {
		expect(template).toMatch(/chooser\.scoresHint"\}\}<\/p>\s*<p class="bastionland-hint">\{\{localize "bastionland\.chooser\.averageHint"\}\}<\/p>/);
		expect(lang.bastionland.chooser.averageHint).toMatch(/10 is an average Virtue \(p177\)/);
	});
});
