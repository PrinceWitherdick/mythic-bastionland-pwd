import { describe, expect, it } from "vitest";
import {
	anyOmenScene,
	emptyOmenScenes,
	normaliseOmenScenes,
	omenScenesByNumber,
	withOmenScene,
	withoutMissingScenes,
	withoutOmenScene
} from "../../module/rules/omen-scenes.js";
import { OMEN_COUNT } from "../../module/rules/realm.js";

describe("normaliseOmenScenes", () => {
	it("gives six empty lists for anything that isn't Scenes", () => {
		for (const raw of [undefined, null, "", 3, "x"]) expect(normaliseOmenScenes(raw)).toEqual(emptyOmenScenes());
		expect(emptyOmenScenes()).toHaveLength(OMEN_COUNT);
	});

	it("reads six lists in order, or lists keyed by Omen number as the Myth notes keep them", () => {
		expect(normaliseOmenScenes([["a"], [], ["b", "c"]])).toEqual([["a"], [], ["b", "c"], [], [], []]);
		expect(normaliseOmenScenes({ 2: ["a"], 6: ["b"], 7: ["lost"] })).toEqual([[], ["a"], [], [], [], ["b"]]);
	});

	it("keeps each id once, and only ids", () => {
		expect(normaliseOmenScenes([["a", " a ", 3, "", null, "b"]])[0]).toEqual(["a", "b"]);
	});
});

describe("omenScenesByNumber", () => {
	it("keeps only the Omens with Scenes, by number from 1", () => {
		expect(omenScenesByNumber([[], ["a"], [], [], [], ["b", "c"]])).toEqual({ 2: ["a"], 6: ["b", "c"] });
		expect(omenScenesByNumber(emptyOmenScenes())).toEqual({});
	});

	it("round-trips through normaliseOmenScenes", () => {
		const lists = [["a"], [], [], ["b"], [], []];
		expect(normaliseOmenScenes(omenScenesByNumber(lists))).toEqual(lists);
	});
});

describe("withOmenScene and withoutOmenScene", () => {
	it("links a Scene to one Omen and takes it off again", () => {
		const linked = withOmenScene(emptyOmenScenes(), 3, "a");
		expect(linked[2]).toEqual(["a"]);
		expect(anyOmenScene(linked)).toBe(true);
		const unlinked = withoutOmenScene(linked, 3, "a");
		expect(unlinked).toEqual(emptyOmenScenes());
		expect(anyOmenScene(unlinked)).toBe(false);
	});

	it("gives back the same lists when nothing would change", () => {
		const linked = withOmenScene(emptyOmenScenes(), 1, "a");
		expect(withOmenScene(linked, 1, "a")).toBe(linked);
		expect(withoutOmenScene(linked, 2, "a")).toBe(linked);
		expect(withOmenScene(linked, 0, "b")).toBe(linked);
		expect(withOmenScene(linked, OMEN_COUNT + 1, "b")).toBe(linked);
		expect(withOmenScene(linked, 2, "")).toBe(linked);
	});

	it("lets one Scene stand for more than one Omen", () => {
		const twice = withOmenScene(withOmenScene(emptyOmenScenes(), 1, "a"), 4, "a");
		expect(twice[0]).toEqual(["a"]);
		expect(twice[3]).toEqual(["a"]);
	});
});

describe("withoutMissingScenes", () => {
	it("drops the Scenes the world no longer has, and is the same lists when none is gone", () => {
		const lists = [["a", "gone"], ["b"], [], [], [], []];
		expect(withoutMissingScenes(lists, (id) => id !== "gone")).toEqual([["a"], ["b"], [], [], [], []]);
		expect(withoutMissingScenes(lists, () => true)).toBe(lists);
	});
});
