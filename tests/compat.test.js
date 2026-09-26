import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyMessageMode,
	contextMenuEntry,
	currentMessageMode,
	deletionEntry,
	isV13,
	noFogSceneData,
	paperSceneData,
	queryAsker,
	replacementEntry,
	scenePaper,
	toolActivated,
	watchQuerySenders
} from "../module/compat.js";

class ForcedDeletion {}
const ForcedReplacement = { create: (value) => ({ replaced: value }) };

/** A game running on the given generation, or on one that doesn't say. */
function run(generation, settings = {}) {
	globalThis.game = {
		release: generation ? { generation } : undefined,
		settings: { get: (_scope, key) => settings[key] },
		user: { id: "me" },
		users: new Map([["gm", { id: "gm", isGM: true }], ["player", { id: "player", isGM: false }]])
	};
}

beforeEach(() => {
	globalThis.foundry = { data: { operators: { ForcedDeletion, ForcedReplacement } } };
	globalThis.ChatMessage = { implementation: { applyMode: vi.fn(), applyRollMode: vi.fn() } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
	delete globalThis.ChatMessage;
	delete globalThis.ui;
});

describe("which core", () => {
	it("is v13 only when the core says so", () => {
		run(13);
		expect(isV13()).toBe(true);
		run(14);
		expect(isV13()).toBe(false);
		run(0);
		expect(isV13()).toBe(false);
	});
});

describe("deleting and replacing keys", () => {
	it("uses v14's operators on v14", () => {
		run(14);
		const [path, value] = deletionEntry("flags.x.hexes.3.4");
		expect(path).toBe("flags.x.hexes.3.4");
		expect(value).toBeInstanceOf(ForcedDeletion);
		expect(replacementEntry("system.seasons", { a: 1 })).toEqual(["system.seasons", { replaced: { a: 1 } }]);
	});

	it("uses v13's -= and == keys on v13, even where the operator classes are defined", () => {
		run(13);
		expect(deletionEntry("flags.x.hexes.3.4")).toEqual(["flags.x.hexes.3.-=4", null]);
		expect(replacementEntry("system.seasons", { a: 1 })).toEqual(["system.==seasons", { a: 1 }]);
		expect(replacementEntry("system", { a: 1 })).toEqual(["==system", { a: 1 }]);
	});

	it("falls back to the keys where no operators exist", () => {
		run(0);
		globalThis.foundry = {};
		expect(deletionEntry("flags.x.layout")).toEqual(["flags.x.-=layout", null]);
	});
});

describe("message modes", () => {
	it("reads and applies v14's message mode on v14", () => {
		run(14, { messageMode: "gm" });
		expect(currentMessageMode()).toBe("gm");
		const data = {};
		applyMessageMode(data, "blind");
		expect(ChatMessage.implementation.applyMode).toHaveBeenCalledWith(data, "blind");
		expect(ChatMessage.implementation.applyRollMode).not.toHaveBeenCalled();
	});

	it("speaks v13's roll modes on v13", () => {
		run(13, { rollMode: "selfroll" });
		expect(currentMessageMode()).toBe("self");
		const data = {};
		applyMessageMode(data, "gm");
		expect(ChatMessage.implementation.applyRollMode).toHaveBeenCalledWith(data, "gmroll");
		applyMessageMode(data, "public");
		expect(ChatMessage.implementation.applyRollMode).toHaveBeenLastCalledWith(data, "publicroll");
		expect(ChatMessage.implementation.applyMode).not.toHaveBeenCalled();
	});

	it("takes an unknown v13 roll mode for public", () => {
		run(13, { rollMode: "roll" });
		expect(currentMessageMode()).toBe("public");
	});
});

describe("who sent a query", () => {
	it("believes v14's context", () => {
		run(14);
		const gm = { isGM: true };
		expect(queryAsker({ user: gm })).toBe(gm);
	});

	it("hears v13's sender off the socket, and nothing written in the data", () => {
		run(13);
		let heard;
		game.socket = { onAny: (listener) => { heard = listener; } };
		watchQuerySenders();
		heard("userQuery", "player", "query-id", "name", { userId: "gm" }, {});
		expect(queryAsker({ timeout: 1000 })).toBe(game.users.get("player"));
		heard("userActivity", "gm", {});
		expect(queryAsker({})).toBe(game.users.get("player"));
		heard("userQuery", "gm", "query-id", "name", {}, {});
		expect(queryAsker(undefined)).toBe(game.users.get("gm"));
		heard("userQuery", "nobody", "query-id", "name", {}, {});
		expect(queryAsker({})).toBeNull();
	});

	it("listens to nothing on v14", () => {
		run(14);
		game.socket = { onAny: vi.fn() };
		watchQuerySenders();
		expect(game.socket.onAny).not.toHaveBeenCalled();
	});
});

describe("context menu entries", () => {
	it("carry both cores' names for the same thing", () => {
		const picked = vi.fn();
		const entry = contextMenuEntry({ label: "key", icon: "fa-solid fa-bolt", visible: () => false, run: picked });
		expect(entry).toMatchObject({ label: "key", name: "key", icon: '<i class="fa-solid fa-bolt"></i>' });
		expect(entry.visible()).toBe(false);
		expect(entry.condition()).toBe(false);
		entry.onClick({}, {});
		entry.callback({});
		expect(picked).toHaveBeenCalledTimes(2);
	});
});

describe("scene control tools", () => {
	it("believes v14's third argument", () => {
		const tool = {};
		expect(toolActivated(tool, true)).toBe(true);
		expect(toolActivated(tool, false)).toBe(false);
	});

	it("asks the controls on v13, which have already picked the new tool", () => {
		const coming = { name: "terrain" };
		const going = { name: "inspect" };
		globalThis.ui = { controls: { tool: coming } };
		expect(toolActivated(coming, undefined)).toBe(true);
		expect(toolActivated(going, undefined)).toBe(false);
	});
});

describe("a Scene's paper", () => {
	it("goes on the Scene's Level on v14", () => {
		run(14);
		expect(paperSceneData("level0", "Realm", "#eee")).toEqual({
			levels: [{ _id: "level0", name: "Realm", background: { color: "#eee" } }],
			initialLevel: "level0"
		});
		expect(noFogSceneData()).toEqual({ fog: { mode: 0 } });
	});

	it("goes on the Scene itself on v13", () => {
		run(13);
		expect(paperSceneData("level0", "Realm", "#eee")).toEqual({ backgroundColor: "#eee" });
		expect(noFogSceneData()).toEqual({ fog: { exploration: false } });
	});

	it("is read and written where each core keeps it", () => {
		run(14);
		const level = { id: "level0", _source: { background: { color: "#111" } }, updateSource: vi.fn() };
		const scene = { levels: new Map([["level0", level]]), _source: {}, updateSource: vi.fn() };
		scene.levels.contents = [level];
		const onLevel = scenePaper(scene, "level0");
		expect(onLevel.colour).toBe("#111");
		expect(onLevel.update("#222")).toEqual({ levels: [{ _id: "level0", background: { color: "#222" } }] });
		onLevel.updateSource("#222");
		expect(level.updateSource).toHaveBeenCalledWith({ background: { color: "#222" } });

		run(13);
		const old = { _source: { backgroundColor: "#333" }, updateSource: vi.fn() };
		const onScene = scenePaper(old, "level0");
		expect(onScene.colour).toBe("#333");
		expect(onScene.update("#444")).toEqual({ backgroundColor: "#444" });
		onScene.updateSource("#444");
		expect(old.updateSource).toHaveBeenCalledWith({ backgroundColor: "#444" });
	});

	it("has nowhere to go on a v14 Scene without Levels", () => {
		run(14);
		expect(scenePaper({ _source: {} }, "level0")).toBeNull();
	});
});
