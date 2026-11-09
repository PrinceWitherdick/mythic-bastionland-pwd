import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { hexCentre, hexKey, realmGeometry } from "../../module/rules/realm-geometry.js";
import { placeFeature } from "../../module/rules/realm-edits.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();
const mythHex = { col: 4, row: 5 };
const wildHex = { col: 8, row: 8 };

/** The Realm, the calendar, the world's settings, the next d6, who rides with the Company, and where its Token stands. */
let realm;
let calendar;
let settings;
let d6;
let company;
/** Whether the Referee has said the Company is worthy of the City Quest. */
let worthiness;
let companyAt;

vi.mock("../../module/actions/realm.js", () => ({
	getRealm: () => ({ realm }),
	isRealmScene: (scene) => Boolean(scene?.isRealm),
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/myth-notes.js", () => ({ liveRealm: (_scene, whole) => whole }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({ ...calendar }) }));
vi.mock("../../module/actions/company.js", () => ({ findCompanyToken: () => (companyAt ? { getCenterPoint: () => hexCentre(g, companyAt) } : null) }));
vi.mock("../../module/actions/journey.js", () => ({ heldBackFrom: () => false }));
vi.mock("../../module/actions/solo.js", () => ({ keptFromMe: () => false }));
vi.mock("../../module/actions/knights.js", () => ({ inCompany: (actor) => company.includes(actor), sidesWithCompany: () => false }));
vi.mock("../../module/actions/city-quest.js", () => ({ cityOmensSeen: () => [], cityQuestSetWorthy: () => worthiness, rollCityOmen: vi.fn(async () => ({ omen: 4, ends: false })) }));
vi.mock("../../module/actions/landmarks.js", () => ({ landmarkOfferView: () => ({}), nameLandmarkFromPrompt: async () => null, strikeOffCourse: vi.fn() }));
vi.mock("../../module/actions/timeline-events.js", () => ({ omensMet: () => ({}), timelineLandmarkFound: async () => null }));
vi.mock("../../module/actions/omen-scenes.js", () => ({ omenSceneChips: () => [], omenSceneIds: () => [] }));
vi.mock("../../module/actions/hex-names.js", () => ({ hexLabel: (hex) => hexKey(hex) }));
vi.mock("../../module/chat/hex-target.js", () => ({ hexTarget: () => ({}) }));
vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: async () => null, mythEntry: () => ({ name: "The Wyvern", page: 33, entry: null }), seerEntry: () => ({}) }));
vi.mock("../../module/chat/cards.js", () => ({ postCard: vi.fn(async () => {}), t: (key) => key }));

const { markOmenOnEntering, omenShownOnEntering, wildernessRoll } = await import("../../module/actions/wilderness.js");
const { rollCityOmen } = await import("../../module/actions/city-quest.js");
const { strikeOffCourse } = await import("../../module/actions/landmarks.js");
const { postCard } = await import("../../module/chat/cards.js");

const scene = { id: "realm", isRealm: true, tokens: [], updateEmbeddedDocuments: vi.fn(async () => {}) };
const card = () => vi.mocked(postCard).mock.calls.find(([, kind]) => kind === "wilderness")?.[2];

beforeEach(() => {
	vi.clearAllMocks();
	realm = placeFeature(emptyRealm(g, "wild"), g, mythHex, { kind: "myth", number: 2, d6: 1, d12: 5, omen: 1 });
	realm.myths[0].id = "t2";
	calendar = { age: 1, year: 1, season: "spring", day: 1, phase: "morning" };
	settings = new Map();
	d6 = 4;
	company = [];
	worthiness = "auto";
	companyAt = null;
	globalThis.game = {
		user: { isGM: true },
		actors: { filter: (test) => company.filter(test) },
		settings: {
			get: (_system, key) => settings.get(key) ?? null,
			set: vi.fn(async (_system, key, value) => settings.set(key, value))
		}
	};
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
		}
		async evaluate() {
			this.total = this.formula === "1d6" ? d6 : 1;
			return this;
		}
	};
});

describe("a Phase ended in a Myth's own hex (p18)", () => {
	it("shows the Myth's next Omen with no roll, and says the Knights get the drop on it", async () => {
		const outcome = await wildernessRoll({ scene, hex: mythHex, phase: "morning", mode: "travel" });
		expect(outcome).toMatchObject({ result: "mythHex", omen: 2, d6: null });
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Tile", [{ _id: "t2", [`flags.${SYSTEM_ID}.realm.omen`]: 2 }], {});
		expect(card().drop).toBe("realm.wilderness.drop");
	});

	it("gives no drop for an Omen shown as the Company comes in, or once all six are seen", async () => {
		await wildernessRoll({ scene, hex: mythHex });
		expect(card().drop).toBeNull();
		vi.clearAllMocks();
		realm.myths[0].omen = 6;
		await wildernessRoll({ scene, hex: mythHex, phase: "morning", mode: "travel" });
		expect(card().drop).toBeNull();
	});
});

