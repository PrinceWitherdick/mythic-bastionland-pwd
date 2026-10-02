import { describe, expect, it } from "vitest";
import { SETTING_GROUPS } from "../module/rules/settings-tab.js";
import { WEATHER, WEATHER_KEYS, WEATHER_KEY_PREFIX, WEATHER_PARTS, isWeather, partsOff, weatherEffectsChange } from "../module/rules/weather.js";

/** A Scene's FXMaster effects after a change is written, as FXMaster would keep them. */
function after(current, change) {
	if (!change) return current;
	const next = { ...current, ...change.set };
	for (const key of change.drop) delete next[key];
	return next;
}

describe("weather", () => {
	it("knows its skies, and nothing on Object's prototype", () => {
		expect(WEATHER_KEYS).toContain("storm");
		expect(isWeather("rain")).toBe(true);
		expect(isWeather("toString")).toBe(false);
		expect(isWeather(null)).toBe(false);
	});

	it("puts a sky's effects on a bare Scene, under keys of our own", () => {
		const change = weatherEffectsChange("storm", {});
		expect(change.drop).toEqual([]);
		expect(Object.keys(change.set)).toHaveLength(WEATHER.storm.effects.length);
		for (const [key, effect] of Object.entries(change.set)) {
			expect(key.startsWith(`${WEATHER_KEY_PREFIX}storm-`)).toBe(true);
			expect(Object.keys(effect)).toEqual(["type", "options"]);
		}
	});

	it("takes the old weather off whole when it changes, and leaves the GM's own effects", () => {
		const own = { core_embers: { type: "embers", options: {} } };
		const stormy = after(own, weatherEffectsChange("storm", own));
		const rainy = after(stormy, weatherEffectsChange("rain", stormy));
		expect(Object.keys(rainy).sort()).toEqual(["bastionland-weather-rain-clouds", "bastionland-weather-rain-rain", "core_embers"]);
		// The storm's slate tint went with its keys rather than staying merged into the rain's clouds.
		expect(rainy["bastionland-weather-rain-clouds"].options.tint).toBeUndefined();
	});

	it("writes nothing when the Scene already shows it", () => {
		const rainy = after({}, weatherEffectsChange("rain", {}));
		expect(weatherEffectsChange("rain", rainy)).toBeNull();
		expect(weatherEffectsChange(null, {})).toBeNull();
	});

	it("clears to nothing for a clear sky, or none", () => {
		const snowy = after({}, weatherEffectsChange("snow", {}));
		expect(after(snowy, weatherEffectsChange("clear", snowy))).toEqual({});
		expect(after(snowy, weatherEffectsChange(null, snowy))).toEqual({});
	});

	it("never hands out the table's own objects", () => {
		const change = weatherEffectsChange("storm", {});
		change.set["bastionland-weather-storm-clouds-tint"].options.tint.apply = false;
		expect(WEATHER.storm.effects[0].options.tint.apply).toBe(true);
	});
});

describe("the parts of the sky", () => {
	const drawn = new Set(Object.values(WEATHER).flatMap((sky) => sky.effects.map((effect) => effect.type)));

	it("has a switch for every effect a sky draws, and none for an effect no sky does", () => {
		const types = WEATHER_PARTS.filter((part) => part.type).map((part) => part.type);
		expect(new Set(types)).toEqual(drawn);
		expect(new Set(WEATHER_PARTS.map((part) => part.setting)).size).toBe(WEATHER_PARTS.length);
	});

	it("gives the tint a switch of its own, and a sky that has one", () => {
		expect(WEATHER_PARTS.filter((part) => part.tint)).toHaveLength(1);
		expect(Object.values(WEATHER).some((sky) => sky.effects.some((effect) => effect.options.tint))).toBe(true);
	});

	it("is the Settings page's weather group, every switch of it", () => {
		const group = SETTING_GROUPS.find((candidate) => candidate.id === "weather");
		for (const { setting } of WEATHER_PARTS) expect(group.keys).toContain(setting);
	});

	it("reads a switch nobody touched as on, and only false as off", () => {
		expect(partsOff(() => undefined)).toEqual({ types: new Set(), tint: false });
		expect(partsOff(() => true)).toEqual({ types: new Set(), tint: false });
		const off = partsOff((setting) => (setting === "weatherFxHail" || setting === "weatherFxStormTint" ? false : 0));
		expect(off).toEqual({ types: new Set(["hail"]), tint: true });
	});

	it("leaves out a part switched off, and keeps the rest of the sky", () => {
		const change = weatherEffectsChange("storm", {}, { types: new Set(["hail"]) });
		expect(Object.values(change.set).map((effect) => effect.type).sort()).toEqual(["clouds", "rain"]);
	});

	it("takes a part switched off from a Scene already drawing it", () => {
		const stormy = after({}, weatherEffectsChange("storm", {}));
		const change = weatherEffectsChange("storm", stormy, { types: new Set(["hail"]) });
		expect(change).toEqual({ set: {}, drop: ["bastionland-weather-storm-hail"] });
	});

	it("takes the tint off whole, under a new key, and leaves the clouds", () => {
		const stormy = after({}, weatherEffectsChange("storm", {}));
		const grey = after(stormy, weatherEffectsChange("storm", stormy, { tint: true }));
		expect(grey["bastionland-weather-storm-clouds-tint"]).toBeUndefined();
		expect(grey["bastionland-weather-storm-clouds"].options.tint).toBeUndefined();
		expect(grey["bastionland-weather-storm-clouds"].options.density).toBe(WEATHER.storm.effects[0].options.density);
		// And back again.
		const tinted = after(grey, weatherEffectsChange("storm", grey));
		expect(Object.keys(tinted).sort()).toEqual(Object.keys(stormy).sort());
	});

	it("doesn't strip the tint from the table itself", () => {
		weatherEffectsChange("storm", {}, { tint: true });
		expect(WEATHER.storm.effects[0].options.tint).toBeDefined();
	});

	it("draws nothing when every part is off", () => {
		const off = partsOff(() => false);
		for (const sky of WEATHER_KEYS) expect(weatherEffectsChange(sky, {}, off)).toBeNull();
	});
});
