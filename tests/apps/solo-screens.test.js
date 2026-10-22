import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Screens that need Foundry's canvas or a whole sheet to run, read for how they keep solo play's secrets.
const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

describe("solo play's secrets on the Referee's own screens", () => {
	it("counts only what's been found on the paint palette", () => {
		expect(read("module/apps/RealmPanel.js")).toContain("const realm = realmKnown(entry.realm, scene);");
	});

	it("lays no Holding, Landmark or Barrier with the brush anywhere, so no hex tells of a secret, and picks up only what's found", () => {
		const layer = read("module/canvas/RealmLayer.js");
		expect(layer).toContain('if (brushRefused("barrier", scene)) return;');
		expect(layer).toContain("if (brushRefused(this.brush, scene)) return;");
		// The palette and the drawing window say why, as such a brush is taken up.
		expect(read("module/apps/RealmPanel.js")).toContain("if (!brushLockedOn(brush, scene)) return t(`realm.panel.hints.${brush}`);");
		expect(read("module/apps/RealmDrawing.js")).toContain("brushHint(brush, scene)");
		expect(layer).toContain("placeable.pick(featureAt(realmKnown(realm, scene), hex))");
	});

	it("has no Cast for a Myth not yet met, so a drop there names nothing", () => {
		const sheet = read("module/sheets/GmToolkitSheet.js");
		const drop = sheet.slice(sheet.indexOf("async _onDropActor("));
		expect(drop.indexOf("if (mythKeptFromMe(myth, this.scene)) return null;")).toBeLessThan(drop.indexOf("addToCast("));
	});

	it("lets the Referee mark which of their Knights ride with the Company, on a Knight no player holds", () => {
		const sheet = read("module/sheets/KnightSheet.js");
		expect(sheet).toContain("if (!isSquire && keptFromMe() && this.isEditable && !this.actor.hasPlayerOwner)");
		expect(sheet).toContain("toggleCompany: KnightSheet.#onToggleCompany");
		expect(sheet).toContain("this.actor.setFlag(SYSTEM_ID, COMPANY_KNIGHT_FLAG, !inCompany(this.actor))");
	});

	it("doesn't move a Myth into a hex from Edit this hex", () => {
		const edit = read("module/apps/hex-edit.js");
		const kind = edit.slice(edit.indexOf("async function setHexKind("));
		expect(kind.indexOf("if (secretsKeptOn(scene)) return false;")).toBeLessThan(kind.indexOf("pickMythToMove("));
	});

	it("keeps Undo on the map off what play brings about", () => {
		for (const file of ["module/canvas/barrier-found.js", "module/actions/myth-resolve.js"]) {
			expect(read(file)).toContain("editRealm(");
			expect(read(file)).not.toContain("editRealmByHand");
		}
		// An Omen marked in play isn't kept for Undo; one stepped in Edit this hex, beside Undo, is.
		expect(read("module/actions/omens.js")).toContain("export async function markMythOmen(scene, number, omen, { byHand = false } = {})");
		expect(read("module/apps/hex-edit.js")).toContain("(now) => now.omen + by, { byHand: true })");
		// A Landmark named as it's first met is play too.
		expect(read("module/actions/landmarks.js")).toContain("await loadArtIndex(), { byHand: false })");
	});

	it("asks a Referee playing alone who places a drawn Realm's secrets, and settles them as it's first finished", () => {
		const realm = read("module/actions/realm.js");
		expect(realm).toContain("const askSecrets = draw && keptFromMe();");
		const finish = realm.slice(realm.indexOf("export async function finishRealmDrawing("));
		expect(finish).toContain('drawingShortfalls(getRealm(scene).realm, { leave: secrets === "dice" ? SECRET_DRAWING_STEPS : [] })');
		// Settled while the Realm is still being drawn, before it's finished and the key would be posted.
		expect(finish.indexOf("await settleSoloSecrets(scene, secrets);")).toBeLessThan(finish.indexOf("refreshThumbnail(scene, drawingFlag(false))"));
		const settle = realm.slice(realm.indexOf("async function settleSoloSecrets("));
		// Written as play, not for Undo to take back; then the Realm is no longer placing its own secrets.
		expect(settle).toMatch(/await editRealm\(scene, [\s\S]+?\}\);\s+await scene\.setFlag\(SYSTEM_ID, SOLO_SECRETS_FLAG, null\);/);
	});

	it("gives the dice's steps of a drawn Realm no tools, only a word that the dice place them", () => {
		const drawing = read("module/apps/RealmDrawing.js");
		expect(drawing).toContain('const step = secret && secrets === "dice" ? null : part.step;');
		expect(drawing).toContain("tool: step ? tool(step) : null");
		expect(read("templates/apps/realm-drawing.hbs")).toContain("{{#if secret}}");
	});

	it("lets a move the Company didn't choose pass a Barrier, as Unconstrained Movement does", () => {
		expect(read("module/canvas/realm-hooks.js")).toContain("movement?.constrainOptions?.ignoreWalls || forcedMove(operation)");
	});
});
