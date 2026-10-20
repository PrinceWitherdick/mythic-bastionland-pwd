import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const template = readFileSync(join(root, "templates/actor/domain-sheet.hbs"), "utf8");

/** The markup of one page of the sheet, from its tab to the next. */
function page(id) {
	const start = template.indexOf(`data-tab="${id}"`);
	const next = template.indexOf("data-tab=", start + 1);
	return template.slice(start, next < 0 ? undefined : next);
}

describe("the Domain sheet's pages", () => {
	it("keeps who rules and what they command on the Rule page", () => {
		const rule = page("domain");
		for (const block of ["domain__ruler", "domain__council\"", "domain__authority"]) expect(rule).toContain(block);
		expect(rule).not.toContain("domain__court\"");
	});

	it("puts the Crises, the Court and the Grand Designs on a page of their own", () => {
		const court = page("court");
		for (const block of ["domain__crisis-block", "domain__court\"", "domain__designs\""]) expect(court).toContain(block);
		expect(court).not.toContain("domain__ruler");
	});
});
