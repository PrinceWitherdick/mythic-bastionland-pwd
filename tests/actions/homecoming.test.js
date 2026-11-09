import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the next dialog answers, and every dialog asked. */
let answer;
let asked;
/** Where the Company Token stands, by Scene id. */
let companyAt;

vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(async (options) => {
		asked.push(options);
		return answer;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/dominion.js", () => ({
	crisisRoll: vi.fn(async () => []),
	worldDomains: () => game.actors.filter((actor) => actor.type === "domain")
}));
vi.mock("../../module/actions/company.js", () => ({
	findCompanyToken: (scene) => (companyAt[scene.id] ? { getCenterPoint: () => companyAt[scene.id] } : null),
	wentSomewhere: () => true
}));
vi.mock("../../module/actions/journey.js", () => ({ COMPANY_MOVED_HOOK: "mythic-bastionland.companyMoved" }));
vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (scene) => Boolean(scene?.realm),
	sceneGeometry: () => ({}),
	getRealm: (scene) => ({ realm: scene.realm })
}));
// A point is the hex it names.
vi.mock("../../module/rules/realm-geometry.js", async (importOriginal) => ({ ...(await importOriginal()), hexAt: (_g, point) => point }));

const { FOUNDED_OPTION, holdingChoices, holdingOptions, markLongAbsences, oneDomainPerHolding, registerHomecoming, seatFollowsCrown, seatWithHolding, welcomeHome } = await import("../../module/actions/homecoming.js");
const { crisisRoll } = await import("../../module/actions/dominion.js");
const { SYSTEM_ID } = await import("../../module/system-id.js");

const HOME = { col: 3, row: 2 };
const realm = { id: "s1", name: "The Realm", realm: { holdings: [{ id: "t1", hex: HOME, name: "Hollowmere", style: "castle", seat: false }] }, tokens: [] };

/**
 * @param {object} system
 * @returns {object} A Domain that writes what it's given.
 */
function makeDomain(system = {}) {
	const domain = {
		type: "domain",
		name: "Hollowmere",
		uuid: "Actor.d1",
		system: { ruler: "Eve", holding: "", longAbsence: false, ...system },
		update: vi.fn(async (changes) => {
			if ("system.longAbsence" in changes) domain.system.longAbsence = changes["system.longAbsence"];
		})
	};
	return domain;
}

const eve = { type: "knight", name: "Eve", hasPlayerOwner: true, system: { domain: "" } };

beforeEach(() => {
	answer = "roll";
	asked = [];
	companyAt = { s1: { col: 6, row: 6 } };
	vi.mocked(crisisRoll).mockClear();
	globalThis.game = {
		user: { isGM: true },
		scenes: Object.assign([realm], { get: (id) => (id === realm.id ? realm : undefined) }),
		actors: [eve]
	};
});

describe("markLongAbsences", () => {
	it("marks a Domain whose ruler rides with a Company away from its Holding", async () => {
		const domain = makeDomain();
		game.actors.push(domain);
		expect(await markLongAbsences()).toEqual([domain]);
		expect(domain.system.longAbsence).toBe(true);
	});

	it("leaves one whose Company stands at home", async () => {
		companyAt.s1 = { ...HOME };
		const domain = makeDomain();
		game.actors.push(domain);
		expect(await markLongAbsences()).toEqual([]);
		expect(domain.update).not.toHaveBeenCalled();
	});

	it("leaves one ruled by nobody in the Company, or not on the map", async () => {
		const npcRuled = makeDomain({ ruler: "Lord Quill" });
		const nowhere = Object.assign(makeDomain(), { name: "Nowhere" });
		game.actors.push(npcRuled, nowhere);
		expect(await markLongAbsences()).toEqual([]);
	});
});

