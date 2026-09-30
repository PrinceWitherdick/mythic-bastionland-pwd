import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realmGeometry, edgeKey } from "../../module/rules/realm-geometry.js";
import { emptyRealm, TERRAIN } from "../../module/rules/realm.js";
import { withBookText } from "../../module/rules/book-text.js";

const g = realmGeometry({ cols: 12, rows: 12 });
const hex = (col, row) => ({ col, row });

/** What the next dialog answers with, and what the last one was asked. */
let answer;
let asked;
/** The Realm the Scene holds. */
let realm;
/** Whether the Phase was moved on. */
let phases;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		asked = options;
		return answer;
	})
}));
vi.mock("../../module/actions/realm.js", () => ({
	isRealmScene: (scene) => scene?.isRealm !== false,
	sceneGeometry: () => g,
	getRealm: () => ({ realm }),
	hexHiddenByHand: () => ({ terrain: false, holding: false, seat: false })
}));
// The Realm and the hex the Company stands in; a Scene that's no Realm warns and gives nothing.
vi.mock("../../module/actions/wilderness.js", () => ({
	realmAndCompany: (scene, where = null) => {
		if (scene?.isRealm === false) {
			ui.notifications.warn("bastionland.realm.wilderness.notRealm");
			return null;
		}
		return { realm, g, where: where ?? hex(6, 6) };
	}
}));
vi.mock("../../module/actions/time.js", () => ({ advancePhase: vi.fn(async () => { phases += 1; }) }));
vi.mock("../../module/book-art/art-index.js", () => ({
	loadArtIndex: async () => null,
	mythEntry: (_index, myth) => ({ name: `The Myth of ${myth.number}`, page: 30 + myth.number, entry: null })
}));
// The Save's own card is saves.js's to build and test; here only what a search asks it for matters.
vi.mock("../../module/actions/saves.js", () => ({
	rollLabelledSave: vi.fn(async (actor, virtue) => ({ virtue, value: 12, roll: { total: 7 }, passed: true }))
}));

const { gatherFolklore, lookFromVantage, markOnPlayersMap, searchTheHex } = await import("../../module/actions/exploration.js");
const { rollLabelledSave } = await import("../../module/actions/saves.js");

const root = join(import.meta.dirname, "../..");
const lang = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8")));
const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const format = (key, data) => String(lookup(key) ?? key).replace(/\{(\w+)\}/g, (_match, name) => data?.[name] ?? "");

/** The cards posted, as the contexts they were rendered with, and their templates. */
let cards;

function realmWith({ myths = [], landmarks = [], barriers = [], terrain = {} } = {}) {
	const made = emptyRealm(g);
	made.myths = myths.map(({ number, hex: where, revealed = false }) => ({ id: `myth-${number}`, hex: where, number, d6: 1, d12: 1, omen: 0, revealed }));
	made.landmarks = landmarks.map(({ type, hex: where, name = "", revealed = false }, index) => ({
		id: `landmark-${index}`, hex: where, type, name, seer: null, revealed
	}));
	made.barriers = barriers.map((edge, index) => ({ id: `barrier-${index}`, edge, revealed: false }));
	for (const [key, value] of Object.entries(terrain)) {
		const [col, row] = key.split(",").map(Number);
		made.terrain[(row - 1) * g.cols + (col - 1)] = TERRAIN.indexOf(value) + 1;
	}
	return made;
}

/** A Realm Scene whose Tiles can be hidden and shown. */
function fakeScene(tiles = [], drawings = []) {
	const held = new Map([...tiles, ...drawings].map((drawn) => [drawn.id, { ...drawn }]));
	const only = (ids) => ({ get: (id) => (ids.has(id) ? held.get(id) : null) ?? null });
	return {
		id: "scene",
		tiles: only(new Set(tiles.map((tile) => tile.id))),
		drawings: only(new Set(drawings.map((drawing) => drawing.id))),
		updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
			for (const update of updates) Object.assign(held.get(update._id), update);
		}),
		held
	};
}

