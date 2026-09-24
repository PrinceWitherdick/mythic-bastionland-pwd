import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../module/system-id.js";

let settings;

/** The document root, as far as the settings touch it. */
function fakeRoot() {
	const classes = new Set();
	const properties = new Map();
	return {
		classes,
		properties,
		classList: { toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name) },
		style: {
			setProperty: (name, value) => properties.set(name, value),
			getPropertyValue: (name) => properties.get(name) ?? ""
		}
	};
}

let root;
let saved;

beforeEach(async () => {
	vi.resetModules();
	root = fakeRoot();
	saved = {};
	globalThis.document = { documentElement: root, querySelectorAll: () => [] };
	globalThis.game = {
		settings: {
			register: vi.fn(),
			get: vi.fn((_namespace, key) => {
				if (!(key in saved)) throw new Error(`${key} is not registered`);
				return saved[key];
			})
		}
	};
	settings = await import("../module/client-settings.js");
});

afterEach(() => {
	delete globalThis.document;
	delete globalThis.game;
});

/** @returns {Record<string, object>} Each registration made, by key. */
const registrations = () => Object.fromEntries(game.settings.register.mock.calls.map(([namespace, key, config]) => {
	expect(namespace).toBe(SYSTEM_ID);
	return [key, config];
}));

describe("registerClientSettings", () => {
	it("registers each person's own settings, shown in Foundry's settings window", () => {
		settings.registerClientSettings();
		const registered = registrations();
		expect(Object.keys(registered)).toEqual(["textSize", "contrast", "typeface", "noItalics", "reduceMotion", "keywordTips", "artPreviews"]);
		for (const config of Object.values(registered)) expect(config).toMatchObject({ scope: "client", config: true });
		expect(registered.textSize).toMatchObject({ type: Number, range: settings.TEXT_SIZE_RANGE, default: 1 });
		expect(Object.keys(registered.typeface.choices)).toEqual([...settings.TYPEFACES]);
		expect(registered.typeface.default).toBe("book");
		expect(Object.keys(registered.contrast.choices)).toEqual(["normal", "high"]);
		expect(registered.artPreviews.default).toBe(true);
	});

	it("leaves the page as drawn while nothing has been chosen", () => {
		settings.registerClientSettings();
		expect(root.properties.get("--bastionland-text-size")).toBe("1");
		expect([...root.classes]).toEqual([]);
	});

	it("applies what was chosen before, so the first window drawn has it", () => {
		Object.assign(saved, { textSize: 1.25, contrast: "high", typeface: "serif", noItalics: true, reduceMotion: true });
		settings.registerClientSettings();
		expect(root.properties.get("--bastionland-text-size")).toBe("1.25");
		expect([...root.classes].sort()).toEqual(["bastionland-high-contrast", "bastionland-no-italics", "bastionland-reduce-motion", "bastionland-typeface-serif"]);
	});

	it("applies a change at once", () => {
		settings.registerClientSettings();
		const registered = registrations();
		registered.textSize.onChange(1.4);
		expect(root.properties.get("--bastionland-text-size")).toBe("1.4");
		registered.contrast.onChange("high");
		expect(root.classes.has("bastionland-high-contrast")).toBe(true);
		registered.contrast.onChange("normal");
		expect(root.classes.has("bastionland-high-contrast")).toBe(false);
		expect(registered.artPreviews.onChange).toBeUndefined();
	});

	it("labels each choice from the language file", () => {
		settings.registerClientSettings();
		expect(registrations().typeface.choices).toEqual({
			book: "bastionland.settings.typeface.book",
			serif: "bastionland.settings.typeface.serif",
			signika: "bastionland.settings.typeface.signika"
		});
		expect(registrations().noItalics).toMatchObject({ name: "bastionland.settings.noItalics.name", hint: "bastionland.settings.noItalics.hint" });
	});

	it("takes the rule words' bold away while their popups are off, without drawing a window again", () => {
		saved.keywordTips = false;
		settings.registerClientSettings();
		expect(root.classes.has("bastionland-no-keyword-tips")).toBe(true);
		registrations().keywordTips.onChange(true);
		expect(root.classes.has("bastionland-no-keyword-tips")).toBe(false);
	});
});

describe("applyTextSize", () => {
	it("calls the hook and reads the same size back, for what's placed in pixels rather than zoomed", () => {
		const called = [];
		globalThis.Hooks = { callAll: (name, value) => called.push([name, value]) };
		settings.applyTextSize(1.3);
		expect(called).toEqual([[`${SYSTEM_ID}.textSizeChanged`, 1.3]]);
		expect(settings.textSizeScale()).toBe(1.3);
		delete globalThis.Hooks;
	});

	it("is the size the sheets were drawn at until one is chosen, and holds a size past the ends of the range in", () => {
		expect(settings.textSizeScale()).toBe(1);
		settings.applyTextSize(9);
		expect(settings.textSizeScale()).toBe(settings.TEXT_SIZE_RANGE.max);
	});
});

describe("applyTypeface", () => {
	it("marks one typeface at a time, and none for the book's own", () => {
		settings.applyTypeface("signika");
		expect([...root.classes]).toEqual(["bastionland-typeface-signika"]);
		settings.applyTypeface("serif");
		expect([...root.classes]).toEqual(["bastionland-typeface-serif"]);
		settings.applyTypeface("book");
		expect([...root.classes]).toEqual([]);
		settings.applyTypeface("comic");
		expect([...root.classes]).toEqual([]);
	});
});

describe("textScale", () => {
	it("keeps Text Size within its range", () => {
		expect(settings.textScale(1.2)).toBe(1.2);
		expect(settings.textScale(5)).toBe(1.4);
		expect(settings.textScale(0.1)).toBe(0.9);
		expect(settings.textScale("nonsense")).toBe(1);
	});
});

describe("reading a setting while it can't be read", () => {
	it("shows art previews and keeps motion until told otherwise", () => {
		expect(settings.showsArtPreviews()).toBe(true);
		expect(settings.reducesMotion()).toBe(false);
		Object.assign(saved, { artPreviews: false, reduceMotion: true });
		expect(settings.showsArtPreviews()).toBe(false);
		expect(settings.reducesMotion()).toBe(true);
	});
});
