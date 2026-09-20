import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARRIER_ICONS, carrierOf, propertyTabIcon } from "../../module/rules/property-tab.js";

describe("carrierOf", () => {
	it("puts a Knight's things on the steed they ride", () => {
		expect(carrierOf({ steed: {}, squire: {} })).toBe("steed");
		expect(carrierOf({ steed: {} })).toBe("steed");
	});

	it("puts them on their Squire when they ride nothing", () => {
		expect(carrierOf({ steed: null, squire: {} })).toBe("squire");
	});

	it("leaves them on the Knight's own back otherwise", () => {
		expect(carrierOf({ steed: null, squire: false })).toBe("back");
		expect(carrierOf()).toBe("back");
	});
});

describe("propertyTabIcon", () => {
	it("draws a horse, the Squire or a backpack", () => {
		expect(propertyTabIcon({ steed: {} })).toBe("fa-solid fa-horse");
		expect(propertyTabIcon({ squire: {} })).toBe(CARRIER_ICONS.squire);
		expect(propertyTabIcon({})).toBe("fa-solid fa-backpack");
	});

	it("has the Squire's glyph drawn by the stylesheet", () => {
		const css = readFileSync(join(import.meta.dirname, "../../styles/mythic-bastionland.css"), "utf8");
		for (const name of CARRIER_ICONS.squire.split(" ")) expect(css).toContain(`.${name} {`);
		expect(css).toContain('url("../assets/icons/squire-glyph.svg")');
	});
});
