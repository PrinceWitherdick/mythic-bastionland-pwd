import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { wireMapSizeFields, wireMapSizeMirror } from "../../module/apps/map-size-fields.js";
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
		this.dataset = {};
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

	getAttribute(name) {
		return this.attributes[name] ?? null;
	}
}

/**
 * The New Realm dialog for a traced Realm, as far as the fields reach into it.
 * @param {object} [options]
 * @param {string} [options.src] The picture already chosen.
 * @param {Function} [options.enlarge] Opens the map larger.
 */
function fakeDialog({ src = "", enlarge } = {}) {
	const node = (props) => new FakeNode(props);
	const nodes = {
		'input[name="layout"]': [...REALM_LAYOUTS, BARE_MAP].map((value) => node({ value, checked: value === BOOK_LAYOUT })),
		"[data-map-field]": [node({ value: src })],
		'[name="setup.cols"]': [node({ value: "12", disabled: true, max: "30" })],
		'[name="setup.rows"]': [node({ value: "12", disabled: true, max: "30" })],
		"[data-map-mode]": ["drawn", "bare", "drawn", "bare"].map((mode) => node({ dataset: { mapMode: mode }, hidden: mode === "bare" })),
		"[data-map-shape]": ["wide", "tall"].map((shape) => node({ dataset: { mapShape: shape }, hidden: true })),
		"[data-map-size-preview]": [node({ hidden: true })],
		"[data-map-size-picture]": [node({ naturalWidth: 0, naturalHeight: 0 })],
		"[data-map-size-hexes]": [node()],
		"[data-map-size-outside]": [node()],
		"[data-map-size-halo]": [node()],
		"[data-map-size-lines]": [node()],
		"[data-map-size-step]": [node({ hidden: true })],
		"[data-map-size-fewer]": [node()],
		"[data-map-size-more]": [node()],
		"[data-map-size-count]": [node({ dataset: { format: "{cols} by {rows}, {hexes} hexes" }, textContent: "" })],
		"[data-map-size-waiting]": [node()],
		"[data-map-size-broken]": [node({ hidden: true })],
		// The map itself, and the button beside Fewer and More hexes.
		"[data-map-size-enlarge]": [node(), node()]
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
		loaded: (width, height) => Object.assign(one("[data-map-size-picture]"), { naturalWidth: width, naturalHeight: height }).fire("load"),
		/** The GM typing a number into one side. */
		type: (side, value) => {
			const input = one(`[name="setup.${side}"]`);
			input.value = value;
			input.fire("input");
		},
		size: () => ({ cols: one('[name="setup.cols"]').value, rows: one('[name="setup.rows"]').value }),
		/** The lines shown, by the kind of map they speak of. */
		shown: (selector, key) => nodes[selector].filter((line) => !line.hidden).map((line) => line.dataset[key])
	};
	dialog.controls = wireMapSizeFields(dialog.element, { enlarge });
	return dialog;
}

/** The map seen larger, as far as wireMapSizeMirror reaches into it. */
function fakeWindow() {
	const node = (props) => new FakeNode(props);
	const nodes = {
		"[data-map-size-big-preview]": [node({ hidden: true })],
		"[data-map-size-big-picture]": [node()],
		"[data-map-size-big-hexes]": [node()],
		"[data-map-size-big-outside]": [node()],
		"[data-map-size-big-halo]": [node()],
		"[data-map-size-big-lines]": [node()],
		'[data-map-size-big-side="cols"]': [node()],
		'[data-map-size-big-side="rows"]': [node()],
		"[data-map-size-big-fewer]": [node()],
		"[data-map-size-big-more]": [node()],
		"[data-map-size-big-count]": [node({ textContent: "" })],
		"[data-map-mode]": ["drawn", "bare"].map((mode) => node({ dataset: { mapMode: mode }, hidden: mode === "bare" }))
	};
	const one = (selector) => nodes[selector][0];
	return {
		one,
		element: { querySelectorAll: (selector) => nodes[selector] ?? [], querySelector: (selector) => nodes[selector]?.[0] ?? null },
		/** The GM typing a number into one side, there. */
		type: (side, value) => {
			const input = one(`[data-map-size-big-side="${side}"]`);
			input.value = value;
			input.fire("input");
		},
		size: () => ({ cols: one('[data-map-size-big-side="cols"]').value, rows: one('[data-map-size-big-side="rows"]').value })
	};
}

