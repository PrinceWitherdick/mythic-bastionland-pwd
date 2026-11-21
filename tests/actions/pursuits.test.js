import { beforeEach, describe, expect, it, vi } from "vitest";
import { PURSUIT_MAKINGS, pursuitMakings } from "../../module/rules/time.js";

/** What each question answers in turn, what was asked, the world's Domains, and the notices shown. */
let answers;
let asked;
let domains;
let notices;
let useTool;
/** The Realm in view, as getRealm reads it. */
let realm;

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
vi.mock("../../module/actions/dominion.js", () => ({ worldDomains: () => domains, knightDomain: (actor) => actor.domain ?? null }));
vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: (scene) => Boolean(scene), getRealm: () => (realm ? { realm } : null) }));
vi.mock("../../module/actions/threads.js", () => ({ addThread: vi.fn(async () => "t1") }));
vi.mock("../../module/actions/grand-designs.js", () => ({ beginDesign: vi.fn(async () => "g1") }));
vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: (hex) => `${hex.col},${hex.row}` }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, mythLookup: (_index, myth) => ({ name: `Myth ${myth.number}` }) }));
vi.mock("../../module/actions/exploration.js", () => ({ markOnPlayersMap: vi.fn(async () => 1) }));

const { followPursuits } = await import("../../module/actions/pursuits.js");

const knight = (name) => ({ name });
const domain = (id, name) => ({ id, name, isOwner: true, update: vi.fn() });

beforeEach(() => {
	answers = [];
	asked = [];
	domains = [];
	notices = [];
	useTool = vi.fn();
	realm = null;
	globalThis.canvas = { realm: { useTool }, scene: {} };
	globalThis.ui = { notifications: { info: (text) => notices.push(text) } };
	globalThis.foundry = { utils: { randomID: () => "newId" } };
	globalThis.game = { actors: [] };
});

