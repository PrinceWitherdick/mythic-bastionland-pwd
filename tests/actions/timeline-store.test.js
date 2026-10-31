import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { REALM_DRAWING_FLAG } from "../../module/rules/realm-drawing.js";

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key, warn: vi.fn() }));
vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: (scene) => Boolean(scene?.realm), isDrawingRealm: (scene) => Boolean(scene?.realm && scene.drawing) }));
// Which Realms the players may know of is journey.js's to test: here, as it has it, from what each Scene says.
vi.mock("../../module/actions/journey.js", () => ({
	JOURNEY_FLAG: "journey",
	glimpsedBy: (user) => (scene) => Boolean(scene.testUserPermission?.(user, "LIMITED")),
	realmKnownToPlayers: (scene, glimpsed) => Boolean(scene?.realm) && !scene.drawing && (Boolean(scene.active) || glimpsed(scene) || Boolean(scene.travelled))
}));
vi.mock("../../module/ask-gm.js", () => ({ askActiveGM: vi.fn(async () => true) }));

const store = await import("../../module/actions/timeline-store.js");
const { askActiveGM } = await import("../../module/ask-gm.js");
const { warn } = await import("../../module/chat/cards.js");

/** A page that keeps what it's written, the way the server merges an update. */
function fakePage(journal, data) {
	const page = {
		id: data._id ?? `p${journal.pages.length}`,
		type: data.type,
		name: data.name,
		sort: data.sort ?? 0,
		ownership: { ...data.ownership },
		parent: journal,
		get isOwner() {
			return journal.isOwner && page.ownership.default !== 0;
		},
		testUserPermission: (user) => user.isGM || page.ownership.default !== 0,
		system: foundryClone(data.system),
		flags: data.flags,
		getFlag: (scope, key) => page.flags?.[scope]?.[key],
		updates: [],
		async update(update) {
			page.updates.push(update);
			for (const [path, value] of Object.entries(update)) {
				const parts = path.split(".");
				const last = parts.pop();
				let at = page;
				for (const part of parts) at = at[part] ??= {};
				if (last.startsWith("-=")) delete at[last.slice(2)];
				else at[last] = foundryClone(value);
			}
		}
	};
	return page;
}

const foundryClone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

function fakeJournal({ owner = true } = {}) {
	const journal = {
		pages: [],
		isOwner: owner,
		flags: { [SYSTEM_ID]: { timelineJournal: true } },
		getFlag: (scope, key) => journal.flags[scope]?.[key],
		createEmbeddedDocuments: vi.fn(async (_type, rows) => rows.map((row) => {
			const page = fakePage(journal, row);
			journal.pages.push(page);
			return page;
		})),
		updateEmbeddedDocuments: vi.fn(async (_type, rows) => {
			for (const { _id, ...row } of rows) {
				const page = journal.pages.find((each) => each.id === _id);
				for (const [path, value] of Object.entries(row)) {
					const parts = path.split(".");
					const last = parts.pop();
					let at = page;
					for (const part of parts) at = at[part] ??= {};
					at[last] = value;
				}
			}
		}),
		deleteEmbeddedDocuments: vi.fn(async (_type, ids) => {
			journal.pages = journal.pages.filter((page) => !ids.includes(page.id));
		})
	};
	return journal;
}

let journal;
const SEEN = { default: 0, p1: 3 };
const actor = (id, type, extra = {}) => ({ id, type, name: `Name ${id}`, ownership: SEEN, ...extra });

beforeEach(() => {
	journal = fakeJournal();
	const actors = [actor("k1", "knight", { hasPlayerOwner: true }), actor("k2", "knight", { hasPlayerOwner: false, ownership: { default: 0 } }), actor("d1", "domain"), actor("d2", "domain", { ownership: { default: 0, gm: 3 } })];
	const users = { p1: { isGM: false }, gm: { isGM: true } };
	const scenes = [{ id: "s1", documentName: "Scene", name: "Realm", realm: true, ownership: { default: 0 } }, { id: "s2", documentName: "Scene", name: "Not one" }];
	globalThis.game = {
		user: { isGM: true, id: "u1" },
		users: { activeGM: { isSelf: true }, get: (id) => users[id] },
		journal: { find: (test) => [journal].find(test) },
		actors: { contents: actors, get: (id) => actors.find((a) => a.id === id) },
		scenes: { contents: scenes, get: (id) => scenes.find((scene) => scene.id === id) }
	};
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 } };
	globalThis.foundry = { utils: { getDocumentClass: () => ({ create: vi.fn() }), hasProperty: () => false, randomID: () => "rnd" } };
	vi.mocked(askActiveGM).mockClear();
	vi.mocked(warn).mockClear();
});

