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
	tileCentred,
	tileCentredUnsettled,
	tileCornerAnchored,
	tileNameData,
	tilePlaced,
	tilePlacedUnsettled,
	tileSettling,
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

describe("where a Tile stands", () => {
	it("is its centre on v14, as the system works in", () => {
		run(14);
		const tile = { x: 100, y: 200, width: 185, height: 160 };
		expect(tileCentred(tile)).toBe(tile);
		expect(tilePlaced(tile)).toBe(tile);
		// A TileDocument gives its source data, as it does on v13, so no caller leans on the document's getters.
		expect(tileCentred({ id: "a", _source: tile })).toBe(tile);
	});

	it("is its top-left corner on v13, turned to and from the centre", () => {
		run(13);
		expect(tilePlaced({ x: 100, y: 200, width: 185, height: 160, alpha: 1 })).toEqual({ x: 8, y: 120, width: 185, height: 160, alpha: 1 });
		expect(tileCentred({ x: 8, y: 120, width: 185, height: 160 })).toEqual({ x: 100, y: 200, width: 185, height: 160 });
		// A TileDocument is read from its source.
		expect(tileCentred({ _source: { x: 8, y: 120, width: 185, height: 160 } })).toMatchObject({ x: 100, y: 200 });
	});

	it("has a name only on v14", () => {
		run(14);
		expect(tileNameData("Hill Fort")).toEqual({ name: "Hill Fort" });
		run(13);
		expect(tileNameData("Hill Fort")).toEqual({});
	});

	it("moves a v13 Tile's corner when an update changes only its size or only its place", () => {
		run(13);
		const current = { x: 100, y: 200, width: 185, height: 160 };
		expect(tilePlaced({ width: 85 }, current)).toEqual({ width: 85, x: 58, y: 120 });
		expect(tilePlaced({ x: 300 }, current)).toEqual({ x: 208, y: 120 });
		expect(tilePlaced({ hidden: true }, current)).toEqual({ hidden: true });
	});
});

/** What v14's upgrade does to a v13 Tile (migratePosition in v14's server Tile). */
function upgraded(tile) {
	const data = structuredClone(tile);
	data.texture ??= {};
	data.texture.anchorX ??= 0.5;
	data.texture.anchorY ??= 0.5;
	if (data.rotation === 0) {
		data.texture.anchorX -= 0.5;
		data.texture.anchorY -= 0.5;
	} else {
		data.x = Math.round((data.x ?? 0) + data.width / 2);
		data.y = Math.round((data.y ?? 0) + data.height / 2);
	}
	return data;
}

