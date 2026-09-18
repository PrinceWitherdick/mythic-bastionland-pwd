import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ASSIGNED_FLAG,
	GM_TOOLKIT_IMAGE,
	GM_TOOLKIT_TYPE,
	adoptNewToolkit,
	assignGmToolkit,
	ensureGmToolkit,
	hideToolkitType,
	keepLastToolkit,
	refuseSecondToolkit,
	speakAsTheGm
} from "../../module/actions/gm-toolkit.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/** An Actor as far as the toolkit looks at one. */
const actor = (id, type = GM_TOOLKIT_TYPE, extra = {}) => ({ id, type, pack: null, ...extra });

let created;

beforeEach(() => {
	created = [];
	globalThis.game = {
		user: { isGM: true, character: null },
		users: { activeGM: { isSelf: true } },
		// A world collection: a list that also finds by id.
		actors: Object.assign([], { get(id) { return this.find((candidate) => candidate.id === id); } }),
		documentTypes: { Actor: ["knight", "npc", GM_TOOLKIT_TYPE] },
		i18n: { localize: (key) => key, format: (key) => key }
	};
	globalThis.ui = { notifications: { warn: vi.fn() } };
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } };
	globalThis.canvas = { ready: true, tokens: { controlled: [] } };
	globalThis.foundry = {
		utils: {
			getDocumentClass: () => ({
				create: vi.fn(async (data) => {
					created.push(data);
					const made = actor("made", data.type, data);
					game.actors.push(made);
					return made;
				})
			})
		}
	};
});

afterEach(() => {
	for (const name of ["game", "ui", "CONST", "canvas", "foundry"]) delete globalThis[name];
});

