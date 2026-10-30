import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What happens after a blow lands on the Cast and on Warbands (p10–11). Only
// what reaches past the Damage itself is stubbed, as in damage-abilities.test.js.
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));
vi.mock("../../module/chat/morale-card.js", () => ({ moralePrompt: () => null, promptGroupMorale: vi.fn(async () => {}) }));
vi.mock("../../module/chat/gambit-marks.js", () => ({ SCANNED_MESSAGES: 200, marksOn: () => [] }));
vi.mock("../../module/actions/attack-fx.js", () => ({ chatIsPublic: () => true, playDamageFx: vi.fn() }));
vi.mock("../../module/actions/fallen.js", () => ({ announceFallenKnight: vi.fn(async () => null) }));
vi.mock("../../module/actions/scars.js", () => ({ offerRevenge: vi.fn(async () => {}), rollScar: vi.fn(async () => {}) }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({}), calendarLabel: () => "" }));
vi.mock("../../module/actions/items.js", () => ({ armourConditionText: () => "" }));
vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineMortalWound: vi.fn(async () => null), timelineWarded: vi.fn(async () => null) }));

const { inputDialog } = await import("../../module/apps/ui.js");
const { postCard } = await import("../../module/chat/cards.js");
const { promptGroupMorale } = await import("../../module/chat/morale-card.js");
const { offerRevenge, rollScar } = await import("../../module/actions/scars.js");
const { takeAttack, takeDamage } = await import("../../module/actions/damage.js");

/** One of the Cast, whose updates land on them. */
function npc({ uuid = "Actor.colossus", name = "Colossus", vig = 15, guard = 6, armour = 0, structure = false, scale = "individual", fightsOn = false } = {}) {
	const actor = {
		uuid,
		name,
		type: "npc",
		isOwner: true,
		items: Object.assign([], { contents: [] }),
		getActiveTokens: () => [],
		system: {
			armour,
			armourNote: "",
			scale,
			structure,
			fightsOn,
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

/** The Damage card's context, as last posted. */
const damageCard = () => postCard.mock.calls.filter((call) => call[1] === "damage").at(-1)[2];

beforeEach(() => {
	inputDialog.mockReset();
	inputDialog.mockResolvedValue(null);
	globalThis.fromUuidSync = () => null;
	globalThis.game = {
		actors: { contents: [] },
		user: { isGM: true },
		i18n: { localize: (key) => key, format: (key) => key }
	};
	globalThis.foundry = { utils: { randomID: () => "id-1" } };
	globalThis.canvas = { ready: false };
});

afterEach(() => {
	for (const key of ["fromUuidSync", "game", "foundry", "canvas"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("a creature that counts as a structure, destroyed (p11)", () => {
	it("is brought down: its side is weighed for Morale, and a Humiliation may be avenged", async () => {
		const colossus = npc({ structure: true });
		await takeDamage(colossus, { damage: 9, auto: true, harm: { structure: true } });
		expect(colossus.system.guard.value).toBe(0);
		expect(promptGroupMorale).toHaveBeenCalledWith(colossus);
		expect(offerRevenge).toHaveBeenCalledWith(colossus);
	});

	it("isn't brought down twice by a blow at its wreck", async () => {
		const colossus = npc({ structure: true, guard: 0 });
		colossus.system.destroyed = true;
		await takeDamage(colossus, { damage: 9, auto: true });
		expect(promptGroupMorale).not.toHaveBeenCalled();
		expect(offerRevenge).not.toHaveBeenCalled();
	});

	it("isn't brought down by a blow it holds against", async () => {
		await takeDamage(npc({ structure: true }), { damage: 3, auto: true });
		expect(promptGroupMorale).not.toHaveBeenCalled();
	});
});

describe("one of the Cast that fights on through a Mortal Wound", () => {
	it("takes the wound, says it fights on, and isn't counted down", async () => {
		const corpse = npc({ uuid: "Actor.corpse", name: "Corpse", vig: 10, guard: 1, armour: 0, fightsOn: true });
		const result = await takeDamage(corpse, { damage: 7, auto: true });
		expect(result.outcome).toBe("mortal");
		expect(corpse.system.mortalWound).toBe(true);
		expect(damageCard().outcome).toBe("bastionland.damage.fightsOn");
		expect(promptGroupMorale).not.toHaveBeenCalled();
	});

	it("is still Slain at VIG 0", async () => {
		const corpse = npc({ uuid: "Actor.corpse", name: "Corpse", vig: 4, guard: 1, fightsOn: true });
		expect((await takeDamage(corpse, { damage: 9, auto: true })).outcome).toBe("slain");
		expect(promptGroupMorale).toHaveBeenCalledWith(corpse);
	});
});

describe("a Warband left at exactly 0GD", () => {
	const card = (extra = {}) => ({
		attacker: "Actor.tal",
		targets: [],
		dice: [{ faces: 8, result: 3, label: "Stone thrower", deniedBy: null }],
		melee: true,
		blast: true,
		largeScale: true,
		gambits: [],
		feats: [],
		appliedTo: [],
		...extra
	});

	it("takes no Scar, which is an individual's, and its card says so", async () => {
		const militia = npc({ uuid: "Actor.militia", name: "Militia", vig: 10, guard: 3, scale: "warband" });
		inputDialog.mockResolvedValue({ damage: "3", armour: "0", "harm-warband": true });
		const result = await takeAttack(militia, card());
		expect(result.outcome).toBe("scar");
		expect(rollScar).not.toHaveBeenCalled();
		expect(damageCard().outcome).toBe("bastionland.damage.warbandOutcomes.scar");
	});

	it("leaves an individual's Scar to be rolled", async () => {
		inputDialog.mockResolvedValue({ damage: "3", armour: "0" });
		await takeAttack(npc({ uuid: "Actor.boar", name: "Boar", guard: 3 }), card());
		expect(rollScar).toHaveBeenCalledOnce();
	});
});
