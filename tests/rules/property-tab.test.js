import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CARRIER_ICONS, carrierOf, comparePropertyPlace, damageReach, propertyTabIcon, samePropertyPlace } from "../../module/rules/property-tab.js";

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

describe("comparePropertyPlace", () => {
	const weapon = (name, damage) => ({ type: "weapon", name, system: { damage } });
	const armour = (name, kind, damage = "") => ({ type: "armour", name, system: { kind, damage } });

	it("reads a damage string's highest roll", () => {
		expect(damageReach("d8")).toBe(8);
		expect(damageReach("2d6")).toBe(12);
		expect(damageReach("")).toBe(0);
	});

	it("puts weapons first, biggest die leading, then shields, then armour from the head outward, then gear", () => {
		const items = [
			{ type: "gear", name: "Rope", system: {} },
			armour("Shield", "shield", "d4"),
			armour("Tower shield", "shield", "d6"),
			armour("Plates", "plates"),
			armour("Mail", "coat"),
			weapon("Dagger", "d6"),
			armour("Gambeson", "coat"),
			armour("Helm", "helm"),
			weapon("Greatsword", "d10")
		];
		expect(items.sort(comparePropertyPlace).map((item) => item.name))
			.toEqual(["Greatsword", "Dagger", "Tower shield", "Shield", "Helm", "Gambeson", "Mail", "Plates", "Rope"]);
	});

	it("keeps the stored order between equals", () => {
		const a = { ...weapon("A", "d8"), sort: 2 };
		const b = { ...weapon("B", "d8"), sort: 1 };
		expect([a, b].sort(comparePropertyPlace).map((item) => item.name)).toEqual(["B", "A"]);
	});
});

describe("samePropertyPlace", () => {
	const weapon = (name, damage) => ({ type: "weapon", name, system: { damage } });

	it("sets apart things of another place, whatever their own order", () => {
		expect(samePropertyPlace({ ...weapon("A", "d8"), sort: 2 }, { ...weapon("B", "d8"), sort: 1 })).toBe(true);
		expect(samePropertyPlace(weapon("Dagger", "d6"), weapon("Mace", "d8"))).toBe(false);
		expect(samePropertyPlace({ type: "gear", name: "Rope" }, { type: "ability", name: "Seer" })).toBe(true);
	});
});
