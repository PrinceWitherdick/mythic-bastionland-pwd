import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDuel } from "../../module/rules/duel.js";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null), confirmDialog: vi.fn(async () => true) }));
vi.mock("../../module/chat/cards.js", async (importOriginal) => ({
	...(await importOriginal()),
	postCard: vi.fn(async () => ({ id: "message-1" }))
}));
// The duel card's own buttons are under test; the Attack cards and Damage they lean on are stubbed.
vi.mock("../../module/actions/damage.js", () => ({ takeAttack: vi.fn(async () => ({ outcome: "wounded" })) }));
vi.mock("../../module/chat/attack-card.js", () => ({
	attackOf: (message) => message?.attack ?? null,
	saveChange: vi.fn(async () => true)
}));
vi.mock("../../module/actions/glory.js", () => ({ adjustGlory: vi.fn(async () => []) }));
vi.mock("../../module/actions/ledger.js", () => ({ causedBy: (key) => ({ cause: key }) }));
vi.mock("../../module/actions/calendar.js", () => ({ CALENDAR_HOOK: "calendarChanged" }));

const { inputDialog } = await import("../../module/apps/ui.js");
const { postCard } = await import("../../module/chat/cards.js");
const { takeAttack } = await import("../../module/actions/damage.js");
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
		expect(duelCardContext(ready).resolveHint).toBeNull();
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
		await hooks.calendarChanged();
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
		await hooks.calendarChanged();
		expect(quiet.message.flags[SYSTEM_ID].duel.ended).toBe(true);
		expect(postCard).not.toHaveBeenCalled();

		actors["Actor.bram"].system.virtues.vig.value = 4;
		const hurt = renderDuel(sparring());
		await hooks.calendarChanged();
		expect(hurt.message.flags[SYSTEM_ID].duel.ended).toBe(true);
		expect(actors["Actor.bram"].system.virtues.vig.value).toBe(9);
		expect(postCard.mock.calls[0][2].tagline).toBe("bastionland.duel.shaken.timePassed");
	});

	it("is left to the active GM, and never closes a duel that isn't sparring", async () => {
		const plain = renderDuel(createDuel({ duelists }));
		await hooks.calendarChanged();
		expect(plain.message.flags[SYSTEM_ID].duel.ended).toBe(false);

		game.users.activeGM = { isSelf: false };
		const bout = renderDuel(sparring());
		await hooks.calendarChanged();
		await hooks.deleteCombat(combatOf("Actor.ada"));
		expect(bout.message.flags[SYSTEM_ID].duel.ended).toBe(false);
	});
});
