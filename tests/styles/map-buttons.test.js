import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(root, "styles", "mythic-bastionland.css"), "utf8");

/** The one rule both buttons held against a Realm's map are drawn by. */
const rule = /button\.bastionland-realm-drawing__finish,\s*button\.bastionland-company-button \{([\s\S]*?)\n\}/.exec(css);

describe("the buttons held against a Realm's map", () => {
	it("are Finish under the map and Place the Company over it, drawn alike", () => {
		expect(rule, "the shared rule for both map buttons").not.toBeNull();
		expect(rule[1]).toMatch(/position: fixed;/);
	});

	it("never animate to where the map has gone", () => {
		// Foundry's own `button` rule is `transition: 0.5s`, which is every property,
		// so each left and top set as the canvas pans would be slid to over half a second.
		expect(rule[1]).toMatch(/\n\ttransition: none;/);
	});
});
