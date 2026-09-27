import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the dialogs answer, what they were asked, the actors in the world, and the Domains founded. */
let formData;
let chosen;
let asked;
let actors;
let created;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		asked.push(options);
		return formData;
	}),
	chooseDialog: vi.fn(async (options) => {
		asked.push(options);
		return chosen;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/dominion.js", () => ({ linkKnightDomain: vi.fn() }));
vi.mock("../../module/actions/homecoming.js", () => ({ holdingOptions: (selected) => [{ value: "Scene.s1.Tile.h1", label: "Mill", selected: selected === "Scene.s1.Tile.h1" }] }));

const realm = {
	holdings: [
		{ id: "h0", name: "High Keep", seat: true },
		{ id: "h1", name: "Mill", seat: false }
	]
};
vi.mock("../../module/actions/realm.js", () => ({ getRealm: () => ({ realm }) }));

const { foundDomain, offerRulerDomain } = await import("../../module/actions/found-domain.js");
const { linkKnightDomain } = await import("../../module/actions/dominion.js");

const knight = (id, name, player = true) => ({ id, name, type: "knight", hasPlayerOwner: player, folder: null, ownership: { default: 0 } });

beforeEach(() => {
	formData = null;
	chosen = null;
	asked = [];
	created = [];
	actors = [knight("k1", "Tal"), knight("k2", "Moss"), knight("k3", "Brand", false)];
	vi.mocked(linkKnightDomain).mockClear();
	globalThis.game = {
		actors,
		user: { isGM: true, can: () => true },
		scenes: { get: (id) => (id === "s1" ? { id: "s1" } : null) }
	};
	globalThis.foundry = { utils: { deepClone: (value) => structuredClone(value), expandObject: (data) => {
		const out = {};
		for (const [key, value] of Object.entries(data)) {
			const [head, tail] = key.split(".");
			if (tail) (out[head] ??= {})[tail] = value;
			else out[head] = value;
		}
		return out;
	} } };
	globalThis.Actor = { implementation: { create: vi.fn(async (data) => {
		const domain = { ...data, sheet: { render: vi.fn() } };
		created.push(domain);
		return domain;
	}) } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
});

describe("foundDomain", () => {
	it("founds the Domain on the Holding picked, named for it, with the ticked Knights in its Circle", async () => {
		formData = { holding: "Scene.s1.Tile.h1", name: "", "circle.k2": true, "circle.k3": false };
		const domain = await foundDomain(actors[0]);
		expect(domain).toMatchObject({ name: "Mill", type: "domain", system: { ruler: "Tal", holding: "Scene.s1.Tile.h1", seat: false, council: { circle: "Moss" } } });
		expect(linkKnightDomain).toHaveBeenCalledWith(actors[0], domain);
		expect(asked[0].context.circle.map(({ name }) => name)).toEqual(["Moss", "Brand"]);
	});

	it("takes the name written in, and a Domain with no Holding keeps a name of its own", async () => {
		formData = { holding: "", name: "  " };
		const domain = await foundDomain(actors[0]);
		expect(domain.name).toContain("domain.newName");
		expect(domain.system).toMatchObject({ holding: "", seat: false, council: { circle: "" } });
	});

	it("founds nothing when the window is closed", async () => {
		expect(await foundDomain(actors[0])).toBeNull();
		expect(created).toEqual([]);
	});
});

describe("offerRulerDomain", () => {
	it("asks which of the players' Knights rules, offering a Holding that isn't the Seat and seating the others (p6)", async () => {
		chosen = "k2";
		formData = { holding: "Scene.s1.Tile.h1", "circle.k1": true };
		const domain = await offerRulerDomain({ id: "s1" });
		expect(asked[0].buttons.map(({ action }) => action)).toEqual(["k1", "k2", "later"]);
		expect(asked[1].context.holdings[0].selected).toBe(true);
		expect(asked[1].context.circle.filter(({ checked }) => checked).map(({ name }) => name)).toEqual(["Tal"]);
		expect(domain.system).toMatchObject({ ruler: "Moss", council: { circle: "Tal" } });
		expect(domain.sheet.render).toHaveBeenCalled();
	});

	it("asks nothing before there are Knights, and founds nothing when left for later", async () => {
		game.actors = [];
		expect(await offerRulerDomain({ id: "s1" })).toBeNull();
		expect(asked).toEqual([]);
		game.actors = actors;
		chosen = "later";
		expect(await offerRulerDomain({ id: "s1" })).toBeNull();
		expect(created).toEqual([]);
	});
});
