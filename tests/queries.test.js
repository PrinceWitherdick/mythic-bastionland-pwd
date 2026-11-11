import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const root = join(import.meta.dirname, "..");

describe("registerQuery", () => {
	beforeEach(() => {
		vi.resetModules();
		globalThis.CONFIG = { queries: {} };
	});

	it("wraps what's registered before the wrapper and after it, and leaves alone what the wrapper does", async () => {
		const { registerQuery, wrapQueries } = await import("../module/queries.js");
		const early = () => "early";
		const kept = () => "kept";
		registerQuery("early", early);
		CONFIG.queries.core = kept;
		const wrap = vi.fn((name, handler) => (name === "core" ? handler : Object.assign(() => handler(), { wrapped: name })));
		wrapQueries(wrap);
		registerQuery("late", () => "late");
		expect(CONFIG.queries.early.wrapped).toBe("early");
		expect(CONFIG.queries.early()).toBe("early");
		expect(CONFIG.queries.core).toBe(kept);
		expect(CONFIG.queries.late.wrapped).toBe("late");
	});

	it("is the one way the system's modules register a query", () => {
		const files = readdirSync(join(root, "module"), { recursive: true })
			.map((path) => path.split(sep).join("/"))
			.filter((path) => path.endsWith(".js") && path !== "queries.js");
		const direct = files.filter((path) => /CONFIG\.queries\[[^\]]+\]\s*(\?\?)?=(?!=)/.test(readFileSync(join(root, "module", path), "utf8")));
		expect(direct).toEqual([]);
	});
});
