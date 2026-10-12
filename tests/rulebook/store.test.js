import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import {
	KEPT_RULEBOOK,
	fetchRulebook,
	findKeptRulebook,
	forgetRulebook,
	foundRulebook,
	registerRulebookSettings,
	rulebookPath,
	saveRulebookPath,
	wasRulebookForgotten
} from "../../module/rulebook/store.js";

let settings;

/** @param {boolean} there Whether another world's copy is on the server. */
function installServer(there) {
	globalThis.fetch = vi.fn(async (url, { method } = {}) => ({
		ok: there && url === `/${KEPT_RULEBOOK}`,
		blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
		method
	}));
}

beforeEach(() => {
	settings = {};
	globalThis.Hooks = { callAll: vi.fn() };
	globalThis.foundry = { utils: { getRoute: (path) => `/${path}` } };
	globalThis.game = {
		settings: {
			register: (_namespace, key, config) => { settings[key] = config.default; },
			get: (namespace, key) => (namespace === SYSTEM_ID ? settings[key] : undefined),
			set: vi.fn(async (_namespace, key, value) => { settings[key] = value; })
		}
	};
	registerRulebookSettings();
});

afterEach(() => {
	for (const key of ["game", "foundry", "Hooks", "fetch"]) delete globalThis[key];
});

describe("findKeptRulebook", () => {
	it("points a world with no book at the copy another world kept, and leaves its import pending", async () => {
		installServer(true);
		await expect(findKeptRulebook()).resolves.toBe(true);
		expect(rulebookPath()).toBe(KEPT_RULEBOOK);
		expect(foundRulebook()).toBe("pending");
		expect(fetch).toHaveBeenCalledWith(`/${KEPT_RULEBOOK}`, expect.objectContaining({ method: "HEAD" }));
	});

	it("finds nothing when no world has kept one", async () => {
		installServer(false);
		await expect(findKeptRulebook()).resolves.toBe(false);
		expect(rulebookPath()).toBe("");
		expect(foundRulebook()).toBe("");
	});

	it("leaves a world already pointed at a book as it is", async () => {
		installServer(true);
		settings.rulebookPdf = "elsewhere/book.pdf";
		await expect(findKeptRulebook()).resolves.toBe(false);
		expect(rulebookPath()).toBe("elsewhere/book.pdf");
		expect(foundRulebook()).toBe("");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("doesn't take up again a book the GM sent away with Forget", async () => {
		installServer(true);
		settings.rulebookPdf = KEPT_RULEBOOK;
		await forgetRulebook();
		expect(rulebookPath()).toBe("");
		expect(wasRulebookForgotten()).toBe(true);
		await expect(findKeptRulebook()).resolves.toBe(false);
		expect(rulebookPath()).toBe("");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("stops waiting to import a found book the GM sent away", async () => {
		installServer(true);
		await expect(findKeptRulebook()).resolves.toBe(true);
		expect(foundRulebook()).toBe("pending");
		await forgetRulebook();
		expect(foundRulebook()).toBe("");
	});

	it("doesn't take up a book sent away by a Forget from before Forget was remembered", async () => {
		installServer(true);
		game.settings.storage = new Map([["world", { getSetting: (key) => (key === `${SYSTEM_ID}.rulebookPdf` ? { key, value: "\"\"" } : undefined) }]]);
		expect(wasRulebookForgotten()).toBe(true);
		await expect(findKeptRulebook()).resolves.toBe(false);
		expect(rulebookPath()).toBe("");
	});

	it("takes up the kept book in a world that never saved a path", async () => {
		installServer(true);
		game.settings.storage = new Map([["world", { getSetting: () => undefined }]]);
		await expect(findKeptRulebook()).resolves.toBe(true);
	});

	it("stops waiting on a found book once the GM chooses one of their own", async () => {
		installServer(true);
		await expect(findKeptRulebook()).resolves.toBe(true);
		await saveRulebookPath("elsewhere/book.pdf");
		expect(foundRulebook()).toBe("");
	});

	it("takes it up again once the GM chooses a book after a Forget", async () => {
		await forgetRulebook();
		await saveRulebookPath("elsewhere/book.pdf");
		expect(wasRulebookForgotten()).toBe(false);
	});
});

describe("fetchRulebook", () => {
	it("fetches the world's copy back as a PDF file", async () => {
		installServer(true);
		settings.rulebookPdf = KEPT_RULEBOOK;
		const file = await fetchRulebook();
		expect(file).toBeInstanceOf(File);
		expect(file.type).toBe("application/pdf");
	});

	it("gives nothing when the world has no copy or it's gone", async () => {
		installServer(false);
		expect(await fetchRulebook()).toBeNull();
		settings.rulebookPdf = KEPT_RULEBOOK;
		expect(await fetchRulebook()).toBeNull();
	});
});
