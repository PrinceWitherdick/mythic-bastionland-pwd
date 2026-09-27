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

const { holdingChoices, markLongAbsences, welcomeHome } = await import("../../module/actions/homecoming.js");
const { crisisRoll } = await import("../../module/actions/dominion.js");

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
});
