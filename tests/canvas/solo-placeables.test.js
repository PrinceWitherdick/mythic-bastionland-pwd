import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

/** Whether this client is a Referee playing alone. */
let kept = true;
vi.mock("../../module/actions/solo.js", () => ({ secretsKeptOn: () => kept }));

const { leaveSecretsOffList } = await import("../../module/canvas/solo-placeables.js");

/** A Tile as the Scene holds it. */
const tile = (id, kind, hidden = true) => ({ id, hidden, flags: kind ? { [SYSTEM_ID]: { realm: { kind } } } : {} });

/** A row of the sidebar's list, as Foundry v14 draws one. */
const row = (id) => ({ dataset: { entryId: id }, remove: vi.fn() });

let rows;
let list;

beforeEach(() => {
	kept = true;
	const tiles = [tile("myth", "myth"), tile("landmark", "landmark"), tile("found", "myth", false), tile("holding", "holding"), tile("mine", null)];
	globalThis.canvas = { scene: { tiles: new Map(tiles.map((entry) => [entry.id, entry])) } };
	rows = tiles.map((entry) => row(entry.id));
	list = { querySelectorAll: () => rows };
});

const removed = () => rows.filter((entry) => entry.remove.mock.calls.length).map((entry) => entry.dataset.entryId);

describe("leaveSecretsOffList", () => {
	it("leaves a hidden Myth or Landmark off Foundry's Tiles list in solo play", () => {
		leaveSecretsOffList({ collectionName: "tiles" }, list);
		expect(removed()).toEqual(["myth", "landmark"]);
	});

	it("lists everything for a Referee who isn't playing alone", () => {
		kept = false;
		leaveSecretsOffList({ collectionName: "tiles" }, list);
		expect(removed()).toEqual([]);
	});

	it("leaves the other lists alone", () => {
		leaveSecretsOffList({ collectionName: "tokens" }, list);
		expect(removed()).toEqual([]);
	});
});
