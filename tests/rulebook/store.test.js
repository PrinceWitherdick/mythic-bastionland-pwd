import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { KEPT_RULEBOOK, fetchRulebook, findKeptRulebook, foundRulebook, registerRulebookSettings, rulebookPath } from "../../module/rulebook/store.js";

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
	it("points a new world at the copy another world kept, and leaves its import pending", async () => {
		installServer(true);
		await findKeptRulebook(() => true);
		expect(rulebookPath()).toBe(KEPT_RULEBOOK);
		expect(foundRulebook()).toBe("pending");
		expect(fetch).toHaveBeenCalledWith(`/${KEPT_RULEBOOK}`, expect.objectContaining({ method: "HEAD" }));
	});

	it("finds nothing when no world has kept one", async () => {
		installServer(false);
		await findKeptRulebook(() => true);
		expect(rulebookPath()).toBe("");
		expect(foundRulebook()).toBe("");
	});

	it("leaves a world already in play, or one already pointed at a book, as it is", async () => {
		installServer(true);
		await findKeptRulebook(() => false);
		expect(rulebookPath()).toBe("");

		settings.rulebookPdf = "elsewhere/book.pdf";
		await findKeptRulebook(() => true);
		expect(rulebookPath()).toBe("elsewhere/book.pdf");
		expect(foundRulebook()).toBe("");
		expect(fetch).not.toHaveBeenCalled();
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
