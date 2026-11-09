import { readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8");

const handlebars = Handlebars.create();
handlebars.registerHelper("checked", (value) => (value ? "checked" : ""));
handlebars.registerHelper("localize", (key) => key);
handlebars.registerPartial("bastionland.pick-list", read("templates/dialogs/parts/pick-list.hbs"));
const greater = handlebars.compile(read("templates/dialogs/greater.hbs"));

describe("the Greater effect dialog (p10)", () => {
	it("says what Something else does when the foe has nothing to take, rather than standing empty", () => {
		const html = greater({ effects: [] });
		expect(html).toContain('<p class="hint">bastionland.attack.greater.otherDetail</p>');
		expect(html).toContain('<input type="hidden" name="effect" value="blank">');
	});

	it("leaves that to the list's own Something else row when there are things to take", () => {
		const html = greater({ effects: [{ id: "0", name: "Ser Kay: Disarm Sword" }] });
		expect(html).not.toContain('<p class="hint">');
		expect(html.match(/bastionland\.attack\.greater\.otherDetail/g)).toHaveLength(1);
	});
});
