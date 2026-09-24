import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(root, "styles", "mythic-bastionland.css"), "utf8");
const sheet = readFileSync(join(root, "templates", "actor", "knight-sheet.hbs"), "utf8").replace(/\r/g, "");

/** The Knight tab's markup, which is the only run of blocks that reorders. */
const tab = sheet.slice(sheet.indexOf('<div class="bastionland-columns">'));

/**
 * What each block of the Knight tab is called, in the order a narrow sheet reads
 * them. Read off the template, so a block that loses its place fails here.
 * @returns {string[]}
 */
function run() {
	// Each block says what it is, so its place can be read without guessing at
	// it from whatever heading happens to follow.
	const blocks = [...tab.matchAll(/data-block="([\w-]+)"[^>]*--bastionland-narrow-order: (\d+)"/g)]
		.map((match) => ({ order: Number(match[2]), name: match[1] }));
	expect(blocks.length, "blocks carrying a narrow order").toBeGreaterThan(0);
	return blocks.sort((one, other) => one.order - other.order);
}

describe("the Knight tab once the sheet is too narrow for two columns", () => {
	it("lets the columns give up their boxes, so the blocks fall into one run", () => {
		const narrow = /@container \(max-width: 640px\) \{([\s\S]*?)\n\}/.exec(css);
		expect(narrow, "the 640px container query").not.toBeNull();
		expect(narrow[1]).toMatch(/\.tab\[data-tab="knight"\] \.bastionland-column \{\s*display: contents;/);
		expect(narrow[1]).toMatch(/order: var\(--bastionland-narrow-order, 0\);/);
	});

	it("gives every block a place of its own, counting from one", () => {
		const orders = run().map((block) => block.order);
		expect(orders).toEqual(orders.map((_, index) => index + 1));
	});

	/*
	 * The two the user asked for: on a narrow sheet Recovery is read under the
	 * Gambits it is weighed against, and Age and Rank under the Scars, rather
	 * than being left where the wide sheet's left-hand column puts them.
	 */
	it.each([
		["recovery", "gambits"],
		["age", "scars"]
	])("reads %s directly under %s", (block, above) => {
		const names = run().map((one) => one.name);
		expect(names, `${block} in the run`).toContain(block);
		expect(names[names.indexOf(block) - 1], `what ${block} follows`).toBe(above);
	});
});
