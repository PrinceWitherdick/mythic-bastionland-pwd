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

	it("lets the Referee make a Knight no player holds an NPC Knight, apart from the Company, in any world", () => {
		const sheet = read("module/sheets/KnightSheet.js");
		expect(sheet).toContain("if (this.isEditable && changesKind(this.actor) && !isUnchosen(this.actor))");
		expect(sheet).toContain("toggleNpcKnight: KnightSheet.#onToggleNpcKnight");
		expect(sheet).toContain("const npc = !isNpcKnight(this.actor);");
		expect(sheet).toContain("return setKnightKind(this.actor, npc);");
		// Not while a Squire serves them (p7): the switch is barred and says why.
		expect(sheet).toContain("const barred = !npc && servedBySquire(this.actor);");
		expect(sheet).toContain("if (npc && servedBySquire(this.actor)) {");
		expect(read("module/actions/npc-knights.js")).toContain("&& !actor.system?.isSquire && (isNpcKnight(actor) || !actor.hasPlayerOwner);");
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
		// What's hidden goes uncounted, and the dice's steps, or those already kept, aren't missing.
		expect(finish).toContain("drawingShortfalls(realmKnown(getRealm(scene).realm, scene), { leave: drawingSecrets(scene).handed ? SECRET_DRAWING_STEPS : [] })");
		// Settled while the Realm is still being drawn, before it's finished and the key would be posted.
		expect(finish.indexOf("await settleSoloSecrets(scene, secrets);")).toBeLessThan(finish.indexOf("refreshThumbnail(scene, drawingFlag(false))"));
		const settle = realm.slice(realm.indexOf("async function settleSoloSecrets("));
		// Written as play, not for Undo to take back; then the Realm is no longer placing its own secrets.
		expect(settle).toMatch(/await editRealm\(scene, [\s\S]+?\}\);\s+await scene\.setFlag\(SYSTEM_ID, SOLO_SECRETS_FLAG, null\);/);
	});

	it("gives the dice's steps of a drawn Realm no tools, only a word that the dice place them", () => {
		const drawing = read("module/apps/RealmDrawing.js");
		expect(drawing).toContain("const step = secret && secrets.handed ? null : part.step;");
		expect(drawing).toContain("tool: step ? tool(step) : null");
		expect(drawing).toContain("counts: step ? counts(step.key) : null");
		expect(read("templates/apps/realm-drawing.hbs")).toContain("{{#if secret}}");
	});

	it("counts nothing hidden as a finished Realm is drawn again, and says why its secret steps have no counts", () => {
		const drawing = read("module/apps/RealmDrawing.js");
		const prepare = drawing.slice(drawing.indexOf("async _prepareContext("));
		expect(prepare).toContain("const realm = realmKnown(getRealm(scene)?.realm ?? null, scene);");
		expect(prepare.indexOf("realmKnown(")).toBeLessThan(prepare.indexOf("drawingTally(realm)"));
		expect(prepare).toContain("secret: secret ? t(`solo.secrets.drawing.${secrets.way}`) : null");
		const lang = JSON.parse(read("languages/en.json"));
		for (const way of ["dice", "hide", "show", "kept"]) expect(lang.bastionland.solo.secrets.drawing[way]).toEqual(expect.any(String));
	});

	it("lets a Company already set down find the new Myth in its hex as a Realm is rolled again", () => {
		const realm = read("module/actions/realm.js");
		const again = realm.slice(realm.indexOf("async function rollRealmAgain("), realm.indexOf("export function addNewRealmButton("));
		// After the write, as when a drawn Realm's secrets are settled.
		expect(again).toMatch(/forgetRealmHistory\(scene\.id\);\s+return realm;\s+\}\);\s+if \(secretsKeptOn\(scene\)\) await revealMythsBeenTo\(scene\);/);
	});

	it("says Rivers and Barriers were cut back only when some were, and never of a hidden Barrier", () => {
		const realm = read("module/actions/realm.js");
		const layout = realm.slice(realm.indexOf("export async function setRealmLayout("));
		expect(layout).toContain("return relayCutBack(realm, joined, { foundOnly: secretsKeptOn(scene) });");
		expect(layout).not.toContain("return joined !== realm;");
	});

	it("lets a move the Company didn't choose pass a Barrier, as Unconstrained Movement does", () => {
		expect(read("module/canvas/realm-hooks.js")).toContain("movement?.constrainOptions?.ignoreWalls || forcedMove(operation)");
	});
});
