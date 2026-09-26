import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	SQUIRE_EQUIPMENT,
	SQUIRE_IMAGE,
	companySize,
	isSquireName,
	itemsGained,
	knightedChoice,
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

const names = { dagger: "Dagger", cudgel: "Cudgel", axe: "Axe", hatchet: "Hatchet", shortbow: "Shortbow", shield: "Shield", javelins: "Javelins" };

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
		expect(squireEquipment(4)).toMatchObject({ key: "shortbow", system: { damage: "d6", long: true, ranged: true, wooden: true } });
		expect(squireEquipment(7)).toBeNull();
	});

	it("makes the hatchet and javelins hefty, as the weapon list does", () => {
		expect(squireEquipment(3)).toMatchObject({ key: "hatchet", system: { damage: "d6", hefty: true } });
		expect(squireEquipment(6)).toMatchObject({ key: "javelins", system: { damage: "d6", hefty: true } });
	});
});

describe("squireItems", () => {
	it("gives every Squire a dagger and what they rolled, worn or wielded", () => {
		expect(squireItems(1, names)).toEqual([
			{ type: "weapon", name: "Dagger", system: { damage: "d6", equipped: true } },
			{ type: "weapon", name: "Cudgel", system: { damage: "d8", hefty: true, wooden: true, equipped: true } }
		]);
		expect(squireItems(5, names)[1]).toEqual({ type: "armour", name: "Shield", system: { kind: "shield", armour: 1, damage: "d4", wooden: true, equipped: true } });
		expect(squireItems(6, names)[1]).toEqual({ type: "weapon", name: "Javelins", system: { damage: "d6", hefty: true, quantity: { value: 3, max: 3 }, equipped: true } });
		expect(squireItems(4, names)[1].system.wooden).toBe(true);
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

describe("isSquireName", () => {
	it("knows the name a Squire was given, whoever they served", () => {
		expect(isSquireName("Squire to Eve", "Squire to {knight}")).toBe(true);
		expect(isSquireName("  squire to Sir Bardolf ", "Squire to {knight}")).toBe(true);
	});

	it("leaves a name of their own alone", () => {
		expect(isSquireName("Wat", "Squire to {knight}")).toBe(false);
		expect(isSquireName("Squire to", "Squire to {knight}")).toBe(false);
		expect(isSquireName("Eve", "{knight}")).toBe(false);
	});

	it("reads a template with words after the Knight too", () => {
		expect(isSquireName("Eve's Squire", "{knight}'s Squire")).toBe(true);
	});
});

describe("knightedChoice", () => {
	const blank = "icons/svg/mystery-man.svg";
	const lantern = { roll: "1-01", name: "The Lantern Knight", path: "art/lantern.webp", token: "art/lantern-token.webp" };
	const seer = { name: "The Glass Seer", path: "art/glass.webp", lines: ["Sees through walls"] };

	it("names the Knight and the Seer who knighted them, and nothing about their scores", () => {
		const update = knightedChoice({ img: blank, tokenImg: blank }, lantern, seer, blank);
		expect(update["system.knightType"]).toBe("Lantern");
		expect(update["system.seer"]).toBe("The Glass Seer");
		expect(update["system.seerImg"]).toBe("art/glass.webp");
		expect(Object.keys(update).some((key) => /virtues|guard|glory|age/.test(key))).toBe(false);
	});

	it("takes the Knight's pictures only over a stand-in", () => {
		expect(knightedChoice({ img: blank, tokenImg: SQUIRE_IMAGE }, lantern, seer, blank)).toMatchObject({
			img: "art/lantern.webp",
			"prototypeToken.texture.src": "art/lantern-token.webp"
		});
		const own = knightedChoice({ img: "me.webp", tokenImg: "my-token.webp" }, lantern, seer, blank);
		expect(own).not.toHaveProperty("img");
		expect(own).not.toHaveProperty(["prototypeToken.texture.src"]);
	});

	it("changes nothing for a Knight the book hasn't been imported for", () => {
		expect(knightedChoice({ img: blank, tokenImg: blank }, null, null, blank)).toEqual({});
	});
});

describe("itemsGained", () => {
	const kit = ["Dagger", "Torches", "Rope", "Dry rations", "Camping gear"];
	const knight = [
		{ type: "weapon", name: "Longsword" },
		{ type: "armour", name: "Shield" },
		{ type: "ability", name: "Glow" },
		{ type: "weapon", name: "Dagger" },
		{ type: "gear", name: "Torches" },
		{ type: "gear", name: "Rope" }
	];

	it("adds the Knight's own things even where the Squire has one alike, and only the kit they lack", () => {
		const carried = [{ type: "weapon", name: "dagger" }, { type: "armour", name: "Shield" }, { type: "gear", name: "Rope" }];
		expect(itemsGained(knight, carried, kit).map((item) => item.name)).toEqual(["Longsword", "Shield", "Glow", "Torches"]);
	});
});
