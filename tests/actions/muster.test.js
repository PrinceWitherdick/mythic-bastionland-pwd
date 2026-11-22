import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data?.names ? `${key}:${data.names}` : key), warn: vi.fn() }));
vi.mock("../../module/actions/knights.js", () => ({ inCompany: (actor) => Boolean(actor.company) }));

const { warn } = await import("../../module/chat/cards.js");
const { bringCast, bringCompany } = await import("../../module/actions/muster.js");

/** A Knight as far as the muster looks at one: its Token is one grid space, made where it's asked for. */
const knight = (id, extra = {}) => ({
	id,
	name: id,
	company: true,
	system: { slain: false },
	getTokenDocument: async () => ({ width: 1, height: 1, toObject: () => ({ name: id, actorId: id, actorLink: true }) }),
	...extra
});

let scene;
let combat;

beforeEach(() => {
	vi.clearAllMocks();
	scene = {
		id: "s1",
		grid: { size: 100 },
		tokens: [],
		createEmbeddedDocuments: vi.fn(async (_type, data) => {
			const made = data.map((token, index) => ({ hidden: false, ...token, id: `new${index}` }));
			scene.tokens.push(...made);
			return made;
		})
	};
	combat = { scene: { id: "s1" }, combatants: [], createEmbeddedDocuments: vi.fn(async () => []) };
	globalThis.canvas = { scene, stage: { pivot: { x: 1000, y: 600 } } };
	globalThis.ui = { notifications: { info: vi.fn() } };
	globalThis.CONFIG = { Combat: { documentClass: { create: vi.fn(async () => combat) } } };
	globalThis.game = { user: { isGM: true }, actors: [], combats: { viewed: combat } };
});

afterEach(() => {
	for (const key of ["canvas", "ui", "CONFIG", "game"]) delete globalThis[key];
});

describe("bringing the Company onto a Scene", () => {
	it("puts a Token for each Knight not there yet in the middle of the view, and all of them in the Combat", async () => {
		game.actors = [knight("Alys"), knight("Bors"), knight("Sentry", { company: false })];
		scene.tokens.push({ id: "old", name: "Bors", actorId: "Bors", hidden: false });
		const { placed, joined } = await bringCompany();
		expect(placed.map(({ name, x, y }) => [name, x, y])).toEqual([["Alys", 950, 550]]);
		expect(joined.map(({ name }) => name).sort()).toEqual(["Alys", "Bors"]);
		expect(combat.createEmbeddedDocuments).toHaveBeenCalledWith("Combatant", [
			{ tokenId: "old", sceneId: "s1", actorId: "Bors", hidden: false },
			{ tokenId: "new0", sceneId: "s1", actorId: "Alys", hidden: false }
		]);
		expect(CONFIG.Combat.documentClass.create).not.toHaveBeenCalled();
		// Bors only joined the fight, and is named beside Alys, who was placed.
		expect(ui.notifications.info).toHaveBeenCalledWith("muster.brought:Alys, Bors");
	});

	it("snaps each new Token to the Scene's own grid, its prototype made in that Scene", async () => {
		const getTokenDocument = vi.fn(async (_data, { parent } = {}) => ({
			width: 1,
			height: 1,
			// As Foundry's: snapped by its parent's grid, or by a 100px square one where it has none.
			getSnappedPosition: ({ x, y }) => (parent ? { x: x + 7, y: y + 7 } : { x, y }),
			toObject: () => ({ name: "Alys", actorId: "Alys", actorLink: true })
		}));
		game.actors = [knight("Alys", { getTokenDocument })];
		const { placed } = await bringCompany();
		expect(getTokenDocument).toHaveBeenCalledWith({}, { parent: scene });
		expect(placed.map(({ x, y }) => [x, y])).toEqual([[957, 557]]);
	});

	it("makes a Combat for the Scene where none is being looked at", async () => {
		game.actors = [knight("Alys")];
		game.combats.viewed = null;
		await bringCompany();
		expect(CONFIG.Combat.documentClass.create).toHaveBeenCalledWith({ scene: "s1", active: true });
		expect(combat.createEmbeddedDocuments).toHaveBeenCalledOnce();
	});

	it("leaves the Slain where they fell, and says so when nobody is left to bring", async () => {
		game.actors = [knight("Alys", { system: { slain: true } })];
		expect(await bringCompany()).toBeNull();
		expect(warn).toHaveBeenCalledWith("muster.nobody");
		expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("does nothing twice: a Company already there and fighting is only said to be", async () => {
		game.actors = [knight("Alys")];
		scene.tokens.push({ id: "old", name: "Alys", actorId: "Alys", hidden: false });
		combat.combatants = [{ tokenId: "old" }];
		const { placed, joined } = await bringCompany();
		expect(placed).toEqual([]);
		expect(joined).toEqual([]);
		expect(combat.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(ui.notifications.info).toHaveBeenCalledWith("muster.alreadyHere");
	});

	it("is the Referee's alone", async () => {
		game.user.isGM = false;
		game.actors = [knight("Alys")];
		expect(await bringCompany()).toBeNull();
		expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
	});
});

describe("bringing a Myth's Cast onto a Scene", () => {
	const foe = (id, extra = {}) => knight(id, { company: false, ...extra });

	it("puts them in the middle of the view and into the fight, as the Company is brought", async () => {
		const { placed, joined } = await bringCast([foe("Troll")]);
		expect(placed.map(({ name, x, y }) => [name, x, y])).toEqual([["Troll", 950, 550]]);
		expect(joined.map(({ name }) => name)).toEqual(["Troll"]);
		expect(ui.notifications.info).toHaveBeenCalledWith("muster.brought:Troll");
	});

	it("places them and their place in the fight hidden from the players when asked", async () => {
		await bringCast([foe("Troll")], { hidden: true });
		expect(scene.createEmbeddedDocuments.mock.calls[0][1][0].hidden).toBe(true);
		expect(combat.createEmbeddedDocuments).toHaveBeenCalledWith("Combatant", [{ tokenId: "new0", sceneId: "s1", actorId: "Troll", hidden: true }]);
	});

	it("brings nobody Slain, and says when they're there and fighting already", async () => {
		expect(await bringCast([foe("Troll", { system: { slain: true } })])).toBeNull();
		scene.tokens.push({ id: "old", name: "Troll", actorId: "Troll", hidden: false });
		combat.combatants = [{ tokenId: "old" }];
		await bringCast([foe("Troll")]);
		expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
		expect(ui.notifications.info).toHaveBeenCalledWith("muster.castHere");
	});

	it("asks for a Scene where none is open, and is the Referee's alone", async () => {
		canvas.scene = null;
		expect(await bringCast([foe("Troll")])).toBeNull();
		expect(warn).toHaveBeenCalledWith("muster.noScene");
		game.user.isGM = false;
		expect(await bringCast([foe("Troll")], { scene })).toBeNull();
		expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
	});
});
