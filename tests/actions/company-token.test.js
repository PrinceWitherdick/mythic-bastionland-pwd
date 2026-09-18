import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCompanyHex } from "../../module/actions/company.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { hexTopLeft, realmGeometry } from "../../module/rules/realm-geometry.js";
import { SYSTEM_ID } from "../../module/system-id.js";

const g = realmGeometry();

/** A Scene that is a Realm of the standard size, holding the Tokens given. */
const realmScene = (tokens = []) => ({
	flags: { [SYSTEM_ID]: { [REALM_FLAG]: { size: g.size, cols: g.cols, rows: g.rows } } },
	tokens,
	createEmbeddedDocuments: vi.fn(async (_type, [data]) => [data])
});

/** A Token already standing for the Company. */
const companyToken = () => ({
	getFlag: (scope, key) => scope === SYSTEM_ID && key === "company",
	update: vi.fn(async () => {})
});

beforeEach(() => {
	globalThis.game = { user: { isGM: true } };
	globalThis.CONST = { TOKEN_DISPOSITIONS: { FRIENDLY: 1 } };
});

afterEach(() => {
	delete globalThis.game;
	delete globalThis.CONST;
});

describe("setCompanyHex", () => {
	// A 1x1 Token on a columnar hex grid is as wide as the hex, which is wider
	// than the grid size, so half the grid size is not half the Token.
	const hex = { col: 4, row: 3 };
	const corner = hexTopLeft(g, hex);

	it("stands a new Company Token on the hex's own corner, not half a grid square from its centre", async () => {
		const scene = realmScene();
		const made = await setCompanyHex(scene, hex, { img: "company.webp", name: "The Company" });
		expect(made).toMatchObject({ x: Math.round(corner.x), y: Math.round(corner.y), width: 1, height: 1 });
		expect(made.x).not.toBe(Math.round(g.radius * (1.5 * (hex.col - 1) + 1) - (g.size / 2)));
		expect(scene.createEmbeddedDocuments).toHaveBeenCalledWith("Token", [made]);
	});

	it("carries the picture chosen with the Realm when the Referee places the Company later", async () => {
		const scene = { ...realmScene(), getFlag: (scope, key) => (scope === SYSTEM_ID && key === "companyImg" ? "banner.webp" : undefined) };
		const made = await setCompanyHex(scene, hex, { name: "The Company" });
		expect(made.texture.src).toBe("banner.webp");
	});

	it("moves the Token already standing to the same corner", async () => {
		const standing = companyToken();
		const scene = realmScene([standing]);
		await expect(setCompanyHex(scene, hex)).resolves.toBe(standing);
		expect(standing.update).toHaveBeenCalledWith({ x: Math.round(corner.x), y: Math.round(corner.y) });
		expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("leaves Scenes that aren't Realms, hexless calls and players alone", async () => {
		await expect(setCompanyHex({ flags: {} }, hex)).resolves.toBeNull();
		await expect(setCompanyHex(realmScene(), null)).resolves.toBeNull();
		globalThis.game.user.isGM = false;
		await expect(setCompanyHex(realmScene(), hex)).resolves.toBeNull();
	});
});
