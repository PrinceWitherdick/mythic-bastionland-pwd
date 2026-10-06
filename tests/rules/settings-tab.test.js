import { describe, expect, it } from "vitest";
import { SETTING_GROUPS, formatRange, groupKeys, groupsFor, offersMenu, offersSetting, pickSummary, settingRow, settingValue } from "../../module/rules/settings-tab.js";
import { WEATHER_PARTS } from "../../module/rules/weather.js";

describe("the Settings page's groups", () => {
	it("shows a player their own settings, and the Referee's to GMs alone", () => {
		expect(groupsFor(false).map((group) => group.id)).toEqual(["reading", "windows"]);
		expect(groupsFor(true).map((group) => group.id)).toEqual(["reading", "windows", "referee", "weather"]);
	});

	it("offers each setting once", () => {
		const keys = SETTING_GROUPS.flatMap(groupKeys);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("gathers the parts of the weather into one drop-down, each still offered to GMs alone", () => {
		const weather = SETTING_GROUPS.find((group) => group.id === "weather");
		expect(weather.keys).toEqual(["weatherButton", "weatherOnMap"]);
		expect(weather.picks.map((pick) => pick.id)).toEqual(["weatherParts"]);
		expect(weather.picks[0].keys).toEqual(WEATHER_PARTS.map((part) => part.setting));
		expect(offersSetting("weatherFxHail", true)).toBe(true);
		expect(offersSetting("weatherFxHail", false)).toBe(false);
	});

	it("lets a player change only what they are shown", () => {
		expect(offersSetting("textSize", false)).toBe(true);
		expect(offersSetting("restoreOpenSheets", false)).toBe(true);
		expect(offersSetting("phaseBannerShown", false)).toBe(true);
		expect(offersSetting("travelRulesShown", false)).toBe(true);
		expect(offersSetting("hexReadoutShown", false)).toBe(true);
		expect(offersSetting("visitedMarksShown", false)).toBe(true);
		expect(offersSetting("rulebookForPlayers", false)).toBe(false);
		expect(offersSetting("rulebookForPlayers", true)).toBe(true);
		expect(offersSetting("weatherButton", false)).toBe(false);
		expect(offersSetting("weatherButton", true)).toBe(true);
		expect(offersSetting("hexCoordinates", false)).toBe(false);
		expect(offersSetting("hexCoordinates", true)).toBe(true);
		// Settings the page doesn't offer can't be written from it, even by a GM.
		expect(offersSetting("calendar", true)).toBe(false);
		expect(offersMenu("welcome", false)).toBe(false);
		expect(offersMenu("welcome", true)).toBe(true);
		expect(offersMenu("realmAppearance", true)).toBe(true);
	});
});

describe("formatRange", () => {
	it("shows as many decimals as the step", () => {
		expect(formatRange(1, 0.05)).toBe("1.00");
		expect(formatRange("1.25", 0.05)).toBe("1.25");
		expect(formatRange(1.5, 0.1)).toBe("1.5");
		expect(formatRange(3, 1)).toBe("3");
	});
});

describe("pickSummary", () => {
	it("reads all, some or none of a drop-down's boxes as ticked", () => {
		expect(pickSummary(7, 7)).toEqual({ key: "bastionland.settingsTab.pick.all", data: { count: 7, total: 7 } });
		expect(pickSummary(5, 7)).toEqual({ key: "bastionland.settingsTab.pick.some", data: { count: 5, total: 7 } });
		expect(pickSummary(0, 7)).toEqual({ key: "bastionland.settingsTab.pick.none", data: { count: 0, total: 7 } });
	});
});

describe("settingRow", () => {
	it("is nothing for a setting that isn't registered", () => {
		expect(settingRow("gone", undefined, true)).toBeNull();
	});

	it("makes a drop-down of a setting with choices, the current one picked", () => {
		const row = settingRow("contrast", { name: "n", hint: "h", choices: { normal: "a", high: "b" } }, "high");
		expect(row).toMatchObject({ key: "contrast", label: "n", hint: "h", isChoice: true });
		expect(row.choices).toEqual([{ value: "normal", label: "a", selected: false }, { value: "high", label: "b", selected: true }]);
	});

	it("matches a numbered choice to its string key", () => {
		const row = settingRow("n", { choices: { 1: "one", 2: "two" } }, 2);
		expect(row.choices.find((choice) => choice.selected)?.value).toBe("2");
	});

	it("makes a slider of a setting with a range, showing its value", () => {
		const range = { min: 0.9, max: 1.4, step: 0.05 };
		expect(settingRow("textSize", { range, default: 1 }, 1.2)).toMatchObject({ isRange: true, ...range, value: 1.2, display: "1.20" });
		// An unreadable value shows the default rather than nothing.
		expect(settingRow("textSize", { range, default: 1 }, "x")).toMatchObject({ value: 1, display: "1.00" });
	});

	it("makes a tick box of anything else", () => {
		expect(settingRow("noItalics", { name: "n" }, true)).toMatchObject({ isCheck: true, checked: true, hint: "" });
		expect(settingRow("noItalics", { name: "n" }, undefined)).toMatchObject({ isCheck: true, checked: false });
	});
});

describe("settingValue", () => {
	it("stores a tick box as true or false", () => {
		expect(settingValue({ type: Boolean }, 1)).toBe(true);
		expect(settingValue({ type: Boolean }, false)).toBe(false);
	});

	it("stores a slider as a number within its range", () => {
		const config = { type: Number, range: { min: 0.9, max: 1.4, step: 0.05 } };
		expect(settingValue(config, "1.25")).toBe(1.25);
		expect(settingValue(config, "9")).toBe(1.4);
		expect(settingValue(config, "0")).toBe(0.9);
		expect(settingValue(config, "much")).toBeUndefined();
	});

	it("takes only a choice the setting offers", () => {
		const config = { type: String, choices: { normal: "a", high: "b" } };
		expect(settingValue(config, "high")).toBe("high");
		expect(settingValue(config, "toString")).toBeUndefined();
		expect(settingValue(config, "loud")).toBeUndefined();
	});
});
