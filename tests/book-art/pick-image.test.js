import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Foundry's FilePicker quietly stays shut for a user without the Browse File
 * Explorer permission, which plain Players lack. So the picture buttons are
 * hidden from them, and a picker asked for anyway says why it won't open.
 */

/** What the arms window answers, and the window it draws, to run its render on. */
let answer;
let drawn;

vi.mock("../../module/apps/ui.js", () => ({
	inputDialog: vi.fn(async (options) => {
		options.render?.(null, { element: drawn });
		return answer;
	})
}));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/actions/knights.js", () => ({ seenOrChosen: () => () => true, worldKnights: () => [] }));

const { pickImageInto } = await import("../../module/book-art/files.js");
const { chooseDomainArms } = await import("../../module/actions/domain-arms.js");

const root = join(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8");

/** Whether this user may browse files, and the pickers opened. */
let browse;
let opened;

/**
 * @returns {object} The arms window as far as its render reads it: a picture choice that can be taken out.
 */
function armsWindow() {
	const label = { remove: vi.fn() };
	const picture = { closest: () => label };
	return { label, querySelector: (selector) => (selector.includes("picture") ? picture : null) };
}

const domain = (arms = "ruler") => ({ name: "Ashford", img: "a.webp", system: { arms, armsKnight: "" }, update: vi.fn() });

beforeEach(() => {
	browse = false;
	opened = [];
	answer = null;
	drawn = armsWindow();
	globalThis.game = { user: { can: (permission) => permission === "FILES_BROWSE" && browse }, i18n: { lang: "en" } };
	globalThis.ui = { notifications: { warn: vi.fn() } };
	globalThis.foundry = {
		utils: { getProperty: (object, key) => object[key] },
		applications: { apps: { FilePicker: { implementation: class {
			constructor(options) {
				opened.push(options);
			}

			render() {
				return this;
			}
		} } } }
	};
});

afterEach(() => {
	for (const key of ["game", "ui", "foundry"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("pickImageInto", () => {
	it("says why no picker opens for a user who may not browse files", () => {
		expect(pickImageInto({ img: "a.webp" })).toBeNull();
		expect(opened).toEqual([]);
		expect(ui.notifications.warn).toHaveBeenCalledWith("bastionland.portrait.cantBrowse", { localize: true });
	});

	it("opens the picker for one who may", () => {
		browse = true;
		expect(pickImageInto({ img: "a.webp" })).not.toBeNull();
		expect(opened).toHaveLength(1);
	});
});

describe("a Domain's arms", () => {
	it("doesn't offer a new picture to a user who may not browse files", async () => {
		await chooseDomainArms(domain());
		expect(drawn.label.remove).toHaveBeenCalled();
	});

	it("keeps a picture already shown, for them to keep but not change", async () => {
		answer = { arms: "picture" };
		const shown = domain("picture");
		await chooseDomainArms(shown);
		expect(drawn.label.remove).not.toHaveBeenCalled();
		expect(opened).toEqual([]);
		expect(shown.update).not.toHaveBeenCalled();
	});

	it("offers it to one who may", async () => {
		browse = true;
		answer = { arms: "picture" };
		await chooseDomainArms(domain());
		expect(drawn.label.remove).not.toHaveBeenCalled();
		expect(opened).toHaveLength(1);
	});
});

describe("the sheets' picture buttons", () => {
	it("open only for whoever may choose a picture, not every editor", () => {
		const knight = read("templates/actor/knight-sheet.hbs");
		expect(knight).toContain('{{#if (or hasArt canPickImage)}}data-action="openPortrait"');
		expect(knight).toContain("{{#if (or system.seerImg canPickImage)}}");
		expect(knight).toContain('{{#if canPickImage}}data-action="pickSeerImage"');
		expect(read("templates/actor/squire-sheet.hbs")).toContain('{{#if (or hasArt canPickImage)}}data-action="openPortrait"');
		expect(read("module/sheets/BastionlandActorSheet.js")).toMatch(/canPickImage: this\.isEditable && canBrowseFiles\(\)/);
		expect(read("module/apps/ArtPopout.js")).toMatch(/canBrowseFiles\(\) \? \[\{ action: "changePicture"/);
	});
});
