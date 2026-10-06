import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const strings = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "languages", "en.json"), "utf8"));
const lookup = (path) => path.split(".").reduce((at, part) => at?.[part], strings);

const { momentLabel, ordinalWord } = await import("../../module/actions/calendar.js");

beforeEach(() => {
	globalThis.game = {
		i18n: {
			lang: "en",
			has: (path) => typeof lookup(path) === "string",
			localize: (path) => lookup(path) ?? path,
			format: (path, data) => (lookup(path) ?? path).replace(/\{(\w+)\}/g, (_, name) => data[name])
		}
	};
});

afterEach(() => {
	delete globalThis.game;
});

describe("the calendar in a sentence", () => {
	it("says a moment as prose, the Age spelled out", () => {
		expect(momentLabel({ age: 2, season: "harvest", phase: "afternoon" })).toBe("the Afternoon of Harvest in the Second Age");
	});

	it("spells out an Age while there's a word for it, then gives its figure", () => {
		expect(ordinalWord(1)).toBe("First");
		expect(ordinalWord(12)).toBe("Twelfth");
		expect(ordinalWord(13)).toBe("13th");
		expect(ordinalWord(22)).toBe("22nd");
	});
});
