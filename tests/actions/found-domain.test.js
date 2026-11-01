import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the dialogs answer, what they were asked, the actors in the world, and the Domains founded. */
let formData;
let asked;
let actors;
let created;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		asked.push(options);
		return typeof formData === "function" ? formData(options) : formData;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/dominion.js", () => ({ linkKnightDomain: vi.fn(), worldDomains: () => game.actors.filter((actor) => actor.type === "domain") }));
vi.mock("../../module/actions/court.js", () => ({ addCourtMember: vi.fn(), courtNames: (domain) => Object.values(domain.system.court ?? {}).map(({ name }) => name) }));
vi.mock("../../module/actions/homecoming.js", () => ({
	FOUNDED_OPTION: "founded",
	realmHoldings: () => [],
	// The Holding offered, first and chosen, so a test can tell which it was.
	holdingOptions: (selected) => [{ value: selected, label: "Holding", selected: selected === "Scene.s1.Tile.h1" || selected === "Scene.s1.Tile.h0" }]
}));

const realm = {
	holdings: [
		{ id: "h0", name: "High Keep", seat: true, hex: { col: 1, row: 1 } },
		{ id: "h1", name: "Mill", seat: false, hex: { col: 5, row: 5 } }
	]
};
vi.mock("../../module/actions/realm.js", () => ({ getRealm: () => ({ realm }) }));

/** Where the Company Token stands, or null with none on the map. */
let standing = null;
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => true) }));
vi.mock("../../module/actions/company.js", () => ({ findCompanyToken: () => (standing ? {} : null), companyTokenHex: () => standing }));

const { foundDomain, offerRulerDomain, seatCourtiers } = await import("../../module/actions/found-domain.js");
const { addCourtMember } = await import("../../module/actions/court.js");
const { linkKnightDomain } = await import("../../module/actions/dominion.js");
const { askActiveGM } = await import("../../module/ask-gm.js");

const knight = (id, name, player = true) => ({ id, name, type: "knight", visible: true, hasPlayerOwner: player, folder: null, ownership: player ? { default: 0, [`u-${id}`]: 3 } : { default: 0 }, system: {} });

beforeEach(() => {
	formData = null;
	asked = [];
	created = [];
	actors = [knight("k1", "Tal"), knight("k2", "Moss"), knight("k3", "Brand", false)];
	actors.get = (id) => actors.find((actor) => actor.id === id);
	vi.mocked(askActiveGM).mockClear();
	vi.mocked(linkKnightDomain).mockClear();
	vi.mocked(addCourtMember).mockClear();
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
	globalThis.game = {
		actors,
		user: { isGM: true, can: () => true },
		users: { get: () => null },
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
		const domain = { id: `d${created.length}`, ownership: { [game.user.id]: 3 }, ...data, sheet: { render: vi.fn() } };
		created.push(domain);
		return domain;
	}) } };
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
});

