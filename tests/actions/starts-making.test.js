import { beforeEach, describe, expect, it, vi } from "vitest";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

/**
 * What a Start sets going as its Realm is made (p6): a Ruler's Domain waits
 * for the Company to be put down in its Holding, Wanderers are pointed to the
 * Realm's Seers, and Myths equally near the Court are chosen between by a
 * roll the Referee sees.
 */

let posted;
let realm;
let placing;
let solo;
const hooks = new Map();

vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	postCard: vi.fn(async (_actor, template, data, options) => posted.push({ template, data, options })),
	registerCardButtons: vi.fn(),
	warn: vi.fn()
}));
vi.mock("../../module/book-art/art-index.js", () => ({
	loadArtIndex: async () => null,
	mythEntry: () => ({ name: "A Myth" }),
	seerEntry: (_index, { d6, d12 }) => ({ name: `Seer ${d6}-${d12}` })
}));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollSpark: vi.fn(async () => null) }));
vi.mock("../../module/actions/timeline-events.js", () => ({ omensMet: () => ({}) }));
vi.mock("../../module/actions/found-domain.js", () => ({
	offerRulerDomain: vi.fn(async () => null),
	seatCourtiers: vi.fn(async () => ({ name: "Seat" })),
	seatOfPower: () => realm.holdings.find((holding) => holding.seat) ?? null,
	seatName: (seat) => seat.name
}));
vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: () => true,
	sceneGeometry: () => realmGeometry()
}));
vi.mock("../../module/actions/myth-notes.js", () => ({ liveRealm: () => realm }));
vi.mock("../../module/canvas/company-placement.js", () => ({
	COMPANY_PLACING_HOOK: "placing",
	isPlacingCompany: () => placing,
	// As the real one does: done at once, or once the hook says the Company is no longer carried.
	companyPlacementDone: () => (placing ? new Promise((resolve) => {
		const id = Hooks.on("placing", () => {
			if (placing) return;
			Hooks.off("placing", id);
			resolve();
		});
	}) : Promise.resolve())
}));
vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: ({ col, row }) => `${col}.${row}` }));
vi.mock("../../module/actions/solo.js", () => ({ keptFromMe: () => solo }));

const { announceStart } = await import("../../module/actions/starts.js");
const { offerRulerDomain } = await import("../../module/actions/found-domain.js");

const scene = { id: "s1", updateEmbeddedDocuments: vi.fn(async () => []) };
const myth = (id, number, col, row) => ({ id, number, hex: { col, row }, d6: 1, d12: number, omen: 0 });

beforeEach(() => {
	posted = [];
	placing = false;
	solo = false;
	hooks.clear();
	vi.mocked(offerRulerDomain).mockClear();
	realm = { holdings: [{ id: "h1", name: "Seat", hex: { col: 6, row: 6 }, seat: true }], myths: [], landmarks: [] };
	globalThis.game = { user: { isGM: true } };
	globalThis.Hooks = {
		on: (name, fn) => {
			hooks.set(name, fn);
			return 1;
		},
		off: (name) => hooks.delete(name)
	};
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
		}

		async evaluate() {
			this.total = Number(this.formula.split("d")[1]);
			return this;
		}
	};
});

describe("a Ruler Start", () => {
	it("asks who rules once the Company is put down, so its Holding is the one they stand in", async () => {
		placing = true;
		const announcing = announceStart(scene, "ruler");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(offerRulerDomain).not.toHaveBeenCalled();
		placing = false;
		hooks.get("placing")();
		await announcing;
		expect(offerRulerDomain).toHaveBeenCalledWith(scene);
	});

	it("asks at once when nobody is carrying the Company", async () => {
		await announceStart(scene, "ruler");
		expect(offerRulerDomain).toHaveBeenCalledOnce();
	});
});

describe("a Wanderer Start", () => {
	it("tells the Referee which Seers the Realm's Sanctums are home to (p6)", async () => {
		realm.landmarks = [
			{ type: "sanctum", hex: { col: 2, row: 3 }, seer: { d6: 4, d12: 9 } },
			{ type: "dwelling", hex: { col: 5, row: 5 }, seer: null },
			{ type: "sanctum", hex: { col: 8, row: 1 }, seer: null }
		];
		await announceStart(scene, "wanderer");
		expect(posted).toHaveLength(1);
		expect(posted[0].options).toMatchObject({ mode: "gm" });
		expect(posted[0].data.text).toContain("company.starts.wanderer.counsel");
		expect(posted[0].data.text).toContain("Seer 4-9");
		expect(posted[0].data.text).toContain("2.3");
	});

	it("says so where the Realm has no Sanctum, and tells nothing played alone", async () => {
		await announceStart(scene, "wanderer");
		expect(posted[0].data.text).toBe("company.starts.wanderer.noSanctum");
		solo = true;
		posted = [];
		await announceStart(scene, "wanderer");
		expect(posted).toEqual([]);
	});
});

describe("the Court's news", () => {
	it("chooses between Myths equally near by a roll it shows, and names them", async () => {
		realm.myths = [myth("t1", 1, 6, 3), myth("t2", 2, 6, 9)];
		await announceStart(scene, "courtier");
		const news = posted.find((card) => card.template === "omen");
		expect(news.options.rolls).toHaveLength(1);
		expect(news.data.hint).toContain('realm.wilderness.tied {"numbers":"1, 2"}');
		// The die came up 2, so the second Myth's first Omen is the news.
		expect(scene.updateEmbeddedDocuments).toHaveBeenLastCalledWith("Tile", [expect.objectContaining({ _id: "t2" })], {});
	});

	it("shows no roll for a single nearest Myth, nor the tie played alone", async () => {
		realm.myths = [myth("t1", 1, 6, 4), myth("t2", 2, 1, 12)];
		await announceStart(scene, "courtier");
		expect(posted.find((card) => card.template === "omen").options.rolls).toEqual([]);
		realm.myths = [myth("t1", 1, 6, 3), myth("t2", 2, 6, 9)];
		solo = true;
		posted = [];
		await announceStart(scene, "courtier");
		const news = posted.find((card) => card.template === "omen");
		expect(news.options.rolls).toEqual([]);
		expect(news.data.hint).not.toContain("tied");
	});
});