describe("welcomeHome", () => {
	it("offers the Crisis Roll when a long-absent ruler comes home", async () => {
		const domain = makeDomain({ longAbsence: true });
		game.actors.push(domain);
		expect(await welcomeHome(realm, [{ col: 4, row: 2 }, HOME])).toEqual([domain]);
		expect(asked).toHaveLength(1);
		expect(crisisRoll).toHaveBeenCalledWith(domain);
		expect(domain.system.longAbsence).toBe(false);
	});

	it("is home again even when the Referee rolls nothing", async () => {
		answer = "no";
		const domain = makeDomain({ longAbsence: true });
		game.actors.push(domain);
		expect(await welcomeHome(realm, [HOME])).toEqual([]);
		expect(crisisRoll).not.toHaveBeenCalled();
		expect(domain.system.longAbsence).toBe(false);
		expect(await welcomeHome(realm, [HOME])).toEqual([]);
		expect(asked).toHaveLength(1);
	});

	it("asks nothing after a short trip, or away from home", async () => {
		const domain = makeDomain();
		game.actors.push(domain);
		await welcomeHome(realm, [HOME]);
		domain.system.longAbsence = true;
		await welcomeHome(realm, [{ col: 4, row: 2 }]);
		expect(asked).toHaveLength(0);
	});
});

describe("holdingChoices", () => {
	it("lists the Realm's Holdings and says which bears the Domain's name", () => {
		const choices = holdingChoices(makeDomain());
		expect(choices.options).toEqual([{ value: "Scene.s1.Tile.t1", label: `Hollowmere realm.readout.coordinates ${JSON.stringify({ col: 3, row: 2 })}`, selected: false }]);
		expect(choices.blank).toContain("domain.holding.byName");
		expect(holdingChoices(makeDomain({ holding: "Scene.s1.Tile.t1" })).options[0].selected).toBe(true);
	});

	it("doesn't offer a player a Holding another Domain rules, but keeps their Domain's own", () => {
		game.user.isGM = false;
		const realms = [{ sceneId: "s1", holdings: [{ id: "t1", hex: HOME, name: "Hollowmere" }, { id: "t2", hex: HOME, name: "Bree" }, { id: "t3", hex: HOME, name: "Carn" }] }];
		const mine = { ...makeDomain({ holding: "Scene.s1.Tile.t3" }), name: "Mine" };
		// Another Domain was given t2, and another rules t1 by its name; both also name t3, which this Domain has already.
		const theirs = { ...makeDomain({ holding: "Scene.s1.Tile.t2" }), name: "Theirs" };
		const named = makeDomain();
		const alsoThree = { ...makeDomain({ holding: "Scene.s1.Tile.t3" }), name: "Also" };
		game.actors.push(mine, theirs, named, alsoThree);
		expect(holdingChoices(mine, realms).options.map(({ value }) => value)).toEqual(["Scene.s1.Tile.t3"]);
		// Founding a new Domain, none of them is offered; the Referee is offered every one.
		expect(holdingOptions("Scene.s1.Tile.t2", realms)).toEqual([]);
		game.user.isGM = true;
		expect(holdingOptions("", realms)).toHaveLength(3);
	});
});

describe("a ruler away (p14, p20)", () => {
	it("leaves a Slain ruler out, since theirs is Succession's business", async () => {
		game.actors = [{ ...eve, system: { domain: "", slain: true } }];
		const domain = makeDomain();
		game.actors.push(domain);
		expect(await markLongAbsences()).toEqual([]);
	});

	it("marks a ruler leaving for a distant Realm away, though the Company set out from home", async () => {
		companyAt.s1 = { ...HOME };
		const domain = makeDomain();
		game.actors.push(domain);
		expect(await markLongAbsences({ leaving: true })).toEqual([domain]);
		expect(domain.system.longAbsence).toBe(true);
	});
});