beforeEach(() => {
	answer = null;
	asked = null;
	phases = 0;
	cards = [];
	realm = realmWith();
	globalThis.Roll = class {
		constructor(formula) {
			this.formula = formula;
			this.total = 1;
		}

		async evaluate() {
			return this;
		}
	};
	globalThis.canvas = { scene: { id: "scene" } };
	globalThis.game = {
		i18n: { localize: (key) => lookup(key) ?? key, format },
		actors: [],
		scenes: { get: () => null },
		settings: { get: () => "public" },
		user: { name: "Referee", isGM: true }
	};
	globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
	globalThis.foundry = {
		applications: {
			handlebars: {
				renderTemplate: vi.fn(async (path, context) => {
					cards.push({ path, context });
					return "<section></section>";
				})
			}
		}
	};
	globalThis.ChatMessage = {
		implementation: { getSpeaker: ({ actor }) => ({ alias: actor.name }), applyMode: () => {}, create: vi.fn(async (data) => data) }
	};
	globalThis.CONFIG = { sounds: { dice: "dice.wav" } };
});

afterEach(() => {
	for (const key of ["Roll", "canvas", "game", "ui", "foundry", "ChatMessage", "CONFIG"]) delete globalThis[key];
	vi.clearAllMocks();
});

/** @returns {object} The context of the last card posted. */
const lastCard = () => cards.at(-1).context;

describe("gatherFolklore", () => {
	beforeEach(() => {
		realm = realmWith({
			myths: [{ number: 1, hex: hex(6, 7) }, { number: 4, hex: hex(2, 2) }],
			landmarks: [{ type: "dwelling", hex: hex(6, 6) }, { type: "ruin", hex: hex(11, 11) }]
		});
	});

	it("tells the Referee what a Vassal knows, and offers to mark the Myth they can place", async () => {
		answer = { source: "vassal" };
		const folklore = await gatherFolklore({ scene: { id: "scene" } });

		expect(folklore.source).toBe("vassal");
		expect(cards.at(-1).path).toMatch(/chat[/\\]folklore\.hbs$/);
		const card = lastCard();
		expect(card.myths[0]).toMatchObject({ number: 1, name: "The Myth of 1" });
		expect(card.landmarks.map((landmark) => landmark.type)).toEqual([lookup("bastionland.realm.landmarks.dwelling")]);
		// The Myth is adjacent to their home, so its Tile and the Landmark's can be marked.
		expect(card.mark.ids.split(",").sort()).toEqual(["landmark-0", "myth-1"]);
		expect(card.rumours).toBe(lookup("bastionland.explore.folklore.rumours"));
		expect(card.secrets).toBeNull();
	});

	it("whispers the card to the Referee", async () => {
		answer = { source: "vassal" };
		await gatherFolklore({ scene: { id: "scene" } });
		expect(ChatMessage.implementation.create).toHaveBeenCalled();
	});

	it("rolls which Myth a roamer speaks of, since they might name any of them", async () => {
		answer = { source: "roamer" };
		await gatherFolklore({ scene: { id: "scene" } });
		const card = lastCard();
		expect(card.myths).toHaveLength(1);
		// The d2 fake always rolls 1, so the first Myth by number is named, without its place.
		expect(card.myths[0].number).toBe(1);
		// Only the Landmark they know of can be marked: they can't place the Myth.
		expect(card.mark.ids).toBe("landmark-0");
	});

	it("has a Seer name every Myth and Landmark, with their secrets", async () => {
		answer = { source: "seer" };
		await gatherFolklore({ scene: { id: "scene" } });
		const card = lastCard();
		expect(card.myths.map((myth) => myth.number)).toEqual([1, 4]);
		expect(card.landmarks).toHaveLength(2);
		expect(card.secrets).toBe(lookup("bastionland.explore.folklore.secrets"));
	});

	it("asks nobody when the dialog is closed", async () => {
		answer = null;
		expect(await gatherFolklore({ scene: { id: "scene" } })).toBeNull();
		expect(cards).toEqual([]);
	});

	it("refuses a Scene that isn't a Realm", async () => {
		expect(await gatherFolklore({ scene: { isRealm: false } })).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalled();
	});
});

