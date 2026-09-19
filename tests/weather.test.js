import { describe, expect, it } from "vitest";
import { WEATHER, WEATHER_KEYS, WEATHER_KEY_PREFIX, isWeather, weatherEffectsChange } from "../module/rules/weather.js";

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
		change.set["bastionland-weather-storm-clouds"].options.tint.apply = false;
		expect(WEATHER.storm.effects[0].options.tint.apply).toBe(true);
	});
});
