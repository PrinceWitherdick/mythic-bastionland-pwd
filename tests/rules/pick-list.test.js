import { describe, expect, it } from "vitest";
import { PICK_BLANK, pickedFrom } from "../../module/rules/pick-list.js";

describe("pickedFrom", () => {
	const list = [{ id: "a" }, { id: "b" }];

	it("finds the one picked, or the blank one", () => {
		expect(pickedFrom(list, "b")).toBe(list[1]);
		expect(pickedFrom(list, PICK_BLANK)).toBe(PICK_BLANK);
	});

	it("gives nothing for an answer that wasn't offered", () => {
		expect(pickedFrom(list, "c")).toBeNull();
		expect(pickedFrom([], undefined)).toBeNull();
	});
});