describe("the New Realm Map size page for a map of the GM's own", () => {
	it("unlocks the map's size for a map with hexes on it, without ignoring the rules", () => {
		const { one, shown } = fakeDialog();
		expect(one('[name="setup.cols"]').disabled).toBe(false);
		expect(one('[name="setup.rows"]').disabled).toBe(false);
		// Or the browser refuses a long side when the dialog is sent.
		expect(one('[name="setup.cols"]').max).toBe("60");
		expect(shown("[data-map-mode]", "mapMode")).toEqual(["drawn", "drawn"]);
		// No picture yet: the line asking for one shows instead.
		expect(one("[data-map-size-preview]").hidden).toBe(true);
		expect(one("[data-map-size-waiting]").hidden).toBe(false);
	});

	it("keeps the book's 12 by 12 for a hexed map of about the book's shape, and draws them over it", () => {
		const { one, loaded, size, shown } = fakeDialog({ src: "maps/sheet.webp" });
		loaded(1709, 2000);
		expect(size()).toEqual({ cols: "12", rows: "12" });
		expect(one("[data-map-size-lines]").attributes.d.match(/M/g)).toHaveLength(12 * 12);
		expect(one("[data-map-size-preview]").hidden).toBe(false);
		expect(shown("[data-map-shape]", "mapShape")).toEqual([]);
	});

	it("suggests a size for a wide hexed map, and says so on the Import map page", () => {
		const { one, loaded, size, shown } = fakeDialog({ src: "maps/wide.webp" });
		expect(one("[data-map-size-picture]").attributes.src).toBe("maps/wide.webp");
		loaded(3840, 2160);
		expect(size()).toEqual({ cols: "17", rows: "8" });
		expect(shown("[data-map-shape]", "mapShape")).toEqual(["wide"]);
		expect(one("[data-map-size-hexes]").attributes.viewBox).toBe("0 0 3840 2160");
		expect(one("[data-map-size-preview]").style.get("--bastionland-map-aspect")).toBe(String(3840 / 2160));
	});

	it("says a tall map is tall", () => {
		const { loaded, shown } = fakeDialog({ src: "maps/tall.webp" });
		loaded(2160, 3840);
		expect(shown("[data-map-shape]", "mapShape")).toEqual(["tall"]);
	});

	it("keeps both hexed sides once the GM has counted them, though they're not the picture's shape", () => {
		const { loaded, type, size } = fakeDialog({ src: "maps/wide.webp" });
		loaded(3840, 2160);
		type("cols", "20");
		expect(size()).toEqual({ cols: "20", rows: "9" });
		type("rows", "14");
		expect(size()).toEqual({ cols: "20", rows: "14" });
		type("cols", "22");
		expect(size()).toEqual({ cols: "22", rows: "14" });
	});

	it("lays the overlay out as the hexes on the map are", () => {
		const { one, choose, loaded, size } = fakeDialog({ src: "maps/wide.webp" });
		loaded(3840, 2160);
		choose("evenRows");
		expect(size()).toEqual({ cols: "14", rows: "9" });
		expect(one("[data-map-size-lines]").attributes.d.match(/M/g)).toHaveLength(14 * 9);
	});

	it("follows the picture's shape with the side the GM didn't set when the map has no hexes on it", () => {
		const { one, choose, loaded, type, size, shown } = fakeDialog({ src: "maps/wide.webp" });
		choose(BARE_MAP);
		loaded(3840, 2160);
		expect(shown("[data-map-mode]", "mapMode")).toEqual(["bare", "bare"]);
		// Already told on the cards that its size is chosen on the Map size page.
		expect(shown("[data-map-shape]", "mapShape")).toEqual([]);
		expect(size()).toEqual({ cols: "17", rows: "8" });
		expect(one("[data-map-size-outside]").attributes.d).not.toBe("");
		type("cols", "20");
		expect(size()).toEqual({ cols: "20", rows: "9" });
		type("rows", "10");
		expect(size()).toEqual({ cols: "21", rows: "10" });
		type("cols", "20");

		const field = one("[data-map-field]");
		field.value = "maps/sheet.webp";
		field.fire("change");
		expect(one("[data-map-size-picture]").attributes.src).toBe("maps/sheet.webp");
		loaded(1709, 2000);
		expect(size()).toEqual({ cols: "20", rows: "20" });
	});

	it("gives more hexes or fewer in the map's shape at a click, once the picture has loaded", () => {
		const { one, choose, loaded, type, size } = fakeDialog({ src: "maps/wide.webp" });
		expect(one("[data-map-size-step]").hidden).toBe(true);
		choose(BARE_MAP);
		loaded(3840, 2160);
		expect(one("[data-map-size-step]").hidden).toBe(false);
		expect(one("[data-map-size-count]").textContent).toBe("17 by 8, 136 hexes");
		one("[data-map-size-more]").fire("click");
		expect(size()).toEqual({ cols: "18", rows: "8" });
		one("[data-map-size-more]").fire("click");
		expect(size()).toEqual({ cols: "19", rows: "9" });
		expect(one("[data-map-size-count]").textContent).toBe("19 by 9, 171 hexes");
		expect(one("[data-map-size-lines]").attributes.d.match(/M/g)).toHaveLength(19 * 9);
		one("[data-map-size-fewer]").fire("click");
		expect(size()).toEqual({ cols: "18", rows: "8" });
		// Typing a side afterwards still has the other follow it.
		type("cols", "20");
		expect(size()).toEqual({ cols: "20", rows: "9" });
		// Down to the smallest size, where there are no fewer.
		while (!one("[data-map-size-fewer]").disabled) one("[data-map-size-fewer]").fire("click");
		expect(size()).toEqual({ cols: "3", rows: "3" });
		expect(one("[data-map-size-more]").disabled).toBe(false);
	});

	it("keeps both stepped sides of a hexed map, as though the GM had counted them", () => {
		const { one, loaded, type, size } = fakeDialog({ src: "maps/wide.webp" });
		loaded(3840, 2160);
		type("cols", "20");
		type("rows", "14");
		one("[data-map-size-more]").fire("click");
		expect(size()).toEqual({ cols: "25", rows: "12" });
		// Both are kept: setting one doesn't move the other.
		type("cols", "26");
		expect(size()).toEqual({ cols: "26", rows: "12" });
	});

	it("shows a number out of bounds as the one used, once it's typed", () => {
		const { one, choose, loaded, type, size } = fakeDialog({ src: "maps/wide.webp" });
		choose(BARE_MAP);
		loaded(3840, 2160);
		type("cols", "99");
		one('[name="setup.cols"]').fire("change");
		// As many as a side may have, and the rows held to the hexes that leaves.
		expect(size()).toEqual({ cols: "60", rows: "15" });
	});

	it("covers a very long map with no hexes on it", () => {
		const { choose, loaded, size } = fakeDialog({ src: "maps/long.webp" });
		choose(BARE_MAP);
		loaded(12000, 1000);
		expect(size()).toEqual({ cols: "48", rows: "3" });
	});

	it("says so when the picture chosen won't load, and asks for one again once it's changed", () => {
		const { one, loaded, shown } = fakeDialog({ src: "maps/wide.webp" });
		loaded(3840, 2160);
		one("[data-map-size-picture]").fire("error");
		expect(one("[data-map-size-preview]").hidden).toBe(true);
		expect(one("[data-map-size-broken]").hidden).toBe(false);
		expect(one("[data-map-size-waiting]").hidden).toBe(true);
		expect(shown("[data-map-shape]", "mapShape")).toEqual([]);

		const field = one("[data-map-field]");
		field.value = "";
		field.fire("change");
		expect(one("[data-map-size-broken]").hidden).toBe(true);
		expect(one("[data-map-size-waiting]").hidden).toBe(false);
	});

	it("opens the map larger from the map and from the button beside the steps", () => {
		const opened = [];
		const { nodes, controls } = fakeDialog({ src: "maps/wide.webp", enlarge: (given) => opened.push(given) });
		for (const button of nodes["[data-map-size-enlarge]"]) button.fire("click");
		expect(opened).toEqual([controls, controls]);
	});

	it("shows the map larger with its hexes, its size and its count", () => {
		const { controls, loaded } = fakeDialog({ src: "maps/wide.webp" });
		loaded(3840, 2160);
		const big = fakeWindow();
		wireMapSizeMirror(big.element, controls);
		expect(big.one("[data-map-size-big-picture]").attributes.src).toBe("maps/wide.webp");
		expect(big.one("[data-map-size-big-preview]").hidden).toBe(false);
		expect(big.one("[data-map-size-big-preview]").style.get("--bastionland-map-aspect")).toBe(String(3840 / 2160));
		expect(big.one("[data-map-size-big-hexes]").attributes.viewBox).toBe("0 0 3840 2160");
		expect(big.one("[data-map-size-big-lines]").attributes.d.match(/M/g)).toHaveLength(17 * 8);
		expect(big.size()).toEqual({ cols: "17", rows: "8" });
		expect(big.one('[data-map-size-big-side="cols"]').max).toBe("60");
		expect(big.one("[data-map-size-big-count]").textContent).toBe("17 by 8, 136 hexes");
		expect(big.one("[data-map-size-big-fewer]").disabled).toBe(false);
	});

	it("sets the page's size from the larger window, as typing on the page does", () => {
		const { controls, choose, loaded, size } = fakeDialog({ src: "maps/wide.webp" });
		choose(BARE_MAP);
		loaded(3840, 2160);
		const big = fakeWindow();
		wireMapSizeMirror(big.element, controls);
		expect(big.one('[data-map-mode]').hidden).toBe(true);
		big.type("cols", "20");
		// The rows follow the picture's shape, there and on the page.
		expect(size()).toEqual({ cols: "20", rows: "9" });
		expect(big.size()).toEqual({ cols: "20", rows: "9" });
		big.one("[data-map-size-big-more]").fire("click");
		expect(size()).toEqual({ cols: "21", rows: "10" });
		expect(big.one("[data-map-size-big-count]").textContent).toBe("21 by 10, 210 hexes");
		big.type("cols", "99");
		big.one('[data-map-size-big-side="cols"]').fire("change");
		expect(size()).toEqual({ cols: "60", rows: "15" });
		expect(big.size()).toEqual({ cols: "60", rows: "15" });
	});

	it("follows the page while it's open, and stops once it's closed", () => {
		const { controls, loaded, type } = fakeDialog({ src: "maps/wide.webp" });
		loaded(3840, 2160);
		const big = fakeWindow();
		const stop = wireMapSizeMirror(big.element, controls);
		type("cols", "20");
		expect(big.size()).toEqual({ cols: "20", rows: "9" });
		stop();
		type("cols", "22");
		expect(big.size()).toEqual({ cols: "20", rows: "9" });
	});

	it("finds every part it wires up in the larger window", () => {
		const template = readFileSync(join(root, "templates/dialogs/map-size-window.hbs"), "utf8");
		for (const name of ["preview", "picture", "hexes", "outside", "halo", "lines", "fewer", "more", "count"]) {
			expect(template).toContain(`data-map-size-big-${name}`);
		}
		for (const value of ['data-map-size-big-side="cols"', 'data-map-size-big-side="rows"', 'data-map-mode="drawn"', 'data-map-mode="bare"']) expect(template).toContain(value);
	});

	it("finds every part it wires up in the New Realm dialog", () => {
		const template = readFileSync(join(root, "templates/dialogs/new-realm.hbs"), "utf8");
		const picker = readFileSync(join(root, "templates/dialogs/parts/realm-picture.hbs"), "utf8");
		for (const name of ["map-size-preview", "map-size-picture", "map-size-hexes", "map-size-outside", "map-size-halo", "map-size-lines", "map-size-waiting", "map-size-broken", "map-size-step", "map-size-fewer", "map-size-more", "map-size-count", "map-size-enlarge"]) {
			expect(template).toContain(`data-${name}`);
		}
		for (const value of ['data-map-mode="drawn"', 'data-map-mode="bare"', 'data-map-shape="wide"', 'data-map-shape="tall"']) expect(template).toContain(value);
		expect(picker).toContain('name="layout"');
		expect(picker).toContain("data-map-field");
	});

	it("leaves Ignore the rules out of a Realm made from the GM's own map", () => {
		const template = readFileSync(join(root, "templates/dialogs/new-realm.hbs"), "utf8");
		const traced = template.slice(template.indexOf('data-rail-page="setup"'), template.indexOf("{{else}}", template.indexOf('data-rail-page="setup"')));
		expect(traced).not.toContain("data-setup-ignore");
	});
});
