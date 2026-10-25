import Handlebars from "handlebars";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MYTH_NOTES_FLAG, getMythNotes } from "../../module/actions/myth-notes.js";
import {
	activateOmenScene,
	droppedScene,
	linkOmenScene,
	omenSceneChips,
	omenSceneIds,
	unlinkOmenScene,
	viewOmenScene
} from "../../module/actions/omen-scenes.js";
import { OWN_MYTH_FLAG } from "../../module/actions/own-myths.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const root = join(import.meta.dirname, "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

class ForcedDeletion {}
class ForcedReplacement {
	static create(value) {
		return Object.assign(new ForcedReplacement(), { value });
	}
}

const wyvern = { number: 3, d6: 1, d12: 5 };
const written = { number: 2, d6: null, d12: null, own: "j1" };

/** A Realm Scene whose updates land on its own flags, as Foundry's would. */
function realmScene() {
	const scene = {
		flags: { [SYSTEM_ID]: { [REALM_FLAG]: { size: 160, cols: 12, rows: 12 } } },
		getFlag: (scope, key) => scene.flags[scope]?.[key],
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) {
				const parts = path.split(".").slice(2);
				let node = scene.flags[SYSTEM_ID];
				for (const part of parts.slice(0, -1)) node = node[part] ??= {};
				if (value instanceof ForcedDeletion) delete node[parts.at(-1)];
				else node[parts.at(-1)] = structuredClone(value instanceof ForcedReplacement ? value.value : value);
			}
		})
	};
	return scene;
}

/** A Scene of the world's, which activates and views by spy. */
const worldScene = (id, name, extra = {}) => ({ id, name, activate: vi.fn(), view: vi.fn(), ...extra });

let scenes;
let entry;

