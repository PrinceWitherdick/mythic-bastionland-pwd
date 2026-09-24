import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const squire = readFileSync(join(root, "templates/actor/squire-sheet.hbs"), "utf8");
const knight = readFileSync(join(root, "templates/actor/knight-sheet.hbs"), "utf8");
const sheet = readFileSync(join(root, "module/sheets/KnightSheet.js"), "utf8");
// What the Squire's sheet draws from partials rather than markup of its own,
// every one of them shared with the Knight's page.
const scores = readFileSync(join(root, "templates/actor/parts/virtue-scores.hbs"), "utf8");
const chronicle = readFileSync(join(root, "templates/actor/parts/chronicle-tab.hbs"), "utf8");
const shared = ["recovery-list", "age-choices", "gambit-list", "scar-list", "steed-block"];
const parts = Object.fromEntries(shared.map((name) => [name, readFileSync(join(root, `templates/actor/parts/${name}.hbs`), "utf8")]));

describe("the Squire's page", () => {
	it("is what the sheet draws for a Squire, in place of the Knight's", () => {
		expect(sheet).toContain('if (this.actor.system.isSquire) parts.sheet.template = templatePath("actor/squire-sheet.hbs");');
	});

	it("leaves out what a Squire hasn't earned (p7)", () => {
		// Glory and the Rank it buys, the three Feats, the Seer who would Knight
		// them, the successor they can't name, and the oath they haven't sworn.
		for (const missing of [
			"bastionland.glory.label",
			"bastionland.rank.label",
			"bastionland.feats.label",
			"bastionland.seer.label",
			"bastionland.successor.label",
			"bastionland.oath.label"
		]) {
			expect(squire, `a Squire's page still shows ${missing}`).not.toContain(missing);
			expect(knight).toContain(missing);
		}
	});

	it("keeps what anyone in a fight needs", () => {
		for (const part of ['data-action="attack"', 'data-action="duel"', 'data-action="takeDamage"']) expect(squire).toContain(part);
		// Their scores, and the Save each Virtue rolls, come from the partial the Knight's page uses.
		expect(squire).toContain('{{> "bastionland.virtue-scores"}}');
		expect(scores).toContain('data-action="rollSave"');
		expect(squire).toContain("bastionland.conditions.label");
		// Recovery, Scars and the Gambits come from the partials both pages share.
		for (const [name, block] of [["recovery-list", "bastionland.recovery.label"], ["scar-list", "bastionland.scars.label"], ["gambit-list", "bastionland.gambits.label"]]) {
			expect(squire, `a Squire's page draws ${name}`).toContain(`{{> "bastionland.${name}"}}`);
			expect(parts[name], `${name} holds ${block}`).toContain(block);
		}
	});

	it("carries their own Property, their pony and whom they serve", () => {
		expect(squire).toContain("bastionland.property.label");
		expect(squire).toContain('{{> "bastionland.steed-block"}}');
		expect(parts["steed-block"]).toContain("bastionland.steed.label");
		expect(squire).toContain("bastionland.squire.servesLabel");
		expect(squire).toContain('data-action="openSquire"');
	});

	it("says what being a Squire costs them, where a Knight's page keeps their Rank", () => {
		expect(squire).toContain("bastionland.squire.hint");
	});

	it("is one page: no Property page, no Seer page", () => {
		expect(squire).toContain('data-tab="squire"');
		for (const tab of ['data-tab="knight"', 'data-tab="property"', 'data-tab="seer"']) expect(squire).not.toContain(tab);
		expect(chronicle).toContain('data-tab="chronicle"');
		expect(squire).toContain('data-tab="settings"');
	});

	it("shares the Chronicle page with the Knight's sheet", () => {
		for (const template of [squire, knight]) expect(template).toContain('{{> "bastionland.chronicle-tab"}}');
	});
});

describe("the Knight's page", () => {
	it("no longer branches on a Squire, who has a page of their own", () => {
		expect(knight).not.toContain("isSquire");
	});
});
