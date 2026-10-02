import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyJourney, recordVisits } from "../../module/rules/journey.js";
import { emptyShared, recordBarrierMet } from "../../module/rules/hex-shared.js";
import { emptyRealm, TERRAIN } from "../../module/rules/realm.js";
import { edgeKey, hexIndex, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

// Invented names, so no book text lives in the repository.
const SECRET_LANDMARK = "Gallows of the Grey Wife";

const g = realmGeometry({ cols: 12, rows: 12 });
const ruin = { col: 3, row: 3 };
const when = { age: 1, season: "spring", day: 2, phase: "morning" };
const beyond = { col: 3, row: 2 };
const barrierEdge = edgeKey(ruin, beyond);
let barrierRevealed = false;

let lore;
let journey;
let shared;

function realmWith() {
	const realm = emptyRealm(g);
	realm.terrain[hexIndex(g, ruin)] = TERRAIN.indexOf("forest") + 1;
	realm.landmarks = [{ id: "l0", hex: ruin, type: "ruin", name: SECRET_LANDMARK, seer: null, revealed: false }];
	realm.barriers = [{ id: "b0", edge: barrierEdge, revealed: barrierRevealed }];
	return realm;
}

vi.mock("../../module/chat/cards.js", () => ({
	t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key),
	warn: vi.fn()
}));
vi.mock("../../module/actions/calendar.js", () => ({ calendarLabel: () => "spring day 2" }));
vi.mock("../../module/book-art/art-index.js", () => ({
	loadArtIndex: async () => null,
	mythEntry: () => ({ name: "Myth", page: 1 }),
	seerEntry: () => ({ name: "Seer", page: 1 })
}));
vi.mock("../../module/actions/hex-lore.js", async (importOriginal) => ({ ...(await importOriginal()), getHexLore: () => lore }));
vi.mock("../../module/actions/hex-shared.js", () => ({
	getHexShared: () => shared,
	getHexSharedRecord: () => null,
	partyNoteBy: () => "",
	toldLabel: () => ""
}));
vi.mock("../../module/actions/journey.js", () => ({
	getHexVisits: () => journey.hexes["3,3"] ?? null,
	visitsLabel: () => "visited"
}));
vi.mock("../../module/actions/realm.js", () => ({
	getRealm: (scene) => (scene?.isRealm ? { realm: realmWith() } : null),
	hexHiddenByHand: () => ({}),
	isDrawingRealm: () => false,
	isRealmScene: (scene) => Boolean(scene?.isRealm),
	realmWritesSettled: async () => {},
	sceneGeometry: () => g
}));
vi.mock("../../module/actions/solo.js", () => ({ realmKnown: (realm) => realm }));
vi.mock("../../module/actions/travels.js", () => ({
	travelsSources: () => ({ realm: realmWith(), g, journey, shared, marks: [], handHidden: () => ({}) }),
	visitsText: (visits) => (visits ? "been" : "never"),
	barrierMetLines: (met) => met.map(({ direction, byName }) => `${direction} by ${byName}`),
	toldLines: (told) => told
}));

const { syncHexJournals, hexJournalEntry } = await import("../../module/actions/hex-journals.js");

/** A Journal entry whose writes land on it. */
function fakeEntry(data) {
	const getFlag = (source) => (scope, key) => source.flags?.[scope]?.[key];
	const entry = {
		...data,
		id: `e${game.journal.length}`,
		ownership: { ...data.ownership },
		pages: data.pages.map((page, index) => ({ ...page, id: `p${index}`, text: { ...page.text }, getFlag: getFlag(page) })),
		getFlag: getFlag(data),
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(entry, path, value);
		}),
		createEmbeddedDocuments: vi.fn(),
		updateEmbeddedDocuments: vi.fn(async (_type, updates) => {
			for (const { _id, text } of updates) Object.assign(entry.pages.find((page) => page.id === _id).text, text);
		})
	};
	return entry;
}

const scene = { id: "realm", name: "Gravenmoor", isRealm: true };

