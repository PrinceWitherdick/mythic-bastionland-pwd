import { beforeEach, describe, expect, it } from "vitest";
import { describeHex, readoutPlacement } from "../../module/canvas/hex-readout.js";

const summary = (more = {}) => ({ hex: { col: 5, row: 7 }, terrain: null, holding: null, myth: null, landmark: null, ...more });

beforeEach(() => {
	globalThis.game = {
		i18n: {
			localize: (key) => key,
			format: (key, data) => `${key}(${Object.values(data).join(",")})`
		}
	};
});

describe("describeHex", () => {
	it("names only what's in the hex unless the column and row are asked for", () => {
		expect(describeHex(summary())).toBe("");
		expect(describeHex(summary({ terrain: "forest" }))).toBe("bastionland.realm.terrain.forest");
	});

	it("leads with the column and row when the GM has turned them on", () => {
		expect(describeHex(summary(), { coordinates: true })).toBe("bastionland.realm.readout.coordinates(5,7)");
		expect(describeHex(summary({ terrain: "forest" }), { coordinates: true })).toBe("bastionland.realm.readout.coordinates(5,7) bastionland.realm.terrain.forest");
	});

	it("marks for a GM the terrain and Holding hidden by hand", () => {
		const text = describeHex(summary({ terrain: "forest", terrainRevealed: false, holding: { style: "town", name: "Oakwall", seat: false, revealed: false } }));
		expect(text).toBe("bastionland.realm.readout.hidden(bastionland.realm.terrain.forest) · bastionland.realm.readout.hidden(Oakwall)");
	});

	it("says something stands where it was seen from afar, in the Referee's words if they wrote any", () => {
		expect(describeHex(summary({ terrain: "hills" }), { sighted: { note: "" } })).toBe("bastionland.realm.terrain.hills · bastionland.seenFromAfar.readout");
		expect(describeHex(summary(), { sighted: { note: "a structure, smoke rising" } })).toBe("bastionland.seenFromAfar.readoutNote(a structure, smoke rising)");
	});
});

describe("readoutPlacement", () => {
	const screen = { left: 50, top: 40, right: 1500, bottom: 1000 };
	const map = { left: 300, top: 100, right: 1100, bottom: 700 };
	const chip = { width: 200, height: 30, screen };

	it("stands centred under the map's foot", () => {
		expect(readoutPlacement(map, chip)).toEqual({ left: 600, top: 712 });
	});

	it("stays above the hotbar when the map runs off the foot of the screen", () => {
		expect(readoutPlacement({ ...map, bottom: 1400 }, { ...chip, floor: 950 })).toEqual({ left: 600, top: 908 });
	});

	it("stays inside the room at the sides", () => {
		expect(readoutPlacement({ ...map, left: -900, right: -100 }, chip).left).toBe(50);
		expect(readoutPlacement({ ...map, left: 1400, right: 2200 }, chip).left).toBe(1300);
	});

	it("stands under Finish, or over it where the hotbar leaves no room below", () => {
		const under = { top: 712, bottom: 750 };
		expect(readoutPlacement(map, { ...chip, under }).top).toBe(762);
		expect(readoutPlacement(map, { ...chip, under, floor: 780 }).top).toBe(670);
	});
});
