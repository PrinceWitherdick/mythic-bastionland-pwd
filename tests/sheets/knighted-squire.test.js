import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const chooser = read("module/apps/KnightChooser.js");
const actions = read("module/actions/squires.js");
const sheet = read("module/sheets/KnightSheet.js");
const template = read("templates/apps/knight-chooser.hbs");

/** @returns {string} The body of the chooser's Knighted-Squire Apply. */
const applyKnighted = () => {
	const start = chooser.indexOf("async #applyKnighted(");
	return chooser.slice(start, chooser.indexOf("\n\t}\n", start));
};

describe("a Squire just Knighted", () => {
	it("is marked as still to choose their Knight, and the chooser opens for them keeping everything", () => {
		expect(actions).toMatch(/\[`flags\.\$\{SYSTEM_ID\}\.\$\{CHOOSING_FLAG\}`\]: true/);
		expect(actions).toMatch(/openKnightChooser\(knight, \{ knighting: true \}\)/);
	});

	it("chooses their Knight without losing a thing they carry, their scores, or their companions", () => {
		const body = applyKnighted();
		expect(body).not.toBe("");
		for (const gone of ["deleteEmbeddedDocuments", "clearCompanions", "knightUpdate", "system.virtues", "system.guard", "system.age", "system.glory"]) {
			expect(body, gone).not.toContain(gone);
		}
		expect(body).toContain("itemsGained(");
		expect(body).toMatch(/CHOOSING_FLAG\}`\] = false/);
	});

	it("isn't asked for a Start or Virtues", () => {
		expect(template).toMatch(/\{\{#if knighting\}\}[\s\S]*knighted\.heading[\s\S]*\{\{else\}\}[\s\S]*chooser\.start"/);
	});

	it("has the sheet's header open that chooser until they've chosen", () => {
		expect(sheet).toMatch(/isChoosingKnight\(this\.actor\)\s*\?\s*\{ action: "chooseKnighted"/);
		expect(sheet).toMatch(/openKnightChooser\(this\.actor, \{ knighting: true \}\)/);
	});
});