describe("threads", () => {
	it("names the thread of the Company, a Knight, a Domain and a Realm", () => {
		expect(store.trackFor("company")).toMatchObject({ trackId: "company", kind: "company" });
		expect(store.trackFor(actor("k1", "knight"))).toMatchObject({ trackId: "k1", kind: "knight" });
		expect(store.trackFor({ id: "s1", documentName: "Scene", realm: true })).toMatchObject({ trackId: "realm:s1", kind: "realm" });
		expect(store.trackFor({ id: "s2", documentName: "Scene" })).toBeNull();
		expect(store.trackFor(actor("n1", "npc"))).toBeNull();
	});

	it("gives a page to the Company, played Knights, Domains and Realms, but not NPC Knights", async () => {
		expect(await store.syncTrackPages()).toBe(5);
		expect(journal.pages.map((page) => store.pageTrackId(page))).toEqual(["company", "k1", "d1", "d2", "realm:s1"]);
		expect(await store.syncTrackPages()).toBe(0);
	});

	it("keeps the thread of a Knight or Domain no player can see from the players", async () => {
		expect(store.trackFor(game.actors.get("k1")).secret).toBe(false);
		expect(store.trackFor(game.actors.get("k2")).secret).toBe(true);
		expect(store.trackFor(actor("k9", "knight", { ownership: { default: 2 } })).secret).toBe(false);
		await store.syncTrackPages();
		await store.ensureTrackPage(store.trackFor(game.actors.get("k2")));
		const defaults = Object.fromEntries(journal.pages.map((page) => [store.pageTrackId(page), page.ownership.default]));
		// A Realm nobody has been shown, travelled or been let glimpse is kept from the players too.
		expect(defaults).toEqual({ company: -1, k1: -1, d1: -1, d2: 0, "realm:s1": 0, k2: 0 });

		game.user.isGM = false;
		expect(store.allTracks().map((t) => t.trackId)).toEqual(["company", "k1", "d1"]);
		// Not written here: the Referee is asked, and refuses a thread the player doesn't own.
		vi.mocked(askActiveGM).mockResolvedValueOnce(false);
		expect(await store.mutateTrack({ trackId: "d2" }, { rows: [{ entry: { title: "x" } }] })).toBeNull();
		expect(askActiveGM).toHaveBeenCalledWith(`${SYSTEM_ID}.timelineWrite`, expect.objectContaining({ trackId: "d2" }), expect.any(String));
	});

	it("never throws before Foundry is ready, keeping a Knight's or Domain's thread from the players", () => {
		delete globalThis.CONST;
		expect(store.trackFor(game.actors.get("k1"))).toMatchObject({ trackId: "k1", secret: true });
		delete globalThis.game;
		expect(store.trackFor("company")).toMatchObject({ trackId: "company", name: "company" });
		expect(store.trackFor(actor("d1", "domain")).secret).toBe(true);
	});

	it("finds the Timeline again once it's gone or unflagged, without searching while it stands", () => {
		const other = fakeJournal();
		journal.id = "j1";
		other.id = "j2";
		const all = [journal, other];
		const find = vi.fn((test) => all.find(test));
		game.journal = { find, get: (id) => all.find((entry) => entry.id === id) };
		expect(store.findTimelineJournal()).toBe(journal);
		expect(store.findTimelineJournal()).toBe(journal);
		expect(find).toHaveBeenCalledTimes(1);
		journal.flags = {};
		expect(store.findTimelineJournal()).toBe(other);
		all.splice(1, 1);
		expect(store.findTimelineJournal()).toBeNull();
	});

	it("shows a thread to the players, or hides it, as its actor comes to be seen or not", async () => {
		await store.syncTrackPages();
		const d2 = journal.pages.find((page) => store.pageTrackId(page) === "d2");
		game.actors.get("d2").ownership = SEEN;
		await store.syncTrackPages();
		expect(d2.ownership.default).toBe(0);
		await store.syncTrackPages({ seen: ["d2"] });
		expect(d2.ownership.default).toBe(-1);
	});

	it("keeps a page's name in step with its thread's", async () => {
		await store.syncTrackPages();
		game.actors.get("k1").name = "Sir Renamed";
		await store.syncTrackPages();
		expect(journal.pages[1].name).toBe("Sir Renamed");
	});

	it("leaves syncing, and making the Timeline, to the active Referee", async () => {
		game.users.activeGM.isSelf = false;
		expect(await store.syncTrackPages()).toBe(0);
		expect(journal.pages).toHaveLength(0);
		const create = vi.fn();
		foundry.utils.getDocumentClass = () => ({ create });
		game.journal.find = () => undefined;
		expect(await store.ensureTimelineJournal()).toBeNull();
		expect(create).not.toHaveBeenCalled();
	});

	it("leaves making a thread's page to the active Referee, so the thread never gets two", async () => {
		game.user.isGM = false;
		expect(await store.ensureTrackPage({ trackId: "k2", kind: "knight", name: "NPC" })).toBeNull();
		game.user.isGM = true;
		game.users.activeGM.isSelf = false;
		expect(await store.ensureTrackPage({ trackId: "k2", kind: "knight", name: "NPC" })).toBeNull();
		expect(journal.createEmbeddedDocuments).not.toHaveBeenCalled();
		game.users.activeGM.isSelf = true;
		expect(await store.ensureTrackPage({ trackId: "k2", kind: "knight", name: "NPC" })).not.toBeNull();
	});
});

