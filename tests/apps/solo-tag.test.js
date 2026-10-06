import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";

let kept = false;
let answer = false;
const confirmDialog = vi.fn(async () => answer);
vi.mock("../../module/actions/solo.js", () => ({ SOLO_SETTING: "soloPlay", keptFromMe: () => kept }));
vi.mock("../../module/apps/ui.js", () => ({ confirmDialog }));

const { addSoloTag, openSoloHelp } = await import("../../module/apps/solo-tag.js");

/** Just enough of an element for the tag to be built and found. */
function fakeElement(tag = "div") {
	const node = {
		tag, className: "", dataset: {}, children: [], listeners: {},
		append: (...kids) => { for (const kid of kids) kid.parent = node; node.children.push(...kids); },
		prepend: (...kids) => { for (const kid of kids) kid.parent = node; node.children.unshift(...kids); },
		remove: () => { node.parent.children = node.parent.children.filter((kid) => kid !== node); },
		addEventListener: (type, handler) => { node.listeners[type] = handler; },
		querySelector: (selector) => {
			const name = selector.slice(1);
			const find = (list) => {
				for (const kid of list) {
					if (kid.className === name || kid.id === name) return kid;
					const deeper = find(kid.children ?? []);
					if (deeper) return deeper;
				}
				return null;
			};
			return find(node.children);
		}
	};
	return node;
}

function installWorld() {
	const set = vi.fn(async () => {});
	const info = vi.fn();
	globalThis.game = { settings: { set }, i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.ui = { notifications: { info } };
	globalThis.document = { createElement: (tag) => fakeElement(tag) };
	return { set, info };
}

afterEach(() => {
	kept = false;
	answer = false;
	confirmDialog.mockClear();
	for (const key of ["game", "ui", "document"]) delete globalThis[key];
});

describe("addSoloTag", () => {
	it("tags the players list for a Referee playing alone, once however often it's drawn", () => {
		installWorld();
		kept = true;
		const list = fakeElement("aside");
		const active = fakeElement();
		active.id = "players-active";
		list.append(active);
		addSoloTag(list);
		addSoloTag(list);
		expect(active.children).toHaveLength(1);
		expect(active.children[0].className).toBe("bastionland-solo-tag");
	});

	it("leaves the list alone, and takes an old tag off, when nothing is kept from this client", () => {
		installWorld();
		kept = true;
		const list = fakeElement("aside");
		addSoloTag(list);
		kept = false;
		addSoloTag(list);
		expect(list.children).toHaveLength(0);
	});
});

describe("openSoloHelp", () => {
	it("turns solo play off when the Referee lets friends join", async () => {
		const { set, info } = installWorld();
		answer = true;
		expect(await openSoloHelp()).toBe(true);
		expect(set).toHaveBeenCalledWith(SYSTEM_ID, "soloPlay", false);
		expect(info).toHaveBeenCalledOnce();
	});

	it("keeps playing alone otherwise", async () => {
		const { set } = installWorld();
		expect(await openSoloHelp()).toBe(false);
		expect(set).not.toHaveBeenCalled();
		expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ no: expect.objectContaining({ label: "bastionland.solo.tag.keep" }) }));
	});
});
