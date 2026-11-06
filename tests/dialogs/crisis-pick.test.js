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
		const html = handlebars.compile(read("templates/dialogs/pick-one.hbs"))({ legend: "Which?", choices, full: true });
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

describe("a pick list with none chosen to start", () => {
	it("checks the first choice by default, but none, and asks for one, when unchosen", () => {
		const page = handlebars.compile(read("templates/dialogs/pick-one.hbs"));
		const first = page({ legend: "Which?", choices });
		expect(first.match(/checked/g)).toHaveLength(1);
		expect(first).not.toContain("required");
		const none = page({ legend: "Which?", choices, unchosen: true });
		expect(none).not.toContain("checked");
		expect(none.match(/required/g)).toHaveLength(choices.length);
	});
});
