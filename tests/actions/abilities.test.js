import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn(async () => false), inputDialog: vi.fn(async () => null) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));
vi.mock("../../module/actions/fallen.js", () => ({ announceFallenKnight: vi.fn(async () => null) }));
vi.mock("../../module/actions/damage.js", () => ({ takeDamage: vi.fn(async () => ({ outcome: "wounded" })) }));
vi.mock("../../module/actions/calendar.js", () => ({ CALENDAR_HOOK: "calendarChanged", getCalendar: () => ({}), calendarLabel: () => "" }));
vi.mock("../../module/book-art/art-index.js", () => ({ loadArtIndex: vi.fn(async () => null) }));

const { confirmDialog, inputDialog } = await import("../../module/apps/ui.js");
const { postCard } = await import("../../module/chat/cards.js");
const { announceFallenKnight } = await import("../../module/actions/fallen.js");
const { takeDamage } = await import("../../module/actions/damage.js");
const { etchRune, rollChance, sufferLoss, throwToChance, watchSunsets } = await import("../../module/actions/abilities.js");
const { sufferAffliction } = await import("../../module/actions/afflictions.js");

/** Somebody whose updates land on them. */
function character({ uuid, name, type = "knight", isOwner = true, items = [] }) {
	const actor = {
		uuid,
		name,
		type,
		isOwner,
		items: Object.assign([...items], { contents: items, get: (id) => items.find((item) => item.id === id) }),
		system: { guard: { value: 3, max: 3 }, virtues: { vig: { value: 10, max: 10 } }, afflictions: [] }
	};
	actor.update = vi.fn(async () => {});
	actor.updateEmbeddedDocuments = vi.fn(async () => {});
	return actor;
}

/** A Roll that shows this total. */
const rollOf = (total) => class {
	async evaluate() {
		this.total = total;
		return this;
	}
};

let hooks;

beforeEach(() => {
	hooks = {};
	globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
	globalThis.game = {
		user: { targets: new Set(), isGM: false },
		users: { activeGM: null },
		actors: { contents: [] },
		i18n: { localize: (key) => key, format: (key) => key }
	};
});