describe("foundDomain", () => {
	it("founds the Domain on the Holding picked, named for it, with the ticked Knights in its Circle", async () => {
		formData = { holding: "Scene.s1.Tile.h1", name: "", "circle.k2": true, "circle.k3": false };
		const domain = await foundDomain(actors[0]);
		expect(domain).toMatchObject({ name: "Mill", type: "domain", system: { ruler: "Tal", holding: "Scene.s1.Tile.h1", seat: false, council: { circle: ["k2"] } } });
		expect(linkKnightDomain).toHaveBeenCalledWith(actors[0], domain);
		// Founded, so it takes the Holding from any Domain that ruled it; a copy wouldn't.
		expect(Actor.implementation.create.mock.calls[0][1]).toEqual({ founded: true });
		expect(asked[0].context.circle.map(({ name }) => name)).toEqual(["Moss", "Brand"]);
	});

	it("takes the name written in, and a Domain with no Holding keeps a name of its own", async () => {
		formData = { holding: "", name: "  " };
		const domain = await foundDomain(actors[0]);
		expect(domain.name).toContain("domain.newName");
		expect(domain.system).toMatchObject({ holding: "", seat: false, council: { circle: [] } });
	});

	it("offers neither a Squire nor the Slain for its Circle (p7, p20)", async () => {
		actors.push({ ...knight("s1", "Pip"), system: { isSquire: true } }, { ...knight("k4", "Ash"), system: { slain: true } });
		await foundDomain(actors[0]);
		expect(asked[0].context.circle.map(({ name }) => name)).toEqual(["Moss", "Brand"]);
	});

	it("lets the players of the Knights in its Circle look at it, as well as the ruler’s own", async () => {
		formData = { holding: "", name: "Ashford", "circle.k2": true };
		const domain = await foundDomain(actors[0]);
		expect(domain.ownership).toEqual({ default: 0, "u-k1": 3, "u-k2": 2 });
		expect(askActiveGM).not.toHaveBeenCalled();
	});

	it("has a player who founds one ask the Referee to share it as they would have", async () => {
		game.user = { id: "u-k1", isGM: false, can: () => true };
		game.users.activeGM = {};
		formData = { holding: "", name: "Ashford", "circle.k2": true };
		const domain = await foundDomain(actors[0]);
		expect(domain.ownership).toEqual({ "u-k1": 3 });
		expect(askActiveGM).toHaveBeenCalledWith(expect.stringMatching(/.shareOwnership$/), { fromId: "k1", actorIds: [domain.id] }, expect.any(String));
	});

	it("founds nothing when the window is closed", async () => {
		expect(await foundDomain(actors[0])).toBeNull();
		expect(created).toEqual([]);
	});
});

describe("offerRulerDomain", () => {
	it("asks which of the players' Knights rules, offering a Holding that isn't the Seat and seating the others (p6)", async () => {
		formData = (options) => (options.template === "who-rules" ? { ruler: "k2" } : { holding: "Scene.s1.Tile.h1", "circle.k1": true });
		const domain = await offerRulerDomain({ id: "s1" });
		// One pick list and one button, rather than a button for each Knight.
		expect(asked[0].template).toBe("who-rules");
		expect(asked[0].context.knights.map(({ id }) => id)).toEqual(["k1", "k2"]);
		expect(asked[1].context.holdings[0].selected).toBe(true);
		expect(asked[1].context.circle.filter(({ checked }) => checked).map(({ name }) => name)).toEqual(["Tal"]);
		expect(domain.system).toMatchObject({ ruler: "Moss", council: { circle: ["k1"] } });
		expect(domain.sheet.render).toHaveBeenCalled();
	});

	it("offers the Holding the Company was put down in, even the Seat, as the Ruler Start asked (p6)", async () => {
		formData = (options) => (options.template === "who-rules" ? { ruler: "k2" } : { holding: options.context.holdings[0].value });
		standing = { col: 1, row: 1 };
		await offerRulerDomain({ id: "s1" });
		standing = null;
		expect(asked[1].context.holdings[0].value).toBe("Scene.s1.Tile.h0");
	});

	it("asks nothing before there are Knights, and founds nothing when left for later", async () => {
		game.actors = [];
		expect(await offerRulerDomain({ id: "s1" })).toBeNull();
		expect(asked).toEqual([]);
		game.actors = actors;
		formData = { ruler: "blank" };
		expect(await offerRulerDomain({ id: "s1" })).toBeNull();
		formData = null;
		expect(await offerRulerDomain({ id: "s1" })).toBeNull();
		expect(created).toEqual([]);
	});

	it("offers neither a Squire, who isn't knighted, nor the slain (p7)", async () => {
		game.actors = [...actors, { ...knight("k4", "Wren"), system: { isSquire: true } }, { ...knight("k5", "Old Hal"), system: { slain: true } }];
		await offerRulerDomain({ id: "s1" });
		expect(asked[0].context.knights.map(({ id }) => id)).toEqual(["k1", "k2"]);
	});
});

