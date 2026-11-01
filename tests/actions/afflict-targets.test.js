import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posted = [];
vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key}:${Object.values(data).join("|")}` : key),
	warn: (key, data) => ui.notifications.warn(data ? `${key}:${Object.values(data).join("|")}` : key),
	postCard: async (_actor, _template, data) => posted.push(data)
}));
vi.mock("../../module/actions/actor-updates.js", () => import("../mocks/actor-updates.js"));
vi.mock("../../module/actions/virtue-loss.js", () => ({ rollVirtueLosses: async () => ({ update: {}, taken: [] }) }));
// Like the real one, with no GM there is nobody to answer.
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => (globalThis.game?.users?.activeGM ? answered : false)) }));
vi.mock("../../module/compat.js", () => ({ queryAsker: (context) => context?.user ?? null }));

/** What the active GM answers when asked. */
let answered;

const { afflictTargets, onAfflictQuery } = await import("../../module/actions/afflictions.js");
const { askActiveGM } = await import("../../module/ask-gm.js");

const plague = { id: "p", name: "The Plague", loss: "1d6", virtue: "vig", when: "daily" };

const victim = (name, more = {}) => ({ name, uuid: `Actor.${name}`, documentName: "Actor", isOwner: true, system: { afflictions: [] }, update: vi.fn(async () => {}), ...more });

beforeEach(() => {
	posted.length = 0;
	let next = 0;
	globalThis.foundry = { utils: { randomID: () => `a${next++}` } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
	answered = false;
	askActiveGM.mockClear();
});

afterEach(() => {
	for (const name of ["foundry", "ui", "game", "fromUuidSync"]) delete globalThis[name];
});

describe("afflictTargets", () => {
	it("afflicts a linked actor targeted through two of its Tokens once", async () => {
		const ada = victim("Ada");
		const bram = victim("Bram");
		globalThis.game = { user: { targets: new Set([{ actor: ada }, { actor: ada }, { actor: bram }]) } };
		const took = await afflictTargets({ system: { inflicts: [plague] } });
		expect(ada.update).toHaveBeenCalledTimes(1);
		expect(ada.update.mock.calls[0][0]["system.afflictions"]).toHaveLength(1);
		expect(bram.update).toHaveBeenCalledTimes(1);
		expect(took).toHaveLength(2);
	});
});

describe("a player afflicting targets they don’t own", () => {
	const source = { uuid: "Actor.rat", name: "Rat", system: { inflicts: [plague] } };

	it("afflicts their own targets and has the active GM afflict the rest, on one card", async () => {
		const ada = victim("Ada");
		const bram = victim("Bram", { isOwner: false });
		globalThis.game = { user: { isGM: false, targets: new Set([{ actor: ada }, { actor: bram, document: { uuid: "Scene.s.Token.bram" } }]) }, users: { activeGM: {} } };
		answered = ["afflictions.took:Bram|The Plague"];
		const took = await afflictTargets(source);
		expect(bram.update).not.toHaveBeenCalled();
		expect(askActiveGM).toHaveBeenCalledWith(expect.stringMatching(/.afflict$/), { sourceUuid: "Actor.rat", afflictionIds: ["p"], tokenUuids: ["Scene.s.Token.bram"] }, expect.any(String));
		expect(took).toHaveLength(2);
		expect(posted).toHaveLength(1);
		expect(ui.notifications.warn).not.toHaveBeenCalled();
	});

	it("afflicts only their own with no Referee to ask, and says who was left", async () => {
		const ada = victim("Ada");
		const bram = victim("Bram", { isOwner: false });
		globalThis.game = { user: { isGM: false, targets: new Set([{ actor: ada }, { actor: bram }]) }, users: { activeGM: null } };
		const took = await afflictTargets(source);
		expect(took).toHaveLength(1);
		expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining("afflictions.othersNeedReferee"));
	});

	/** A Scene with the Rat's Token on it, and Tokens for the victims given. */
	const sceneWith = (id, ...victims) => {
		const scene = { id, tokens: [{ actorId: "rat" }] };
		for (const [name, actor, more] of victims) scene.tokens.push({ documentName: "Token", uuid: `Scene.${id}.Token.${name}`, parent: scene, actor, hidden: false, ...more });
		return scene;
	};
	const rat = { ...source, id: "rat", documentName: "Actor", testUserPermission: (user) => user.id === "p1" };
	const askedGM = (scenes) => {
		globalThis.game = { user: { isGM: true }, scenes: new Map(scenes.map((scene) => [scene.id, scene])) };
		const all = Object.fromEntries(scenes.flatMap((scene) => scene.tokens.filter((token) => token.uuid).map((token) => [token.uuid, token])));
		globalThis.fromUuidSync = (uuid) => ({ "Actor.rat": rat, ...all })[uuid] ?? null;
	};

	it("has the Referee afflict only for a source the asker owns, with what it really causes", async () => {
		const bram = victim("Bram");
		askedGM([sceneWith("s", ["bram", bram])]);
		const asked = { sourceUuid: "Actor.rat", afflictionIds: ["p"], tokenUuids: ["Scene.s.Token.bram"] };
		expect(await onAfflictQuery(asked, { user: { id: "p2", viewedScene: "s" } })).toBe(false);
		expect(await onAfflictQuery({ ...asked, afflictionIds: ["other"] }, { user: { id: "p1", viewedScene: "s" } })).toBe(false);
		expect(bram.update).not.toHaveBeenCalled();
		expect(await onAfflictQuery(asked, { user: { id: "p1", viewedScene: "s" } })).toHaveLength(1);
		expect(bram.update.mock.calls[0][0]["system.afflictions"]).toHaveLength(1);
	});

	it("has the Referee afflict only visible Tokens on the Scene the player looks at, where the source is too", async () => {
		const bram = victim("Bram");
		const cora = victim("Cora");
		const dell = victim("Dell");
		const here = sceneWith("s", ["bram", bram], ["cora", cora, { hidden: true }]);
		const away = sceneWith("t", ["dell", dell]);
		away.tokens.shift();
		askedGM([here, away]);
		const asked = { sourceUuid: "Actor.rat", afflictionIds: ["p"], tokenUuids: ["Scene.s.Token.bram", "Scene.s.Token.cora", "Scene.t.Token.dell", "Actor.Bram"] };
		expect(await onAfflictQuery(asked, { user: { id: "p1", viewedScene: "s" } })).toHaveLength(1);
		expect(bram.update).toHaveBeenCalledTimes(1);
		expect(cora.update).not.toHaveBeenCalled();
		expect(dell.update).not.toHaveBeenCalled();
		// Looking at a Scene without the source, nobody is reached.
		expect(await onAfflictQuery({ ...asked, tokenUuids: ["Scene.t.Token.dell"] }, { user: { id: "p1", viewedScene: "t" } })).toBe(false);
		expect(dell.update).not.toHaveBeenCalled();
	});
});
