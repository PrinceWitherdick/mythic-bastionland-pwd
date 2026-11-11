import { readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8").replace(/\r/g, "");
const lang = JSON.parse(read("languages/en.json"));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);

const handlebars = Handlebars.create();
handlebars.registerHelper("checked", (value) => (value ? "checked" : ""));
handlebars.registerHelper("localize", (key) => lookup(key) ?? key);

/** The Posts block of the Knight's page, on its own. */
const sheet = read("templates/actor/knight-sheet.hbs");
const start = sheet.lastIndexOf("<section", sheet.indexOf('data-block="posts"'));
const block = handlebars.compile(sheet.slice(start, sheet.indexOf("</section>", start) + "</section>".length));

const row = (more = {}) => ({ domainId: "d1", domain: "Bramblewatch", opens: true, member: "", post: "Steward", unproven: "", leave: null, ...more });

describe("the Posts block on the Knight's page", () => {
	it("says the Knight holds nothing, and offers a seat where there's one to take", () => {
		const html = block({ posts: { rows: [], canTake: true } });
		expect(html).toContain(lookup("bastionland.posts.empty"));
		expect(html).toContain('data-action="takeSeat"');
		expect(block({ posts: { rows: [], canTake: false } })).not.toContain('data-action="takeSeat"');
	});

	it("names the Domain, opening it for whoever can see it, and the post held there", () => {
		const html = block({ posts: { rows: [row()], canTake: false } });
		expect(html).toContain('data-domain-id="d1"');
		expect(html).toMatch(/data-action="openPostDomain">Bramblewatch</);
		expect(html).toContain("<strong>Steward</strong>");
		expect(block({ posts: { rows: [row({ opens: false })] } })).not.toContain("openPostDomain");
	});

	it("marks a post the Knight's Rank isn't worthy of yet, and lets whoever holds the Domain give it up", () => {
		const html = block({ posts: { rows: [row({ unproven: "Holds it too soon", leave: { action: "leaveSeat", label: "Leave the Seat" } })] } });
		expect(html).toContain('data-tooltip="Holds it too soon"');
		expect(html).toContain(lookup("bastionland.posts.unproven"));
		expect(html).toContain('data-action="leaveSeat"');
		expect(block({ posts: { rows: [row()] } })).not.toContain("bastionland-item__controls");
	});

	it("keeps its own place when the sheet is narrow", () => {
		expect(sheet).toMatch(/data-block="posts" style="--bastionland-narrow-order: \d+"/);
	});
});

describe("the window to take a seat", () => {
	const page = handlebars.compile(read("templates/dialogs/council-seat.hbs"));
	const seat = (value, more = {}) => ({ value, name: value, detail: "", checked: false, ...more });

	it("is one radio list across every Domain, a fieldset each, and one choice made", () => {
		const html = page({
			intro: "Which seat?",
			domains: [
				{ name: "Bramblewatch", seats: [seat("d1:steward", { checked: true, detail: "Held by Coll" }), seat("d1:circle")] },
				{ name: "Hollin", seats: [seat("d2:steward")] }
			]
		});
		expect(html.match(/<fieldset/g)).toHaveLength(2);
		expect(html.match(/type="radio" name="seat"/g)).toHaveLength(3);
		expect(html.match(/checked/g)).toHaveLength(1);
		expect(html).toContain("<legend>Hollin</legend>");
		expect(html).toContain("Held by Coll");
	});
});