describe("seatCourtiers", () => {
	it("makes a Domain for the Seat of Power, the Referee's to run, and seats the players' Knights in its Court (p6)", async () => {
		const domain = await seatCourtiers({ id: "s1" });
		expect(domain).toMatchObject({ name: "High Keep", type: "domain", system: { ruler: "", holding: "Scene.s1.Tile.h0", seat: true } });
		expect(domain.ownership).toEqual({ default: 0, "u-k1": 2, "u-k2": 2 });
		expect(vi.mocked(addCourtMember).mock.calls.map(([, role, { name }]) => [role, name])).toEqual([["courtier", "Tal"], ["courtier", "Moss"]]);
		expect(ui.notifications.info).toHaveBeenCalled();
	});

	it("joins the Court of a Domain already ruling the Seat, seating nobody twice", async () => {
		const seatDomain = { name: "The Crown", type: "domain", ownership: { default: 0 }, update: vi.fn(), system: { holding: "Scene.s1.Tile.h0", court: { a: { role: "courtier", name: "Tal" } } } };
		game.actors = [...actors, seatDomain];
		expect(await seatCourtiers({ id: "s1" })).toBe(seatDomain);
		expect(created).toEqual([]);
		expect(vi.mocked(addCourtMember).mock.calls.map(([domain, , { name, knight }]) => [domain.name, name, knight])).toEqual([["The Crown", "Moss", "k2"]]);
		// Whoever plays a Knight newly seated there can look at it, as at a Seat's Domain made for them.
		expect(seatDomain.update).toHaveBeenCalledWith({ ownership: { "u-k2": 2 } });
		expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining("company.starts.courtier.seated"));
	});

	it("leaves the look alone for a player who sees the Domain already, and says when nobody new was seated", async () => {
		const seatDomain = { name: "The Crown", type: "domain", ownership: { default: 0, "u-k1": 3 }, update: vi.fn(), system: { holding: "Scene.s1.Tile.h0", court: {} } };
		game.actors = [actors[0], seatDomain];
		await seatCourtiers({ id: "s1" });
		expect(seatDomain.update).not.toHaveBeenCalled();
		seatDomain.system.court = { a: { role: "courtier", name: "Tal", knight: "k1" } };
		await seatCourtiers({ id: "s1" });
		expect(ui.notifications.info).toHaveBeenLastCalledWith(expect.stringContaining("company.starts.courtier.allSeated"));
	});

	it("seats no Squire, and none of the slain", async () => {
		game.actors = [actors[0], { ...knight("k4", "Wren"), system: { isSquire: true } }, { ...knight("k5", "Old Hal"), system: { slain: true } }];
		await seatCourtiers({ id: "s1" });
		expect(vi.mocked(addCourtMember).mock.calls.map(([, , { name }]) => name)).toEqual(["Tal"]);
	});

	it("knows a Knight seated before by id, though they've been renamed since", async () => {
		const seatDomain = { name: "The Crown", type: "domain", system: { holding: "Scene.s1.Tile.h0", court: { a: { role: "courtier", name: "Tal the Young", knight: "k1" }, b: { role: "courtier", name: "Moss", knight: "k2" } } } };
		game.actors = [...actors, seatDomain];
		await seatCourtiers({ id: "s1" });
		expect(vi.mocked(addCourtMember)).not.toHaveBeenCalled();
	});

	it("does nothing before there are Knights, or in a Realm with no Seat", async () => {
		game.actors = [];
		expect(await seatCourtiers({ id: "s1" })).toBeNull();
		game.actors = actors;
		realm.holdings[0].seat = false;
		expect(await seatCourtiers({ id: "s1" })).toBeNull();
		realm.holdings[0].seat = true;
		expect(created).toEqual([]);
	});
});
