import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** @param {string} path Relative to the repository root. */
const source = (path) => readFileSync(join(import.meta.dirname, "../..", path), "utf8");

describe("putting a Realm Scene back in order as it is drawn", () => {
	it("is left to the one GM who keeps the world, so two GMs don't lay its lines twice over", () => {
		const realm = source("module/actions/realm.js");
		const sync = realm.slice(realm.indexOf("export async function syncRealmScene"));
		const guard = sync.slice(0, sync.indexOf("\n\tconst"));
		expect(guard).toContain("game.users?.activeGM?.isSelf");
		expect(guard).toContain("isRealmScene(scene)");
	});

	it("logs a write it couldn't make rather than leaving the promise to go unheard", () => {
		const hooks = source("module/canvas/realm-hooks.js");
		expect(hooks).toMatch(/syncRealmScene\(canvas\?\.scene\)\.catch\(/);
	});
});
