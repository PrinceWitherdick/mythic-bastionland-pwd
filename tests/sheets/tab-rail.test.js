import { describe, expect, it } from "vitest";
import { railHangsLeft } from "../../module/sheets/tab-rail.js";

describe("railHangsLeft", () => {
	it("keeps the rail on the right while it fits there", () => {
		expect(railHangsLeft({ left: 100, right: 960 }, 46, 1920)).toBe(false);
	});

	it("moves the rail left when the window is against the right of the screen", () => {
		expect(railHangsLeft({ left: 1060, right: 1920 }, 46, 1920)).toBe(true);
		expect(railHangsLeft({ left: 1040, right: 1900 }, 46, 1920)).toBe(true);
	});

	it("stays right when the left has even less room", () => {
		expect(railHangsLeft({ left: 10, right: 1000 }, 46, 1020)).toBe(false);
	});
});