describe("searchTheHex", () => {
	beforeEach(() => {
		realm = realmWith({
			landmarks: [{ type: "monument", hex: hex(6, 6) }],
			barriers: [edgeKey(hex(6, 6), hex(6, 7))],
			terrain: { "6,6": "forest", "6,7": "peaks" }
		});
	});

	it("sweeps the Hex, offering its Landmark to the players' map, and spends the Phase", async () => {
		answer = { aim: "sweep", phase: true };
		expect(await searchTheHex({ scene: { id: "scene" } })).toBe("sweep");
		const card = lastCard();
		expect(cards.at(-1).path).toMatch(/chat[/\\]survey\.hbs$/);
		expect(card.around).toEqual([]);
		expect(card.mark.ids).toBe("landmark-0");
		expect(phases).toBe(1);
	});

	it("shows the land around from a vantage point, with the Barrier it reveals", async () => {
		answer = { aim: "vantage", phase: true };
		await searchTheHex({ scene: { id: "scene" } });
		const card = lastCard();
		expect(card.around).toHaveLength(6);
		expect(card.mark.ids.split(",")).toContain("barrier-0");
		expect(card.around.some((step) => step.barrier)).toBe(true);
	});

	it("leaves the day where it stands when the Phase is unticked", async () => {
		answer = { aim: "sweep", phase: false };
		await searchTheHex({ scene: { id: "scene" } });
		expect(phases).toBe(0);
	});

	it("rolls the Save the Company chose for a search for something known to be there", async () => {
		const knight = { id: "k1", name: "Sir Ose", type: "knight", system: { virtues: { cla: { value: 12 } } } };
		game.actors = [knight];
		answer = { aim: "known", who: "k1", virtue: "cla", what: "The buried door", phase: true };
		await searchTheHex({ scene: { id: "scene" } });

		expect(rollLabelledSave).toHaveBeenCalledWith(knight, "cla", expect.objectContaining({
			label: lookup("bastionland.explore.search.saveTitle"),
			outcome: "The buried door"
		}), { rolled: null });
		// What the Save found is read off the result, so the card can say either way.
		const { hint } = rollLabelledSave.mock.calls.at(-1)[2];
		expect(hint({ passed: true })).toBe(lookup("bastionland.explore.search.found"));
		expect(hint({ passed: false })).toBe(lookup("bastionland.explore.search.obstacle"));
		expect(phases).toBe(1);
	});

	it("rolls here when no d20 was entered, and keeps the face the player rolled at the table", async () => {
		const knight = { id: "k1", name: "Sir Ose", type: "knight", system: { virtues: { cla: { value: 12 } } } };
		game.actors = [knight];
		answer = { aim: "known", who: "k1", virtue: "cla", what: "", rolled: null, phase: false };
		await searchTheHex({ scene: { id: "scene" } });
		expect(rollLabelledSave.mock.calls.at(-1)[3]).toEqual({ rolled: null });

		answer = { ...answer, rolled: 17 };
		await searchTheHex({ scene: { id: "scene" } });
		expect(rollLabelledSave.mock.calls.at(-1)[3]).toEqual({ rolled: 17 });
	});

	it("says so when nobody was chosen to roll", async () => {
		answer = { aim: "known", who: "nobody", virtue: "cla", what: "", phase: false };
		await searchTheHex({ scene: { id: "scene" } });
		expect(rollLabelledSave).not.toHaveBeenCalled();
		expect(ui.notifications.warn).toHaveBeenCalledWith(lookup("bastionland.explore.search.noOne"));
	});

	it("offers the Company's own Knights and the book's Virtue guidance", async () => {
		game.actors = [{ id: "k1", name: "Sir Ose", type: "knight", system: { virtues: {} } }, { id: "d1", name: "A dog", type: "npc", system: { virtues: {} } }];
		answer = null;
		await searchTheHex({ scene: { id: "scene" } });
		expect(asked.context.knights.map((knight) => knight.name)).toEqual(["Sir Ose"]);
		expect(asked.context.virtues.map((virtue) => virtue.key)).toEqual(["vig", "cla", "spi"]);
	});
});