describe("a Realm's thread", () => {
	const realm = (extra = {}) => ({ id: "s9", documentName: "Scene", name: "Far Realm", realm: true, ownership: { default: 0 }, ...extra });

	it("is kept from the players until the Realm is shown, glimpsed or travelled, and while it's drawn", () => {
		expect(store.trackFor(realm()).secret).toBe(true);
		expect(store.trackFor(realm({ active: true })).secret).toBe(false);
		expect(store.trackFor(realm({ travelled: true })).secret).toBe(false);
		expect(store.trackFor(realm({ ownership: { default: 1 } })).secret).toBe(false);
		expect(store.trackFor(realm({ ownership: { default: 0, p1: 1 } })).secret).toBe(false);
		// The Referee's own sight of it tells nothing.
		expect(store.trackFor(realm({ ownership: { default: 0, gm: 3 } })).secret).toBe(true);
		expect(store.trackFor(realm({ active: true, drawing: true })).secret).toBe(true);
	});

	it("is shown to the players once they know of the Realm, and kept again if they no longer may", async () => {
		await store.syncTrackPages();
		const page = store.findTrackPage("realm:s1");
		expect(page.ownership.default).toBe(0);
		game.scenes.get("s1").active = true;
		await store.syncTrackPages();
		expect(page.ownership.default).toBe(-1);
		game.scenes.get("s1").active = false;
		game.scenes.get("s1").drawing = true;
		await store.syncTrackPages();
		expect(page.ownership.default).toBe(0);
	});

	it("stays as the Referee shared it by hand", async () => {
		await store.syncTrackPages();
		const page = store.findTrackPage("realm:s1");
		page.ownership.default = 2;
		await store.syncTrackPages();
		expect(page.ownership.default).toBe(2);
	});

	it("stays hidden once the Referee hides it by hand, though the players know of the Realm", async () => {
		const scene = game.scenes.get("s1");
		scene.active = true;
		await store.syncTrackPages();
		const page = store.findTrackPage("realm:s1");
		expect(page.ownership.default).toBe(-1);
		page.ownership.default = 0;
		await store.syncTrackPages();
		expect(page.ownership.default).toBe(0);
	});

	it("stays shown once another Scene is shown in its place, till its drawing is taken up again", async () => {
		const scene = game.scenes.get("s1");
		scene.active = true;
		await store.syncTrackPages();
		const page = store.findTrackPage("realm:s1");
		scene.active = false;
		await store.syncTrackPages();
		expect(page.ownership.default).toBe(-1);
		scene.drawing = true;
		await store.syncTrackPages();
		expect(page.ownership.default).toBe(0);
	});

	it("is looked at afresh when its Realm is shown, or first travelled while kept", async () => {
		const hooks = {};
		globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
		globalThis.CONFIG = { queries: {} };
		foundry.utils.debounce = (fn) => fn;
		foundry.utils.hasProperty = (object, path) => path.split(".").reduce((at, key) => (at && key in at ? at[key] : undefined), object) !== undefined;
		store.registerTimelineStoreHooks();
		await store.syncTrackPages();
		const page = store.findTrackPage("realm:s1");
		const scene = game.scenes.get("s1");

		scene.travelled = true;
		hooks.updateScene(scene, { flags: { [SYSTEM_ID]: { journey: {} } } });
		await vi.waitFor(() => expect(page.ownership.default).toBe(-1));
		scene.travelled = false;
		// A travelled Realm's every step leaves its thread alone.
		hooks.updateScene(scene, { flags: { [SYSTEM_ID]: { journey: {} } } });
		await new Promise((resolve) => setTimeout(resolve));
		expect(page.ownership.default).toBe(-1);
		scene.drawing = true;
		hooks.updateScene(scene, { flags: { [SYSTEM_ID]: { [REALM_DRAWING_FLAG]: true } } });
		await vi.waitFor(() => expect(page.ownership.default).toBe(0));
		delete globalThis.Hooks;
		delete globalThis.CONFIG;
	});
});

