import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const templates = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
	const path = join(dir, entry.name);
	if (entry.isDirectory()) return templates(path);
	return entry.name.endsWith(".hbs") ? [relative(root, path)] : [];
});

// The partials whose output holds an entry's own words, and so a code block typed into one.
const CARRIERS = ["timeline-cards", "timeline-thread", "timeline-board"];

// A Handlebars partial called on a line of its own takes that line's indent onto every line it
// prints, so a `<pre>` in an entry's body gained the template's tabs. Core v14 compiles with
// `preventIndent`; v13, which this system still runs on, does not. `{{~>` makes the call not
// stand alone.
describe("a Timeline entry's preformatted lines", () => {
	it("keep their own indent: a partial that prints them is called {{~> on a line of its own", () => {
		const calls = templates(join(root, "templates")).flatMap((path) => read(path).split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => CARRIERS.some((name) => line.includes(`"bastionland.${name}"`)))
			.map((line) => [path, line]));
		expect(calls.length).toBeGreaterThan(0);
		// Inline after other markup a call can't stand alone; on a line of its own it must strip.
		for (const [path, line] of calls.filter(([, text]) => /^\{\{~?>/.test(text))) {
			expect(line, path).toMatch(/^\{\{~>/);
		}
	});

	it("is what the stripping guards against, with the real cards partial", () => {
		const hb = Handlebars.create();
		for (const name of ["localize", "checked"]) hb.registerHelper(name, () => "");
		hb.registerPartial("bastionland.timeline-card", read("templates/apps/parts/timeline-card.hbs"));
		hb.registerPartial("bastionland.timeline-cards", read("templates/apps/parts/timeline-cards.hbs"));
		const context = { entries: [{ id: "a", title: "A song", chip: {}, bodyHtml: "<pre>a\n  b</pre>" }] };
		const host = (call) => hb.compile(`<section>\n\t\t${call}\n</section>`)(context).match(/<pre>[\s\S]*?<\/pre>/)?.[0];
		expect(host('{{> "bastionland.timeline-cards"}}'), "the mechanism").toBe("<pre>a\n\t\t  b</pre>");
		expect(host('{{~> "bastionland.timeline-cards"}}')).toBe("<pre>a\n  b</pre>");
	});
});