describe("the toolkit's portrait", () => {
	const file = join(import.meta.dirname, "..", "..", GM_TOOLKIT_IMAGE.replace(/^systems\/[^/]+\//, ""));

	it("ships, crediting the drawing it's made from", () => {
		expect(existsSync(file)).toBe(true);
		const svg = readFileSync(file, "utf8");
		expect(svg).toContain("game-icons.net/1x1/skoll/read.html");
		expect(svg).toContain("CC BY 3.0");
	});

	it("keeps its comments to what a browser loading it as a picture will parse", () => {
		// A pair of hyphens inside an XML comment breaks the whole picture.
		const comments = [...readFileSync(file, "utf8").matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1]);
		expect(comments.length).toBeGreaterThan(0);
		for (const comment of comments) expect(comment).not.toContain("--");
	});
});

describe("refuseSecondToolkit", () => {
	it("lets the world's first toolkit be made, by a GM", () => {
		expect(refuseSecondToolkit(actor(null), { type: GM_TOOLKIT_TYPE }, {})).toBeUndefined();
	});

	it("refuses a second, whether it's made, duplicated or imported", () => {
		game.actors.push(actor("one"));
		expect(refuseSecondToolkit(actor(null), { type: GM_TOOLKIT_TYPE }, {})).toBe(false);
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.gmToolkit.onlyOne");
	});

	it("refuses one made by a player, even in a world without one", () => {
		game.user.isGM = false;
		expect(refuseSecondToolkit(actor(null), { type: GM_TOOLKIT_TYPE }, {})).toBe(false);
	});

	it("leaves every other Actor, and any toolkit in a compendium, alone", () => {
		game.actors.push(actor("one"));
		expect(refuseSecondToolkit(actor(null, "knight"), { type: "knight" }, {})).toBeUndefined();
		expect(refuseSecondToolkit(actor(null), { type: GM_TOOLKIT_TYPE }, { pack: "world.spares" })).toBeUndefined();
	});
});

describe("keepLastToolkit", () => {
	it("won't delete the world's only toolkit", () => {
		game.actors.push(actor("one"));
		expect(keepLastToolkit(game.actors[0], {})).toBe(false);
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.gmToolkit.keep");
	});

	it("deletes a spare, and keeps one when both go in one batch", () => {
		game.actors.push(actor("one"), actor("two"));
		const batch = {};
		expect(keepLastToolkit(game.actors[0], batch)).toBeUndefined();
		expect(keepLastToolkit(game.actors[1], batch)).toBe(false);
	});

	it("deletes any other Actor", () => {
		expect(keepLastToolkit(actor("k", "knight"), {})).toBeUndefined();
	});
});

describe("hideToolkitType", () => {
	/** The Create Actor dialog's type choices, as far as this reads them. */
	const dialog = (types) => {
		const options = types.map((value, index) => ({ value, selected: index === 0, remove: vi.fn(() => options.splice(options.indexOf(option(value)), 1)) }));
		const option = (value) => options.find((candidate) => candidate.value === value);
		const select = { options, selectedIndex: 0 };
		for (const each of options) each.parentElement = select;
		return {
			options,
			element: { querySelector: (selector) => (selector.includes(`option[value="${GM_TOOLKIT_TYPE}"]`) ? option(GM_TOOLKIT_TYPE) ?? null : null) }
		};
	};

	it("offers a GM the toolkit while the world has none", () => {
		const { options, element } = dialog([GM_TOOLKIT_TYPE, "knight"]);
		hideToolkitType(null, element);
		expect(options.map((option) => option.value)).toEqual([GM_TOOLKIT_TYPE, "knight"]);
	});

	it("leaves it out once the world has one, and always for players", () => {
		game.actors.push(actor("one"));
		const made = dialog(["domain", GM_TOOLKIT_TYPE, "knight"]);
		hideToolkitType(null, made.element);
		expect(made.options.map((option) => option.value)).toEqual(["domain", "knight"]);

		game.actors.length = 0;
		game.user.isGM = false;
		const player = dialog(["domain", GM_TOOLKIT_TYPE]);
		hideToolkitType(null, player.element);
		expect(player.options.map((option) => option.value)).toEqual(["domain"]);
	});

	it("leaves every other dialog alone", () => {
		expect(() => hideToolkitType(null, { querySelector: () => null })).not.toThrow();
		expect(() => hideToolkitType(null, null)).not.toThrow();
	});
});

describe("ensureGmToolkit", () => {
	it("makes the world's toolkit on the active GM's browser, hidden from players", async () => {
		const made = await ensureGmToolkit();
		expect(made.id).toBe("made");
		expect(created).toEqual([expect.objectContaining({
			type: GM_TOOLKIT_TYPE,
			img: GM_TOOLKIT_IMAGE,
			ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE }
		})]);
	});

	it("makes none when there is one, and makes only one when asked twice at once", async () => {
		await Promise.all([ensureGmToolkit(), ensureGmToolkit()]);
		await ensureGmToolkit();
		expect(created).toHaveLength(1);
	});

	it("leaves it to the active GM, and to a world that knows the type", async () => {
		game.users.activeGM.isSelf = false;
		await expect(ensureGmToolkit()).resolves.toBeNull();
		game.users.activeGM.isSelf = true;
		game.user.isGM = false;
		await expect(ensureGmToolkit()).resolves.toBeNull();
		game.user.isGM = true;
		game.documentTypes.Actor = ["knight"];
		await expect(ensureGmToolkit()).resolves.toBeNull();
		expect(created).toEqual([]);
	});
});

/**
 * This browser's User, whose character and flags change as Foundry's would.
 * @param {object} [options]
 * @param {boolean} [options.isGM]
 * @param {string|null} [options.characterId]
 */
function user({ isGM = true, characterId = null } = {}) {
	const flags = {};
	const me = {
		id: "gm",
		name: "Gamemaster",
		isGM,
		characterId,
		get character() {
			return game.actors.find((candidate) => candidate.id === me.characterId) ?? null;
		},
		getFlag: (scope, key) => flags[scope]?.[key],
		setFlag: vi.fn(async (scope, key, value) => {
			(flags[scope] ??= {})[key] = value;
		}),
		update: vi.fn(async (changes) => {
			for (const [path, value] of Object.entries(changes)) {
				if (path === "character") me.characterId = value;
				else if (path.startsWith("flags.")) {
					const [, scope, key] = path.split(".");
					(flags[scope] ??= {})[key] = value;
				}
			}
		})
	};
	return me;
}