beforeEach(() => {
	barrierRevealed = false;
	lore = { version: 1, hexes: { "3,3": { note: "", sparks: [{ id: "s1", table: "Land", rolls: [4], entries: ["Mossy Hollow"], prompt: "Mossy Hollow", when }] } } };
	journey = emptyJourney();
	shared = emptyShared();
	const folders = [];
	globalThis.game = {
		user: { isGM: true },
		users: { activeGM: { isSelf: true } },
		settings: { get: () => true },
		journal: [],
		folders
	};
	folders.find = Array.prototype.find.bind(folders);
	globalThis.foundry = {
		utils: {
			setProperty: (object, path, value) => {
				const keys = path.split(".");
				const last = keys.pop();
				let target = object;
				for (const key of keys) target = target[key] ??= {};
				target[last] = value;
			},
			getDocumentClass: (name) => (name === "Folder"
				? { create: vi.fn(async (data) => {
					const folder = { ...data, id: "f1", getFlag: (scope, key) => data.flags?.[scope]?.[key] };
					folders.push(folder);
					return folder;
				}) }
				: {
					createDocuments: vi.fn(async (list) => list.map((data) => game.journal.push(fakeEntry(data)))),
					updateDocuments: vi.fn(async (list) => Promise.all(list.map(({ _id, ...changes }) => game.journal.find((entry) => entry.id === _id).update(changes))))
				})
		}
	};
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
	vi.clearAllMocks();
});

describe("syncHexJournals", () => {
	it("makes an entry for a hex with rolls, in the Realm's folder, keeping its secrets from players", async () => {
		await syncHexJournals(scene);
		const entry = hexJournalEntry(scene, ruin);
		expect(entry).toBeTruthy();
		expect(entry.folder).toBe("f1");
		expect(entry.flags[SYSTEM_ID].hexJournal).toEqual({ scene: "realm", hex: "3,3", open: false });
		expect(entry.ownership.default).toBe(0);
		const [rolled, known, notes] = entry.pages;
		expect(rolled.text.markdown).toContain("Mossy Hollow");
		expect(rolled.text.markdown).toContain(SECRET_LANDMARK);
		expect(known.text.markdown + entry.name).not.toContain(SECRET_LANDMARK);
		expect(notes.text.markdown).toBe("");
	});

	it("writes nothing the second time, and only the Rolled page once a roll is added", async () => {
		await syncHexJournals(scene);
		const entry = hexJournalEntry(scene, ruin);
		await syncHexJournals(scene);
		expect(entry.update).not.toHaveBeenCalled();
		expect(entry.updateEmbeddedDocuments).not.toHaveBeenCalled();

		lore.hexes["3,3"].note = "A well.";
		await syncHexJournals(scene);
		expect(entry.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
		expect(entry.updateEmbeddedDocuments.mock.calls[0][1].map((update) => update._id)).toEqual(["p0"]);
		expect(entry.pages[0].text.markdown).toContain("A well.");
	});

	it("lets players see the entry once the Company has been there", async () => {
		await syncHexJournals(scene);
		const entry = hexJournalEntry(scene, ruin);
		journey = recordVisits(emptyJourney(), [ruin], when);
		await syncHexJournals(scene);
		expect(entry.ownership.default).toBe(1);
		expect(entry.flags[SYSTEM_ID].hexJournal.open).toBe(true);
	});

	it("keeps an entry whose hex was forgotten, and says nothing is kept", async () => {
		await syncHexJournals(scene);
		lore = { version: 1, hexes: {} };
		await syncHexJournals(scene);
		const entry = hexJournalEntry(scene, ruin);
		expect(entry.pages[0].text.markdown).toContain("hexJournal.nothingKept");
	});

	it("lists a hidden Barrier on the Rolled page alone, marked hidden", async () => {
		await syncHexJournals(scene);
		const [rolled, known] = hexJournalEntry(scene, ruin).pages;
		expect(rolled.text.markdown).toContain("realm.readout.hidden");
		expect(rolled.text.markdown).toContain("realm.readout.barrier");
		expect(known.text.markdown).not.toContain("realm.readout.barrier");
	});

	it("makes an entry for a hex a Barrier was met from, and tells the players of it", async () => {
		lore = { version: 1, hexes: {} };
		barrierRevealed = true;
		shared = recordBarrierMet(emptyShared(), ruin, { edge: barrierEdge, byName: "Alys", when, at: 1 });
		await syncHexJournals(scene);
		const entry = hexJournalEntry(scene, ruin);
		const [rolled, known] = entry.pages;
		expect(entry.ownership.default).toBe(1);
		for (const page of [rolled, known]) {
			expect(page.text.markdown).toContain("### hexJournal.met");
			expect(page.text.markdown).toContain("north by Alys");
			expect(page.text.markdown).toContain("realm.readout.barrier");
		}
		expect(rolled.text.markdown).not.toContain("hexJournal.nothingKept");
	});

	it("leaves it to the active GM, and to worlds that want entries", async () => {
		game.users.activeGM = { isSelf: false };
		await syncHexJournals(scene);
		expect(game.journal).toHaveLength(0);
		game.users.activeGM = { isSelf: true };
		game.settings.get = () => false;
		await syncHexJournals(scene);
		expect(game.journal).toHaveLength(0);
	});
});