beforeEach(() => {
	scenes = new Map([["s1", worldScene("s1", "The Ferry")], ["s2", worldScene("s2", "The Bell Tower")]]);
	entry = {
		id: "j1",
		flags: { [SYSTEM_ID]: { [OWN_MYTH_FLAG]: { omens: ["One"] } } },
		update: vi.fn(async (changes) => {
			entry.flags[SYSTEM_ID][OWN_MYTH_FLAG].scenes = changes[`flags.${SYSTEM_ID}.${OWN_MYTH_FLAG}.scenes`];
		})
	};
	globalThis.game = {
		user: { isGM: true },
		scenes,
		journal: new Map([["j1", entry]]),
		i18n: { localize: (key) => key, format: (key) => key }
	};
	globalThis.foundry = { data: { operators: { ForcedDeletion, ForcedReplacement } } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.foundry;
	delete globalThis.ui;
	delete globalThis.fromUuid;
});

describe("linking a Scene to an Omen", () => {
	it("keeps a book Myth's with its notes on the Realm, and takes it off again", async () => {
		const realm = realmScene();
		await linkOmenScene(realm, wyvern, 2, scenes.get("s1"));
		await linkOmenScene(realm, wyvern, 2, scenes.get("s2"));
		expect(omenSceneIds(realm, wyvern)[1]).toEqual(["s1", "s2"]);
		await unlinkOmenScene(realm, wyvern, 2, "s1");
		expect(omenSceneIds(realm, wyvern)[1]).toEqual(["s2"]);
		// Once the last goes, nothing is kept for the Myth at all.
		await unlinkOmenScene(realm, wyvern, 2, "s2");
		expect(getMythNotes(realm).myths).toEqual({});
		expect(realm.getFlag(SYSTEM_ID, MYTH_NOTES_FLAG).myths).toEqual({});
	});

	it("writes a note holding Scenes over whole, so an Omen whose last Scene went keeps none", async () => {
		const realm = realmScene();
		await linkOmenScene(realm, wyvern, 1, scenes.get("s1"));
		await linkOmenScene(realm, wyvern, 4, scenes.get("s2"));
		await unlinkOmenScene(realm, wyvern, 1, "s1");
		expect(realm.update.mock.calls.at(-1)[0][`flags.${SYSTEM_ID}.${MYTH_NOTES_FLAG}.myths.3`]).toBeInstanceOf(ForcedReplacement);
		expect(realm.getFlag(SYSTEM_ID, MYTH_NOTES_FLAG).myths[3].scenes).toEqual({ 4: ["s2"] });
	});

	it("keeps a written Myth's on its own entry, so they go wherever it's used", async () => {
		const realm = realmScene();
		await linkOmenScene(realm, written, 6, scenes.get("s2"));
		expect(entry.update).toHaveBeenCalledWith({ [`flags.${SYSTEM_ID}.${OWN_MYTH_FLAG}.scenes`]: [[], [], [], [], [], ["s2"]] });
		expect(omenSceneIds(realm, written)[5]).toEqual(["s2"]);
		expect(realm.update).not.toHaveBeenCalled();
	});

	it("writes nothing for a Scene already linked, or for a player", async () => {
		const realm = realmScene();
		await linkOmenScene(realm, wyvern, 2, scenes.get("s1"));
		await expect(linkOmenScene(realm, wyvern, 2, scenes.get("s1"))).resolves.toBe(false);
		game.user.isGM = false;
		await expect(linkOmenScene(realm, wyvern, 3, scenes.get("s2"))).resolves.toBe(false);
		expect(realm.update).toHaveBeenCalledTimes(1);
	});

	it("keeps both of two links made at once, for a book Myth and a written one", async () => {
		const realm = realmScene();
		await Promise.all([linkOmenScene(realm, wyvern, 2, scenes.get("s1")), linkOmenScene(realm, wyvern, 2, scenes.get("s2"))]);
		expect(omenSceneIds(realm, wyvern)[1]).toEqual(["s1", "s2"]);
		await Promise.all([linkOmenScene(realm, written, 1, scenes.get("s1")), linkOmenScene(realm, written, 3, scenes.get("s2"))]);
		expect(omenSceneIds(realm, written)[0]).toEqual(["s1"]);
		expect(omenSceneIds(realm, written)[2]).toEqual(["s2"]);
	});

	it("drops a Scene deleted since it was linked on the next change", async () => {
		const realm = realmScene();
		await linkOmenScene(realm, wyvern, 2, scenes.get("s1"));
		scenes.delete("s1");
		await linkOmenScene(realm, wyvern, 3, scenes.get("s2"));
		expect(omenSceneIds(realm, wyvern)[1]).toEqual([]);
		expect(omenSceneIds(realm, wyvern)[2]).toEqual(["s2"]);
	});
});

describe("showing and activating linked Scenes", () => {
	it("names the Scenes the world still has, and leaves out one since deleted", () => {
		expect(omenSceneChips(["s1", "gone", "s2"])).toEqual([{ id: "s1", name: "The Ferry" }, { id: "s2", name: "The Bell Tower" }]);
		expect(omenSceneChips(undefined)).toEqual([]);
	});

	it("activates one for everyone, or views it for the Referee alone", () => {
		activateOmenScene("s1");
		viewOmenScene("s2");
		expect(scenes.get("s1").activate).toHaveBeenCalled();
		expect(scenes.get("s2").view).toHaveBeenCalled();
		expect(scenes.get("s1").view).not.toHaveBeenCalled();
	});

	it("says so for a Scene no longer in the world, and lets only a GM activate", () => {
		expect(activateOmenScene("gone")).toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.omenScenes.gone");
		game.user.isGM = false;
		expect(activateOmenScene("s1")).toBeNull();
		expect(scenes.get("s1").activate).not.toHaveBeenCalled();
	});
});

describe("a Scene dropped on an Omen", () => {
	const drag = (data) => {
		globalThis.foundry.applications = { ux: { TextEditor: { implementation: { getDragEventData: () => data } } } };
		return { preventDefault: vi.fn(), stopPropagation: vi.fn() };
	};

	it("takes the drop at once and gives the world Scene", async () => {
		globalThis.fromUuid = vi.fn(async () => scenes.get("s1"));
		const event = drag({ type: "Scene", uuid: "Scene.s1" });
		await expect(droppedScene(event)).resolves.toBe(scenes.get("s1"));
		expect(event.preventDefault).toHaveBeenCalled();
	});

	it("turns away anything else, and a compendium's Scene with word to import it", async () => {
		globalThis.fromUuid = vi.fn(async () => worldScene("c1", "Packed", { pack: "world.scenes" }));
		const other = drag({ type: "Actor", uuid: "Actor.a1" });
		await expect(droppedScene(other)).resolves.toBeNull();
		expect(other.preventDefault).not.toHaveBeenCalled();
		await expect(droppedScene(drag({ type: "Scene", uuid: "Compendium.world.scenes.Scene.c1" }))).resolves.toBeNull();
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.omenScenes.fromCompendium");
	});
});

describe("where linked Scenes are offered", () => {
	const toolkit = read("module/sheets/GmToolkitSheet.js");
	const myths = read("templates/actor/gm-toolkit/myths.hbs");
	const card = read("templates/chat/wilderness.hbs");

	it("shows each Omen's Scenes on its row in the GM Toolkit, a Scene dropped there linking it", () => {
		expect(toolkit).toContain("scenes: omenSceneChips(linked[index])");
		expect(toolkit).toMatch(/async _onDropDocument\(event, document\) \{\s*if \(document\?\.documentName !== "Scene"\) return super\._onDropDocument\(event, document\);/);
		expect(toolkit).toContain("await linkOmenScene(this.scene, myth, omen, document);");
		expect(myths).toContain('{{> "bastionland.omen-scenes" activate=true editable=true}}');
	});

	it("doesn't mark the Omen for a click that misses a Scene's buttons, the list being inside its row", () => {
		expect(toolkit).toContain('if (event.target?.closest?.(".bastionland-omen-scenes")) return;');
	});

	it("writes a written Myth's Scenes in turn with its sheet's saves", () => {
		const sheet = read("module/apps/OwnMythSheet.js");
		expect(sheet).toContain("return ownMythWrites(this.document.id);");
		expect(read("module/actions/own-myths.js")).toContain("return ownMythWrites(entry.id)(async () => {");
	});

	it("draws one list for both: activate and view in the Toolkit, view alone in a written Myth's sheet, a cross where it can be changed", () => {
		const hb = Handlebars.create();
		hb.registerHelper("localize", (key) => key);
		const list = hb.compile(read("templates/apps/parts/omen-scenes.hbs"));
		const scenes = [{ id: "s1", name: "The Ferry" }];
		const actions = (html) => [...html.matchAll(/data-action="(\w+)"/g)].map(([, action]) => action);
		expect(actions(list({ scenes, activate: true, editable: true }))).toEqual(["activateOmenScene", "viewOmenScene", "unlinkOmenScene"]);
		expect(actions(list({ scenes, editable: true }))).toEqual(["viewOmenScene", "unlinkOmenScene"]);
		expect(actions(list({ scenes, editable: false }))).toEqual(["viewOmenScene"]);
		expect(list({ scenes: [], activate: true, editable: true }).trim()).toBe("");
		expect(read("mythic-bastionland.js")).toContain('"bastionland.omen-scenes": templatePath("apps/parts/omen-scenes.hbs"),');
	});

	it("strikes through a met Omen's words only, not its Scenes", () => {
		expect(read("styles/gm-toolkit.css")).toContain(".bastionland-gm-toolkit__omen.is-past .bastionland-gm-toolkit__omen-text > p {");
	});

	it("puts a button for each on the Wilderness card that shows the Omen, for the Referee alone", () => {
		expect(card).toContain('<button type="button" data-omen-scene="{{id}}">');
		expect(read("module/actions/wilderness.js")).toContain("scenes: outcome.complete ? [] : omenSceneChips(omenSceneIds(scene, outcome.myth, { entry })[outcome.omen - 1])");
		expect(read("module/actions/omen-scenes.js")).toMatch(/selector: "\[data-omen-scene\]",\s*gmOnly: true,/);
		expect(read("mythic-bastionland.js")).toContain("registerOmenSceneCards();");
	});
});
