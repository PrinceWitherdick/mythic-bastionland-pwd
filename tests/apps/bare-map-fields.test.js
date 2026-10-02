import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { wireBareMapFields } from "../../module/apps/bare-map-fields.js";
import { BARE_MAP } from "../../module/rules/realm-map.js";
import { BOOK_LAYOUT, REALM_LAYOUTS } from "../../module/rules/realm-geometry.js";

const root = join(import.meta.dirname, "../..");

/** Just enough of an element for the fields to read, write and listen to. */
class FakeNode {
	constructor(props = {}) {
		this.hidden = false;
		this.disabled = false;
		this.checked = false;
		this.value = "";
		this.attributes = {};
		this.listeners = {};
		const style = {};
		this.style = { setProperty: (name, value) => { style[name] = value; }, get: (name) => style[name] };
		Object.assign(this, props);
	}

	addEventListener(type, handler) {
		(this.listeners[type] ??= []).push(handler);
	}

	dispatchEvent(event) {
		for (const handler of this.listeners[event.type] ?? []) handler(event);
		return true;
	}

	fire(type) {
		this.dispatchEvent(new Event(type));
	}

	setAttribute(name, value) {
		this.attributes[name] = String(value);
	}

	removeAttribute(name) {
		delete this.attributes[name];
	}
}

/**
 * The New Realm dialog for a traced Realm, as far as the fields reach into it.
 * @param {object} [options]
 * @param {string} [options.src] The picture already chosen.
 */
function fakeDialog({ src = "" } = {}) {
	const node = (props) => new FakeNode(props);
	const nodes = {
		"[data-bare-map]": [node({ hidden: true }), node({ hidden: true })],
		"[data-setup-rules]": [node(), node(), node()],
		'input[name="layout"]': [...REALM_LAYOUTS, BARE_MAP].map((value) => node({ value, checked: value === BOOK_LAYOUT })),
		"[data-map-field]": [node({ value: src })],
		"[data-setup-ignore]": [node()],
		'[name="setup.cols"]': [node({ value: "12", disabled: true, max: "30" })],
		'[name="setup.rows"]': [node({ value: "12", disabled: true, max: "30" })],
		"[data-bare-preview]": [node({ hidden: true })],
		"[data-bare-picture]": [node({ naturalWidth: 0, naturalHeight: 0 })],
		"[data-bare-hexes]": [node()],
		"[data-bare-outside]": [node()],
		"[data-bare-halo]": [node()],
		"[data-bare-lines]": [node()],
		"[data-bare-waiting]": [node()],
		"[data-bare-broken]": [node({ hidden: true })]
	};
	const one = (selector) => nodes[selector][0];
	const dialog = {
		nodes,
		one,
		element: { querySelectorAll: (selector) => nodes[selector] ?? [], querySelector: (selector) => nodes[selector]?.[0] ?? null },
		/** Pick one of the cards on the Import map page. */
		choose: (value) => {
			for (const radio of nodes['input[name="layout"]']) radio.checked = radio.value === value;
			nodes['input[name="layout"]'].find((radio) => radio.value === value).fire("change");
		},
		/** The picture finishing loading, at its own size. */
		loaded: (width, height) => Object.assign(one("[data-bare-picture]"), { naturalWidth: width, naturalHeight: height }).fire("load"),
		/** The GM typing a number into one side. */
		type: (side, value) => {
			const input = one(`[name="setup.${side}"]`);
			input.value = value;
			input.fire("input");
		},
		size: () => ({ cols: one('[name="setup.cols"]').value, rows: one('[name="setup.rows"]').value })
	};
	wireBareMapFields(dialog.element);
	return dialog;
}

