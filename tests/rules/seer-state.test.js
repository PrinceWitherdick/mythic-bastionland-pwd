import { describe, expect, it } from "vitest";
import { SEER_UNHARMED, namesNewSeer, seerCurrent } from "../../module/rules/seer-state.js";
import { SCORES } from "../../module/rules/virtues.js";

const stats = { vig: 7, cla: 5, spi: 11, guard: 2 };

describe("SCORES", () => {
	it("lists the Virtues, then GD", () => {
		expect(SCORES).toEqual(["vig", "cla", "spi", "guard"]);
	});
});

describe("seerCurrent", () => {
	it("gives the book's scores while nothing is kept", () => {
		expect(seerCurrent(stats)).toEqual(stats);
		expect(seerCurrent(stats, SEER_UNHARMED)).toEqual(stats);
	});

	it("gives what's kept on the sheet, down to 0", () => {
		expect(seerCurrent(stats, { vig: 3, cla: null, spi: 11, guard: 0 })).toEqual({ vig: 3, cla: 5, spi: 11, guard: 0 });
	});

	it("gives null for what the book doesn't give, as for a Seer with only GD", () => {
		expect(seerCurrent({ vig: null, cla: null, spi: null, guard: 6 }, { vig: 4, guard: 2 })).toEqual({ vig: null, cla: null, spi: null, guard: 2 });
		expect(seerCurrent(null)).toEqual({ vig: null, cla: null, spi: null, guard: null });
	});
});

describe("namesNewSeer", () => {
	it("is true when the update names someone else", () => {
		expect(namesNewSeer({ system: { seer: "The Glass Seer" } }, "The Rotted Seer")).toBe(true);
		expect(namesNewSeer({ system: { seer: "" } }, "The Rotted Seer")).toBe(true);
	});

	it("is false for the same Seer, spaces aside, or an update that doesn't name one", () => {
		expect(namesNewSeer({ system: { seer: " The Rotted Seer " } }, "The Rotted Seer")).toBe(false);
		expect(namesNewSeer({ system: { seerState: { vig: 3 } } }, "The Rotted Seer")).toBe(false);
		expect(namesNewSeer({ name: "Sir Ban" }, "The Rotted Seer")).toBe(false);
	});
});
