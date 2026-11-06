import { beforeEach, describe, expect, it, vi } from "vitest";
import { PURSUIT_MAKINGS, pursuitMakings } from "../../module/rules/time.js";

/** What each question answers in turn, what was asked, the world's Domains, and the notices shown. */
let answers;
let asked;
let domains;
let notices;
let useTool;

vi.mock("../../module/apps/ui.js", () => ({
	chooseDialog: vi.fn(async (options) => {
		asked.push(options);
		return answers.shift() ?? null;
	})
}));
// The Court picked from a list is answered by its id, from the same answers.
vi.mock("../../module/apps/actor-pick.js", () => ({
	chooseOne: vi.fn(async (items, ask) => {
		asked.push({ ...ask, items });
		const id = answers.shift() ?? null;
		return items.find((item) => item.id === id) ?? null;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/dominion.js", () => ({ worldDomains: () => domains }));
vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: () => true }));

const { followPursuits } = await import("../../module/actions/pursuits.js");

const knight = (name) => ({ name });
const domain = (id, name) => ({ id, name, isOwner: true, update: vi.fn() });

beforeEach(() => {
	answers = [];
	asked = [];
	domains = [];
	notices = [];
	useTool = vi.fn();
	globalThis.canvas = { realm: { useTool }, scene: {} };
	globalThis.ui = { notifications: { info: (text) => notices.push(text) } };
	globalThis.foundry = { utils: { randomID: () => "newId" } };
	globalThis.game = { actors: [] };
});

describe("pursuitMakings", () => {
	it("lets Service and Courtesy make something, and nothing else", () => {
		expect(pursuitMakings("service")).toEqual(["dwelling", "other"]);
		expect(pursuitMakings("courtesy")).toEqual(["court", "contact", "favour"]);
		expect(pursuitMakings("pilgrimage")).toEqual([]);
		expect(pursuitMakings(null)).toEqual([]);
		expect(pursuitMakings("toString")).toEqual([]);
		expect(Object.keys(PURSUIT_MAKINGS)).toEqual(["service", "courtesy"]);
	});
});

describe("followPursuits", () => {
	it("carries out what was said beside the pursuit without asking, and asks where nothing was", async () => {
		const company = [{ actor: knight("Tal"), pursuit: "courtesy", making: "contact" }, { actor: knight("Moss"), pursuit: "service", making: null }, { actor: knight("Ash"), pursuit: "service", making: "favour" }];
		const entries = [{ lines: [] }, { lines: [] }, { lines: [] }];
		answers = ["other", "other"];
		await followPursuits(company, entries, "Winter");
		expect(asked.map(({ message }) => message)).toEqual([
			'time.pursuitMakes.service.question {"name":"Moss"}',
			'time.pursuitMakes.service.question {"name":"Ash"}'
		]);
		expect(entries.map(({ lines }) => lines[0])).toEqual(["time.pursuitMakes.courtesy.made.contact", "time.pursuitMakes.service.made.other", "time.pursuitMakes.service.made.other"]);
	});

	it("asks only those whose pursuit makes something, and says what it made on their entry", async () => {
		const company = [{ actor: knight("Tal"), pursuit: "pilgrimage" }, { actor: knight("Moss"), pursuit: "courtesy" }];
		const entries = [{ lines: [] }, { lines: [] }];
		answers = ["favour"];
		await followPursuits(company, entries, "Winter");
		expect(asked).toHaveLength(1);
		expect(entries[0].lines).toEqual([]);
		expect(entries[1].lines).toEqual(["time.pursuitMakes.courtesy.made.favour"]);
	});

	it("takes up the Dwelling brush once everybody has been asked (p192)", async () => {
		const company = [{ actor: knight("Tal"), pursuit: "service" }, { actor: knight("Ash"), pursuit: "service" }];
		const entries = [{ lines: [] }, { lines: [] }];
		answers = ["dwelling", "other"];
		await followPursuits(company, entries, "Winter");
		expect(useTool).toHaveBeenCalledOnce();
		expect(useTool).toHaveBeenCalledWith("terrain", { brush: "dwelling" });
		expect(entries.map(({ lines }) => lines[0])).toEqual(["time.pursuitMakes.service.made.dwelling", "time.pursuitMakes.service.made.other"]);
	});

	it("writes a Courtier into the Court of the Domain picked", async () => {
		const keep = domain("d1", "Keep");
		const fen = domain("d2", "Fen");
		domains = [keep, fen];
		const entries = [{ lines: [] }];
		answers = ["court", "d2"];
		await followPursuits([{ actor: knight("Moss"), pursuit: "courtesy" }], entries, "Winter");
		// The Courts are a list to pick one from, with one button, not a button for each.
		expect(asked[1].items).toEqual([keep, fen]);
		expect(asked[1]).toMatchObject({ message: 'time.pursuitMakes.courtesy.whichCourt {"name":"Moss"}', ok: "time.pursuitMakes.courtesy.joinCourt" });
		expect(asked[1].buttons).toBeUndefined();
		expect(keep.update).not.toHaveBeenCalled();
		const [update] = fen.update.mock.calls[0];
		expect(update["system.court.newId"]).toMatchObject({ role: "courtier", name: "Moss" });
		expect(entries[0].lines[0]).toContain("time.pursuitMakes.courtesy.joined");
	});

	it("joins no Court when the list of Courts is closed", async () => {
		domains = [domain("d1", "Keep"), domain("d2", "Fen")];
		const entries = [{ lines: [] }];
		answers = ["court", null];
		await followPursuits([{ actor: knight("Moss"), pursuit: "courtesy" }], entries, "Winter");
		expect(domains.every(({ update }) => !update.mock.calls.length)).toBe(true);
	});

	it("seats a Knight already at a Court nowhere twice, and says so (p192)", async () => {
		const moss = { id: "k1", name: "Moss", type: "knight", system: {} };
		game.actors = [moss];
		const keep = { ...domain("d1", "Keep"), system: { court: { c1: { role: "courtier", name: "Moss", knight: "k1" } } } };
		domains = [keep];
		const entries = [{ lines: [] }];
		answers = ["court"];
		await followPursuits([{ actor: moss, pursuit: "courtesy" }], entries, "Winter");
		expect(keep.update).not.toHaveBeenCalled();
		expect(entries[0].lines).toEqual(['time.pursuitMakes.courtesy.alreadyAtCourt {"court":"Keep"}']);
	});

	it("offers only the Courts a Knight doesn't sit at yet", async () => {
		const moss = { id: "k1", name: "Moss", type: "knight", system: {} };
		game.actors = [moss];
		const keep = { ...domain("d1", "Keep"), system: { court: { c1: { role: "courtier", name: "Moss", knight: "k1" } } } };
		const fen = { ...domain("d2", "Fen"), system: { court: {} } };
		domains = [keep, fen];
		const entries = [{ lines: [] }];
		answers = ["court"];
		await followPursuits([{ actor: moss, pursuit: "courtesy" }], entries, "Winter");
		// One Court left to join, so nobody is asked which.
		expect(asked).toHaveLength(1);
		expect(keep.update).not.toHaveBeenCalled();
		expect(fen.update).toHaveBeenCalledOnce();
		expect(entries[0].lines[0]).toContain("time.pursuitMakes.courtesy.joined");
	});

	it("never offers a Squire a place at Court, even said beside the pursuit (p7)", async () => {
		const tam = { id: "s1", name: "Tam", system: { isSquire: true } };
		domains = [domain("d1", "Keep")];
		const entries = [{ lines: [] }];
		answers = ["favour"];
		await followPursuits([{ actor: tam, pursuit: "courtesy", making: "court" }], entries, "Winter");
		expect(asked).toHaveLength(1);
		expect(asked[0].buttons.map(({ action }) => action)).toEqual(["contact", "favour"]);
		expect(domains[0].update).not.toHaveBeenCalled();
		expect(entries[0].lines).toEqual(["time.pursuitMakes.courtesy.made.favour"]);
	});

	it("says so where no Domain is kept, and asks no more when a question is closed", async () => {
		const entries = [{ lines: [] }, { lines: [] }];
		answers = ["court", null];
		await followPursuits([{ actor: knight("Moss"), pursuit: "courtesy" }, { actor: knight("Tal"), pursuit: "service" }], entries, "Winter");
		expect(entries[0].lines).toEqual(["time.pursuitMakes.courtesy.noCourt"]);
		expect(entries[1].lines).toEqual([]);
		expect(useTool).not.toHaveBeenCalled();
	});
});
