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
		expect(keep.update).not.toHaveBeenCalled();
		const [update] = fen.update.mock.calls[0];
		expect(update["system.court.newId"]).toMatchObject({ role: "courtier", name: "Moss" });
		expect(entries[0].lines[0]).toContain("time.pursuitMakes.courtesy.joined");
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
