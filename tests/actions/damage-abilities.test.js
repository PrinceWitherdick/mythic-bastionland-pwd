import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only what reaches past the Damage itself is stubbed: the dialogs, the chat,
// Morale, Scars and the effects on the map.
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));
vi.mock("../../module/chat/morale-card.js", () => ({ moralePrompt: () => null, promptGroupMorale: vi.fn(async () => {}) }));
vi.mock("../../module/chat/gambit-marks.js", () => ({ marksOn: () => [] }));
vi.mock("../../module/actions/attack-fx.js", () => ({ chatIsPublic: () => true, playDamageFx: vi.fn() }));
vi.mock("../../module/actions/fallen.js", () => ({ announceFallenKnight: vi.fn(async () => null) }));
vi.mock("../../module/actions/scars.js", () => ({ offerRevenge: vi.fn(async () => {}), rollScar: vi.fn(async () => {}) }));
vi.mock("../../module/actions/calendar.js", () => ({ getCalendar: () => ({}), calendarLabel: () => "" }));
vi.mock("../../module/actions/items.js", () => ({ armourConditionText: () => "" }));

const { inputDialog } = await import("../../module/apps/ui.js");
const { postCard } = await import("../../module/chat/cards.js");
const { takeAttack, takeDamage } = await import("../../module/actions/damage.js");
const { announceFallenKnight } = await import("../../module/actions/fallen.js");