describe("a Holding chosen on the Domain's sheet (p20–21)", () => {
	const path = (object, key) => key.split(".").reduce((node, part) => node?.[part], object);
	const seatRealm = { sceneId: "s1", holdings: [{ id: "t1", seat: true }, { id: "t2", seat: false }] };

	beforeEach(() => {
		globalThis.foundry = {
			utils: {
				getProperty: path,
				hasProperty: (object, key) => path(object, key) !== undefined,
				setProperty: (object, key, value) => {
					const keys = key.split(".");
					const last = keys.pop();
					keys.reduce((node, part) => (node[part] ??= {}), object)[last] = value;
				}
			}
		};
		globalThis.Actor = { implementation: { updateDocuments: vi.fn(async () => []) } };
		game.users = { activeGM: { isSelf: true } };
	});

	it("makes the Domain a Seat of Power with the Realm's Seat, and not with another Holding", () => {
		const seat = { system: { holding: "Scene.s1.Tile.t1" } };
		seatWithHolding({ type: "domain" }, seat, [seatRealm]);
		expect(seat.system.seat).toBe(true);
		const other = { system: { holding: "Scene.s1.Tile.t2" } };
		seatWithHolding({ type: "domain" }, other, [seatRealm]);
		expect(other.system.seat).toBe(false);
	});

	it("leaves a change that says for itself whether it's a Seat, a blank Holding, or another kind of actor", () => {
		const granted = { system: { holding: "Scene.s1.Tile.t2", seat: true } };
		seatWithHolding({ type: "domain" }, granted, [seatRealm]);
		expect(granted.system.seat).toBe(true);
		const blank = { system: { holding: "" } };
		seatWithHolding({ type: "domain" }, blank, [seatRealm]);
		expect(blank.system.seat).toBeUndefined();
		const knight = { system: { holding: "Scene.s1.Tile.t1" } };
		seatWithHolding({ type: "knight" }, knight, [seatRealm]);
		expect(knight.system.seat).toBeUndefined();
	});

	it("has a Domain whose Seat is taken away stop being a Seat of Power, but keeps one ticked by hand", () => {
		const taken = { system: { holding: "" } };
		seatWithHolding({ type: "domain", system: { holding: "Scene.s1.Tile.t1", seat: true } }, taken, [seatRealm]);
		expect(taken.system.seat).toBe(false);
		const byHand = { system: { holding: "" } };
		seatWithHolding({ type: "domain", system: { holding: "", seat: true } }, byHand, [seatRealm]);
		expect(byHand.system.seat).toBeUndefined();
		const fromOther = { system: { holding: "" } };
		seatWithHolding({ type: "domain", system: { holding: "Scene.s1.Tile.t2", seat: true } }, fromOther, [seatRealm]);
		expect(fromOther.system.seat).toBeUndefined();
	});

	it("has any other Domain naming the Holding give it up, on the active GM's browser alone", async () => {
		const mine = { ...makeDomain({ holding: "Scene.s1.Tile.t1" }), id: "d1" };
		const theirs = { ...makeDomain({ holding: "Scene.s1.Tile.t1" }), id: "d2" };
		const elsewhere = { ...makeDomain({ holding: "Scene.s1.Tile.t2" }), id: "d3" };
		game.actors.push(mine, theirs, elsewhere);
		expect(await oneDomainPerHolding(mine, { system: { holding: "Scene.s1.Tile.t1" } })).toEqual([theirs]);
		expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "d2", "system.holding": "" }]);
		game.users.activeGM.isSelf = false;
		expect(await oneDomainPerHolding(mine, { system: { holding: "Scene.s1.Tile.t1" } })).toEqual([]);
	});

	it("has a Domain founded on a ruled Holding take it from the other, as giving it on the sheet does", async () => {
		const hooks = {};
		globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
		registerHomecoming();
		const theirs = { ...makeDomain({ holding: "Scene.s1.Tile.t1" }), id: "d2" };
		const founded = { ...makeDomain({ holding: "Scene.s1.Tile.t1" }), id: "d1" };
		game.actors.push(theirs, founded);
		hooks.createActor(founded, { [FOUNDED_OPTION]: true });
		await vi.waitFor(() => expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "d2", "system.holding": "" }]));
		delete globalThis.Hooks;
	});

	it("leaves the Holding with its Domain when a copy of that Domain is made, by Duplicate or import", async () => {
		const hooks = {};
		globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
		registerHomecoming();
		const original = { ...makeDomain({ holding: "Scene.s1.Tile.t1" }), id: "d2" };
		const copy = { ...makeDomain({ holding: "Scene.s1.Tile.t1" }), id: "d1" };
		game.actors.push(original, copy);
		hooks.createActor(copy, {});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(Actor.implementation.updateDocuments).not.toHaveBeenCalled();
		delete globalThis.Hooks;
	});
});

