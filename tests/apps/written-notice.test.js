import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/apps/TravelsPlaces.js", () => ({ openHex: vi.fn() }));

const { addWrittenNotice } = await import("../../module/apps/written-notice.js");
const { openHex } = await import("../../module/apps/TravelsPlaces.js");

/** Just enough of an element for the notice to be built and read back. */
function element(tag) {
	const listeners = {};
	return {
		tag,
		className: "",
		textContent: "",
		children: [],
		attributes: {},
		append(...nodes) {
			this.children.push(...nodes);
		},
		prepend(...nodes) {
			this.children.unshift(...nodes);
		},
		setAttribute(name, value) {
			this.attributes[name] = value;
		},
		addEventListener(type, listener) {
			listeners[type] = listener;
		},
		click() {
			listeners.click?.({ preventDefault: () => {} });
		},
		querySelector: () => null
	};
}

/** @returns {object[]} Every element under one, depth first. */
const within = (node) => (typeof node === "object" ? [node, ...node.children.flatMap(within)] : []);

const realm = { id: "realm" };

/** A page sheet as it shows a page of an entry with these flags. */
function sheet(entryFlags, role, { isView = true, isOwner = true } = {}) {
	const content = element("section");
	const root = element("div");
	root.querySelector = (selector) => (selector === ".journal-page-content" ? content : null);
	return {
		sheet: {
			isView,
			document: {
				isOwner,
				parent: { flags: { [SYSTEM_ID]: entryFlags } },
				getFlag: (scope, key) => (scope === SYSTEM_ID && key === "role" ? role : undefined)
			}
		},
		root,
		content
	};
}

beforeEach(() => {
	globalThis.document = { createElement: element };
	globalThis.game = { user: { isGM: true }, scenes: { get: (id) => (id === realm.id ? realm : undefined) } };
});

afterEach(() => {
	delete globalThis.document;
	delete globalThis.game;
	vi.clearAllMocks();
});

describe("addWrittenNotice", () => {
	const hexFlags = { hexJournal: { scene: "realm", hex: "5,7", open: false } };

	it("opens a hex's written page with the notice and a GM's button to the hex in Places", () => {
		const { sheet: page, root, content } = sheet(hexFlags, "known");
		addWrittenNotice(page, root);
		const [notice] = content.children;
		expect(notice.className).toBe("secret bastionland-written-notice");
		expect(within(notice).some((node) => node.textContent === "hexJournal.writtenOver")).toBe(true);
		const button = within(notice).find((node) => node.className === "bastionland-lay-link");
		button.click();
		expect(openHex).toHaveBeenCalledWith({ scene: realm, hex: { col: 5, row: 7 } });
	});

	it("gives a player who owns the page the notice alone", () => {
		game.user.isGM = false;
		const { sheet: page, root, content } = sheet(hexFlags, "known");
		addWrittenNotice(page, root);
		expect(within(content.children[0]).some((node) => node.className === "bastionland-lay-link")).toBe(false);
	});

	it("gives the GM's What's Here page the notice too, now that it copies the hex's note", () => {
		const { sheet: page, root, content } = sheet(hexFlags, "notes");
		addWrittenNotice(page, root);
		expect(within(content.children[0]).some((node) => node.textContent === "hexJournal.writtenOver")).toBe(true);
	});

	it("sets a Site's written pages its own notice", () => {
		const { sheet: page, root, content } = sheet({ siteJournal: { site: "s1" } }, "found");
		addWrittenNotice(page, root);
		expect(within(content.children[0]).some((node) => node.textContent === "siteJournal.writtenOver")).toBe(true);
	});

	it("leaves a Site's Notes page, other entries, the page's editor, and those who can't edit it", () => {
		const cases = [
			sheet({ siteJournal: { site: "s1" } }, "notes"),
			sheet({}, "known"),
			sheet(hexFlags, "known", { isView: false }),
			sheet(hexFlags, "known", { isOwner: false })
		];
		for (const { sheet: page, root, content } of cases) {
			addWrittenNotice(page, root);
			expect(content.children).toEqual([]);
		}
	});
});