describe("lookFromVantage", () => {
	it("shows the land around without spending a Phase, since the search already did", async () => {
		realm = realmWith({ terrain: { "6,6": "hills" } });
		await lookFromVantage({ scene: { id: "scene" } });
		expect(lastCard().around).toHaveLength(6);
		expect(phases).toBe(0);
	});

	it("offers to mark what stands hidden in the hexes around, seen from afar (p197)", async () => {
		realm = realmWith({ landmarks: [{ type: "monument", hex: hex(6, 7), name: "Eternal Hearth" }], barriers: [edgeKey(hex(6, 6), hex(6, 5))] });
		const scene = { id: "scene", flags: {}, update: vi.fn() };
		answer = { "sight-0": true, "note-0": "a structure, smoke rising" };
		await lookFromVantage({ scene });
		expect(asked.template).toBe("sighted");
		expect(asked.context.hexes).toHaveLength(1);
		const [[changes]] = scene.update.mock.calls;
		expect(Object.values(changes)).toEqual([{ note: "a structure, smoke rising" }]);
		expect(Object.keys(changes)[0]).toMatch(/\.sighted\.6,7$/);
	});

	it("sees nothing past the Hex in fog, and offers nothing to mark there", async () => {
		realm = realmWith({ landmarks: [{ type: "monument", hex: hex(6, 7) }], barriers: [edgeKey(hex(6, 6), hex(6, 5))] });
		// The day's fog came down this morning, which is where the calendar stands.
		game.settings.get = (_scope, key) => (key === "fog" ? { when: { age: 1, year: 1, season: "spring", day: 1, phase: "morning" } } : "public");
		const scene = { id: "scene", flags: {}, update: vi.fn() };
		answer = { "sight-0": true };
		await lookFromVantage({ scene });
		const card = lastCard();
		expect(card.around).toEqual([]);
		expect(card.mark).toBeNull();
		expect(card.hint).toBe(lookup("bastionland.skyWeather.fog.vantage"));
		expect(asked).toBeNull();
		expect(scene.update).not.toHaveBeenCalled();
	});
});

describe("markOnPlayersMap", () => {
	it("draws what was told or seen on the players' copy, and leaves what they already have", async () => {
		const scene = fakeScene([{ id: "a", hidden: true }, { id: "b", hidden: false }]);
		expect(await markOnPlayersMap(scene, ["a", "b", "gone"])).toBe(1);
		expect(scene.held.get("a").hidden).toBe(false);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Tile", [{ _id: "a", hidden: false }]);
	});

	it("marks nothing where the map already shows it all", async () => {
		const scene = fakeScene([{ id: "a", hidden: false }]);
		expect(await markOnPlayersMap(scene, ["a"])).toBe(0);
		expect(scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
		expect(ui.notifications.info).toHaveBeenCalledWith(lookup("bastionland.explore.markedNothing"));
	});

	it("marks a Barrier, which is a Drawing rather than a Tile", async () => {
		const scene = fakeScene([{ id: "myth", hidden: true }], [{ id: "edge", hidden: true }]);
		expect(await markOnPlayersMap(scene, ["myth", "edge"])).toBe(2);
		expect(scene.held.get("edge").hidden).toBe(false);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Tile", [{ _id: "myth", hidden: false }]);
		expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith("Drawing", [{ _id: "edge", hidden: false }]);
	});

	it("marks nothing for a player", async () => {
		game.user.isGM = false;
		expect(await markOnPlayersMap(fakeScene([{ id: "a", hidden: true }]), ["a"])).toBe(0);
	});
});
