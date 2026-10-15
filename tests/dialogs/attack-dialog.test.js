import { readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const template = readFileSync(join(root, "templates/dialogs/attack.hbs"), "utf8");

describe("the Attack dialog's Impaired", () => {
	it("is never asked for, since the sheet and the marks on it already say", () => {
		expect(template).not.toMatch(/name="impaired"/);
	});

	it("tells the player what an Impaired Attack rolls, when they are Impaired", () => {
		expect(template).toContain('{{#if impaired}}\n\t\t<p class="hint">{{localize "bastionland.attack.impaired"}}</p>');
	});
});

describe("what the Attack dialog shows", () => {
	const handlebars = Handlebars.create();
	handlebars.registerHelper("localize", (key) => key);
	handlebars.registerHelper("checked", (value) => (value ? "checked" : ""));
	handlebars.registerHelper("disabled", (value) => (value ? "disabled" : ""));
	const render = (context) => handlebars.compile(template)({ sources: [], abilityOffers: [], declarations: [], woundEffects: [], ...context });

	it("folds Confined, Spearwall and the declarations away, open only where Confined was remembered", () => {
		const html = render({ declarations: [{ key: "blast", label: "Blast", hint: "" }] });
		const fold = html.slice(html.indexOf("<details"), html.indexOf("</details>"));
		expect(fold).toContain('name="confined"');
		expect(fold).toContain('name="spearwall"');
		expect(fold).toContain('name="declare.blast"');
		expect(html).toContain('<details class="bastionland-attack__more" >');
		expect(render({ moreOpen: true, confined: true })).toContain('<details class="bastionland-attack__more" open>');
	});

	it("offers keeping the bonus dice only in a Combat, and Smite only to somebody who knows it", () => {
		expect(render({ canKeep: false })).not.toContain('name="keepBonus"');
		expect(render({ canKeep: true })).toContain('name="keepBonus"');
		expect(render({ smiteKnown: false })).not.toContain('name="smite"');
		expect(render({ smiteKnown: true, smiteDisabled: true })).toMatch(/name="smite" disabled/);
	});

	it("leaves out the Abilities' fieldset where no Ability lends the blow anything", () => {
		expect(render({})).not.toContain("bastionland.attack.declared");
		expect(render({ abilityOffers: [{ id: "a", label: "Thunder Strike: Blast", hint: "", effects: [] }] })).toContain("bastionland.attack.declared");
	});
});