describe("a thread with two pages", () => {
	it("has the second folded into the first by the Referee's sync, and the second deleted", async () => {
		await store.syncTrackPages();
		const first = store.findTrackPage("k1");
		await first.update({ "system.entries.a": { id: "a", key: "squire:s1", title: "Took a Squire", season: "1-spring" }, "system.entries.b": { id: "b", title: "By hand", season: "1-spring" } });
		const [twin] = await journal.createEmbeddedDocuments("JournalEntryPage", [{
			name: "Name k1",
			type: first.type,
			sort: 999,
			ownership: { default: -1 },
			system: { trackKind: "knight", trackId: "k1", entries: {
				c: { id: "c", key: "squire:s1", title: "Took a Squire", season: "1-spring" },
				d: { id: "d", title: "Written on the twin", season: "1-spring" }
			} }
		}]);
		await store.syncTrackPages();
		expect(journal.deleteEmbeddedDocuments).toHaveBeenCalledWith("JournalEntryPage", [twin.id]);
		expect(journal.pages.filter((page) => store.pageTrackId(page) === "k1")).toEqual([first]);
		expect(Object.values(first.system.entries).map((entry) => entry.title).sort()).toEqual(["By hand", "Took a Squire", "Written on the twin"]);
	});
});

describe("a player's write the Referee makes for them", () => {
	const QUERY = `${SYSTEM_ID}.timelineWrite`;
	const asPlayer = () => {
		game.user = { isGM: false, id: "p1" };
	};

	it("is asked of the active Referee for a thread with no page, which the player doesn't make", async () => {
		asPlayer();
		const result = await store.mutateTrack({ trackId: "k9", kind: "knight" }, { rows: [{ entry: { id: "x", title: "Hand", season: "1-spring" } }] }, { create: true });
		expect(result).toEqual({ page: null });
		expect(journal.createEmbeddedDocuments).not.toHaveBeenCalled();
		const [[name, data]] = vi.mocked(askActiveGM).mock.calls;
		expect(name).toBe(QUERY);
		expect(data).toMatchObject({ trackId: "k9", forget: [], rows: [{ entry: { id: "x", title: "Hand" } }] });
	});

	it("sends the milestone in words when it's given them, and a thread kept for the Referee's too", async () => {
		await store.syncTrackPages();
		asPlayer();
		const relay = { rows: [{ entry: { key: "rules:d2", title: "Rules" }, refresh: ["title"] }] };
		await store.mutateTrack({ trackId: "d2" }, relay);
		expect(askActiveGM).toHaveBeenCalledWith(QUERY, { trackId: "d2", rows: relay.rows, forget: [] }, expect.any(String));
		vi.mocked(askActiveGM).mockClear();
		await store.removeKeyEverywhere("rules:d2", [{ trackId: "d2" }]);
		expect(askActiveGM).toHaveBeenCalledWith(QUERY, { trackId: "d2", rows: [], forget: ["rules:d2"] }, expect.any(String));
	});

	it("asks the Referee to write a player's own new entry on a thread kept for the Referee", async () => {
		await store.syncTrackPages();
		asPlayer();
		const entry = { title: "Hand", season: "1-spring", source: "hand" };
		expect(await store.mutateTrack({ trackId: "d2" }, { rows: [{ entry }] }, { create: true })).toEqual({ page: null });
		expect(askActiveGM).toHaveBeenCalledWith(QUERY, { trackId: "d2", rows: [{ entry }], forget: [] }, expect.any(String));
	});

	it("says so, and asks nobody, when a player edits a row on a thread kept for the Referee", async () => {
		await store.syncTrackPages();
		asPlayer();
		vi.mocked(warn).mockClear();
		expect(await store.mutateTrack({ trackId: "d2" }, { edits: [{ op: "remove", id: "a" }] }, { create: true })).toBeNull();
		expect(warn).toHaveBeenCalledWith("timeline.refereeKeeps");
		expect(askActiveGM).not.toHaveBeenCalled();
	});

	it("is let go with no Referee here, or nothing to write, telling the player when a row is lost", async () => {
		asPlayer();
		await store.mutateTrack({ trackId: "k9" }, {}, { create: true });
		expect(warn).not.toHaveBeenCalled();
		game.users.activeGM = null;
		expect(await store.mutateTrack({ trackId: "k9" }, { rows: [{ entry: { title: "x" } }] }, { create: true })).toBeNull();
		expect(askActiveGM).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith("timeline.needsReferee", undefined);
	});

	it("tells the player when the Referee refuses to write it", async () => {
		asPlayer();
		vi.mocked(askActiveGM).mockResolvedValueOnce(false);
		expect(await store.mutateTrack({ trackId: "k9" }, { rows: [{ entry: { title: "x" } }] }, { create: true })).toBeNull();
		expect(warn).toHaveBeenCalledWith("timeline.writeRefused", undefined);
	});

	describe("answered by the Referee", () => {
		const alys = { id: "p1", name: "Alys", isGM: false };
		const owns = (ids) => (user, level) => level === "OWNER" && ids.includes(user.id);
		const row = (extra = {}) => ({ entry: { key: "squire:s1", title: "Took a Squire", season: "1-spring", authorId: "someoneElse", ...extra } });

		beforeEach(async () => {
			game.actors.get("k1").testUserPermission = owns(["p1"]);
			game.actors.get("d2").testUserPermission = owns([]);
			await store.syncTrackPages();
		});

		it("writes on a thread of an actor the asker owns, once by its key, signed by the asker", async () => {
			expect(await store.onTrackWriteQuery({ trackId: "k1", rows: [row()] }, { user: alys })).toBe(true);
			expect(await store.onTrackWriteQuery({ trackId: "k1", rows: [row({ title: "Again" })] }, { user: alys })).toBe(true);
			const entries = Object.values(store.findTrackPage("k1").system.entries);
			expect(entries).toHaveLength(1);
			expect(entries[0]).toMatchObject({ title: "Took a Squire", authorId: "p1" });
		});

		it("makes the thread's page for a new actor, in the Referee's browser alone", async () => {
			game.actors.contents.push({ id: "k5", type: "knight", name: "Sir New", ownership: SEEN, testUserPermission: owns(["p1"]) });
			expect(await store.onTrackWriteQuery({ trackId: "k5", rows: [row()] }, { user: alys })).toBe(true);
			expect(Object.keys(store.findTrackPage("k5").system.entries)).toHaveLength(1);
		});

		it("refreshes only the fields a row may have, and takes off the keys asked", async () => {
			await store.onTrackWriteQuery({ trackId: "k1", rows: [row()] }, { user: alys });
			await store.onTrackWriteQuery({ trackId: "k1", rows: [{ ...row({ title: "New", ownership: 3 }), refresh: ["title", "ownership"] }] }, { user: alys });
			expect(Object.values(store.findTrackPage("k1").system.entries)[0].title).toBe("New");
			expect(await store.onTrackWriteQuery({ trackId: "k1", forget: ["squire:s1"] }, { user: alys })).toBe(true);
			expect(Object.keys(store.findTrackPage("k1").system.entries)).toEqual([]);
		});

		it("writes on the Company's thread for anyone, and a Realm's only for one who knows of it", async () => {
			expect(await store.onTrackWriteQuery({ trackId: "company", rows: [row()] }, { user: alys })).toBe(true);
			game.scenes.get("s1").testUserPermission = () => false;
			expect(await store.onTrackWriteQuery({ trackId: "realm:s1", rows: [row()] }, { user: alys })).toBe(false);
			game.scenes.get("s1").testUserPermission = (user, level) => user.id === "p1" && level === "LIMITED";
			expect(await store.onTrackWriteQuery({ trackId: "realm:s1", rows: [row()] }, { user: alys })).toBe(true);
		});

		it("refuses a thread the asker doesn't own, an ask that isn't rows, or one heard on a player's browser", async () => {
			const before = JSON.stringify(journal.pages.map((page) => page.system));
			expect(await store.onTrackWriteQuery({ trackId: "d2", rows: [row()] }, { user: alys })).toBe(false);
			expect(await store.onTrackWriteQuery({ trackId: "nobody", rows: [row()] }, { user: alys })).toBe(false);
			expect(await store.onTrackWriteQuery({ trackId: "k1", rows: "x" }, { user: alys })).toBe(false);
			expect(await store.onTrackWriteQuery({ trackId: "k1", rows: [null] }, { user: alys })).toBe(false);
			expect(await store.onTrackWriteQuery({ trackId: "k1", rows: Array.from({ length: 51 }, () => row()) }, { user: alys })).toBe(false);
			expect(await store.onTrackWriteQuery({ trackId: "k1", forget: [7] }, { user: alys })).toBe(false);
			expect(await store.onTrackWriteQuery({ trackId: "k1" }, { user: alys })).toBe(false);
			expect(await store.onTrackWriteQuery({ trackId: "k1", rows: [row()] }, {})).toBe(false);
			game.user.isGM = false;
			expect(await store.onTrackWriteQuery({ trackId: "k1", rows: [row()] }, { user: alys })).toBe(false);
			expect(JSON.stringify(journal.pages.map((page) => page.system))).toBe(before);
		});
	});
});