describe("an Omen shown as the Company came into a Myth's hex (p27)", () => {
	it("counts for that hex and Phase only, so ending the Phase there shows no second one", async () => {
		await markOmenOnEntering(scene, mythHex);
		expect(omenShownOnEntering(scene, mythHex)).toBe(true);
		expect(omenShownOnEntering(scene, wildHex)).toBe(false);
		expect(omenShownOnEntering({ id: "other" }, mythHex)).toBe(false);
		expect(omenShownOnEntering(scene, mythHex, { ...calendar, phase: "midday" })).toBe(false);
	});

	it("is nothing before any Omen has shown on entering", () => {
		expect(omenShownOnEntering(scene, mythHex)).toBe(false);
	});
});

describe("a Company with a Knight-Radiant, on the City Quest (p172)", () => {
	it("meets an Omen of the City on a 1, and no Myth's Omen is spent", async () => {
		company = [{ system: { rank: "radiant" } }];
		d6 = 1;
		const outcome = await wildernessRoll({ scene, hex: wildHex, phase: "morning", mode: "travel" });
		expect(outcome).toEqual({ result: "randomOmen", d6: 1 });
		expect(scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
		expect(rollCityOmen).toHaveBeenCalledTimes(1);
		expect(card().cityQuest).toBe("cityQuest.wildernessHint");
	});

	it("meets a Myth's Omen on a 1 when nobody in the Company is a Knight-Radiant", async () => {
		company = [{ system: { rank: "knight" } }];
		d6 = 1;
		const outcome = await wildernessRoll({ scene, hex: wildHex, phase: "morning", mode: "travel" });
		expect(outcome).toMatchObject({ result: "randomOmen", omen: 2 });
		expect(rollCityOmen).not.toHaveBeenCalled();
	});

	it("meets a Myth's Omen when the only Knight-Radiant is Slain", async () => {
		company = [{ system: { rank: "radiant", slain: true } }];
		d6 = 1;
		const outcome = await wildernessRoll({ scene, hex: wildHex, phase: "morning", mode: "travel" });
		expect(outcome).toMatchObject({ result: "randomOmen", omen: 2 });
		expect(rollCityOmen).not.toHaveBeenCalled();
	});

	it("does as the Referee says, worthy or not, whoever rides", async () => {
		d6 = 1;
		worthiness = "worthy";
		company = [{ system: { rank: "tenant" } }];
		expect(await wildernessRoll({ scene, hex: wildHex, phase: "morning", mode: "travel" })).toEqual({ result: "randomOmen", d6: 1 });
		expect(rollCityOmen).toHaveBeenCalledTimes(1);
		worthiness = "unworthy";
		company = [{ system: { rank: "radiant" } }];
		expect(await wildernessRoll({ scene, hex: wildHex, phase: "morning", mode: "travel" })).toMatchObject({ result: "randomOmen", omen: 2 });
		expect(rollCityOmen).toHaveBeenCalledTimes(1);
	});
});

describe("a Curse met on a Wilderness Roll (p14)", () => {
	beforeEach(() => {
		realm = placeFeature(realm, g, wildHex, { kind: "landmark", type: "curse", revealed: true });
		globalThis.canvas = { scene: null };
	});

	it("throws the Company off course where it stands there", async () => {
		companyAt = wildHex;
		const outcome = await wildernessRoll({ scene, hex: wildHex, mode: "travel" });
		expect(outcome.result).toBe("landmark");
		expect(strikeOffCourse).toHaveBeenCalledTimes(1);
	});

	it("leaves the Company on course when the Referee rolls for a hex it isn't in", async () => {
		companyAt = { col: 2, row: 2 };
		const outcome = await wildernessRoll({ scene, hex: wildHex, mode: "travel" });
		expect(outcome.result).toBe("landmark");
		expect(strikeOffCourse).not.toHaveBeenCalled();
	});

	it("takes it for the Company's own roll where no Token says where the Company is", async () => {
		await wildernessRoll({ scene, hex: wildHex, mode: "travel" });
		expect(strikeOffCourse).toHaveBeenCalledTimes(1);
	});
});
