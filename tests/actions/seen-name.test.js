import { afterEach, describe, expect, it } from "vitest";
import { seenName } from "../../module/actions/seen-name.js";

/** Actors by UUID, as fromUuidSync finds them. */
let actors = {};

afterEach(() => {
	actors = {};
	delete globalThis.fromUuidSync;
	delete globalThis.canvas;
});

const look = (found, ready = false) => {
	actors = found;
	globalThis.fromUuidSync = (uuid) => actors[uuid] ?? null;
	globalThis.canvas = { ready };
};

describe("seenName", () => {
	it("names somebody by their Token, as the table saw them", () => {
		look({ "Scene.s.Token.t.Actor.a": { name: "Sir Malvane", token: { name: "Hooded Stranger" } } });
		expect(seenName("Scene.s.Token.t.Actor.a")).toBe("Hooded Stranger");
	});

	it("names a world Actor by their Token on the map, else by their own name", () => {
		const actor = { name: "Sir Malvane", token: null, getActiveTokens: () => [{ name: "Hooded Stranger" }] };
		look({ "Actor.a": actor }, true);
		expect(seenName("Actor.a")).toBe("Hooded Stranger");
		look({ "Actor.a": actor }, false);
		expect(seenName("Actor.a")).toBe("Sir Malvane");
	});

	it("names nobody when there's nobody by it", () => {
		look({});
		expect(seenName("Actor.gone")).toBe("");
		expect(seenName("")).toBe("");
		expect(seenName(undefined)).toBe("");
	});
});