describe("deleting the Timeline", () => {
	it("is refused a player, page by page too, and said why", () => {
		game.user.isGM = false;
		expect(store.refuseTimelineDelete(journal)).toBe(false);
		expect(store.refuseTimelinePageDelete({ parent: journal })).toBe(false);
		expect(warn).toHaveBeenCalledWith("timeline.deleteRefused");
		expect(warn).toHaveBeenCalledWith("timeline.pageDeleteRefused");
	});

	it("is left to the Referee, and any other journal to its owners", () => {
		const other = { getFlag: () => undefined };
		game.user.isGM = false;
		expect(store.refuseTimelineDelete(other)).toBeUndefined();
		expect(store.refuseTimelinePageDelete({ parent: other })).toBeUndefined();
		game.user.isGM = true;
		expect(store.refuseTimelineDelete(journal)).toBeUndefined();
		expect(store.refuseTimelinePageDelete({ parent: journal })).toBeUndefined();
		expect(warn).not.toHaveBeenCalled();
	});

	it("is guarded from init, beside the query that writes for players", () => {
		const on = vi.fn();
		globalThis.Hooks = { on };
		globalThis.CONFIG = { queries: {} };
		store.registerTimelineStoreHooks();
		expect(on).toHaveBeenCalledWith("preDeleteJournalEntry", store.refuseTimelineDelete);
		expect(on).toHaveBeenCalledWith("preDeleteJournalEntryPage", store.refuseTimelinePageDelete);
		expect(CONFIG.queries[`${SYSTEM_ID}.timelineWrite`]).toBe(store.onTrackWriteQuery);
		delete globalThis.Hooks;
		delete globalThis.CONFIG;
	});
});