describe("assignGmToolkit", () => {
	it("makes the toolkit a GM's character, marking it in the same write", async () => {
		game.actors.push(actor("toolkit"));
		game.user = user();
		await expect(assignGmToolkit()).resolves.toBe(game.actors[0]);
		expect(game.user.update).toHaveBeenCalledOnce();
		expect(game.user.update).toHaveBeenCalledWith({ character: "toolkit", [`flags.${SYSTEM_ID}.${ASSIGNED_FLAG}`]: true });
		expect(game.user.character.id).toBe("toolkit");
	});

	it("never gives it back to a GM who took it off", async () => {
		game.actors.push(actor("toolkit"));
		game.user = user();
		await assignGmToolkit();
		game.user.characterId = null;
		await expect(assignGmToolkit()).resolves.toBeNull();
		expect(game.user.update).toHaveBeenCalledOnce();
		expect(game.user.character).toBeNull();
	});

	it("leaves a GM their own character, and doesn't ask again once they drop it", async () => {
		game.actors.push(actor("toolkit"), actor("knight", "knight"));
		game.user = user({ characterId: "knight" });
		await expect(assignGmToolkit()).resolves.toBeNull();
		expect(game.user.character.id).toBe("knight");
		expect(game.user.setFlag).toHaveBeenCalledWith(SYSTEM_ID, ASSIGNED_FLAG, true);
		game.user.characterId = null;
		await assignGmToolkit();
		expect(game.user.update).not.toHaveBeenCalled();
	});

	it("marks nothing before the world has a toolkit, so it's given once there is one", async () => {
		game.user = user();
		await expect(assignGmToolkit()).resolves.toBeNull();
		expect(game.user.setFlag).not.toHaveBeenCalled();
		game.actors.push(actor("toolkit"));
		await assignGmToolkit();
		expect(game.user.character.id).toBe("toolkit");
	});

	it("reads a character since deleted as none", async () => {
		game.actors.push(actor("toolkit"));
		game.user = user({ characterId: "gone" });
		await assignGmToolkit();
		expect(game.user.character.id).toBe("toolkit");
	});

	it("writes once when asked twice at once, and never for players", async () => {
		game.actors.push(actor("toolkit"));
		game.user = user();
		await Promise.all([assignGmToolkit(), assignGmToolkit()]);
		expect(game.user.update).toHaveBeenCalledOnce();

		game.user = user({ isGM: false });
		await expect(assignGmToolkit()).resolves.toBeNull();
		expect(game.user.update).not.toHaveBeenCalled();
	});
});

describe("adoptNewToolkit", () => {
	it("gives a GM the toolkit as it arrives, whoever made it", async () => {
		const toolkit = actor("toolkit");
		game.actors.push(toolkit);
		game.user = user();
		await adoptNewToolkit(toolkit, {}, "another-gm");
		expect(game.user.character.id).toBe("toolkit");
	});

	it("leaves other Actors, compendium copies and players alone", () => {
		game.user = user();
		expect(adoptNewToolkit(actor("k", "knight"))).toBeUndefined();
		expect(adoptNewToolkit(actor("spare", GM_TOOLKIT_TYPE, { pack: "world.spares" }))).toBeUndefined();
		game.user = user({ isGM: false });
		expect(adoptNewToolkit(actor("toolkit"))).toBeUndefined();
	});
});

describe("speakAsTheGm", () => {
	const message = (speaker) => ({ speaker, updateSource: vi.fn() });

	beforeEach(() => {
		game.actors.push(actor("toolkit", GM_TOOLKIT_TYPE, { name: "GM Toolkit" }), actor("knight", "knight", { name: "Sir Moss" }));
		game.users = { get: (id) => (id === "gm" ? { name: "Gamemaster" } : null) };
	});

	it("signs a GM's chat with their own name rather than the toolkit's", () => {
		const sent = message({ scene: "s", actor: "toolkit", token: null, alias: "GM Toolkit" });
		speakAsTheGm(sent, {}, {}, "gm");
		expect(sent.updateSource).toHaveBeenCalledWith({ speaker: { actor: null, token: null, alias: "Gamemaster" } });
	});

	it("keeps an alias the sender chose", () => {
		const sent = message({ actor: "toolkit", alias: "A Voice in the Mist" });
		speakAsTheGm(sent, {}, {}, "gm");
		expect(sent.updateSource).toHaveBeenCalledWith({ speaker: { actor: null, token: null, alias: "A Voice in the Mist" } });
	});

	it("leaves a message spoken by anybody else alone", () => {
		for (const speaker of [{ actor: "knight", alias: "Sir Moss" }, { actor: null, alias: "Gamemaster" }, undefined]) {
			const sent = message(speaker);
			speakAsTheGm(sent, {}, {}, "gm");
			expect(sent.updateSource).not.toHaveBeenCalled();
		}
	});
});
