import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ART_INDEX_HOOK, artIndexWritten, loadArtIndex, registerArtIndexStamp } from "../../module/book-art/art-index.js";

/** The index file as the server holds it, how often it's been asked for, and how often read. */
const server = { index: null, fetches: 0, reads: 0 };
let settings;
let user;

beforeEach(() => {
	server.index = { version: 1 };
	server.fetches = 0;
	server.reads = 0;
	settings = new Map();
	user = { isGM: true };
	vi.stubGlobal("fetch", vi.fn(async () => {
		server.fetches++;
		const index = server.index;
		// The server tags each version of the file, as Foundry's does.
		const headers = { get: (name) => (name === "etag" && index ? `W/"${index.version}"` : null) };
		return {
			ok: Boolean(index),
			headers,
			json: async () => {
				server.reads++;
				return structuredClone(index);
			}
		};
	}));
	vi.stubGlobal("foundry", { utils: { getRoute: (path) => `/${path}` } });
	vi.stubGlobal("Hooks", { callAll: vi.fn() });
	vi.stubGlobal("game", {
		get user() {
			return user;
		},
		settings: {
			register: (_scope, key, config) => settings.set(key, { config, value: config.default }),
			// A world setting changes on every client, this one included.
			set: async (_scope, key, value) => {
				const kept = settings.get(key);
				kept.value = value;
				kept.config.onChange?.(value);
				return value;
			}
		}
	});
	registerArtIndexStamp();
});

afterEach(async () => {
	// The next test starts with nothing kept.
	await artIndexWritten();
	vi.unstubAllGlobals();
});

describe("loadArtIndex", () => {
	it("shares one read among callers at once, and the copy it kept while the file is unchanged", async () => {
		const [first, second] = await Promise.all([loadArtIndex(), loadArtIndex()]);
		expect(second).toBe(first);
		expect(server.fetches).toBe(1);
		expect(await loadArtIndex()).toBe(first);
		expect(server.fetches).toBe(2);
		expect(server.reads).toBe(1);
	});

	it("finds an index written in another world, which stamps nothing here", async () => {
		await loadArtIndex();
		server.index = { version: 5 };
		expect(await loadArtIndex()).toEqual({ version: 5 });
		expect(server.reads).toBe(2);
	});

	it("asks again while there's no index to read, so an import elsewhere is found", async () => {
		server.index = null;
		expect(await loadArtIndex()).toBeNull();
		server.index = { version: 2 };
		expect(await loadArtIndex()).toEqual({ version: 2 });
		expect(server.fetches).toBe(2);
	});

	it("reads the new index on every client once a GM stamps the world", async () => {
		await loadArtIndex();
		server.index = { version: 3 };
		await artIndexWritten();
		expect(Hooks.callAll).toHaveBeenCalledWith(ART_INDEX_HOOK);
		expect(await loadArtIndex()).toEqual({ version: 3 });
		expect(server.fetches).toBe(2);
	});

	it("lets a player who wrote the index read it afresh, without stamping the world", async () => {
		user = { isGM: false };
		await loadArtIndex();
		server.index = { version: 4 };
		await artIndexWritten();
		expect(settings.get("artIndexStamp").value).toBe(0);
		expect(Hooks.callAll).toHaveBeenCalledWith(ART_INDEX_HOOK);
		expect(await loadArtIndex()).toEqual({ version: 4 });
	});
});
