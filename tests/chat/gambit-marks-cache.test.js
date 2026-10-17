import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data?.name ? `${key}:${data.name}` : key) }));

const { marksOn, registerGambitMarks } = await import("../../module/chat/gambit-marks.js");
const { SYSTEM_ID } = await import("../../module/system-id.js");

const hooks = new Map();
let reads;
let log;

/** An Attack card aimed at `target`, with an Impair landed. */
const card = (id, target) => ({
	id,
	flags: { [SYSTEM_ID]: { attack: { attacker: "Actor.a", attackerName: "Ann", targets: [{ uuid: `Token.${target}` }], gambits: [{ key: "impair", die: null }] } } }
});

const actor = (uuid, rendered = true) => ({ uuid, sheet: { rendered, render: vi.fn() } });

beforeEach(() => {
	hooks.clear();
	reads = 0;
	log = [card("m1", "b")];
	globalThis.Hooks = { on: (name, fn) => hooks.set(name, [...(hooks.get(name) ?? []), fn]) };
	globalThis.fromUuidSync = (uuid) => ({ actor: { uuid: uuid.replace("Token.", "Actor.") } });
	globalThis.game = {
		combat: null,
		messages: {
			get size() { return log.length; },
			get contents() {
				reads++;
				return log;
			}
		}
	};
	registerGambitMarks();
	hooks.get("deleteChatMessage")[0]();
});

afterEach(() => {
	delete globalThis.Hooks;
	delete globalThis.fromUuidSync;
	delete globalThis.game;
});

const call = (name, ...args) => hooks.get(name).forEach((fn) => fn(...args));

describe("marksOn", () => {
	it("reads the chat log once, until it changes", () => {
		const target = actor("Actor.b");
		expect(marksOn(target).map((mark) => mark.key)).toEqual(["impair"]);
		marksOn(target);
		expect(reads).toBe(1);
		call("updateChatMessage", log[0], {});
		marksOn(target);
		expect(reads).toBe(2);
	});

	it("reads a card posted even before its hook is heard", () => {
		const target = actor("Actor.c");
		expect(marksOn(target)).toEqual([]);
		log = [...log, card("m2", "c")];
		expect(marksOn(target).map((mark) => mark.messageId)).toEqual(["m2"]);
	});

	it("hands back a copy, so a caller can't change what is kept", () => {
		const target = actor("Actor.b");
		marksOn(target).pop();
		expect(marksOn(target)).toHaveLength(1);
	});

	it("redraws a combatant's sheet as the turn moves on only where their marks changed, and every one at a new round", () => {
		const marked = actor("Actor.b");
		const free = actor("Actor.d");
		game.combat = { id: "c1", started: true, round: 1, turn: 0, turns: [{ actor: marked }, { actor: free }] };
		marksOn(marked);
		marksOn(free);
		game.combat.turn = 1;
		call("updateCombat", game.combat, { turn: 1 });
		expect(free.sheet.render).not.toHaveBeenCalled();
		game.combat.round = 2;
		call("updateCombat", game.combat, { round: 2, turn: 0 });
		expect(free.sheet.render).toHaveBeenCalledTimes(1);
		expect(marked.sheet.render).toHaveBeenCalled();
	});

	it("reads the marks again once an initiative set has the turns laid out anew, and redraws only where they changed", () => {
		vi.useFakeTimers();
		try {
			const marked = actor("Actor.b");
			const free = actor("Actor.d");
			const combat = { id: "c1", started: true, round: 1, turn: 0, turns: [{ actor: marked }, { actor: free }] };
			game.combat = combat;
			marksOn(marked);
			marksOn(free);
			const before = reads;
			// What the turn order holds over Actor.b reads differently after it, as a mark lapsing would.
			log = [card("m9", "b")];
			combat.turns = [{ actor: free }, { actor: marked }];
			call("updateCombatant", { parent: combat }, { initiative: 12 });
			expect(marked.sheet.render).not.toHaveBeenCalled();
			vi.runAllTimers();
			expect(reads).toBeGreaterThan(before);
			expect(marked.sheet.render).toHaveBeenCalledTimes(1);
			expect(free.sheet.render).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
