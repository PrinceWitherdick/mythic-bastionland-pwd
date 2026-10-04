import { describe, expect, it } from "vitest";
import { INK, INK_HEX, colourNumber } from "../../module/rules/colour.js";

describe("colourNumber", () => {
	it("turns a \"#rrggbb\" colour into the number the canvas wants", () => {
		expect(colourNumber("#1f6fd1")).toBe(0x1f6fd1);
		expect(colourNumber("#000000")).toBe(0);
		expect(INK_HEX).toBe(colourNumber(INK));
	});
});