describe("writing", () => {
	const track = { trackId: "k1", kind: "knight", name: "Sir" };

	it("writes only what moved: whole rows added, fields changed, rows deleted", async () => {
		await store.mutateTrack(track, { rows: [{ entry: { id: "a", title: "One", season: "1-spring" } }] }, { create: true });
		const page = store.findTrackPage("k1");
		expect(Object.keys(page.updates[0])).toEqual(["system.entries.a"]);

		await store.mutateTrack(track, { edits: [{ op: "patch", id: "a", changes: { title: "Two" } }] });
		expect(page.updates[1]).toEqual({ "system.entries.a.title": "Two" });

		await store.mutateTrack(track, { edits: [{ op: "remove", id: "a" }] });
		expect(Object.keys(page.updates[2])).toEqual(["system.entries.-=a"]);
		expect(page.system.entries).toEqual({});
	});

	it("writes nothing when nothing moved, or there's no page and none to be made", async () => {
		expect(await store.mutateTrack(track, {}, { create: true })).toBeNull();
		expect(await store.mutateTrack({ trackId: "zz" }, { rows: [{ entry: { title: "x" } }] })).toBeNull();
	});

	it("takes each write in turn, so a burst on one thread keeps every row", async () => {
		await Promise.all([1, 2, 3].map((n) => store.mutateTrack(track, { rows: [{ entry: { id: `e${n}`, season: "1-spring" } }] }, { create: true })));
		expect(Object.keys(store.findTrackPage("k1").system.entries).sort()).toEqual(["e1", "e2", "e3"]);
	});

	it("takes a milestone out of every thread", async () => {
		const mark = (id) => ({ rows: [{ entry: { id, key: "myth:x", season: "1-spring" } }] });
		await store.mutateTrack(track, mark("a"), { create: true });
		await store.mutateTrack({ trackId: "company", kind: "company" }, mark("b"), { create: true });
		await store.removeKeyEverywhere("myth:x");
		expect(store.allTracks().every((t) => !Object.keys(t.entries).length)).toBe(true);
	});

	it("takes a milestone out of only the threads it's told to look on", async () => {
		const mark = (id) => ({ rows: [{ entry: { id, key: "note:x", season: "1-spring" } }] });
		await store.mutateTrack(track, mark("a"), { create: true });
		await store.mutateTrack({ trackId: "company", kind: "company" }, mark("b"), { create: true });
		await store.removeKeyEverywhere("note:x", [{ trackId: "company", kind: "company" }]);
		expect(Object.keys(store.findTrackPage("company").system.entries)).toEqual([]);
		expect(Object.keys(store.findTrackPage("k1").system.entries)).toEqual(["a"]);
	});

	it("takes several milestones out of every thread in one write each", async () => {
		await store.mutateTrack(track, { rows: ["a", "b", "c"].map((id) => ({ entry: { id, key: `omen:${id}`, season: "1-spring" } })) }, { create: true });
		const { updates } = store.findTrackPage("k1");
		const before = updates.length;
		await store.removeKeyEverywhere(["omen:a", "omen:c"]);
		expect(updates.length - before).toBe(1);
		expect(Object.keys(store.findTrackPage("k1").system.entries)).toEqual(["b"]);
	});

	it("lists every Season on the Timeline", async () => {
		await store.mutateTrack(track, { rows: [{ entry: { id: "a", season: "2-winter" } }] }, { create: true });
		await store.mutateTrack({ trackId: "company", kind: "company" }, { rows: [{ entry: { id: "b", season: "" } }] }, { create: true });
		expect([...store.allSeasons()]).toEqual(["2-winter"]);
		// Read again for a page whose entries were written anew, as every write leaves them.
		const page = store.findTrackPage("k1");
		page.system.entries = { ...page.system.entries, c: { id: "c", season: "1-spring" } };
		expect([...store.allSeasons()]).toEqual(["2-winter", "1-spring"]);
		expect(store.allTracks().map((t) => t.trackId)).toEqual(["company", "k1"]);
	});
});
