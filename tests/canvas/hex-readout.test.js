import { beforeEach, describe, expect, it } from "vitest";
import { describeHex } from "../../module/canvas/hex-readout.js";

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
		expect(describeHex(summary(), { coordinates: true })).toBe("bastionland.realm.hex(5,7)");
		expect(describeHex(summary({ terrain: "forest" }), { coordinates: true })).toBe("bastionland.realm.hex(5,7) · bastionland.realm.terrain.forest");
	});

	it("marks for a GM the terrain and Holding hidden by hand", () => {
		const text = describeHex(summary({ terrain: "forest", terrainRevealed: false, holding: { style: "town", name: "Oakwall", seat: false, revealed: false } }));
		expect(text).toBe("bastionland.realm.readout.hidden(bastionland.realm.terrain.forest) · bastionland.realm.readout.hidden(Oakwall)");
	});
});