describe("pursuitMakings", () => {
	it("lets Pilgrimage, Service, Courtesy and Duty make something, and nothing else (p17)", () => {
		expect(pursuitMakings("pilgrimage")).toEqual(["myth", "landmark", "other"]);
		expect(pursuitMakings("service")).toEqual(["dwelling", "other"]);
		expect(pursuitMakings("courtesy")).toEqual(["court", "contact", "favour"]);
		expect(pursuitMakings("duty")).toEqual(["grand", "holding", "other"]);
		expect(pursuitMakings("succession")).toEqual([]);
		expect(pursuitMakings(null)).toEqual([]);
		expect(pursuitMakings("toString")).toEqual([]);
		expect(Object.keys(PURSUIT_MAKINGS)).toEqual(["pilgrimage", "service", "courtesy", "duty"]);
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
		const company = [{ actor: knight("Tal"), pursuit: "succession" }, { actor: knight("Moss"), pursuit: "courtesy" }];
		const entries = [{ lines: [] }, { lines: [] }];
		answers = ["favour"];
		await followPursuits(company, entries, "Winter");
		expect(asked).toHaveLength(1);
		expect(entries[0].lines).toEqual([]);
		expect(entries[1].lines).toEqual(["time.pursuitMakes.courtesy.made.favour"]);
	});

	it("keeps a favour or a contact Courtesy earned with what's left open, for the Knight who earned it", async () => {
		const { addThread } = await import("../../module/actions/threads.js");
		addThread.mockClear();
		const moss = knight("Moss");
		const company = [{ actor: moss, pursuit: "courtesy", making: "favour" }, { actor: knight("Ash"), pursuit: "service", making: "other" }];
		await followPursuits(company, [{ lines: [] }, { lines: [] }], "Winter");
		expect(addThread).toHaveBeenCalledOnce();
		expect(addThread).toHaveBeenCalledWith({ kind: "favour", name: 'threads.courtesy.favour {"name":"Moss"}', knight: moss.id });
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

	it("shows on the players' map where the Myth a Pilgrimage learnt of lies, picked from those still hidden (p17)", async () => {
		const { markOnPlayersMap } = await import("../../module/actions/exploration.js");
		markOnPlayersMap.mockClear();
		realm = {
			myths: [{ id: "m1", number: 1, hex: { col: 2, row: 3 }, revealed: true }, { id: "m2", number: 2, hex: { col: 4, row: 5 }, revealed: false }, { id: "m3", number: 3, hex: { col: 6, row: 1 }, revealed: false }],
			landmarks: []
		};
		const entries = [{ lines: [] }];
		answers = ["m3"];
		await followPursuits([{ actor: knight("Tal"), pursuit: "pilgrimage", making: "myth" }], entries, "Winter");
		expect(asked[0].items.map(({ name, detail }) => [name, detail])).toEqual([["Myth 2", "4,5"], ["Myth 3", "6,1"]]);
		expect(markOnPlayersMap).toHaveBeenCalledWith(canvas.scene, ["m3"]);
		expect(entries[0].lines).toEqual(['time.pursuitMakes.pilgrimage.made.myth {"name":"Myth 3","hex":"6,1"}']);
	});

	it("shows the only Landmark still hidden without asking which, and says when none is", async () => {
		const { markOnPlayersMap } = await import("../../module/actions/exploration.js");
		markOnPlayersMap.mockClear();
		realm = { myths: [], landmarks: [{ id: "l1", type: "sanctum", name: "Greyhallow", hex: { col: 1, row: 1 }, revealed: false }] };
		const entries = [{ lines: [] }, { lines: [] }];
		await followPursuits([{ actor: knight("Tal"), pursuit: "pilgrimage", making: "landmark" }, { actor: knight("Ash"), pursuit: "pilgrimage", making: "myth" }], entries, "Winter");
		expect(asked).toHaveLength(0);
		expect(markOnPlayersMap).toHaveBeenCalledOnce();
		expect(entries[0].lines[0]).toContain("Greyhallow");
		expect(entries[1].lines).toEqual(["time.pursuitMakes.pilgrimage.noneHidden.myth"]);
	});

	it("says to open a Realm where there's none to learn of", async () => {
		canvas.scene = null;
		game.scenes = { active: null };
		const entries = [{ lines: [] }];
		await followPursuits([{ actor: knight("Tal"), pursuit: "pilgrimage", making: "myth" }], entries, "Winter");
		expect(entries[0].lines).toEqual(["time.pursuitMakes.pilgrimage.noRealm"]);
	});

	it("begins a grand project on the Domain a Knight's Duty serves, or says there's none (p17, p21)", async () => {
		const { beginDesign } = await import("../../module/actions/grand-designs.js");
		beginDesign.mockClear();
		const keep = domain("d1", "Keep");
		const entries = [{ lines: [] }, { lines: [] }];
		await followPursuits([{ actor: { name: "Moss", domain: keep }, pursuit: "duty", making: "grand" }, { actor: knight("Tal"), pursuit: "duty", making: "grand" }], entries, "Spring");
		expect(beginDesign).toHaveBeenCalledOnce();
		expect(beginDesign).toHaveBeenCalledWith(keep, "grand");
		expect(entries[0].lines).toEqual(['time.pursuitMakes.duty.begun {"domain":"Keep"}']);
		expect(entries[1].lines).toEqual(['time.pursuitMakes.duty.noDomain {"name":"Tal"}']);
	});

	it("takes up the Holding brush for a Holding a Duty added", async () => {
		const entries = [{ lines: [] }];
		await followPursuits([{ actor: knight("Moss"), pursuit: "duty", making: "holding" }], entries, "Spring");
		expect(useTool).toHaveBeenCalledWith("terrain", { brush: "holding" });
		expect(notices).toEqual(["time.pursuitMakes.duty.markIt"]);
		expect(entries[0].lines).toEqual(["time.pursuitMakes.duty.made.holding"]);
	});
});
