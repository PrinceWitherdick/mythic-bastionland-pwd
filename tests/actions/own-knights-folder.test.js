import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/apps/ui.js", () => ({ addDirectoryButton: vi.fn() }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => ({ "ownKnight.folder": "Homebrew Knights", "ownMyth.folder": "Homebrew Myths" })[key] ?? key }));

const { renameOldOwnKnightsFolder } = await import("../../module/actions/own-knights.js");
const { renameOldOwnMythsFolder } = await import("../../module/actions/own-myths.js");

/**
 * A Journal folder, flagged as the written Knights' (or another flag's), or not.
 * @returns {object}
 */
const folder = (name, flagged = true, flag = "ownKnightsFolder") => ({
	name,
	type: "JournalEntry",
	getFlag: (scope, key) => (scope === SYSTEM_ID && key === flag && flagged ? true : undefined),
	update: vi.fn(async function update(data) {
		Object.assign(this, data);
		return this;
	})
});

let folders;

beforeEach(() => {
	folders = [];
	globalThis.game = { users: { activeGM: { isSelf: true } }, folders };
});

afterEach(() => {
	delete globalThis.game;
});

describe("renameOldOwnKnightsFolder", () => {
	it("renames the written Knights' folder still called Your Knights", async () => {
		const mine = folder("Your Knights");
		folders.push(folder("Your Knights", false), mine);
		await renameOldOwnKnightsFolder();
		expect(mine.update).toHaveBeenCalledWith({ name: "Homebrew Knights" });
		expect(folders[0].update).not.toHaveBeenCalled();
	});

	it("leaves a folder the Referee named for themselves, and leaves it to the active GM", async () => {
		const named = folder("Knights of the Fen");
		folders.push(named);
		await renameOldOwnKnightsFolder();
		expect(named.update).not.toHaveBeenCalled();

		const old = folder("Your Knights");
		folders.splice(0, 1, old);
		game.users.activeGM.isSelf = false;
		await renameOldOwnKnightsFolder();
		expect(old.update).not.toHaveBeenCalled();
	});

	it("does nothing in a world without the folder", async () => {
		await expect(renameOldOwnKnightsFolder()).resolves.toBeNull();
	});
});

describe("renameOldOwnMythsFolder", () => {
	it("renames the written Myths' folder still called Your Myths, and only that one", async () => {
		const myths = folder("Your Myths", true, "ownMythsFolder");
		const knights = folder("Your Knights");
		folders.push(knights, myths);
		await renameOldOwnMythsFolder();
		expect(myths.update).toHaveBeenCalledWith({ name: "Homebrew Myths" });
		expect(knights.update).not.toHaveBeenCalled();
	});
});