describe("the crown moved on the map (p14, p21)", () => {
	const path = (object, key) => key.split(".").reduce((node, part) => node?.[part], object);
	/**
	 * @param {string} id
	 * @param {boolean} seat
	 * @returns {object} A Holding's Tile on the Realm s1.
	 */
	const holdingTile = (id, seat) => ({ id, parent: { id: "s1" }, flags: { [SYSTEM_ID]: { realm: { kind: "holding", style: "castle", seat } } } });
	const crowned = { flags: { [SYSTEM_ID]: { realm: { seat: true } } } };

	beforeEach(() => {
		globalThis.foundry = { utils: { hasProperty: (object, key) => path(object, key) !== undefined } };
		globalThis.Actor = { implementation: { updateDocuments: vi.fn(async () => []) } };
		game.users = { activeGM: { isSelf: true } };
	});

	it("makes the Domain ruling a newly crowned Holding a Seat of Power, and the one ruling the old Seat not", async () => {
		const newSeat = { ...makeDomain({ holding: "Scene.s1.Tile.t2", seat: false }), id: "d1" };
		const oldSeat = { ...makeDomain({ holding: "Scene.s1.Tile.t1", seat: true }), id: "d2" };
		const elsewhere = { ...makeDomain({ holding: "Scene.s1.Tile.t3", seat: false }), id: "d3" };
		game.actors.push(newSeat, oldSeat, elsewhere);
		expect(await seatFollowsCrown(holdingTile("t2", true), crowned)).toEqual([newSeat]);
		expect(Actor.implementation.updateDocuments).toHaveBeenLastCalledWith([{ _id: "d1", "system.seat": true }]);
		expect(await seatFollowsCrown(holdingTile("t1", false), { flags: { [SYSTEM_ID]: { realm: { kind: "holding", seat: false } } } })).toEqual([oldSeat]);
		expect(Actor.implementation.updateDocuments).toHaveBeenLastCalledWith([{ _id: "d2", "system.seat": false }]);
	});

	it("leaves the Domains be when the crown isn't written, already agrees, or on another browser", async () => {
		const ruling = { ...makeDomain({ holding: "Scene.s1.Tile.t2", seat: false }), id: "d1" };
		game.actors.push(ruling);
		expect(await seatFollowsCrown(holdingTile("t2", true), { x: 100 })).toEqual([]);
		expect(await seatFollowsCrown(holdingTile("t2", false), crowned)).toEqual([]);
		expect(await seatFollowsCrown({ ...holdingTile("t2", true), flags: { [SYSTEM_ID]: { realm: { kind: "myth" } } } }, crowned)).toEqual([]);
		game.users.activeGM.isSelf = false;
		expect(await seatFollowsCrown(holdingTile("t2", true), crowned)).toEqual([]);
		expect(Actor.implementation.updateDocuments).not.toHaveBeenCalled();
	});

	it("follows a crowned Holding's Tile as it's made, and as it's updated, through the Tile hooks", async () => {
		const hooks = {};
		globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
		registerHomecoming();
		const ruling = { ...makeDomain({ holding: "Scene.s1.Tile.t2", seat: false }), id: "d1" };
		game.actors.push(ruling);
		hooks.createTile(holdingTile("t2", true), {});
		await vi.waitFor(() => expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "d1", "system.seat": true }]));
		ruling.system.seat = true;
		hooks.updateTile(holdingTile("t2", false), { flags: { [SYSTEM_ID]: { realm: { seat: false } } } }, {});
		await vi.waitFor(() => expect(Actor.implementation.updateDocuments).toHaveBeenCalledWith([{ _id: "d1", "system.seat": false }]));
		delete globalThis.Hooks;
	});
});
