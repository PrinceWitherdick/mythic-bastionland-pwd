import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => null)
}));
vi.mock("../../module/chat/morale-card.js", () => ({ moralePrompt: () => null, promptGroupMorale: vi.fn(async () => {}) }));
vi.mock("../../module/chat/gambit-marks.js", () => ({ marksOn: () => [] }));
vi.mock("../../module/actions/attack-fx.js", () => ({ chatIsPublic: () => true, playDamageFx: vi.fn() }));
vi.mock("../../module/actions/fallen.js", () => ({ announceFallenKnight: vi.fn(async () => null) }));
vi.mock("../../module/actions/scars.js", () => ({ offerRevenge: vi.fn(async () => {}), rollScar: vi.fn(async () => {}) }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({}), calendarLabel: () => "" }));
vi.mock("../../module/actions/items.js", () => ({ armourConditionText: () => "" }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineMortalWound: vi.fn(async () => null), timelineWarded: vi.fn(async () => null) }));

const { inputDialog } = await import("../../module/apps/ui.js");
const { takeDamage, wantsJudging } = await import("../../module/actions/damage.js");

/** A foe with GD, VIG and Armour, whose updates land on them. */
function boar({ armour = 1, guard = 3, vig = 12 } = {}) {
	const actor = {
		uuid: "Actor.boar",
		name: "Boar",
		type: "npc",
		isOwner: true,
		items: Object.assign([], { contents: [] }),
		getActiveTokens: () => [],
		system: {
			armour,
			armourNote: "",
			scale: "individual",
			structure: false,
			immunity: "",
			conditions: { exposed: false },
			guard: { value: guard, max: guard },
			virtues: { vig: { value: vig, max: vig }, cla: { value: 10, max: 10 }, spi: { value: 10, max: 10 } },
			afflictions: []
		}
	};
	actor.update = vi.fn(async (changes) => {
		for (const [path, value] of Object.entries(changes)) {
			const keys = path.split(".").slice(1);
			const last = keys.pop();
			keys.reduce((node, key) => (node[key] ??= {}), actor.system)[last] = value;
		}
	});
	return actor;
}

beforeEach(() => {
	inputDialog.mockReset();
	inputDialog.mockResolvedValue(null);
	globalThis.fromUuidSync = () => null;
	globalThis.game = { actors: { contents: [] }, user: { isGM: true }, i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.canvas = { ready: false };
});

afterEach(() => {
	for (const key of ["fromUuidSync", "game", "canvas"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("applying an Attack card's Damage in one click", () => {
	it("takes a melee blow at their Armour without the Damage window", async () => {
		const foe = boar({ armour: 1, guard: 3, vig: 12 });
		const result = await takeDamage(foe, { damage: 8, ranged: false, harm: { warband: false, structure: false }, quick: true });
		expect(inputDialog).not.toHaveBeenCalled();
		expect(result.dealt).toBe(7);
		expect(foe.system.guard.value).toBe(0);
		expect(foe.system.virtues.vig.value).toBe(8);
	});

	it("opens the Damage window for a ranged blow, where cover is the table's call", async () => {
		await takeDamage(boar(), { damage: 8, ranged: true, quick: true });
		expect(inputDialog).toHaveBeenCalledOnce();
	});

	it("opens it without quick, as Shift-click asks", async () => {
		await takeDamage(boar(), { damage: 8, ranged: false });
		expect(inputDialog).toHaveBeenCalledOnce();
	});
});

describe("wantsJudging", () => {
	const plain = { situational: [], trap: null, immunity: "", warband: false, structure: false };

	it("asks nothing of a melee blow at somebody plain", () => {
		expect(wantsJudging(plain, { ranged: false })).toBe(false);
	});

	it("asks about cover, Armour worn only sometimes, a Trap, or what keeps them from harm", () => {
		expect(wantsJudging(plain, { ranged: true })).toBe(true);
		expect(wantsJudging(plain, {})).toBe(true);
		expect(wantsJudging({ ...plain, situational: [{ id: "helm" }] }, { ranged: false })).toBe(true);
		expect(wantsJudging({ ...plain, trap: { label: "" } }, { ranged: false })).toBe(true);
		expect(wantsJudging({ ...plain, immunity: "fire" }, { ranged: false })).toBe(true);
	});

	it("leaves a Warband or structure to the card where it says whether the blow reaches them", () => {
		expect(wantsJudging({ ...plain, warband: true }, { ranged: false, harm: { warband: false } })).toBe(false);
		expect(wantsJudging({ ...plain, structure: true }, { ranged: false })).toBe(true);
	});
});