describe("the New Realm fields for a map with no hexes on it", () => {
	it("stay put away while the map is said to have hexes", () => {
		const { nodes, one, loaded, size } = fakeDialog({ src: "maps/wide.webp" });
		loaded(3840, 2160);
		expect(nodes["[data-bare-map]"].every((part) => part.hidden)).toBe(true);
		expect(nodes["[data-setup-rules]"].some((part) => part.hidden)).toBe(false);
		expect(one("[data-bare-preview]").hidden).toBe(true);
		expect(size()).toEqual({ cols: "12", rows: "12" });
		expect(one('[name="setup.cols"]').disabled).toBe(true);
	});

	it("put the rules for setup away and unlock the map's size, without ignoring the rules", () => {
		const { nodes, one, choose } = fakeDialog();
		choose(BARE_MAP);
		expect(nodes["[data-bare-map]"].every((part) => !part.hidden)).toBe(true);
		expect(nodes["[data-setup-rules]"].every((part) => part.hidden)).toBe(true);
		// Disabled, so the tick isn't sent with the rest.
		expect(one("[data-setup-ignore]").disabled).toBe(true);
		expect(one('[name="setup.cols"]').disabled).toBe(false);
		expect(one('[name="setup.rows"]').disabled).toBe(false);
		// No picture yet: the line asking for one shows instead.
		expect(one("[data-bare-preview]").hidden).toBe(true);
		expect(one("[data-bare-waiting]").hidden).toBe(false);
	});

	it("suggest a size from the picture's shape and draw the hexes over it", () => {
		const { one, choose, loaded, size } = fakeDialog({ src: "maps/wide.webp" });
		expect(one("[data-bare-picture]").attributes.src).toBe("maps/wide.webp");
		choose(BARE_MAP);
		loaded(3840, 2160);
		expect(size()).toEqual({ cols: "17", rows: "8" });
		expect(one("[data-bare-hexes]").attributes.viewBox).toBe("0 0 3840 2160");
		expect(one("[data-bare-lines]").attributes.d.match(/M/g)).toHaveLength(17 * 8);
		expect(one("[data-bare-halo]").attributes.d).toBe(one("[data-bare-lines]").attributes.d);
		expect(one("[data-bare-outside]").attributes.d).not.toBe("");
		expect(one("[data-bare-preview]").hidden).toBe(false);
		expect(one("[data-bare-preview]").style.get("--bastionland-bare-aspect")).toBe(String(3840 / 2160));
		expect(one("[data-bare-waiting]").hidden).toBe(true);
	});

	it("follow the picture's shape with the side the GM didn't set, and keep the one they did for a new picture", () => {
		const { one, choose, loaded, type, size } = fakeDialog({ src: "maps/wide.webp" });
		choose(BARE_MAP);
		loaded(3840, 2160);
		type("cols", "20");
		expect(size()).toEqual({ cols: "20", rows: "9" });
		type("rows", "10");
		expect(size()).toEqual({ cols: "21", rows: "10" });
		type("cols", "20");

		const field = one("[data-map-field]");
		field.value = "maps/sheet.webp";
		field.fire("change");
		expect(one("[data-bare-picture]").attributes.src).toBe("maps/sheet.webp");
		loaded(1709, 2000);
		expect(size()).toEqual({ cols: "20", rows: "20" });
	});

	it("show a number out of bounds as the one used, once it's typed", () => {
		const { one, choose, loaded, type, size } = fakeDialog({ src: "maps/wide.webp" });
		choose(BARE_MAP);
		loaded(3840, 2160);
		type("cols", "99");
		one('[name="setup.cols"]').fire("change");
		// As many as a side may have, and the rows held to the hexes that leaves.
		expect(size()).toEqual({ cols: "60", rows: "15" });
	});

	it("let a side run further while the map has no hexes on it, and hold it back again after", () => {
		const { one, choose, loaded, size } = fakeDialog({ src: "maps/long.webp" });
		choose(BARE_MAP);
		expect(one('[name="setup.cols"]').max).toBe("60");
		expect(one('[name="setup.rows"]').max).toBe("60");
		loaded(12000, 1000);
		expect(size()).toEqual({ cols: "48", rows: "3" });
		choose(BOOK_LAYOUT);
		expect(one('[name="setup.cols"]').max).toBe("30");
		expect(size()).toEqual({ cols: "12", rows: "12" });
	});

	it("say so when the picture chosen won't load, and ask for one again once it's changed", () => {
		const { one, choose, loaded } = fakeDialog({ src: "maps/wide.webp" });
		choose(BARE_MAP);
		loaded(3840, 2160);
		one("[data-bare-picture]").fire("error");
		expect(one("[data-bare-preview]").hidden).toBe(true);
		expect(one("[data-bare-broken]").hidden).toBe(false);
		expect(one("[data-bare-waiting]").hidden).toBe(true);

		const field = one("[data-map-field]");
		field.value = "";
		field.fire("input");
		expect(one("[data-bare-broken]").hidden).toBe(true);
		expect(one("[data-bare-waiting]").hidden).toBe(false);
	});

	it("hand the size back to the setup fields when the map has hexes after all", () => {
		const { nodes, one, choose, loaded } = fakeDialog({ src: "maps/wide.webp" });
		const ignored = vi.fn();
		one("[data-setup-ignore]").addEventListener("change", ignored);
		choose(BARE_MAP);
		loaded(3840, 2160);
		choose("oddRows");
		expect(nodes["[data-bare-map]"].every((part) => part.hidden)).toBe(true);
		expect(nodes["[data-setup-rules]"].every((part) => !part.hidden)).toBe(true);
		expect(one("[data-setup-ignore]").disabled).toBe(false);
		// The setup fields hear of it, and put the book's numbers back unless the rules are ignored.
		expect(ignored).toHaveBeenCalledOnce();
	});

	it("give back the size the GM set with the rules ignored, when the map has hexes after all", () => {
		const { one, choose, loaded, size } = fakeDialog({ src: "maps/wide.webp" });
		Object.assign(one('[name="setup.cols"]'), { value: "10", disabled: false });
		Object.assign(one('[name="setup.rows"]'), { value: "7", disabled: false });
		choose(BARE_MAP);
		loaded(3840, 2160);
		expect(size()).toEqual({ cols: "17", rows: "8" });
		choose("evenRows");
		expect(size()).toEqual({ cols: "10", rows: "7" });
		// Choosing another layout with hexes leaves them be.
		choose("oddRows");
		expect(size()).toEqual({ cols: "10", rows: "7" });
	});

	it("find every part they wire up in the New Realm dialog", () => {
		const template = readFileSync(join(root, "templates/dialogs/new-realm.hbs"), "utf8");
		const picker = readFileSync(join(root, "templates/dialogs/parts/realm-picture.hbs"), "utf8");
		for (const name of ["bare-map", "setup-rules", "bare-preview", "bare-picture", "bare-hexes", "bare-outside", "bare-halo", "bare-lines", "bare-waiting", "bare-broken", "setup-ignore"]) {
			expect(template).toContain(`data-${name}`);
		}
		expect(picker).toContain('name="layout"');
		expect(picker).toContain("data-map-field");
	});
});
