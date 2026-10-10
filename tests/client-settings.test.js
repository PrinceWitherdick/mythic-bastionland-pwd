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
		expect(Object.keys(registered)).toEqual(["textSize", "contrast", "colourScheme", "typeface", "noItalics", "reduceMotion", "keywordTips", "artPreviews"]);
		for (const config of Object.values(registered)) expect(config).toMatchObject({ scope: "client", config: true });
		expect(registered.textSize).toMatchObject({ type: Number, range: settings.TEXT_SIZE_RANGE, default: 1 });
		expect(Object.keys(registered.typeface.choices)).toEqual([...settings.TYPEFACES]);
		expect(registered.typeface.default).toBe("book");
		expect(Object.keys(registered.contrast.choices)).toEqual(["normal", "high"]);
		expect(Object.keys(registered.colourScheme.choices)).toEqual(["parchment", "lamplit", "midnight", "ashen", "auto"]);
		expect(registered.colourScheme.default).toBe("parchment");
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

describe("applyColourScheme", () => {
	const dark = () => [...root.classes].filter((name) => name === "bastionland-dark" || name.startsWith("bastionland-scheme-")).sort();

	it("marks a dark scheme, with Lamplit as the dark base and the others drawn over it", () => {
		settings.applyColourScheme("lamplit");
		expect(dark()).toEqual(["bastionland-dark"]);
		settings.applyColourScheme("midnight");
		expect(dark()).toEqual(["bastionland-dark", "bastionland-scheme-midnight"]);
		settings.applyColourScheme("ashen");
		expect(dark()).toEqual(["bastionland-dark", "bastionland-scheme-ashen"]);
		settings.applyColourScheme("parchment");
		expect(dark()).toEqual([]);
	});

	it("reads an unknown scheme as parchment", () => {
		settings.applyColourScheme("midnight");
		settings.applyColourScheme("neon");
		expect(dark()).toEqual([]);
	});

	it("leaves High Contrast to its own setting, so either scheme can have it", () => {
		settings.applyContrast("high");
		settings.applyColourScheme("ashen");
		expect(root.classes.has("bastionland-high-contrast")).toBe(true);
		settings.applyColourScheme("parchment");
		expect(root.classes.has("bastionland-high-contrast")).toBe(true);
	});

	it("follows Foundry's windows: its own choice first, then the browser's while that's left at the default", () => {
		saved.colourScheme = "auto";
		const uiConfig = { colorScheme: { applications: "dark" } };
		game.settings.get.mockImplementation((namespace, key) => (namespace === "core" ? uiConfig : saved[key]));
		let browserDark = false;
		globalThis.matchMedia = () => ({ matches: browserDark });
		try {
			settings.applyColourScheme("auto");
			expect(dark()).toEqual(["bastionland-dark"]);
			uiConfig.colorScheme.applications = "light";
			settings.applyColourScheme("auto");
			expect(dark()).toEqual([]);
			uiConfig.colorScheme.applications = "";
			browserDark = true;
			settings.applyColourScheme("auto");
			expect(dark()).toEqual(["bastionland-dark"]);
		} finally {
			delete globalThis.matchMedia;
		}
	});

	it("turns with Foundry's interface setting while following it, and not otherwise", () => {
		const hooks = {};
		globalThis.Hooks = { on: (name, fn) => (hooks[name] = fn), callAll: () => {} };
		const uiConfig = { colorScheme: { applications: "light" } };
		game.settings.get.mockImplementation((namespace, key) => {
			if (namespace === "core") return uiConfig;
			if (!(key in saved)) throw new Error(`${key} is not registered`);
			return saved[key];
		});
		try {
			saved.colourScheme = "auto";
			settings.registerClientSettings();
			expect(dark()).toEqual([]);
			uiConfig.colorScheme.applications = "dark";
			hooks.clientSettingChanged("core.uiConfig");
			expect(dark()).toEqual(["bastionland-dark"]);
			saved.colourScheme = "midnight";
			settings.applyColourScheme("midnight");
			uiConfig.colorScheme.applications = "light";
			hooks.clientSettingChanged("core.uiConfig");
			expect(dark()).toEqual(["bastionland-dark", "bastionland-scheme-midnight"]);
		} finally {
			delete globalThis.Hooks;
		}
	});
});
