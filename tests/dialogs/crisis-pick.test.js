import { readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";
import { CRISES } from "../../module/rules/dominion.js";

const root = join(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8");

const handlebars = Handlebars.create();
handlebars.registerHelper("checked", (value) => (value ? "checked" : ""));
handlebars.registerPartial("bastionland.pick-list", read("templates/dialogs/parts/pick-list.hbs"));
const choices = CRISES.map((id) => ({ id, name: id, detail: "How it's resolved" }));

describe("the Crisis picker", () => {
	it("shows all six Crises at full length, with no scrollbar of its own", () => {
		const html = handlebars.compile(read("templates/dialogs/crisis-pick.hbs"))({ intro: "Which?", crises: choices });
		expect(html).toContain('class="bastionland-choice-list bastionland-choice-list--full"');
		for (const id of CRISES) expect(html).toContain(`value="${id}"`);
	});

	it("is joined by the Domain's other short lists: its arms and a Warband's upkeep", () => {
		for (const path of ["templates/dialogs/domain-arms.hbs", "templates/dialogs/upkeep.hbs"]) {
			expect(read(path)).toContain('class="bastionland-choice-list bastionland-choice-list--full"');
		}
	});

	it("leaves other pick lists to scroll when long", () => {
		const html = handlebars.compile('{{> "bastionland.pick-list" name="x" legend="L" choices=choices}}')({ choices });
		expect(html).toContain('class="bastionland-choice-list"');
	});
});
