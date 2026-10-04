import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/actions/realm.js", () => ({ isRealmScene: (scene) => Boolean(scene?.realm) }));

const { hexFlagEditor } = await import("../../module/actions/hex-flags.js");
const { SYSTEM_ID } = await import("../../module/system-id.js");

class ForcedDeletion {}
const ForcedReplacement = { create: (value) => ({ replaced: value }) };
const path = (...parts) => `flags.${SYSTEM_ID}.notes.${parts.join(".")}`;

let kept;
const scene = { realm: true, update: vi.fn(async () => {}) };
const edit = hexFlagEditor({ flag: "notes", version: 2, read: () => kept, besides: ({ next }) => ({ next }) });

beforeEach(() => {
	kept = { version: 2, next: 1, hexes: { "1,1": { note: "A ford", sparks: [] }, "2,2": { note: "A tower" } } };
	scene.update.mockClear();
	globalThis.game = { user: { isGM: true } };
	globalThis.foundry = { data: { operators: { ForcedDeletion, ForcedReplacement } } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
});

describe("hexFlagEditor", () => {
	it("writes each changed hex whole, takes a forgotten one out, and leaves the rest alone", async () => {
		const { "2,2": _gone, ...rest } = kept.hexes;
		await expect(edit(scene, (before) => ({ ...before, next: 2, hexes: { ...rest, "1,1": { sparks: [] } } }))).resolves.toBe(true);
		const [[update]] = scene.update.mock.calls;
		expect(Object.keys(update).sort()).toEqual([path("hexes", "1,1"), path("hexes", "2,2"), path("next"), path("version")]);
		// Whole, so the note rubbed out of it really goes.
		expect(update[path("hexes", "1,1")]).toEqual({ replaced: { sparks: [] } });
		expect(update[path("hexes", "2,2")]).toBeInstanceOf(ForcedDeletion);
		expect(update[path("next")]).toBe(2);
	});

	it("writes nothing when nothing changes, for players, or off a Realm", async () => {
		await expect(edit(scene, (before) => before)).resolves.toBe(false);
		await expect(edit(scene, (before) => ({ ...before, hexes: { ...before.hexes } }))).resolves.toBe(false);
		await expect(edit({ realm: false, update: scene.update }, () => ({ hexes: {} }))).resolves.toBe(false);
		game.user.isGM = false;
		await expect(edit(scene, () => ({ hexes: {} }))).resolves.toBe(false);
		expect(scene.update).not.toHaveBeenCalled();
	});
});
