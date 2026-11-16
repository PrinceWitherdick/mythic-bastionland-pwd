import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDuel } from "../../module/rules/duel.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Each actor written on its own, so a test reads what each was given.
vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null), confirmDialog: vi.fn(async () => true) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));
// The duel card's own buttons are under test; the Attack cards and Damage they lean on are stubbed.
vi.mock("../../module/actions/damage.js", () => ({ takeAttack: vi.fn(async () => ({ outcome: "wounded" })), landMirrors: vi.fn(async () => {}) }));
vi.mock("../../module/chat/attack-card.js", () => ({
	attackOf: (message) => message?.attack ?? null,
	confirmApply: vi.fn(async () => true),
	saveChange: vi.fn(async () => true)
}));
vi.mock("../../module/actions/glory.js", () => ({ adjustGlory: vi.fn(async () => []) }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: (key) => ({ cause: key }) }));
vi.mock("../../module/actions/calendar.js", () => ({ CALENDAR_HOOK: "calendarChanged", onCalendarWrites: (fn) => globalThis.Hooks.on("calendarChanged", fn) }));
vi.mock("../../module/actions/timeline-events.js", () => ({ timelineDuel: vi.fn(async () => null) }));

const { inputDialog } = await import("../../module/apps/ui.js");
const { postCard } = await import("../../module/chat/cards.js");
const { landMirrors, takeAttack } = await import("../../module/actions/damage.js");
const { confirmApply } = await import("../../module/chat/attack-card.js");
const { challengeToDuel, duelCardContext } = await import("../../module/actions/duel.js");
const { registerDuelCards } = await import("../../module/chat/duel-card.js");

const duelists = [{ uuid: "Actor.ada", name: "Ada", token: "Token.a" }, { uuid: "Actor.bram", name: "Bram", token: "Token.b" }];

beforeEach(() => {
	globalThis.ui = { notifications: { warn: () => {} } };
	globalThis.game = {
		user: { targets: new Set() },
		i18n: { localize: (key) => key, format: (key) => key }
	};
});

