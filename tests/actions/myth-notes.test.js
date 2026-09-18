import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MYTH_NOTES_FLAG, editMythNote, getMythNotes } from "../../module/actions/myth-notes.js";
import { mythNoteFor } from "../../module/rules/myth-notes.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { SYSTEM_ID } from "../../module/system-id.js";

class ForcedDeletion {}

const wyvern = { number: 3, d6: 1, d12: 5 };

/** A Realm Scene whose updates land on its own flags, as Foundry's would. */
function realmScene() {
	const scene = {
		flags: { [SYSTEM_ID]: { [REALM_FLAG]: { size: 160, cols: 12, rows: 12 } } },
		getFlag: (scope, key) => scene.flags[scope]?.[key],
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) {
				const parts = path.split(".").slice(2);
				let node = scene.flags[SYSTEM_ID];
				for (const part of parts.slice(0, -1)) node = node[part] ??= {};
				if (value instanceof ForcedDeletion) delete node[parts.at(-1)];
				else node[parts.at(-1)] = structuredClone(value);
			}
		})
	};
	return scene;
}

beforeEach(() => {
	globalThis.game = { user: { isGM: true } };
	globalThis.foundry = { data: { operators: { ForcedDeletion } } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
});

describe("editMythNote", () => {
	it("writes one Myth's own path, and reads back what was written", async () => {
		const scene = realmScene();
		await editMythNote(scene, wyvern, { note: "Nest in the crags." });
		await editMythNote(scene, wyvern, { resolved: true });
		const [[first]] = scene.update.mock.calls;
		expect(Object.keys(first).sort()).toEqual([`flags.${SYSTEM_ID}.${MYTH_NOTES_FLAG}.myths.3`, `flags.${SYSTEM_ID}.${MYTH_NOTES_FLAG}.version`]);
		expect(mythNoteFor(getMythNotes(scene), wyvern)).toEqual({ note: "Nest in the crags.", resolved: true });
	});

	it("takes the Myth's key out once nothing is kept about it", async () => {
		const scene = realmScene();
		await editMythNote(scene, wyvern, { note: "Nest" });
		await editMythNote(scene, wyvern, { note: "" });
		expect(scene.update.mock.calls.at(-1)[0][`flags.${SYSTEM_ID}.${MYTH_NOTES_FLAG}.myths.3`]).toBeInstanceOf(ForcedDeletion);
		expect(getMythNotes(scene).myths).toEqual({});
	});

	it("writes nothing for no change, for players, or off a Realm", async () => {
		const scene = realmScene();
		await expect(editMythNote(scene, wyvern, { note: "" })).resolves.toBe(false);
		await expect(editMythNote({ flags: {} }, wyvern, { note: "x" })).resolves.toBe(false);
		await expect(editMythNote(scene, null, { note: "x" })).resolves.toBe(false);
		game.user.isGM = false;
		await expect(editMythNote(scene, wyvern, { note: "x" })).resolves.toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
	});
});