/** Somebody with Virtues, GD and Armour, whose updates land on them. */
function character({ uuid = "Actor.boar", name = "Boar", type = "npc", vig = 12, spi = 10, guard = 3, armour = 1, items = [] } = {}) {
	const actor = {
		uuid,
		name,
		type,
		isOwner: true,
		// An array that also reads as a Collection's contents.
		items: Object.assign([...items], { contents: items }),
		getActiveTokens: () => [],
		system: {
			armour,
			armourNote: "",
			scale: "individual",
			structure: false,
			immunity: "",
			conditions: { exposed: false },
			guard: { value: guard, max: guard },
			virtues: { vig: { value: vig, max: vig }, cla: { value: 10, max: 10 }, spi: { value: spi, max: spi } },
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

let actors;

beforeEach(() => {
	actors = {};
	// Answers queued for one test never reach the next.
	inputDialog.mockReset();
	inputDialog.mockResolvedValue(null);
	globalThis.fromUuidSync = (uuid) => actors[uuid] ?? null;
	globalThis.game = {
		actors: { contents: [] },
		user: { isGM: true },
		i18n: { localize: (key) => key, format: (key) => key }
	};
	globalThis.foundry = { utils: { randomID: () => "affliction-1" } };
	globalThis.canvas = { ready: false };
});

afterEach(() => {
	for (const key of ["fromUuidSync", "game", "foundry", "canvas"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("Damage to SPI (p68)", () => {
	it("comes off SPI past GD, leaving them broken but not dying", async () => {
		const boar = character();
		inputDialog.mockResolvedValue({ damage: "9", armour: "1" });
		const result = await takeDamage(boar, { damage: 9, virtue: "spi" });
		expect(result.outcome).toBe("broken");
		expect(boar.system.virtues.spi.value).toBe(5);
		expect(boar.system.virtues.vig.value).toBe(12);
		expect(boar.system.mortalWound).toBeUndefined();
		expect(boar.system.wounded).toBeUndefined();
		expect(damageCard()).toMatchObject({ vigourLine: "bastionland.damage.spiritLine", outcome: "bastionland.damage.outcomes.broken" });
	});

	it("never Wounds them, short of half their SPI either", async () => {
		const boar = character({ guard: 3, armour: 0 });
		inputDialog.mockResolvedValue({ damage: "6", armour: "0" });
		expect((await takeDamage(boar, { damage: 6, virtue: "spi" })).outcome).toBe("wounded");
		expect(boar.system.virtues.spi.value).toBe(7);
		expect(boar.system.wounded).toBeUndefined();
		expect(damageCard().outcome).toBe("bastionland.damage.spiritHurt");
	});
});

describe("Damage taken without asking", () => {
	it("weighs their Armour unless it's ignored, and says what dealt it", async () => {
		const boar = character({ guard: 3, armour: 2 });
		await takeDamage(boar, { damage: 4, auto: true, cause: "Lye burns" });
		expect(inputDialog).not.toHaveBeenCalled();
		expect(boar.system.guard.value).toBe(1);
		await takeDamage(boar, { damage: 4, auto: true, ignoreArmour: true });
		expect(boar.system.guard.value).toBe(0);
		expect(boar.system.virtues.vig.value).toBe(9);
		expect(postCard.mock.calls.filter((call) => call[1] === "damage")[0][2].cause).toBe("Lye burns");
	});
});

describe("an ally's Mortal Wound taken in their place (p66)", () => {
	function warden(name = "Ser Ward") {
		const knight = character({ uuid: `Actor.${name}`, name, type: "knight", items: [{ type: "ability", system: { deathWard: true } }] });
		game.actors.contents.push(knight);
		return knight;
	}

	it("asks, and when a Knight takes it, spares the victim's VIG and marks the Knight", async () => {
		const ward = warden();
		const kay = character({ uuid: "Actor.kay", name: "Ser Kay", type: "knight", vig: 8, guard: 2 });
		inputDialog.mockResolvedValueOnce({ damage: "9", armour: "0" }).mockResolvedValueOnce({ warden: ward.uuid });
		const result = await takeDamage(kay, { damage: 9 });
		expect(inputDialog.mock.calls[1][0].template).toBe("death-ward");
		expect(result.outcome).toBe("warded");
		expect(kay.system.virtues.vig.value).toBe(8);
		expect(kay.system.guard.value).toBe(0);
		expect(ward.system).toMatchObject({ mortalWound: true, wounded: true });
		expect(damageCard().outcome).toBe("bastionland.damage.outcomes.warded");
	});

	it("lets it land when nobody takes it, and asks nobody for a blow that only Wounds", async () => {
		warden();
		const kay = character({ uuid: "Actor.kay", name: "Ser Kay", type: "knight", vig: 8, guard: 2 });
		inputDialog.mockResolvedValueOnce({ damage: "9", armour: "0" }).mockResolvedValueOnce({ warden: "" });
		expect((await takeDamage(kay, { damage: 9 })).outcome).toBe("mortal");
		expect(kay.system.mortalWound).toBe(true);
		inputDialog.mockClear();
		const ned = character({ uuid: "Actor.ned", name: "Ned", vig: 12, guard: 2 });
		inputDialog.mockResolvedValueOnce({ damage: "4", armour: "0" });
		expect((await takeDamage(ned, { damage: 4 })).outcome).toBe("wounded");
		expect(inputDialog).toHaveBeenCalledOnce();
	});

	it("asks nobody for a foe off the map, and only the foe's own side on it", async () => {
		const ward = warden();
		const foe = character({ uuid: "Actor.foe", name: "Brigand", vig: 6, guard: 1 });
		inputDialog.mockResolvedValueOnce({ damage: "9", armour: "0" });
		await takeDamage(foe, { damage: 9 });
		expect(inputDialog).toHaveBeenCalledOnce();

		inputDialog.mockClear();
		globalThis.canvas = { ready: true, scene: { id: "scene" } };
		// Token documents only: the shieldwall's look at the map's placed Tokens finds none.
		const placed = (actor, disposition) => {
			actor.getActiveTokens = (_linked, documents) => (documents ? [{ parent: canvas.scene, disposition }] : []);
			return actor;
		};
		placed(ward, 1);
		const ally = placed(character({ uuid: "Actor.ally", name: "Guide", vig: 6, guard: 1 }), 1);
		placed(foe, -1);
		inputDialog.mockResolvedValueOnce({ damage: "9", armour: "0" });
		await takeDamage(foe, { damage: 9 });
		expect(inputDialog).toHaveBeenCalledOnce();
		inputDialog.mockResolvedValueOnce({ damage: "9", armour: "0" }).mockResolvedValueOnce({ warden: "" });
		await takeDamage(ally, { damage: 9 });
		expect(inputDialog.mock.calls.at(-1)[0].template).toBe("death-ward");
	});

	it("offers nobody a death already died, nor tells of it again", async () => {
		warden();
		const kay = character({ uuid: "Actor.kay", name: "Ser Kay", type: "knight", vig: 8, guard: 0 });
		Object.assign(kay.system, { slain: true });
		kay.system.virtues.vig.value = 0;
		inputDialog.mockResolvedValueOnce({ damage: "3", armour: "0" });
		expect((await takeDamage(kay, { damage: 3 })).outcome).toBe("slain");
		expect(inputDialog).toHaveBeenCalledOnce();
		expect(announceFallenKnight).not.toHaveBeenCalled();
	});

	it("looks for a victim on another Scene than the one viewed, and asks only who's there", async () => {
		const far = warden("Ser Far");
		far.id = "far";
		const kay = character({ uuid: "Actor.kay", name: "Ser Kay", type: "knight", vig: 8, guard: 1 });
		kay.id = "kay";
		const tokens = [{ actorLink: true, actorId: "kay", disposition: 1 }];
		const elsewhere = { id: "elsewhere", tokens };
		tokens.forEach((token) => Object.assign(token, { parent: elsewhere }));
		globalThis.canvas = { ready: true, scene: { id: "viewed", tokens: [] } };
		game.scenes = { contents: [canvas.scene, elsewhere] };
		// 4 past GD of 8 VIG: a Mortal Wound.
		inputDialog.mockResolvedValueOnce({ damage: "5", armour: "0" });
		expect((await takeDamage(kay, { damage: 5 })).outcome).toBe("mortal");
		expect(inputDialog).toHaveBeenCalledOnce();

		inputDialog.mockClear();
		await kay.update({ "system.mortalWound": false, "system.virtues.vig.value": 8, "system.guard.value": 1 });
		tokens.push({ actorLink: true, actorId: "far", disposition: 1, parent: elsewhere });
		inputDialog.mockResolvedValueOnce({ damage: "5", armour: "0" }).mockResolvedValueOnce({ warden: "" });
		await takeDamage(kay, { damage: 5 });
		expect(inputDialog.mock.calls.at(-1)[0].template).toBe("death-ward");
	});

	it("offers no Knight who is down, or the victim themself", async () => {
		const down = warden("Ser Down");
		down.system.mortalWound = true;
		const self = warden("Ser Self");
		inputDialog.mockResolvedValueOnce({ damage: "20", armour: "0" });
		await takeDamage(self, { damage: 20 });
		expect(inputDialog).toHaveBeenCalledOnce();
	});
});

describe("an Attack card's Abilities as the Damage lands", () => {
	const card = (extra = {}) => ({
		attacker: "Actor.tal",
		targets: [],
		dice: [{ faces: 8, result: 8, label: "Bite", deniedBy: null }],
		melee: true,
		gambits: [],
		feats: [],
		appliedTo: [],
		...extra
	});

	it("gives the biter back the VIG the Wound cost, up to their most (p166)", async () => {
		const tal = character({ uuid: "Actor.tal", name: "Tal", type: "knight", vig: 12 });
		tal.system.virtues.vig.value = 4;
		actors["Actor.tal"] = tal;
		const boar = character({ guard: 2, armour: 0 });
		inputDialog.mockResolvedValue({ damage: "8", armour: "0" });
		await takeAttack(boar, card({ drain: true }));
		expect(boar.system.virtues.vig.value).toBe(6);
		expect(tal.system.virtues.vig.value).toBe(10);
	});

	it("says nothing of VIG taken back by a biter already at their most", async () => {
		actors["Actor.tal"] = character({ uuid: "Actor.tal", name: "Tal", type: "knight", vig: 12 });
		inputDialog.mockResolvedValue({ damage: "8", armour: "0" });
		await takeAttack(character({ guard: 2, armour: 0 }), card({ drain: true }));
		expect(postCard.mock.calls.filter((call) => call[1] === "note")).toEqual([]);
	});

	it("says a bite's sleep or memory lands once it Wounds, and not when it doesn't (p166)", async () => {
		const boar = character({ guard: 2, armour: 0 });
		inputDialog.mockResolvedValue({ damage: "8", armour: "0" });
		await takeAttack(boar, card({ onWound: ["sleep"] }));
		expect(postCard.mock.calls.filter((call) => call[1] === "note").map((call) => call[2].text)).toEqual(["bastionland.damage.onWound.sleep"]);

		postCard.mockClear();
		const fox = character({ uuid: "Actor.fox", name: "Fox", guard: 10, armour: 0 });
		await takeAttack(fox, card({ onWound: ["memory"] }));
		expect(postCard.mock.calls.filter((call) => call[1] === "note")).toEqual([]);
	});

	it("takes SPI rather than VIG for a blow that harms SPI", async () => {
		const boar = character({ guard: 2, armour: 0 });
		inputDialog.mockResolvedValue({ damage: "8", armour: "0" });
		await takeAttack(boar, card({ spirit: true }));
		expect(boar.system.virtues).toMatchObject({ vig: { value: 12 }, spi: { value: 4 } });
	});

	it("leaves what burns on with whoever it reached past GD (p173)", async () => {
		const boar = character({ guard: 2, armour: 0 });
		inputDialog.mockResolvedValue({ damage: "8", armour: "0" });
		await takeAttack(boar, card({ lingers: [{ name: "Lye", damage: "d6", when: "round", ignoresArmour: true }] }));
		expect(boar.system.afflictions).toEqual([{ id: "affliction-1", name: "Lye", loss: "1d6", virtue: "vig", when: "round", damage: true, ignoresArmour: true }]);

		const dodger = character({ uuid: "Actor.fox", name: "Fox", guard: 10, armour: 0 });
		await takeAttack(dodger, card({ lingers: [{ name: "Lye", damage: "d6", when: "round" }] }));
		expect(dodger.system.afflictions).toEqual([]);
	});
});
