import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => [] }));

const { registerLeadingHooks } = await import("../../module/actions/leading.js");
const { leaderCandidates, letGoOf } = await import("../../module/actions/leading.js");

/** The hooks registered, by name. */
let hooks;

/** A Combat's combatants as Foundry keeps them: a Collection, iterated by value, with map but none of an Array's other methods. */
const collection = (...entries) => {
	const kept = new Map(entries.map((entry, index) => [String(index), entry]));
	kept[Symbol.iterator] = () => kept.values();
	kept.map = (fn) => [...kept.values()].map(fn);
	return kept;
};

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
		await hooks.get("deleteCombat")({ combatants: collection({ actor: tokens }) });
		expect(led.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
		expect(tokens.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
		expect(unled.update).not.toHaveBeenCalled();
	});

	it("leaves the leaders of another fight be", async () => {
		const here = warband("Actor.militia", "Actor.kay");
		const elsewhere = warband("Actor.riders", "Actor.gawain");
		game.actors = [here, elsewhere];
		await hooks.get("deleteCombat")({ combatants: collection({ actor: here }) });
		expect(here.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
		expect(elsewhere.update).not.toHaveBeenCalled();
	});

	it("leaves a Warband still fighting on another Scene its leader, though the leader fought here too", async () => {
		const led = warband("Actor.militia", "Actor.kay");
		game.actors = [led];
		game.combats = [{ id: "c2", combatants: collection({ actor: led }) }];
		await hooks.get("deleteCombat")({ id: "c1", combatants: collection({ actor: { uuid: "Actor.kay", type: "knight", system: {} } }) });
		expect(led.update).not.toHaveBeenCalled();
	});

	it("frees a Warband led by somebody who was in the fight", async () => {
		const led = warband("Actor.militia", "Actor.kay");
		game.actors = [led];
		await hooks.get("deleteCombat")({ combatants: collection({ actor: { uuid: "Actor.kay", type: "knight", system: {} } }) });
		expect(led.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
	});

	it("is left to the active GM's browser", async () => {
		const led = warband("Actor.militia", "Actor.kay");
		game.actors = [led];
		game.users.activeGM.isSelf = false;
		await hooks.get("deleteCombat")({ combatants: collection() });
		expect(led.update).not.toHaveBeenCalled();
	});
});

describe("who may lead from the front", () => {
	it("leaves out the Slain and the dying (p8)", () => {
		const person = (uuid, extra = {}) => ({ uuid, system: { virtues: {}, ...extra } });
		globalThis.canvas = { tokens: { controlled: [
			{ actor: person("Actor.kay") },
			{ actor: person("Actor.dead", { slain: true }) },
			{ actor: person("Actor.dying", { mortalWound: true }) }
		] } };
		globalThis.fromUuidSync = () => null;
		game.user = { character: null };
		try {
			expect(leaderCandidates({ uuid: "Actor.militia", system: { leader: "" } }).map(({ uuid }) => uuid)).toEqual(["Actor.kay"]);
		} finally {
			delete globalThis.canvas;
			delete globalThis.fromUuidSync;
		}
	});

	it("leaves out anybody already leading another Warband, but not this one's own leader (p11)", () => {
		const person = (uuid) => ({ uuid, system: { virtues: {} } });
		const kay = person("Actor.kay");
		const gawain = person("Actor.gawain");
		const militia = { uuid: "Actor.militia", system: { scale: "warband", leader: "Actor.kay" } };
		const riders = { uuid: "Actor.riders", system: { scale: "warband", leader: "Actor.gawain" } };
		// An unlinked Token's copy of the Warband being led names its leader too.
		const ownCopy = { uuid: "Scene.s.Token.t.Actor.militia", isToken: true, token: { baseActor: militia }, system: { scale: "warband", leader: "Actor.kay" } };
		game.actors = [militia, riders];
		globalThis.canvas = { tokens: { controlled: [{ actor: kay }, { actor: gawain }] }, scene: { tokens: [{ actor: ownCopy }] } };
		globalThis.fromUuidSync = (uuid) => (uuid === "Actor.kay" ? kay : null);
		game.user = { character: null };
		try {
			expect(leaderCandidates(militia).map(({ uuid }) => uuid)).toEqual(["Actor.kay"]);
		} finally {
			delete globalThis.canvas;
			delete globalThis.fromUuidSync;
		}
	});
});

describe("letGoOf", () => {
	it("frees every Warband a leader led as they go down for good, unlinked Tokens' and fights' too (p8, p11)", async () => {
		const led = { ...warband("Actor.militia", "Actor.kay"), isOwner: true };
		const other = { ...warband("Actor.riders", "Actor.gawain"), isOwner: true };
		const token = { ...warband("Scene.s.Token.t.Actor.militia", "Actor.kay"), isOwner: true };
		game.actors = [led, other];
		game.combats = [{ combatants: collection({ actor: token }) }];
		await letGoOf({ uuid: "Actor.kay" });
		expect(led.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
		expect(token.update).toHaveBeenCalledWith({ "system.leader": "" }, undefined);
		expect(other.update).not.toHaveBeenCalled();
		delete game.combats;
	});

	it("leaves a Warband this user can't change", async () => {
		const theirs = { ...warband("Actor.militia", "Actor.kay"), isOwner: false };
		game.actors = [theirs];
		await letGoOf({ uuid: "Actor.kay" });
		expect(theirs.update).not.toHaveBeenCalled();
	});
});
