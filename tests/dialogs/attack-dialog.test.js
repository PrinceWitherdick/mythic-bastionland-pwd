import { readFileSync } from "node:fs";
import { join } from "node:path";
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
