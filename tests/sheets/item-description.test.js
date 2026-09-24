import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(root, "styles/mythic-bastionland.css"), "utf8");
const template = readFileSync(join(root, "templates/item/item-sheet.hbs"), "utf8");

/** @returns {string} The one rule with this selector, header and all. */
function rule(selector) {
	const from = css.indexOf(selector + " {");
	expect(from, "no rule for " + selector).toBeGreaterThan(-1);
	return css.slice(from, css.indexOf("}", from));
}

describe("the description box on an item sheet", () => {
	it("is the section the editor sits in", () => {
		expect(template).toContain('<section class="bastionland-item-description">');
		expect(template).toContain('<prose-mirror name="system.description"');
	});

	it("can be dragged taller", () => {
		const declarations = rule(".bastionland-page .bastionland-item-description prose-mirror");

		expect(declarations).toContain("resize: vertical;");
		// `resize` is ignored on a box whose overflow is visible.
		expect(declarations).toMatch(/overflow: (auto|hidden|scroll);/);
	});

	it("hands the height it is dragged to to the text", () => {
		// Foundry stacks the editor's menu above the container holding the text,
		// which only takes a height of its own down a column.
		const declarations = rule(".bastionland-page .bastionland-item-description prose-mirror");

		expect(declarations).toContain("display: flex;");
		expect(declarations).toContain("flex-direction: column;");
		expect(rule(".bastionland-page .bastionland-item-description prose-mirror > .editor-container")).toContain("min-height: 0;");
	});
});
