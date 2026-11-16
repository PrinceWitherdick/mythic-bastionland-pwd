import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { knightTypeFromName } from "../../module/rules/creation.js";
import { keyedSerialWrites } from "../../module/rules/queue.js";
import { withOwnKnights } from "../../module/rules/own-knights.js";

// Every Knight and Seer here is invented, so no book text lives in the repository.

const book = {
	knights: [{ roll: "1-01", name: "The Ferry Knight" }],
	seers: [{ roll: "1-01", name: "The Glass Seer" }]
};

/** The written Knights' entries, each as the art index would list them. */
let entries = [];
/** The characters of the world. */
let knights = [];

const confirmDialog = vi.fn(async () => true);
vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: (...args) => confirmDialog(...args) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: () => knights }));
vi.mock("../../module/actions/knight-index.js", () => ({
	knightIndex: async () => withOwnKnights(book, {
		knights: entries.map((entry) => ({ own: entry.id, roll: null, name: entry.name })),
		seers: entries.filter((entry) => entry.seerName).map((entry) => ({ own: entry.id, roll: null, name: entry.seerName }))
	})
}));
vi.mock("../../module/actions/own-knights.js", () => ({
	OWN_KNIGHT_FLAG: "ownKnight",
	isOwnKnightEntry: (entry) => Boolean(entry?.isOwn),
	isReadyForPlayers: (entry) => entry.ready,
	ownKnightType: (entry) => knightTypeFromName(entry.name),
	ownKnightWrites: keyedSerialWrites(),
	readOwnKnight: (entry) => ({ seer: { name: entry.seerName } })
}));

const { registerOwnKnightRenameHooks } = await import("../../module/actions/own-knight-renames.js");

/** The hooks registered, by name. */
const hooks = {};

/**
 * A written Knight's entry, whose updates call the hooks as Foundry would on the client making them.
 * @returns {object}
 */
function writtenKnight({ id, name, seerName = "", ready = false }) {
	const entry = {
		id, name, seerName, ready, isOwn: true,
		followed: null,
		update: vi.fn(async (changes, options = {}) => {
			hooks.preUpdateJournalEntry(entry, changes, options);
			if ("name" in changes) entry.name = changes.name;
			const seer = Object.keys(changes).find((key) => key.endsWith(".seer.name"));
			if (seer) entry.seerName = changes[seer];
			entry.followed = hooks.updateJournalEntry(entry, changes, options, game.user.id);
			await entry.followed;
		})
	};
	entries.push(entry);
	return entry;
}

const character = (id, knightType, seer = "") => ({
	id, name: `Sir ${id}`,
	system: { knightType, seer, bookTable: { knight: knightType }, bookVerse: { knight: "" } },
	update: vi.fn(async () => {})
});

beforeEach(() => {
	globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn) };
	globalThis.ui = { notifications: { warn: vi.fn() } };
	globalThis.game = { user: { id: "gm", isGM: true }, actors: { get: (id) => knights.find((knight) => knight.id === id) } };
	registerOwnKnightRenameHooks();
});

afterEach(() => {
	entries = [];
	knights = [];
	confirmDialog.mockClear();
	delete globalThis.Hooks;
	delete globalThis.ui;
	delete globalThis.game;
});

describe("renaming a written Knight, from wherever it's done", () => {
	it("offers to rename the characters going by the old name", async () => {
		const lantern = writtenKnight({ id: "e1", name: "The Lantern Knight", ready: true });
		knights = [character("a", "Lantern"), character("b", "Moth")];
		await lantern.update({ name: "The Barge Knight" });
		await lantern.followed;
		expect(confirmDialog).toHaveBeenCalledOnce();
		expect(knights[0].update).toHaveBeenCalledWith({ "system.knightType": "Barge", "system.bookTable.knight": "Barge" });
		expect(knights[1].update).not.toHaveBeenCalled();
	});

	it("puts back a book Knight's name on one players can choose, and renames no one into the book's", async () => {
		const lantern = writtenKnight({ id: "e1", name: "The Lantern Knight", ready: true });
		knights = [character("a", "Lantern")];
		await lantern.update({ name: "The Ferry Knight" });
		expect(lantern.name).toBe("The Lantern Knight");
		expect(ui.notifications.warn).toHaveBeenCalledWith('ownKnight.nameKept {"name":"The Ferry Knight","kept":"The Lantern Knight"}');
		expect(knights[0].update).not.toHaveBeenCalled();
		expect(confirmDialog).not.toHaveBeenCalled();
	});

	it("puts back another written Knight's name on one a character is", async () => {
		writtenKnight({ id: "e2", name: "The Moth Knight" });
		const lantern = writtenKnight({ id: "e1", name: "The Lantern Knight" });
		knights = [character("a", "Lantern")];
		await lantern.update({ name: "The Moth Knight" });
		expect(lantern.name).toBe("The Lantern Knight");
		expect(knights[0].update).not.toHaveBeenCalled();
	});

	it("lets a draft no one is, and players can't choose, share a name until it's renamed", async () => {
		const draft = writtenKnight({ id: "e1", name: "The Lantern Knight" });
		await draft.update({ name: "The Ferry Knight" });
		expect(draft.name).toBe("The Ferry Knight");
		expect(ui.notifications.warn).not.toHaveBeenCalled();
	});

	it("leaves the characters going by a book Knight's name alone when a copy of them is renamed", async () => {
		const copy = writtenKnight({ id: "e1", name: "The Ferry Knight" });
		knights = [character("a", "Ferry")];
		await copy.update({ name: "The Barge Knight" });
		expect(confirmDialog).not.toHaveBeenCalled();
		expect(knights[0].update).not.toHaveBeenCalled();
	});

	it("puts back a book Seer's name on the Seer of one players can choose", async () => {
		const lantern = writtenKnight({ id: "e1", name: "The Lantern Knight", seerName: "The Reed Seer", ready: true });
		await lantern.update({ "flags.mythic-bastionland-pwd.ownKnight.seer.name": "The Glass Seer" });
		expect(lantern.seerName).toBe("The Reed Seer");
		expect(ui.notifications.warn).toHaveBeenCalledWith('ownKnight.seerNameKept {"name":"The Glass Seer","kept":"The Reed Seer"}');
	});

	it("follows only this Referee's own changes", async () => {
		const lantern = writtenKnight({ id: "e1", name: "The Lantern Knight" });
		knights = [character("a", "Lantern")];
		const options = {};
		hooks.preUpdateJournalEntry(lantern, { name: "The Barge Knight" }, options);
		lantern.name = "The Barge Knight";
		await hooks.updateJournalEntry(lantern, { name: "The Barge Knight" }, options, "someone-else");
		expect(confirmDialog).not.toHaveBeenCalled();
	});
});