describe("a Tile v14's upgrade has moved", () => {
	const anchored = { anchorX: 0.5, anchorY: 0.5 };

	it("is read by the point it's anchored on, its anchor left for a sync to see", () => {
		run(14);
		// Laid on v13 by its corner, and anchored there by the upgrade.
		const tile = { x: 8, y: 120, width: 185, height: 160, rotation: 0, texture: { src: "a.svg", anchorX: 0, anchorY: 0 } };
		expect(tileCentred(tile)).toEqual({ ...tile, x: 100, y: 200 });
		expect(tileCentred({ _source: tile })).toMatchObject({ x: 100, y: 200, texture: { anchorX: 0, anchorY: 0 } });
		// One the system laid on v14 is anchored on its middle, and read as it is.
		const laid = { x: 100, y: 200, width: 185, height: 160, rotation: 0, texture: { src: "a.svg", ...anchored } };
		expect(tileCentred(laid)).toBe(laid);
	});

	it("finds the centre of a Tile turned about its corner", () => {
		run(14);
		const centre = tileCentred({ x: 0, y: 0, width: 100, height: 50, rotation: 90, texture: { anchorX: 0, anchorY: 0 } });
		expect(centre.x).toBeCloseTo(-25);
		expect(centre.y).toBeCloseTo(50);
	});

	it("is written back at its centre, anchored on its middle", () => {
		run(14);
		const current = tileCentred({ x: 8, y: 120, width: 185, height: 160, rotation: 0, texture: { anchorX: 0, anchorY: 0 } });
		// Anchored anew, its x and y are written with it, though its centre hasn't moved.
		expect(tilePlaced({ texture: anchored }, current)).toEqual({ texture: anchored, x: 100, y: 200 });
		// While it's still anchored on its corner, a new size moves that corner.
		expect(tilePlaced({ width: 85 }, current)).toEqual({ width: 85, x: 58, y: 120 });
		expect(tilePlaced({ x: 300 }, current)).toEqual({ x: 208, y: 120 });
		const hidden = { hidden: true };
		expect(tilePlaced(hidden, current)).toBe(hidden);
		// A new Tile anchored on its middle is placed by its centre.
		expect(tilePlaced({ x: 100, y: 200, width: 185, height: 160, texture: anchored })).toEqual({ x: 100, y: 200, width: 185, height: 160, texture: anchored });
	});

	it("is told by its corner anchor, which only an unturned Tile is given", () => {
		run(14);
		expect(tileCornerAnchored({ rotation: 0, texture: { anchorX: 0, anchorY: 0 } })).toBe(true);
		expect(tileCornerAnchored({ _source: { rotation: 0, texture: { anchorX: 0, anchorY: 0 } } })).toBe(true);
		expect(tileCornerAnchored({ rotation: 30, texture: { anchorX: 0, anchorY: 0 } })).toBe(false);
		expect(tileCornerAnchored({ rotation: 0, texture: anchored })).toBe(false);
		expect(tileCornerAnchored({ rotation: 0 })).toBe(false);
		run(13);
		expect(tileCornerAnchored({ rotation: 0, texture: { anchorX: 0, anchorY: 0 } })).toBe(false);
	});

	it("comes out at the centre it was laid at, turned or not, by its corner on v13", () => {
		for (const rotation of [0, 30]) {
			for (const [width, height, near] of [[186, 160, 0], [185, 161, rotation ? 1 : 0]]) {
				run(13);
				const laid = { x: 100, y: 200, width, height, rotation, texture: { src: "a.svg", ...anchored } };
				const placed = { ...laid, ...tilePlaced(laid) };
				run(14);
				const centre = tileCentred(upgraded(placed));
				// The upgrade rounds half an odd size up, so a turned Tile can come out a pixel off, which a sync puts right.
				expect(Math.abs(centre.x - 100)).toBeLessThanOrEqual(near);
				expect(Math.abs(centre.y - 200)).toBeLessThanOrEqual(near);
			}
		}
	});

	it("comes out at the centre it was laid at, turned or not, by its centre on v13 before Tiles were settled", () => {
		for (const rotation of [0, 30]) {
			run(14);
			const tile = upgraded({ x: 100, y: 200, width: 185, height: 161, rotation, texture: { src: "a.svg", ...anchored } });
			expect(tileCentredUnsettled(tile)).toMatchObject({ x: 100, y: 200 });
			// Written back as it was laid until it's settled: its anchor kept, and a turned Tile moved on as the upgrade moved it.
			expect(tilePlacedUnsettled({ x: 100, y: 200, texture: { src: "b.svg", ...anchored } }, tileCentredUnsettled(tile)))
				.toEqual({ x: tile.x, y: tile.y, texture: { src: "b.svg" } });
			// Settled once: moved to its centre, anchored on its middle.
			expect(tileSettling(tile)).toEqual({ x: 100, y: 200, texture: anchored });
		}
		expect(tilePlacedUnsettled({ texture: anchored }, { rotation: 0 })).toEqual({});
	});

	it("leaves a v13 Tile laid by its centre as it is till it's settled by its corner", () => {
		run(13);
		const tile = { x: 100, y: 200, width: 185, height: 160, rotation: 30 };
		expect(tileCentredUnsettled(tile)).toBe(tile);
		const data = { x: 120, width: 85 };
		expect(tilePlacedUnsettled(data, tile)).toBe(data);
		expect(tileSettling({ _source: tile })).toEqual({ x: 8, y: 120 });
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
