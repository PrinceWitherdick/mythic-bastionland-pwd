import { afterEach, describe, expect, it } from "vitest";
import { UNDOES_MOVE, nameUndoneMoves, undoneMove } from "../../module/canvas/undone-moves.js";

/** Foundry's Token layer, as far as its Undo history goes. */
class TokenLayer {
	history = [];
	storeHistory(type, data, options) {
		if (options._stopMovement) return;
		this.history.push({ type, data, options: type === "update" && options._movement ? { isUndo: true } : {} });
	}
}

afterEach(() => {
	delete globalThis.CONFIG;
});

describe("the move an Undo takes back", () => {
	it("is named in the Undo history of each Token's move, by Token id", () => {
		globalThis.CONFIG = { Canvas: { layers: { tokens: { layerClass: TokenLayer } } } };
		nameUndoneMoves();
		const layer = new CONFIG.Canvas.layers.tokens.layerClass();
		layer.storeHistory("update", [{ _id: "t1" }, { _id: "t2" }], { _movement: { t1: { id: "moveA" } } });
		expect(layer.history.at(-1).options[UNDOES_MOVE]).toEqual({ t1: "moveA" });
		expect(undoneMove({ id: "t1" }, layer.history.at(-1).options)).toBe("moveA");
		expect(undoneMove({ id: "t2" }, layer.history.at(-1).options)).toBeNull();
	});

	it("isn't named for an update that moved nothing, or one the history didn't keep", () => {
		globalThis.CONFIG = { Canvas: { layers: { tokens: { layerClass: TokenLayer } } } };
		nameUndoneMoves();
		const layer = new CONFIG.Canvas.layers.tokens.layerClass();
		layer.storeHistory("update", [{ _id: "t1" }], {});
		expect(layer.history.at(-1).options).toEqual({});
		layer.storeHistory("update", [{ _id: "t1" }], { _stopMovement: "moveB", _movement: { t1: { id: "moveB" } } });
		expect(layer.history).toHaveLength(1);
		expect(layer.history[0].options).toEqual({});
	});

	it("is unknown without an Undo naming it", () => {
		expect(undoneMove({ id: "t1" }, undefined)).toBeNull();
		expect(undoneMove({ id: "t1" }, { [UNDOES_MOVE]: { t1: "" } })).toBeNull();
	});
});
