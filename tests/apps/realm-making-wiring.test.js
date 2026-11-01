import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * How the Making a Realm fixes are wired in the parts that need Foundry: the
 * rolls behind hand-placed Myths and Sanctums, a Realm rolled again in play,
 * and Finish's word on hexes walled off. The rules they call are tested in
 * tests/rules/realm-making.test.js.
 */

/** @param {string} path Relative to the repository root. */
const source = (path) => readFileSync(join(import.meta.dirname, "../..", path), "utf8");
const lang = JSON.parse(source("languages/en.json")).bastionland;

describe("what the Referee places by hand", () => {
	it("is rolled from Edit this hex and from the brush, as a rolled Realm's is (p14, p26, p27)", () => {
		const edit = source("module/apps/hex-edit.js");
		expect(edit).toContain('return placeFeature(realm, g, hex, value === "none" ? null : { kind: value }, byHand);');
		expect(edit).toContain("return editFeature(realm, g, hex, { type: value }, byHand);");
		// The Seer roll in Edit this hex skips Seers other Sanctums have.
		expect(edit).toContain("const seer = landmark ? rollFreeSeer(freshRandom(), realm.landmarks) : null;");
		expect(source("module/canvas/RealmLayer.js")).toContain("placeFeature(current, geometry, hex, taking ? null : feature, byHand)");
	});

	it("has wording for a Myth the Realm already holds", () => {
		expect(lang.realm.problems.repeated).toBeTruthy();
	});
});

describe("a Realm rolled again in play", () => {
	const realm = source("module/actions/realm.js");
	const reroll = realm.slice(realm.indexOf("export async function rerollRealm"), realm.indexOf("const mythPicksKey"));

	it("warns first of Domains whose Holdings it replaces, and of what stays", () => {
		expect(reroll).toContain('parseHoldingRef(actor.system?.holding)?.sceneId === scene.id');
		expect(reroll).toContain('t("realm.reroll.kept")');
		expect(lang.realm.reroll).toMatchObject({ domains: expect.stringContaining("{count}"), domainsOne: expect.any(String), kept: expect.any(String) });
	});

	it("tidies what no longer fits, then pictures the new Realm and whispers its key", () => {
		const order = ["await rollRealmAgain(scene);", "await tidyAfterReroll(scene, before);", "await refreshThumbnail(scene);", "await postRealmKey(scene);"];
		const at = order.map((line) => reroll.indexOf(line));
		expect(at.every((index) => index > -1)).toBe(true);
		expect([...at].sort((a, b) => a - b)).toEqual(at);
		// Marks seen from afar go, Barriers met keep only the found ones still standing, and a Courtier Company moves to the new Seat.
		expect(reroll).toContain("writeSightings(scene, { drop: Object.keys(getSighted(scene)) })");
		expect(reroll).toContain("barrierEdges(realm, { revealed: true })");
		expect(reroll).toContain("keepHexBarriersMet(scene, standing)");
		expect(reroll).toContain('realmStartOf(scene) === "courtier"');
		expect(reroll).toContain("tidying.push(restandCompany(scene, newSeat.hex));");
		// All three are done before the new Realm is pictured.
		expect(reroll).toContain("await Promise.all(tidying);");
	});
});

describe("finishing a Realm drawn by hand", () => {
	it("says how many hexes Barriers wall off, without stopping the finish", () => {
		const realm = source("module/actions/realm.js");
		const finish = realm.slice(realm.indexOf("export async function finishRealmDrawing("));
		expect(finish).toContain("if (short.length || walled) {");
		expect(lang.realmDrawing.finish.walled).toContain("{count}");
		expect(lang.realmDrawing.finish.walledOne).toBeTruthy();
	});

	it("tallies a kind of Landmark wanting just one without a range of one to one", () => {
		expect(lang.realmDrawing.tally.landmarkOne).toBe("{type}: {count} of {target}");
		expect(source("module/actions/realm.js")).toContain('t("realmDrawing.tally.landmarkOne", { type, count, target: min })');
	});
});
