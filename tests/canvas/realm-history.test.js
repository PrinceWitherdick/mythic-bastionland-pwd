import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hooks = readFileSync(join(import.meta.dirname, "../..", "module/canvas/realm-hooks.js"), "utf8");

describe("the Realm's Undo and Redo buttons", () => {
	it("are drawn again after an Undo that writes nothing, even while a change to the hexes alone waits to be shown", () => {
		const hook = hooks.slice(hooks.indexOf("Hooks.on(REALM_HISTORY_HOOK"));
		expect(hook).toMatch(/^Hooks\.on\(REALM_HISTORY_HOOK, \(sceneId\) => \{\s+if \(historyShownLater\(sceneId\)\) return;/);
		for (const refresh of ["refreshRealmPanel(sceneId)", "refreshRealmDrawing(sceneId)"]) expect(hook.slice(0, hook.indexOf("});"))).toContain(refresh);
		// A change still to be shown draws the palette and Creating a Realm again only when it's more than the hexes'.
		const shownLater = hooks.slice(hooks.indexOf("function historyShownLater("));
		// One rule says so, for the redraw itself and for the wait on it.
		expect(hooks).toContain('const redrawsPalette = (kind) => kind !== "hex";');
		expect(shownLater.slice(0, shownLater.indexOf("\n}"))).toContain("return Boolean(pending) && redrawsPalette(pending.kind);");
		const show = hooks.slice(hooks.indexOf("function showChanges("));
		expect(show).toMatch(/if \(redrawsPalette\(kind\)\) \{\s+refreshRealmPanel\(sceneId\);\s+refreshRealmDrawing\(sceneId\);/);
	});
});
