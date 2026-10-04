import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const npc = readFileSync(join(root, "templates/actor/npc-sheet.hbs"), "utf8");
const structure = readFileSync(join(root, "templates/actor/structure-sheet.hbs"), "utf8");

describe("the NPC sheet's Counts as a structure tick", () => {
	it("binds system.structure, which the Attack, Damage and Morale rules read", () => {
		expect(npc).toMatch(/<input type="checkbox" name="system\.structure" \{\{checked system\.structure\}\} \{\{#unless editable\}\}disabled\{\{\/unless\}\}>/);
		expect(npc).toContain("bastionland.npc.structureHint");
	});

	it("shows whether or not the NPC has an Age or a way of wielding", () => {
		// The block it sits in used to be drawn only for those.
		expect(npc).not.toContain("{{#if (or ages.length wields.length)}}");
	});

	it("isn't on a Structure's own sheet, which is one already", () => {
		expect(structure).not.toContain('name="system.structure"');
	});
});
