import { afterEach, describe, expect, it } from "vitest";
import { tileCentred, tileCentredUnsettled } from "../../module/compat.js";
import { tileDataAt } from "../../module/canvas/map-alignment.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { TILE_CORNERS_FLAG } from "../../module/rules/realm-documents.js";

const mapFlag = { [REALM_FLAG]: { kind: "map", role: "players" } };

/** A map Tile on a Realm Scene with the given flags, as a TileDocument holds it. */
function mapTileOn(sceneFlags, source) {
	const tile = { _source: { flags: { [SYSTEM_ID]: mapFlag }, ...source } };
	tile.parent = { flags: { [SYSTEM_ID]: { [REALM_FLAG]: {}, ...sceneFlags } }, tiles: [tile] };
	return tile;
}

const rect = { x: 500, y: 400, width: 801, height: 600 };

afterEach(() => { delete globalThis.game; });

describe("the picture's Tile, while it's lined up", () => {
	it("stands by its corner on a v13 Realm that's settled, and by its centre on one that isn't", () => {
		globalThis.game = { release: { generation: 13 } };
		const settled = mapTileOn({ [TILE_CORNERS_FLAG]: true }, { x: 0, y: 0, width: 801, height: 600, rotation: 0 });
		expect(tileDataAt(settled, rect)).toEqual({ x: 100, y: 100, width: 801, height: 600 });
		// Laid before Tiles were placed by their corners: its centre stays in x and y, as the write that follows reads it.
		const unsettled = mapTileOn({}, { x: 0, y: 0, width: 801, height: 600, rotation: 0 });
		const data = tileDataAt(unsettled, rect);
		expect(data).toEqual({ x: 500, y: 400, width: 801, height: 600 });
		expect(tileCentredUnsettled({ ...unsettled._source, ...data })).toMatchObject({ x: 500, y: 400 });
	});

	it("stands by the point it's anchored on, on v14", () => {
		globalThis.game = { release: { generation: 14 } };
		const middle = mapTileOn({ [TILE_CORNERS_FLAG]: true }, { x: 0, y: 0, width: 801, height: 600, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
		expect(tileDataAt(middle, rect)).toEqual({ x: 500, y: 400, width: 801, height: 600 });
		// Laid by its corner on v13 and anchored there by the upgrade, it's shown there until a write anchors it anew.
		const corner = mapTileOn({ [TILE_CORNERS_FLAG]: true }, { x: 0, y: 0, width: 801, height: 600, rotation: 0, texture: { anchorX: 0, anchorY: 0 } });
		const data = tileDataAt(corner, rect);
		expect(data).toEqual({ x: 100, y: 100, width: 801, height: 600 });
		expect(tileCentred({ ...corner._source, ...data })).toMatchObject({ x: 500, y: 400 });
		// Laid by its centre on v13 before Tiles were settled, it keeps its centre.
		const unsettled = mapTileOn({}, { x: 0, y: 0, width: 801, height: 600, rotation: 0, texture: { anchorX: 0, anchorY: 0 } });
		expect(tileDataAt(unsettled, rect)).toEqual({ x: 500, y: 400, width: 801, height: 600 });
	});
});