afterEach(() => {
	for (const key of ["Hooks", "ui", "game", "Roll"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("a coin flipped for a life (p120)", () => {
	const gift = { name: "Coin Gift" };
	const target = (actor) => {
		game.user.targets = new Set([{ actor }]);
		return actor;
	};

	it("asks first, and flips nothing if that's declined", async () => {
		const tal = character({ uuid: "Actor.tal", name: "Tal" });
		target(character({ uuid: "Actor.boar", name: "Boar", type: "npc" }));
		expect(await throwToChance(tal, gift)).toBeNull();
		expect(confirmDialog).toHaveBeenCalledOnce();
		expect(postCard).not.toHaveBeenCalled();
	});

	it("kills the one targeted on heads, and the Knight on tails", async () => {
		confirmDialog.mockResolvedValue(true);
		const tal = character({ uuid: "Actor.tal", name: "Tal" });
		const boar = target(character({ uuid: "Actor.boar", name: "Boar", type: "npc" }));
		globalThis.Roll = rollOf(1);
		expect((await throwToChance(tal, gift)).loser).toBe(boar);
		expect(boar.update).toHaveBeenCalledWith({ "system.virtues.vig.value": 0, "system.slain": true, "system.mortalWound": false }, expect.anything());
		globalThis.Roll = rollOf(2);
		expect((await throwToChance(tal, gift)).loser).toBe(tal);
		expect(announceFallenKnight).toHaveBeenLastCalledWith(tal, "slain");
		expect(postCard.mock.calls[1][2]).toMatchObject({ face: "bastionland.coinFlip.tails", pending: null });
	});

	it("leaves a button for whoever can change a loser this user can't", async () => {
		confirmDialog.mockResolvedValue(true);
		const boar = target(character({ uuid: "Actor.boar", name: "Boar", type: "npc", isOwner: false }));
		globalThis.Roll = rollOf(1);
		await throwToChance(character({ uuid: "Actor.tal", name: "Tal" }), gift);
		expect(boar.update).not.toHaveBeenCalled();
		expect(postCard.mock.calls[0][2].pending).toEqual({ uuid: "Actor.boar", label: "bastionland.coinFlip.carryOut" });
	});

	it("needs exactly one target with VIG to lose", async () => {
		const tal = character({ uuid: "Actor.tal", name: "Tal" });
		expect(await throwToChance(tal, gift)).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.coinFlip.oneTarget");
		target(tal);
		expect(await throwToChance(tal, gift)).toBeNull();
		expect(confirmDialog).not.toHaveBeenCalled();
	});
});

describe("a rune etched at sunset (p100)", () => {
	const rune = (system = {}) => ({ id: "r1", name: "Rune Gift", type: "ability", system: { sigil: true, sigilNumber: null, sigilLast: null, quantity: { value: null, max: null }, ...system }, update: vi.fn(async () => {}) });

	it("is etched for a number, never last night's, with as many turns", async () => {
		const item = rune({ sigilLast: 6 });
		inputDialog.mockResolvedValueOnce({ number: "4" });
		expect(await etchRune(character({ uuid: "Actor.y", name: "Ysolde" }), item)).toBe(4);
		expect(inputDialog.mock.calls[0][0].context.choices.map(({ value }) => value)).not.toContain(6);
		expect(item.update).toHaveBeenCalledWith({ "system.sigilNumber": 4, "system.quantity": { value: 4, max: 4 }, "system.restock": "" }, expect.anything());
		inputDialog.mockResolvedValueOnce({ number: "6" });
		expect(await etchRune(character({ uuid: "Actor.y", name: "Ysolde" }), item)).toBeNull();
	});

	it("is etched once each sunset, unless the Referee puts it right", async () => {
		const item = rune({ sigilNumber: 4, quantity: { value: 4, max: 4 } });
		expect(await etchRune(character({ uuid: "Actor.y", name: "Ysolde" }), item)).toBeNull();
		expect(inputDialog).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.sigil.untilSunset");
		game.user.isGM = true;
		inputDialog.mockResolvedValueOnce({ number: "5" });
		expect(await etchRune(character({ uuid: "Actor.y", name: "Ysolde" }), item)).toBe(5);
	});

	it("fades as night falls, written by the active GM", async () => {
		const item = rune({ sigilNumber: 3, quantity: { value: 1, max: 3 } });
		const ysolde = character({ uuid: "Actor.y", name: "Ysolde", items: [item] });
		game.actors.contents = [ysolde];
		game.users.activeGM = game.user;
		watchSunsets();
		await hooks.calendarChanged({}, {}, ["day"]);
		expect(ysolde.updateEmbeddedDocuments).not.toHaveBeenCalled();
		await hooks.calendarChanged({}, {}, ["night"]);
		expect(ysolde.updateEmbeddedDocuments).toHaveBeenCalledWith("Item", [{ _id: "r1", "system.sigilNumber": null, "system.sigilLast": 3, "system.quantity": { value: null, max: null } }]);
		expect(ui.notifications.info).toHaveBeenCalledWith("bastionland.sigil.faded");
	});
});

describe("a rune turning the bearer's own Save (p100)", () => {
	/** A d20 that shows `face`, and can be made again showing another. */
	function d20(face) {
		return class {
			async evaluate() {
				this.total = face;
				return this;
			}

			toJSON() {
				return { terms: [{}] };
			}

			static fromData(data) {
				return { total: data.total };
			}
		};
	}
	const rune = (number, left) => ({ id: "r1", name: "Rune Gift", type: "ability", system: { sigil: true, sigilNumber: number, quantity: { value: left, max: number } }, update: vi.fn(async () => {}) });
	const bearer = (item) => {
		const actor = character({ uuid: "Actor.y", name: "Ysolde", items: [item] });
		actor.system.virtues.cla = { value: 10, max: 10 };
		return actor;
	};

	it("offers to turn a d20 showing the number, as it's rolled, spending a turn", async () => {
		const { evaluateSave } = await import("../../module/actions/saves.js");
		globalThis.Roll = d20(12);
		const item = rune(12, 3);
		inputDialog.mockResolvedValueOnce({ die: "0", value: "4" });
		const save = await evaluateSave(bearer(item), "cla");
		expect(inputDialog.mock.calls[0][0].template).toBe("sigil-turn");
		expect(save).toMatchObject({ passed: true, roll: { total: 4 } });
		expect(item.update).toHaveBeenCalledWith({ "system.quantity.value": 2 }, expect.anything());
	});

	it("keeps the face when the window is closed, and asks nothing of another number or a spent rune", async () => {
		const { evaluateSave } = await import("../../module/actions/saves.js");
		globalThis.Roll = d20(12);
		const item = rune(12, 3);
		expect(await evaluateSave(bearer(item), "cla")).toMatchObject({ passed: false, roll: { total: 12 } });
		expect(item.update).not.toHaveBeenCalled();
		inputDialog.mockClear();
		await evaluateSave(bearer(rune(5, 3)), "cla");
		await evaluateSave(bearer(rune(12, 0)), "cla");
		expect(inputDialog).not.toHaveBeenCalled();
	});

	it("asks the player, not a GM rolling for their Knight, as Surprise does for everyone", async () => {
		const { evaluateSave } = await import("../../module/actions/saves.js");
		globalThis.Roll = d20(12);
		const player = { active: true, isGM: false };
		const users = [player];
		game.user.isGM = true;
		game.users = Object.assign(users, { activeGM: null });
		const knight = bearer(rune(12, 3));
		knight.testUserPermission = (user) => user === player;
		expect(await evaluateSave(knight, "cla")).toMatchObject({ roll: { total: 12 } });
		expect(inputDialog).not.toHaveBeenCalled();
		// With their player away, the GM decides.
		player.active = false;
		await evaluateSave(knight, "cla");
		expect(inputDialog.mock.calls[0][0].template).toBe("sigil-turn");
	});
});

describe("a Virtue a possession costs (p62)", () => {
	const banner = { name: "War-standard (d8 long)", system: { loss: { dice: "d4", virtue: "spi", when: "if it is ever torn" } } };

	it("is lost once asked, as Virtue Loss on a card", async () => {
		globalThis.Roll = rollOf(3);
		const tal = character({ uuid: "Actor.tal", name: "Tal" });
		tal.system.virtues.spi = { value: 9, max: 9 };
		confirmDialog.mockResolvedValue(false);
		expect(await sufferLoss(tal, banner)).toBeNull();
		expect(tal.update).not.toHaveBeenCalled();
		confirmDialog.mockResolvedValueOnce(true);
		expect(await sufferLoss(tal, banner)).toMatchObject({ from: 9, to: 6 });
		expect(tal.update).toHaveBeenCalledWith({ "system.virtues.spi.value": 6 }, expect.anything());
		expect(postCard.mock.calls[0][2].text).toBe("bastionland.loss.taken");
	});
});

describe("odds a possession gives (p88)", () => {
	const sack = { name: "Sack of maps (1-in-2 chance, otherwise see below)", system: { chance: { in: 1, of: 2 } } };

	it("roll on a card, holding on the lower numbers", async () => {
		globalThis.Roll = rollOf(1);
		expect(await rollChance(character({ uuid: "Actor.o", name: "Owl" }), sack)).toBe(true);
		expect(postCard.mock.calls[0][2].text).toBe("bastionland.chance.held");
		globalThis.Roll = rollOf(2);
		expect(await rollChance(character({ uuid: "Actor.o", name: "Owl" }), sack)).toBe(false);
		expect(await rollChance(character({ uuid: "Actor.o", name: "Owl" }), { name: "Rope", system: { chance: { in: null, of: null } } })).toBeNull();
	});
});

describe("an affliction that deals Damage (p173)", () => {
	it("is taken as a blow without asking, against Armour unless it ignores it", async () => {
		globalThis.Roll = class {
			async evaluate() {
				this.total = 5;
				return this;
			}
		};
		const boar = character({ uuid: "Actor.boar", name: "Boar", type: "npc" });
		boar.system.afflictions = [{ id: "a1", name: "Lye", loss: "1d6", virtue: "vig", when: "round", damage: true, ignoresArmour: true }];
		const taken = await sufferAffliction(boar, "a1");
		expect(taken).toMatchObject({ burned: 1, lines: [] });
		expect(takeDamage).toHaveBeenCalledWith(boar, { damage: 5, ignoreArmour: true, auto: true, cause: "bastionland.afflictions.burns" });
		expect(postCard).not.toHaveBeenCalled();
	});

	it("burns on in nobody already Slain", async () => {
		globalThis.Roll = rollOf(5);
		const tal = character({ uuid: "Actor.tal", name: "Tal" });
		tal.system.slain = true;
		tal.system.afflictions = [{ id: "a1", name: "Lye", loss: "1d6", virtue: "vig", when: "round", damage: true }];
		expect(await sufferAffliction(tal, "a1")).toBeNull();
		expect(takeDamage).not.toHaveBeenCalled();
	});
});
