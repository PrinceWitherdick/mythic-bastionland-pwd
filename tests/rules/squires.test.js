import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	SQUIRE_EQUIPMENT,
	SQUIRE_IMAGE,
	companySize,
	knightedLooks,
	knightedVirtues,
	mayTakeSquires,
	outgrewSquires,
	ponySystem,
	squireEquipment,
	squireItems,
	squireSystem,
	squireTabs
} from "../../module/rules/squires.js";

const names = { dagger: "Dagger", cudgel: "Cudgel", axe: "Axe", hatchet: "Hatchet", shortbow: "Shortbow", shield: "Shield", javelins: "Three javelins" };

describe("companySize", () => {
	it("counts one Knight for each player", () => {
		expect(companySize([{ isSquire: false, players: ["a"] }, { isSquire: false, players: ["b"] }])).toBe(2);
	});

	it("counts a fallen Knight and their heir once, since one player owns both", () => {
		expect(companySize([{ isSquire: false, players: ["a"] }, { isSquire: false, players: ["a"] }, { isSquire: false, players: ["b"] }])).toBe(2);
	});

	it("leaves out Squires and Knights no player owns", () => {
		expect(companySize([{ isSquire: false, players: ["a"] }, { isSquire: true, players: ["a", "b"] }, { isSquire: false, players: [] }])).toBe(1);
	});

	it("counts a Knight shared by two players as two seats at the table", () => {
		expect(companySize([{ isSquire: false, players: ["a", "b"] }])).toBe(2);
	});
});

describe("mayTakeSquires", () => {
	it("allows Squires for a Company of 2 Knights or fewer", () => {
		expect(mayTakeSquires(1)).toBe(true);
		expect(mayTakeSquires(2)).toBe(true);
		expect(mayTakeSquires(3)).toBe(false);
	});
});

describe("outgrewSquires", () => {
	it("is true only when the Company grows past 2 Knights", () => {
		expect(outgrewSquires(2, 3)).toBe(true);
		expect(outgrewSquires(1, 4)).toBe(true);
		expect(outgrewSquires(1, 2)).toBe(false);
		expect(outgrewSquires(3, 4)).toBe(false);
		expect(outgrewSquires(3, 2)).toBe(false);
	});
});

describe("squireEquipment", () => {
	it("has one entry for each face of the d6", () => {
		expect(SQUIRE_EQUIPMENT).toHaveLength(6);
		expect(squireEquipment(4)).toMatchObject({ key: "shortbow", system: { damage: "d6", long: true, ranged: true } });
		expect(squireEquipment(7)).toBeNull();
	});
});

describe("squireItems", () => {
	it("gives every Squire a dagger and what they rolled, worn or wielded", () => {
		expect(squireItems(1, names)).toEqual([
			{ type: "weapon", name: "Dagger", system: { damage: "d6", equipped: true } },
			{ type: "weapon", name: "Cudgel", system: { damage: "d8", hefty: true, equipped: true } }
		]);
		expect(squireItems(5, names)[1]).toEqual({ type: "armour", name: "Shield", system: { kind: "shield", armour: 1, damage: "d4", equipped: true } });
	});
});

describe("squireSystem", () => {
	it("sets the rolled Virtues, 1GD, and no Glory", () => {
		expect(squireSystem({ vig: 7, cla: 12, spi: 2 })).toEqual({
			isSquire: true,
			virtues: { vig: { value: 7, max: 7 }, cla: { value: 12, max: 12 }, spi: { value: 2, max: 2 } },
			guard: { value: 1, max: 1 },
			glory: 0
		});
	});
});

describe("ponySystem", () => {
	it("is the pony the book gives Squires", () => {
		expect(ponySystem()).toEqual({
			virtues: { vig: { value: 7, max: 7 }, cla: { value: 7, max: 7 }, spi: { value: 2, max: 2 } },
			guard: { value: 2, max: 2 }
		});
	});
});

describe("knightedVirtues", () => {
	it("raises each Virtue by its d6, current and maximum, up to 19", () => {
		const virtues = { vig: { value: 4, max: 8 }, cla: { value: 12, max: 12 }, spi: { value: 16, max: 17 } };
		expect(knightedVirtues(virtues, { vig: 3, cla: 6, spi: 5 })).toEqual({
			vig: { value: 7, max: 11 },
			cla: { value: 18, max: 18 },
			spi: { value: 19, max: 19 }
		});
	});
});

describe("knightedLooks", () => {
	const blank = "icons/svg/mystery-man.svg";
	const looks = (img, token) => ({ img, prototypeToken: { texture: { src: token } } });

	it("takes the Squire's portrait off a new Knight, Token and all", () => {
		expect(knightedLooks(looks(SQUIRE_IMAGE, SQUIRE_IMAGE), blank)).toEqual({ img: blank, "prototypeToken.texture.src": blank });
	});

	it("keeps pictures the player chose", () => {
		expect(knightedLooks(looks("art/sir-hew.webp", "art/sir-hew-token.webp"), blank)).toEqual({});
		expect(knightedLooks(looks("art/sir-hew.webp", SQUIRE_IMAGE), blank)).toEqual({ "prototypeToken.texture.src": blank });
	});
});

describe("squireTabs", () => {
	const page = { id: "squire" };
	// The rail as the Knight sheet declares it: a page a Squire has no use for says so itself.
	const knightRail = [
		{ id: "knight", squire: false },
		{ id: "property", squire: false },
		{ id: "seer", squire: false },
		{ id: "chronicle" }
	];

	it("leads with the Squire's page and keeps the Chronicle", () => {
		expect(squireTabs(knightRail, page).map((tab) => tab.id)).toEqual(["squire", "chronicle"]);
	});

	it("drops the Knight's page, their Property page and their Seer", () => {
		const ids = squireTabs(knightRail, page).map((tab) => tab.id);
		for (const id of ["knight", "property", "seer"]) expect(ids).not.toContain(id);
	});

	// The fact lives on the tab table, so a page added to the rail is a Squire's
	// unless it says otherwise there.
	it("reads that off the Knight sheet's own rail", () => {
		const rail = readFileSync(join(import.meta.dirname, "../../module/sheets/KnightSheet.js"), "utf8");
		for (const id of ["knight", "property", "seer"]) {
			expect(rail, `the ${id} page is marked as no Squire's`).toMatch(new RegExp(`id: "${id}",[^\\n]*squire: false`));
		}
	});

	it("keeps a page the reader is shown, such as Settings, and leaves out one they aren't", () => {
		expect(squireTabs([...knightRail, { id: "settings" }], page).map((tab) => tab.id)).toEqual(["squire", "chronicle", "settings"]);
		expect(squireTabs(knightRail, page).map((tab) => tab.id)).not.toContain("settings");
	});
});
