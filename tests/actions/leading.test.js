import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => [] }));

const { registerLeadingHooks } = await import("../../module/actions/leading.js");

/** The hooks registered, by name. */
let hooks;

const warband = (uuid, leader) => ({ uuid, type: "npc", system: { leader }, update: vi.fn(async () => {}) });

beforeEach(() => {
	hooks = new Map();
	globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn) };
	globalThis.game = { users: { activeGM: { isSelf: true } }, actors: [] };
	registerLeadingHooks();
});

describe("leading from the front (p11)", () => {
	it("ends with the fight, even for a leader whose turn never came", async () => {
		const led = warband("Actor.militia", "Actor.kay");
		const unled = warband("Actor.riders", "");
		const tokens = { ...warband("Scene.s.Token.t.Actor.militia", "Actor.kay"), isToken: true, token: { baseActor: led } };
		game.actors = [led, unled];
		await hooks.get("deleteCombat")({ combatants: [{ actor: tokens }] });
		expect(led.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
		expect(tokens.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
		expect(unled.update).not.toHaveBeenCalled();
	});

	it("leaves the leaders of another fight be", async () => {
		const here = warband("Actor.militia", "Actor.kay");
		const elsewhere = warband("Actor.riders", "Actor.gawain");
		game.actors = [here, elsewhere];
		await hooks.get("deleteCombat")({ combatants: [{ actor: here }] });
		expect(here.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
		expect(elsewhere.update).not.toHaveBeenCalled();
	});

	it("frees a Warband led by somebody who was in the fight", async () => {
		const led = warband("Actor.militia", "Actor.kay");
		game.actors = [led];
		await hooks.get("deleteCombat")({ combatants: [{ actor: { uuid: "Actor.kay", type: "knight", system: {} } }] });
		expect(led.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
	});

	it("is left to the active GM's browser", async () => {
		const led = warband("Actor.militia", "Actor.kay");
		game.actors = [led];
		game.users.activeGM.isSelf = false;
		await hooks.get("deleteCombat")({ combatants: [] });
		expect(led.update).not.toHaveBeenCalled();
	});
});
