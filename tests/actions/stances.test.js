import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/chat/cards.js", async (importOriginal) => ({ ...(await importOriginal()), postCard: vi.fn(async () => ({})) }));
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => true) }));

const { endStanceFromMove, lapseStances, onStanceQuery, takeStanceOnMove } = await import("../../module/actions/stances.js");
const { askActiveGM } = await import("../../module/ask-gm.js");
const { postCard } = await import("../../module/chat/cards.js");

/** The Willow Knight's Ability: Armour 4 after a Gambit spent on Moving, until their next turn (p40). */
const willow = (extra = {}) => ({ id: "willow", name: "Willow", type: "ability", system: { armourFloor: 4, onMove: true, lapses: "turn", inEffect: false }, flags: {}, ...extra });

/** A Knight whose Item updates land on their Items, flags and all. */
function knight(items, isOwner = true) {
	const list = items.map((item) => ({
		...item,
		getFlag(scope, key) {
			return this.flags?.[scope]?.[key];
		}
	}));
	const actor = {
		uuid: "Actor.kay",
		name: "Ser Kay",
		isOwner,
		items: Object.assign(list, { contents: list, get: (id) => list.find((item) => item.id === id) }),
		updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
			for (const { _id, ...changes } of updates) {
				const item = list.find((each) => each.id === _id);
				for (const [path, value] of Object.entries(changes)) {
					if (path === "system.inEffect") item.system.inEffect = value;
					if (path.startsWith("flags.")) item.flags = { [SYSTEM_ID]: { ...item.flags?.[SYSTEM_ID], [path.split(".").at(-1)]: value } };
				}
			}
		})
	};
	return actor;
}

/** An Attack card whose die 0, rolled by Ser Kay, may be spent on Moving. */
const card = (gambits) => ({ id: "m1", flags: { [SYSTEM_ID]: { attack: { attacker: "Actor.kay", dice: [{ faces: 8, result: 6 }], gambits } } } });

beforeEach(() => {
	globalThis.game = {
		users: { activeGM: { isSelf: false } },
		user: { isGM: true },
		messages: new Map(),
		i18n: { localize: (key) => key, format: (key) => key }
	};
});

afterEach(() => {
	for (const key of ["game", "fromUuidSync"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("a stance a Move Gambit takes up (p40)", () => {
	it("is stamped with the card and die that paid for it, and taking that Gambit back ends it", async () => {
		const kay = knight([willow()]);
		await takeStanceOnMove(kay, { message: "m1", die: 0 });
		expect(kay.items[0].system.inEffect).toBe(true);
		expect(kay.items[0].flags[SYSTEM_ID].stanceBy).toBe("m1:0");

		// Another card's Gambit taken back leaves it be.
		await endStanceFromMove(kay, { message: "m2", die: 0 });
		expect(kay.items[0].system.inEffect).toBe(true);
		await endStanceFromMove(kay, { message: "m1", die: 0 });
		expect(kay.items[0].system.inEffect).toBe(false);
		expect(postCard.mock.calls.at(-1)[2].text).toBe("bastionland.stance.takenBack");
	});

	it("leaves a stance taken up some other way when a Move is taken back", async () => {
		const kay = knight([willow({ system: { ...willow().system, inEffect: true } })]);
		await endStanceFromMove(kay, { message: "m1", die: 0 });
		expect(kay.updateEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("asks the GM when an ally spends the Knight's die, and the GM puts it in effect only as the card shows", async () => {
		const theirs = knight([willow()], false);
		await takeStanceOnMove(theirs, { message: "m1", die: 0 });
		expect(askActiveGM).toHaveBeenCalledWith(expect.stringContaining("stanceOnMove"), { actor: "Actor.kay", message: "m1", die: 0, end: false }, expect.any(String));
		expect(theirs.updateEmbeddedDocuments).not.toHaveBeenCalled();

		const kay = knight([willow()]);
		globalThis.fromUuidSync = (uuid) => (uuid === "Actor.kay" ? kay : null);
		const ask = (data) => onStanceQuery({ actor: "Actor.kay", message: "m1", die: 0, end: false, ...data }, { user: { id: "ann" } });
		// No card, or a card with no Move from that die: nothing.
		expect(await ask()).toBe(false);
		game.messages.set("m1", card([{ die: 0, key: "repel" }]));
		expect(await ask()).toBe(false);
		game.messages.set("m1", card([{ die: 0, key: "move" }]));
		expect(await ask()).toBe(true);
		expect(kay.items[0].system.inEffect).toBe(true);
		// Nor ended while the Move still stands on the card.
		expect(await ask({ end: true })).toBe(false);
		game.messages.set("m1", card([]));
		expect(await ask({ end: true })).toBe(true);
		expect(kay.items[0].system.inEffect).toBe(false);
	});

	it("is the GM's to answer only", async () => {
		game.user.isGM = false;
		globalThis.fromUuidSync = () => knight([willow()]);
		game.messages.set("m1", card([{ die: 0, key: "move" }]));
		expect(await onStanceQuery({ actor: "Actor.kay", message: "m1", die: 0 }, { user: { id: "ann" } })).toBe(false);
	});
});

describe("stances held for the fight's turns", () => {
	it("end when lapsed, leaving a sworn quest and lasting stances be", async () => {
		const water = { id: "water", name: "Deep water", type: "ability", system: { armourBonus: 1, inEffect: true }, flags: {} };
		const quest = { id: "quest", name: "Quest", type: "ability", system: { oath: true, inEffect: true }, flags: {} };
		const kay = knight([willow({ system: { ...willow().system, inEffect: true } }), water, quest]);
		await lapseStances(kay);
		expect(kay.items.map((item) => item.system.inEffect)).toEqual([false, true, true]);
	});
});
