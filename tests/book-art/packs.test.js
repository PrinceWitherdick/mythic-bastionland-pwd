import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillPack } from "../../module/book-art/packs.js";

/** A world compendium that remembers what was made in it. */
function fakePack() {
	let next = 0;
	const made = { folders: [], documents: [] };
	const createFolders = vi.fn(async (data) => data.map((folder) => {
		const created = { ...folder, id: `folder${++next}` };
		made.folders.push(created);
		return created;
	}));
	const createDocuments = vi.fn(async (data) => {
		made.documents.push(...data);
		return data;
	});
	const pack = { collection: "world.test", folders: [], getIndex: async () => ({ size: 0, map: () => [] }) };
	return { pack, made, createFolders, createDocuments };
}

describe("fillPack", () => {
	let fake;

	beforeEach(() => {
		fake = fakePack();
		globalThis.game = { packs: { get: () => fake.pack } };
		globalThis.foundry = {
			documents: { collections: { CompendiumCollection: {} } },
			utils: { getDocumentClass: (type) => (type === "Folder" ? { createDocuments: fake.createFolders } : { createDocuments: fake.createDocuments }) }
		};
	});

	afterEach(() => {
		delete globalThis.game;
		delete globalThis.foundry;
	});

	it("files documents in folders, and folders inside folders, leaving out empty ones", async () => {
		await fillPack({ name: "test", type: "Actor", label: "Test" }, [
			{ name: "One", documents: [], folders: [{ name: "Heron", sort: 300, documents: [{ name: "Wade" }] }, { name: "Empty", documents: [] }] },
			{ name: "Nothing", documents: [], folders: [{ name: "Also empty", documents: [] }] },
			{ name: "City", documents: [{ name: "Ada" }] }
		]);

		const byName = Object.fromEntries(fake.made.folders.map((folder) => [folder.name, folder]));
		expect(Object.keys(byName)).toEqual(["One", "City", "Heron"]);
		expect(byName.One).toMatchObject({ folder: null, sort: 100, type: "Actor" });
		expect(byName.City).toMatchObject({ folder: null, sort: 300 });
		expect(byName.Heron).toMatchObject({ folder: byName.One.id, sort: 300 });
		expect(fake.made.documents).toEqual([{ name: "Ada", folder: byName.City.id }, { name: "Wade", folder: byName.Heron.id }]);
		// A level at a time, then every document at once.
		expect(fake.createFolders).toHaveBeenCalledTimes(2);
		expect(fake.createDocuments).toHaveBeenCalledTimes(1);
	});
});