afterEach(() => {
	for (const key of ["ui", "game"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("the duel card", () => {
	it("says what Resolve is waiting for until both Attacks are in", () => {
		const duel = createDuel({ duelists });
		expect(duelCardContext(duel).resolveHint).toBe("bastionland.duel.notReady");
		const ready = { ...duel, duelists: duel.duelists.map((duelist) => ({ ...duelist, attack: "message-x" })) };
		game.messages = new Map([["message-x", {}]]);
		expect(duelCardContext(ready).resolveHint).toBeNull();
		// An Attack card since deleted is no Attack, before anybody forgets it on the card.
		game.messages.delete("message-x");
		expect(duelCardContext(ready).resolveHint).toBe("bastionland.duel.notReady");
	});
});

describe("a sparring duel's card", () => {
	it("says it's sparring, in place of the bloodless note it goes beyond", () => {
		const context = duelCardContext(createDuel({ sparring: true, duelists }));
		expect(context.title).toBe("bastionland.duel.sparringTitle");
		expect(context.notes).toEqual(["bastionland.duel.sparringNote"]);
		expect(duelCardContext(createDuel({ bloodless: true, duelists })).notes).toEqual(["bastionland.duel.bloodlessNote"]);
	});
});

describe("the duel dialog", () => {
	/** A Knight and the Token they've targeted, the Knight mounted or not. */
	const setUp = ({ steed }) => {
		const actor = {
			uuid: "Actor.ada",
			name: "Ada",
			type: "knight",
			system: { steed, isSquire: false },
			getActiveTokens: () => []
		};
		const opponent = { uuid: "Actor.bram", type: "knight", system: { isSquire: false } };
		game.user.targets = new Set([{ actor: opponent, document: { uuid: "Token.b", name: "Bram" } }]);
		return actor;
	};

	it("refuses a Warband or a structure as either duellist (p10)", async () => {
		const actor = setUp({ steed: "" });
		const [{ actor: opponent }] = game.user.targets;
		opponent.system = { ...opponent.system, scale: "warband" };
		expect(await challengeToDuel(actor)).toBeNull();
		opponent.system = { isSquire: false };
		actor.type = "structure";
		expect(await challengeToDuel(actor)).toBeNull();
		expect(inputDialog).not.toHaveBeenCalled();
	});

	it("opens on a duel, even for a Knight with a steed", async () => {
		await challengeToDuel(setUp({ steed: "Actor.horse" }));
		const [{ context }] = inputDialog.mock.calls[0];
		expect(context.kinds.map(({ key, selected }) => [key, selected])).toEqual([["duel", true], ["joust", false]]);
	});

	it("keeps both duelists' GD, VIG and Wound as a sparring bout begins (p188)", async () => {
		const actor = setUp({ steed: "" });
		actor.system = { ...actor.system, guard: { value: 4 }, virtues: { vig: { value: 12 } }, wounded: false };
		const [{ actor: opponent }] = game.user.targets;
		opponent.system = { ...opponent.system, guard: { value: 2 }, virtues: { vig: { value: 8 } }, wounded: true };
		inputDialog.mockResolvedValueOnce({ kind: "duel", sparring: true });
		await challengeToDuel(actor);
		const { duel } = postCard.mock.calls[0][3].flags[SYSTEM_ID];
		expect(duel).toMatchObject({ sparring: true, bloodless: true });
		expect(duel.duelists.map(({ start }) => start)).toEqual([
			{ guard: 4, vigour: 12, wounded: false },
			{ guard: 2, vigour: 8, wounded: true }
		]);
	});
});

describe("a sparring duel's buttons", () => {
	let hooks;
	let actors;

	/** A duelist as the card reads and writes them. */
	const duelist = (uuid, name, { guard, vig, wounded = false }) => {
		const actor = {
			uuid,
			name,
			isOwner: true,
			system: { guard: { value: guard }, virtues: { vig: { value: vig } }, wounded },
			update: vi.fn(async (changes) => {
				if ("system.guard.value" in changes) actor.system.guard.value = changes["system.guard.value"];
				if ("system.virtues.vig.value" in changes) actor.system.virtues.vig.value = changes["system.virtues.vig.value"];
				if ("system.wounded" in changes) actor.system.wounded = changes["system.wounded"];
			})
		};
		return actor;
	};

	/** The duel card as chat draws it, and a way to press one of its buttons. */
	const renderDuel = (duel) => {
		const message = { id: "duel-1", isOwner: true, flags: { [SYSTEM_ID]: { duel } } };
		message.update = vi.fn(async (changes) => { message.flags[SYSTEM_ID].duel = changes[`flags.${SYSTEM_ID}.duel`]; });
		game.messages.set(message.id, message);
		let listener;
		const card = { addEventListener: (_type, fn) => { listener = fn; } };
		registerDuelCards();
		hooks.renderChatMessageHTML(message, { querySelector: () => card });
		const press = (dataset) => {
			const button = { dataset, disabled: false };
			button.closest = () => button;
			return listener({ target: button, preventDefault() {} });
		};
		return { message, press };
	};

	beforeEach(() => {
		hooks = {};
		actors = {
			"Actor.ada": duelist("Actor.ada", "Ada", { guard: 4, vig: 12 }),
			"Actor.bram": duelist("Actor.bram", "Bram", { guard: 3, vig: 9, wounded: true })
		};
		globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
		globalThis.CONFIG = { queries: {} };
		globalThis.fromUuidSync = (uuid) => actors[uuid] ?? null;
		globalThis.foundry = { utils: { escapeHTML: (text) => text }, applications: { handlebars: { renderTemplate: async () => "<section></section>" } } };
		// As Foundry's Collection, which iterates its documents rather than its entries.
		game.messages = new (class extends Map {
			[Symbol.iterator]() {
				return this.values();
			}
		})([["attack-a", { attack: { appliedTo: [] } }], ["attack-b", { attack: { appliedTo: [] } }]]);
		game.users = { activeGM: { isSelf: true } };
	});

	afterEach(() => {
		for (const key of ["Hooks", "CONFIG", "fromUuidSync", "foundry"]) delete globalThis[key];
	});

	const sparring = () => createDuel({
		sparring: true,
		duelists: [
			{ ...duelists[0], scores: { guard: 4, vigour: 12, wounded: false } },
			{ ...duelists[1], scores: { guard: 3, vigour: 9, wounded: true } }
		]
	});

	it("lands both blows as sparring, which is non-lethal and leaves no Scar", async () => {
		const duel = sparring();
		duel.duelists[0].attack = "attack-a";
		duel.duelists[1].attack = "attack-b";
		await renderDuel(duel).press({ duelAction: "resolve" });
		expect(takeAttack).toHaveBeenCalledTimes(2);
		for (const call of takeAttack.mock.calls) expect(call[2]).toMatchObject({ scars: false, sparring: true });
	});

	it("gives back a mirrored Wound only once both blows have landed (p116)", async () => {
		const duel = sparring();
		duel.duelists[0].attack = "attack-a";
		duel.duelists[1].attack = "attack-b";
		takeAttack.mockClear();
		const kept = { dealer: "Actor.ada", loss: 2 };
		takeAttack.mockImplementationOnce(async (_target, _attack, { mirrors }) => {
			mirrors.push(kept);
			return { outcome: "wounded" };
		});
		await renderDuel(duel).press({ duelAction: "resolve" });
		const [first, second] = takeAttack.mock.calls.map((call) => call[2].mirrors);
		expect(first).toBe(second);
		expect(landMirrors).toHaveBeenCalledWith([kept]);
		expect(landMirrors.mock.invocationCallOrder[0]).toBeGreaterThan(takeAttack.mock.invocationCallOrder[1]);
	});

	it("asks first about what's still to be had on both Attacks, and lands nothing if told no", async () => {
		const duel = sparring();
		duel.duelists[0].attack = "attack-a";
		duel.duelists[1].attack = "attack-b";
		takeAttack.mockClear();
		confirmApply.mockClear();
		confirmApply.mockResolvedValueOnce(false);
		await renderDuel(duel).press({ duelAction: "resolve" });
		// Each Attack is weighed against the duelist it lands on.
		expect(confirmApply).toHaveBeenCalledWith([
			{ attack: game.messages.get("attack-a").attack, actors: [actors["Actor.bram"]] },
			{ attack: game.messages.get("attack-b").attack, actors: [actors["Actor.ada"]] }
		]);
		expect(takeAttack).not.toHaveBeenCalled();
	});

	it("puts back what the bout cost as it ends, and says so", async () => {
		Object.assign(actors["Actor.ada"].system, { guard: { value: 0 }, virtues: { vig: { value: 5 } }, wounded: true });
		actors["Actor.bram"].system.guard.value = 1;
		const { message, press } = renderDuel(sparring());
		await press({ duelAction: "end", victor: "Actor.bram" });

		expect(message.flags[SYSTEM_ID].duel.ended).toBe(true);
		expect(actors["Actor.ada"].update).toHaveBeenCalledWith(
			{ "system.guard.value": 4, "system.virtues.vig.value": 12, "system.wounded": false },
			{ cause: "recovery" }
		);
		// Wounded before the bout, so still Wounded after it.
		expect(actors["Actor.bram"].system).toMatchObject({ guard: { value: 3 }, wounded: true });
		const [, template, context] = postCard.mock.calls.at(-1);
		expect(template).toBe("report");
		expect(context.title).toBe("bastionland.duel.shaken.title");
		expect(context.entries.map(({ name, lines }) => [name, lines.length])).toEqual([["Ada", 3], ["Bram", 1]]);
	});

	it("puts nothing back when a duel that isn't sparring ends", async () => {
		actors["Actor.ada"].system.guard.value = 0;
		await renderDuel(createDuel({ duelists })).press({ duelAction: "end", victor: "" });
		expect(actors["Actor.ada"].update).not.toHaveBeenCalled();
		expect(postCard).not.toHaveBeenCalled();
	});

	it("writes the duel's end on the Timeline once, with its victor", async () => {
		const { timelineDuel } = await import("../../module/actions/timeline-events.js");
		const { message, press } = renderDuel(createDuel({ duelists }));
		await press({ duelAction: "end", victor: "Actor.ada" });
		await press({ duelAction: "end", victor: "Actor.ada" });
		expect(timelineDuel).toHaveBeenCalledTimes(1);
		expect(timelineDuel).toHaveBeenCalledWith(message.id, expect.objectContaining({ kind: "duel" }), [actors["Actor.ada"], actors["Actor.bram"]], "Actor.ada", {});
	});

	/** A Combat ending, with Combatants for these actors. */
	const combatOf = (...uuids) => ({ combatants: uuids.map((uuid) => ({ actor: actors[uuid] ?? { uuid } })) });

	it("is shaken off, once, when the Combat either duelist was in ends, with no victor needed", async () => {
		actors["Actor.ada"].system.guard.value = 1;
		const { message, press } = renderDuel(sparring());
		await Promise.all([hooks.deleteCombat(combatOf("Actor.bram", "Actor.cole")), hooks.deleteCombat(combatOf("Actor.ada"))]);

		expect(message.flags[SYSTEM_ID].duel).toMatchObject({ ended: true, victor: null });
		expect(actors["Actor.ada"].update).toHaveBeenCalledOnce();
		expect(actors["Actor.ada"].system.guard.value).toBe(4);
		expect(postCard).toHaveBeenCalledOnce();
		expect(postCard.mock.calls[0][2].tagline).toBe("bastionland.duel.shaken.combatEnded");

		// Nothing more comes back, and no Glory moves, from a win pressed afterwards or time passing.
		await press({ duelAction: "end", victor: "Actor.ada" });
		await hooks.calendarChanged(null, null, ["phase"]);
		expect(actors["Actor.ada"].update).toHaveBeenCalledOnce();
		expect(postCard).toHaveBeenCalledOnce();
	});

	it("leaves a bout alone when the Combat that ends didn't hold either duelist", async () => {
		const { message } = renderDuel(sparring());
		await hooks.deleteCombat(combatOf("Actor.cole"));
		expect(message.flags[SYSTEM_ID].duel.ended).toBe(false);
	});

	it("is shaken off as time passes, closing quietly a bout with nothing to put back", async () => {
		const quiet = renderDuel(sparring());
		await hooks.calendarChanged(null, null, ["phase"]);
		expect(quiet.message.flags[SYSTEM_ID].duel.ended).toBe(true);
		expect(postCard).not.toHaveBeenCalled();

		actors["Actor.bram"].system.virtues.vig.value = 4;
		const hurt = renderDuel(sparring());
		await hooks.calendarChanged(null, null, ["phase"]);
		expect(hurt.message.flags[SYSTEM_ID].duel.ended).toBe(true);
		expect(actors["Actor.bram"].system.virtues.vig.value).toBe(9);
		expect(postCard.mock.calls[0][2].tagline).toBe("bastionland.duel.shaken.timePassed");
	});

	it("isn't shaken off by time turned back, as an Undo does, which puts back the bouts it ended", async () => {
		const bout = renderDuel(sparring());
		const night = { age: 1, year: 1, season: "spring", day: 2, phase: "night" };
		await hooks.calendarChanged({ ...night, phase: "afternoon" }, night, []);
		expect(bout.message.flags[SYSTEM_ID].duel.ended).toBe(false);
		await hooks.calendarChanged(night, { ...night, phase: "afternoon" }, ["night", "phase"]);
		expect(bout.message.flags[SYSTEM_ID].duel.ended).toBe(true);
	});

	it("is left to the active GM, and never closes a duel that isn't sparring", async () => {
		const plain = renderDuel(createDuel({ duelists }));
		await hooks.calendarChanged(null, null, ["phase"]);
		expect(plain.message.flags[SYSTEM_ID].duel.ended).toBe(false);

		game.users.activeGM = { isSelf: false };
		const bout = renderDuel(sparring());
		await hooks.calendarChanged(null, null, ["phase"]);
		await hooks.deleteCombat(combatOf("Actor.ada"));
		expect(bout.message.flags[SYSTEM_ID].duel.ended).toBe(false);
	});
});

describe("an Attack recorded on a duel card", () => {
	let duelMessage;
	let saveDuelChange;
	let onDuelQuery;

	/** An Attack card, as attack-card.js keeps its state. */
	const attackCard = (id, attack) => [id, { id, flags: { [SYSTEM_ID]: { attack: { attacker: "Actor.ada", duel: "duel-1", appliedTo: [], ...attack } } } }];

	beforeEach(async () => {
		({ saveDuelChange, onDuelQuery } = await import("../../module/actions/duel.js"));
		globalThis.foundry = { applications: { handlebars: { renderTemplate: async () => "<section></section>" } } };
		// Ada's player owns Ada, and nobody else.
		globalThis.fromUuidSync = (uuid) => ({ testUserPermission: (user) => uuid === "Actor.ada" && user.id === "ada-player" });
		duelMessage = { id: "duel-1", isOwner: true, flags: { [SYSTEM_ID]: { duel: createDuel({ duelists }) } } };
		duelMessage.update = vi.fn(async (changes) => { duelMessage.flags[SYSTEM_ID].duel = changes[`flags.${SYSTEM_ID}.duel`]; });
		game.messages = new Map([
			["duel-1", duelMessage],
			attackCard("ada-attack", {}),
			// The Referee's dragon, at somebody else.
			attackCard("dragon-attack", { attacker: "Actor.dragon", duel: null }),
			attackCard("ada-old", { appliedTo: ["Bram"] }),
			attackCard("ada-elsewhere", { duel: "duel-2" })
		]);
		game.users = { activeGM: { isSelf: true } };
	});

	afterEach(() => {
		for (const key of ["foundry", "fromUuidSync"]) delete globalThis[key];
	});

	const attackOn = (message) => ({ type: "attack", actor: "Actor.ada", message });
	const adaAttack = () => duelMessage.flags[SYSTEM_ID].duel.duelists[0].attack;

	it("takes the duelist's own Attack, rolled for this duel and not yet applied", async () => {
		expect(await onDuelQuery({ messageId: "duel-1", change: attackOn("ada-attack") }, { user: { id: "ada-player" } })).toBe(true);
		expect(adaAttack()).toBe("ada-attack");
	});

	it("refuses another card swapped in, asked of the GM", async () => {
		const ask = (message) => onDuelQuery({ messageId: "duel-1", change: attackOn(message) }, { user: { id: "ada-player" } });
		for (const message of ["dragon-attack", "ada-old", "ada-elsewhere", "missing", "duel-1"]) expect(await ask(message)).toBe(false);
		expect(adaAttack()).toBeNull();
		expect(duelMessage.update).not.toHaveBeenCalled();
	});

	it("refuses it on the card's own client too", async () => {
		const warn = vi.fn();
		globalThis.ui = { notifications: { warn } };
		expect(await saveDuelChange(duelMessage, attackOn("dragon-attack"))).toBe(false);
		expect(warn).toHaveBeenCalledWith("bastionland.duel.changeRefused");
		expect(adaAttack()).toBeNull();
		expect(await saveDuelChange(duelMessage, attackOn("ada-attack"))).toBe(true);
		expect(adaAttack()).toBe("ada-attack");
	});

	it("takes any change from the card's author, as their own client would with no GM here", async () => {
		duelMessage.author = { id: "ada-player" };
		// Ada's player doesn't own Bram, so only being the author lets the duel end.
		expect(await onDuelQuery({ messageId: "duel-1", change: { type: "end", victor: null } }, { user: { id: "ada-player" } })).toBe(true);
		expect(duelMessage.flags[SYSTEM_ID].duel.ended).toBe(true);
	});

	it("refuses an ending from a player who neither wrote the card nor owns both duelists", async () => {
		duelMessage.author = { id: "gm" };
		expect(await onDuelQuery({ messageId: "duel-1", change: { type: "end", victor: null } }, { user: { id: "ada-player" } })).toBe(false);
		expect(duelMessage.update).not.toHaveBeenCalled();
	});

	it("still refuses another card swapped in by the card's author", async () => {
		duelMessage.author = { id: "ada-player" };
		expect(await onDuelQuery({ messageId: "duel-1", change: attackOn("dragon-attack") }, { user: { id: "ada-player" } })).toBe(false);
		expect(adaAttack()).toBeNull();
	});

	it("refuses an Attack for somebody who doesn't own the duelist, or with nobody asking", async () => {
		expect(await onDuelQuery({ messageId: "duel-1", change: attackOn("ada-attack") }, { user: { id: "bram-player" } })).toBe(false);
		expect(await onDuelQuery({ messageId: "duel-1", change: attackOn("ada-attack") }, {})).toBe(false);
		expect(adaAttack()).toBeNull();
	});
});

const { adjustGlory } = await import("../../module/actions/glory.js");
const { confirmDialog } = await import("../../module/apps/ui.js");
const { openDuelFor, onDuelQuery: answerDuelQuery, onStakeQuery, stakeAnswerer, tieTicksToSparring, knockedDownIn, duelCardContext: contextOf } = await import("../../module/actions/duel.js");

describe("duel audit of 2026-11-04", () => {
	let hooks;
	let actors;

	/** A duelist as the card reads them. */
	const duelist = (uuid, name, system = {}) => ({
		uuid,
		name,
		type: "knight",
		isOwner: true,
		system: { guard: { value: 3 }, virtues: { vig: { value: 10 } }, wounded: false, ...system },
		testUserPermission: () => true,
		update: vi.fn(async () => {})
	});

	/** Chat as Foundry keeps it: a Collection iterated by its documents, with `contents`. */
	const chat = (entries) => new (class extends Map {
		[Symbol.iterator]() {
			return this.values();
		}

		get contents() {
			return [...this.values()];
		}
	})(entries);

	/** A duel card, drawn in chat, and a way to press its buttons. */
	const renderDuel = (duel, id = "duel-1") => {
		const message = { id, isOwner: true, flags: { [SYSTEM_ID]: { duel } } };
		message.update = vi.fn(async (changes) => { message.flags[SYSTEM_ID].duel = changes[`flags.${SYSTEM_ID}.duel`]; });
		game.messages.set(message.id, message);
		let listener;
		const card = { addEventListener: (_type, fn) => { listener = fn; } };
		registerDuelCards();
		hooks.renderChatMessageHTML(message, { querySelector: () => card });
		const press = (dataset) => {
			const button = { dataset, disabled: false };
			button.closest = () => button;
			return listener({ target: button, preventDefault() {} });
		};
		return { message, press, duel: () => message.flags[SYSTEM_ID].duel };
	};

	/** Both Attacks in, on cards still in chat. */
	const rolled = (duel) => ({ ...duel, duelists: duel.duelists.map((each, index) => ({ ...each, attack: ["attack-a", "attack-b"][index] })) });

	beforeEach(() => {
		hooks = {};
		actors = { "Actor.ada": duelist("Actor.ada", "Ada"), "Actor.bram": duelist("Actor.bram", "Bram") };
		globalThis.Hooks = { on: (name, fn) => { hooks[name] = fn; } };
		globalThis.CONFIG = { queries: {} };
		globalThis.fromUuidSync = (uuid) => actors[uuid] ?? null;
		globalThis.foundry = { utils: { escapeHTML: (text) => text }, applications: { handlebars: { renderTemplate: async () => "<section></section>" } } };
		game.messages = chat([["attack-a", { id: "attack-a", attack: { appliedTo: [] } }], ["attack-b", { id: "attack-b", attack: { appliedTo: [] } }]]);
		game.users = Object.assign([], { activeGM: { isSelf: true } });
		game.user.isGM = true;
		ui.notifications.info = vi.fn();
		ui.notifications.warn = vi.fn();
	});

	afterEach(() => {
		for (const key of ["Hooks", "CONFIG", "fromUuidSync", "foundry"]) delete globalThis[key];
	});

	describe("a duel left open", () => {
		it("never takes over the survivor's next Attack once the other is gone, Slain or out of the fight", () => {
			renderDuel(createDuel({ duelists }), "duel-old");
			renderDuel(createDuel({ duelists }), "duel-new");
			expect(openDuelFor(actors["Actor.ada"]).message.id).toBe("duel-new");
			for (const system of [{ slain: true }, { mortalWound: true }, { moraleBroken: "fled" }]) {
				Object.assign(actors["Actor.bram"].system, system);
				expect(openDuelFor(actors["Actor.ada"])).toBeNull();
				actors["Actor.bram"].system = duelist("Actor.bram", "Bram").system;
			}
			delete actors["Actor.bram"];
			expect(openDuelFor(actors["Actor.ada"])).toBeNull();
		});

		it("skips a duel whose other duelist is gone for an older one still fought", () => {
			renderDuel(createDuel({ duelists }), "duel-old");
			renderDuel(createDuel({ duelists: [duelists[0], { uuid: "Actor.cole", name: "Cole", token: "Token.c" }] }), "duel-new");
			expect(openDuelFor(actors["Actor.ada"]).message.id).toBe("duel-old");
		});

		it("can be ended with a duelist deleted, moving only the survivor's Glory", async () => {
			const { press, duel } = renderDuel(createDuel({ stake: true, duelists }));
			delete actors["Actor.bram"];
			await press({ duelAction: "end", victor: "Actor.bram" });
			expect(duel().ended).toBe(false);
			expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.duel.gone");
			await press({ duelAction: "end", victor: "Actor.ada" });
			expect(duel()).toMatchObject({ ended: true, victor: "Actor.ada" });
			expect(adjustGlory).toHaveBeenCalledOnce();
			expect(adjustGlory).toHaveBeenCalledWith(actors["Actor.ada"], 1);
		});

		it("can be ended by a player who owns the duelist still here, asked of the Referee", async () => {
			const { message } = renderDuel(createDuel({ duelists }));
			message.author = { id: "gm" };
			actors["Actor.ada"].testUserPermission = (user) => user.id === "ada-player";
			delete actors["Actor.bram"];
			expect(await answerDuelQuery({ messageId: "duel-1", change: { type: "end", victor: "Actor.ada" } }, { user: { id: "ada-player" } })).toBe(true);
		});

		it("is closed by the active Referee as a duelist is deleted or Slain, with no Glory moved", async () => {
			const plain = renderDuel(createDuel({ stake: true, duelists }), "duel-plain");
			const bout = renderDuel(createDuel({ sparring: true, duelists }), "duel-bout");
			actors["Actor.bram"].system.slain = true;
			await hooks.updateActor(actors["Actor.bram"], { system: { slain: true } });
			expect(plain.duel()).toMatchObject({ ended: true, victor: null, closed: { name: "Bram", reason: "slain" } });
			expect(adjustGlory).not.toHaveBeenCalled();
			// Sparring closes its own way, shaken off.
			expect(bout.duel().ended).toBe(false);
			const context = contextOf(plain.duel());
			expect(context.outcome).toBe("bastionland.duel.closed.slain");
			expect(context.notes).toContain("bastionland.duel.stakeUnmoved");

			const gone = renderDuel(createDuel({ duelists: [duelists[0], { uuid: "Actor.cole", name: "Cole", token: "Token.c" }] }), "duel-gone");
			await hooks.deleteToken({ uuid: "Token.c" });
			expect(gone.duel().closed).toEqual({ name: "Cole", reason: "gone" });
		});

		it("looks over the chat once for a batch of deletions, such as a Scene's Tokens cleared", async () => {
			const { duel } = renderDuel(createDuel({ duelists }));
			delete actors["Actor.bram"];
			const first = hooks.deleteToken({ uuid: "Token.x" });
			const second = hooks.deleteActor({ uuid: "Actor.bram" });
			expect(second).toBe(first);
			await first;
			expect(duel().closed).toEqual({ name: "Bram", reason: "gone" });
			// Once it's begun, a later deletion looks again.
			const later = hooks.deleteToken({ uuid: "Token.y" });
			expect(later).not.toBe(first);
			await later;
		});

		it("is left alone by an update that slays nobody, and by a Referee who isn't the active one", async () => {
			const { duel } = renderDuel(createDuel({ duelists }));
			await hooks.updateActor(actors["Actor.bram"], { system: { guard: { value: 1 } } });
			expect(duel().ended).toBe(false);
			game.users.activeGM = { isSelf: false };
			delete actors["Actor.bram"];
			await hooks.deleteActor({ uuid: "Actor.bram" });
			expect(duel().ended).toBe(false);
		});
	});

	describe("an Attack card deleted", () => {
		it("is forgotten by the duel, so its duelist rolls again", async () => {
			const { duel } = renderDuel(rolled(createDuel({ duelists })));
			game.messages.delete("attack-a");
			await hooks.deleteChatMessage({ id: "attack-a" });
			expect(duel().duelists.map(({ attack }) => attack)).toEqual([null, "attack-b"]);
			expect(openDuelFor(actors["Actor.ada"]).message.id).toBe("duel-1");
		});

		it("is looked for once for a batch, such as the chat log cleared, leaving a duel card deleted with it be", async () => {
			const { message, duel } = renderDuel(rolled(createDuel({ duelists })));
			const update = vi.spyOn(message, "update");
			game.messages.delete("attack-a");
			game.messages.delete("attack-b");
			const first = hooks.deleteChatMessage({ id: "attack-a" });
			expect(hooks.deleteChatMessage({ id: "attack-b" })).toBe(first);
			await first;
			expect(duel().duelists.map(({ attack }) => attack)).toEqual([null, null]);
			// Both forgotten in the one write.
			expect(update).toHaveBeenCalledOnce();
			update.mockClear();
			// The whole log: the duel card goes in the same batch, and nothing writes to it.
			const kept = rolled(createDuel({ duelists }));
			const again = renderDuel(kept, "duel-2");
			const writes = vi.spyOn(again.message, "update");
			game.messages.clear();
			const all = [hooks.deleteChatMessage({ id: "attack-a" }), hooks.deleteChatMessage({ id: "attack-b" }), hooks.deleteChatMessage({ id: "duel-2" })];
			await Promise.all(all);
			expect(writes).not.toHaveBeenCalled();
		});

		it("counts as no Attack even before the Referee's client forgets it", () => {
			renderDuel(rolled(createDuel({ duelists })));
			expect(openDuelFor(actors["Actor.ada"])).toBeNull();
			game.messages.delete("attack-a");
			expect(openDuelFor(actors["Actor.ada"]).message.id).toBe("duel-1");
		});
	});

	describe("Resolve", () => {
		it("lands each blow once, however many times it's pressed while the first press works", async () => {
			const { press } = renderDuel(rolled(createDuel({ duelists })));
			let answer;
			confirmApply.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
			const first = press({ duelAction: "resolve" });
			const second = press({ duelAction: "resolve" });
			await second;
			answer(true);
			await first;
			expect(takeAttack).toHaveBeenCalledTimes(2);
			expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.cardButtons.alreadyPressed");
		});

		it("reads each card again as its blow lands, so one applied meanwhile isn't applied twice", async () => {
			const { press } = renderDuel(rolled(createDuel({ duelists })));
			confirmApply.mockImplementationOnce(async () => {
				game.messages.get("attack-a").attack = { appliedTo: ["Bram"] };
				return true;
			});
			await press({ duelAction: "resolve" });
			expect(takeAttack).toHaveBeenCalledOnce();
			expect(takeAttack.mock.calls[0][0]).toBe(actors["Actor.ada"]);
		});

		it("lands the Attack as it stands, with a Deny made while the windows stood open", async () => {
			const { press } = renderDuel(rolled(createDuel({ duelists })));
			const denied = { appliedTo: [], dice: [{ faces: 8, result: 6, deniedBy: "Bram" }] };
			confirmApply.mockImplementationOnce(async () => {
				game.messages.get("attack-a").attack = denied;
				return true;
			});
			await press({ duelAction: "resolve" });
			expect(takeAttack.mock.calls[0][1]).toBe(denied);
		});

		it("knocks a sparring duelist taken to a Mortal Wound out of the bout (p188)", async () => {
			const { press, duel } = renderDuel(rolled(createDuel({ sparring: true, duelists })));
			takeAttack.mockResolvedValueOnce({ outcome: "mortal" });
			await press({ duelAction: "resolve" });
			expect(duel().duelists.map(({ down }) => down)).toEqual([false, true]);
			expect(contextOf(duel()).duelists[1].status).toBe("bastionland.duel.downStatus");
			// Nor does the bout take over Ada's next Attack, with Bram down, though it waits on one from her.
			game.messages.delete("attack-a");
			expect(openDuelFor(actors["Actor.ada"])).toBeNull();
			expect(knockedDownIn(actors["Actor.bram"])).toBeTruthy();
			expect(knockedDownIn(actors["Actor.ada"])).toBeNull();
		});
	});

	describe("the challenge", () => {
		/** A challenger, and the one Token they target. */
		const challenge = ({ challenger = {}, opponent = {} } = {}) => {
			const actor = { ...duelist("Actor.ada", "Ada"), getActiveTokens: () => [], ...challenger };
			const foe = { ...duelist("Actor.bram", "Bram"), ...opponent };
			game.user.targets = new Set([{ actor: foe, document: { uuid: "Token.b", name: "Bram" } }]);
			return { actor, foe };
		};
		const posted = () => postCard.mock.calls.at(-1)[3].flags[SYSTEM_ID].duel;

		it("refuses a duelist Slain or Mortally Wounded, before any dialog", async () => {
			const slain = challenge({ opponent: { system: { slain: true } } });
			expect(await challengeToDuel(slain.actor)).toBeNull();
			expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.duel.refused.slain");
			const dying = challenge({ challenger: { system: { mortalWound: true } } });
			expect(await challengeToDuel(dying.actor)).toBeNull();
			expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.duel.refused.mortalWound");
			expect(inputDialog).not.toHaveBeenCalled();
		});

		it("fights an unlinked NPC sheet's duel with its Token in play, selected first", async () => {
			const token = (id) => ({ uuid: `Scene.s.Token.${id}`, name: `Boar ${id}`, actor: { ...duelist(`Scene.s.Token.${id}.Actor.boar`, "Boar"), type: "npc" } });
			const [one, two] = [token("t1"), token("t2")];
			const { actor } = challenge({ challenger: { uuid: "Actor.boar", type: "npc", isToken: false, prototypeToken: { actorLink: false }, getActiveTokens: () => [one, two] } });
			globalThis.canvas = { tokens: { controlled: [{ document: two }] } };
			inputDialog.mockResolvedValueOnce({ kind: "duel" });
			await challengeToDuel(actor);
			delete globalThis.canvas;
			expect(posted().duelists[0]).toMatchObject({ uuid: "Scene.s.Token.t2.Actor.boar", token: "Scene.s.Token.t2", name: "Boar t2" });
		});

		it("lets a Knight stake Glory against a non-Knight, whose Glory never moves", async () => {
			const { actor } = challenge({ opponent: { type: "npc" } });
			inputDialog.mockResolvedValueOnce({ kind: "duel", stake: true });
			await challengeToDuel(actor);
			expect(inputDialog.mock.calls[0][0].context.stakeLocked).toBe(false);
			expect(posted()).toMatchObject({ stake: true, stakeAnswer: null });
			expect(posted().duelists.map(({ knight }) => knight)).toEqual([true, false]);
		});

		it("asks the active Referee whether the Referee's own opponent stakes, for a player challenging", async () => {
			game.user.isGM = false;
			const query = vi.fn(async () => true);
			game.users.activeGM = { isSelf: false, query };
			const { actor } = challenge({ opponent: { type: "npcKnight", testUserPermission: () => false } });
			inputDialog.mockResolvedValueOnce({ kind: "joust", stake: true });
			await challengeToDuel(actor);
			// With when the challenger stops waiting, by the clock the two clients share.
			expect(query).toHaveBeenCalledWith(`${SYSTEM_ID}.agreeToStake`, { uuid: "Actor.bram", kind: "joust", challenger: "Ada", opponent: "Bram", answerBy: expect.any(Number) }, { timeout: 60000 });
			expect(query.mock.calls[0][1].answerBy - Date.now()).toBeGreaterThan(59000);
			expect(ui.notifications.info).toHaveBeenCalledWith("bastionland.duel.stakeAsking");
			expect(posted().stake).toBe(true);
		});

		it("goes ahead without a stake, and says so, when refused or unanswered", async () => {
			game.user.isGM = false;
			for (const [answer, said] of [[async () => false, "refused"], [async () => { throw new Error("timed out"); }, "unanswered"], [async () => undefined, "unanswered"]]) {
				game.users.activeGM = { isSelf: false, query: vi.fn(answer) };
				const { actor } = challenge({ opponent: { type: "npc", testUserPermission: () => false } });
				inputDialog.mockResolvedValueOnce({ kind: "duel", stake: true });
				await challengeToDuel(actor);
				expect(posted()).toMatchObject({ stake: false, stakeAnswer: said });
				expect(contextOf(posted()).notes).toContain(`bastionland.duel.stakeDeclined.${said}`);
			}
			// With no Referee here, nobody can answer for the Referee's own.
			game.users.activeGM = null;
			const { actor } = challenge({ opponent: { type: "npc", testUserPermission: () => false } });
			inputDialog.mockResolvedValueOnce({ kind: "duel", stake: true });
			await challengeToDuel(actor);
			expect(posted()).toMatchObject({ stake: false, stakeAnswer: "unanswered" });
		});

		it("asks the opponent's player, and nobody when the challenger answers for both sides", async () => {
			const query = vi.fn(async () => true);
			const player = { id: "bram-player", active: true, isGM: false, isSelf: false, character: { id: "bram" }, query };
			game.users.push(player);
			const opponent = { id: "bram", testUserPermission: (user) => user === player };
			expect(stakeAnswerer(opponent)).toBe(player);
			const { actor } = challenge({ opponent });
			inputDialog.mockResolvedValueOnce({ kind: "duel", stake: true });
			await challengeToDuel(actor);
			expect(query).toHaveBeenCalledOnce();

			// The Referee speaks for an NPC, and a player for a character they own.
			expect(stakeAnswerer({ testUserPermission: () => false })).toBeNull();
			game.users.push({ id: "me", active: true, isGM: false, isSelf: true });
			expect(stakeAnswerer({ testUserPermission: () => true })).toBeNull();
		});

		it("stakes nothing on sparring, and asks nobody", async () => {
			game.user.isGM = false;
			const query = vi.fn(async () => true);
			game.users.activeGM = { isSelf: false, query };
			const { actor } = challenge({ opponent: { testUserPermission: () => false } });
			inputDialog.mockResolvedValueOnce({ kind: "duel", stake: true, sparring: true });
			await challengeToDuel(actor);
			expect(query).not.toHaveBeenCalled();
			expect(posted()).toMatchObject({ stake: false, stakeAnswer: null, sparring: true });
		});
	});

	describe("the stake question", () => {
		it("is put to whoever answers for the duelist, yes or no", async () => {
			confirmDialog.mockResolvedValueOnce(false);
			expect(await onStakeQuery({ uuid: "Actor.bram", kind: "joust", challenger: "Ada", opponent: "Bram" }, { user: { name: "Ada's player" } })).toBe(false);
			expect(confirmDialog.mock.calls[0][0].message[0]).toBe("bastionland.duel.stakeAsk.message");
			expect(await onStakeQuery({ uuid: "Actor.bram", kind: "duel" }, { user: { name: "Ada's player" } })).toBe(true);
		});

		it("is refused for somebody this client doesn't answer for, or from nobody", async () => {
			actors["Actor.bram"].testUserPermission = () => false;
			expect(await onStakeQuery({ uuid: "Actor.bram" }, { user: { name: "Ada's player" } })).toBe(false);
			expect(await onStakeQuery({ uuid: "Actor.ada" }, {})).toBe(false);
			expect(confirmDialog).not.toHaveBeenCalled();
		});

		it("closes itself 5 seconds before the challenger stops waiting, and says it went unanswered", async () => {
			// The window closed by its own timer answers null; refused in time is still a refusal.
			confirmDialog.mockResolvedValueOnce(null);
			expect(await onStakeQuery({ uuid: "Actor.bram", answerBy: 1000000 }, { user: { name: "Ada's player" } })).toBeNull();
			expect(confirmDialog.mock.calls[0][0].closeBy).toBe(1000000 - 5000);
			confirmDialog.mockResolvedValueOnce(false);
			expect(await onStakeQuery({ uuid: "Actor.bram", answerBy: 1000000 }, { user: { name: "Ada's player" } })).toBe(false);
		});

		it("takes a question that doesn't say when the challenger stops waiting as just asked", async () => {
			const asked = Date.now();
			await onStakeQuery({ uuid: "Actor.bram" }, { user: { name: "Ada's player" } });
			const { closeBy } = confirmDialog.mock.calls[0][0];
			expect(closeBy - asked).toBeGreaterThanOrEqual(55000);
			expect(closeBy - Date.now()).toBeLessThanOrEqual(55000);
		});
	});

	describe("the duel dialog's ticks", () => {
		/** A checkbox, as the form holds it. */
		const box = ({ checked = false, disabled = false } = {}) => {
			const listeners = [];
			return {
				checked,
				disabled,
				addEventListener: (_type, fn) => listeners.push(fn),
				tick(value) {
					this.checked = value;
					for (const fn of listeners) fn();
				}
			};
		};
		const dialogWith = (boxes) => ({
			element: {
				querySelector: () => ({
					querySelector: (selector) => {
						const name = selector.match(/name='(\w+)'/)[1];
						const found = boxes[name];
						return selector.includes(":not(:disabled)") && found?.disabled ? null : found ?? null;
					}
				})
			}
		});

		it("locks the Stake box unticked while Sparring is ticked, and gives it back after", () => {
			const boxes = { sparring: box(), bloodless: box(), stake: box() };
			tieTicksToSparring(dialogWith(boxes));
			boxes.stake.tick(true);
			boxes.sparring.tick(true);
			expect(boxes.stake).toMatchObject({ checked: false, disabled: true });
			expect(boxes.bloodless).toMatchObject({ checked: true, disabled: true });
			boxes.sparring.tick(false);
			expect(boxes.stake).toMatchObject({ checked: true, disabled: false });
			expect(boxes.bloodless).toMatchObject({ checked: false, disabled: false });
		});

		it("leaves a Stake box that was never open locked", () => {
			const boxes = { sparring: box(), bloodless: box(), stake: box({ disabled: true }) };
			tieTicksToSparring(dialogWith(boxes));
			boxes.sparring.tick(true);
			boxes.sparring.tick(false);
			expect(boxes.stake.disabled).toBe(true);
		});
	});
});
