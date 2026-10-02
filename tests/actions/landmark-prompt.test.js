import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRealm } from "../../module/rules/realm.js";
import { realmGeometry } from "../../module/rules/realm-geometry.js";

const g = realmGeometry();
const hex = (col, row) => ({ col, row });

/** The Realm the Scene holds, which editRealm writes back. */
let realm;
/** The prompts along the foot of whatever Myth page is read. */
let prompts;

vi.mock("../../module/chat/cards.js", () => ({
	postCard: vi.fn(),
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key)
}));
vi.mock("../../module/actions/realm.js", () => ({
	editRealm: vi.fn(async (_scene, edit) => {
		realm = edit(realm, g);
	}),
	getRealm: () => ({ realm }),
	isRealmScene: (scene) => Boolean(scene?.realm),
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/book-flip.js", () => ({ throwSpread: vi.fn(async () => ({ d6: 2, d12: 7 })) }));
vi.mock("../../module/actions/company.js", () => ({ companyTokenHex: vi.fn(), setCompanyHex: vi.fn() }));
vi.mock("../../module/actions/journey.js", () => ({ getJourney: vi.fn() }));
vi.mock("../../module/actions/time.js", () => ({ chooseCompany: vi.fn(), virtueLoss: vi.fn() }));
vi.mock("../../module/actions/referee-rolls.js", () => ({ rollRefereeTable: vi.fn() }));
vi.mock("../../module/book-art/art-index.js", () => ({
	loadArtIndex: vi.fn(async () => ({})),
	mythEntry: vi.fn((_index, { d6, d12 }) => ({ name: `Myth ${d6}-${d12}`, page: 40, entry: {} }))
}));
vi.mock("../../module/book-art/myth-tables.js", () => ({ promptsForEntry: vi.fn(async () => prompts) }));
vi.mock("../../module/apps/ui.js", () => ({ chooseDialog: vi.fn() }));

const { nameLandmarkFromPrompt, renameLandmark, rerollLandmarkName } = await import("../../module/actions/landmarks.js");
const { throwSpread } = await import("../../module/actions/book-flip.js");
const { mythEntry } = await import("../../module/book-art/art-index.js");

const scene = { id: "realm", realm: true };
const at = hex(4, 5);
const landmarkHere = () => realm.landmarks.find((landmark) => landmark.hex.col === at.col && landmark.hex.row === at.row);

beforeEach(() => {
	realm = emptyRealm(g);
	realm.landmarks.push({ id: "tile", type: "curse", hex: at, name: "Icy mist", revealed: true });
	prompts = [
		{ label: "Dwelling", value: "Honey farm" },
		{ label: "Sanctum", value: "Chiming bells" },
		{ label: "Curse", value: "Ominous chimes" },
		{ label: "Ruin", value: "Shattered shield" }
	];
	vi.mocked(throwSpread).mockClear();
	vi.mocked(mythEntry).mockClear();
	globalThis.game = { user: { isGM: true } };
	globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
	globalThis.Roll = class {
		constructor(formula) {
			this.total = formula === "1d6" ? 3 : 9;
		}
		async evaluate() {
			return this;
		}
	};
});

describe("naming a Landmark from a random page", () => {
	it("takes the prompt a random page prints for its type", async () => {
		expect(await rerollLandmarkName(scene, at)).toEqual({ name: "Ominous chimes", myth: "Myth 2-7", page: 40 });
		expect(throwSpread).toHaveBeenCalledOnce();
		expect(landmarkHere().name).toBe("Ominous chimes");
	});

	it("leaves the name alone where the page wasn't read", async () => {
		prompts = null;
		expect(await rerollLandmarkName(scene, at)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("realm.landmarks.promptUnread");
		expect(landmarkHere().name).toBe("Icy mist");
	});

	it("does nothing where no Landmark stands", async () => {
		expect(await rerollLandmarkName(scene, hex(1, 1))).toBeNull();
		expect(throwSpread).not.toHaveBeenCalled();
	});

	it("is the Referee's alone", async () => {
		game.user.isGM = false;
		expect(await rerollLandmarkName(scene, at)).toBeNull();
		expect(landmarkHere().name).toBe("Icy mist");
	});
});

describe("renaming a Landmark by hand", () => {
	it("keeps the name typed", async () => {
		await renameLandmark(scene, at, "The Weeping Fog");
		expect(landmarkHere().name).toBe("The Weeping Fog");
	});
});

describe("naming a Landmark the first time it's met", () => {
	it("rolls a random spread for a Sanctum, not its Seer's (p14)", async () => {
		const sanctum = { id: "s", type: "sanctum", hex: hex(2, 2), name: "", seer: { d6: 6, d12: 1 }, revealed: true };
		realm.landmarks.push(sanctum);
		expect(await nameLandmarkFromPrompt(scene, sanctum)).toEqual({ name: "Chiming bells", myth: "Myth 3-9", page: 40 });
		expect(mythEntry).toHaveBeenCalledWith(expect.anything(), { d6: 3, d12: 9 });
	});

	it("rolls a random spread for a Ruin and leaves its echo to be rolled when asked", async () => {
		const ruin = { id: "r", type: "ruin", hex: hex(3, 3), name: "", revealed: true };
		realm.landmarks.push(ruin);
		expect((await nameLandmarkFromPrompt(scene, ruin)).name).toBe("Shattered shield");
		const kept = realm.landmarks.find((landmark) => landmark.id === "r");
		expect(kept.name).toBe("Shattered shield");
		expect(kept.echo ?? null).toBeNull();
	});

	it("keeps a name already given", async () => {
		expect(await nameLandmarkFromPrompt(scene, landmarkHere())).toBeNull();
	});
});
