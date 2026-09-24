import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPANY_LAST_HEX_FLAG, lastCompanyHex, rememberCompany, setCompanyHex, standCompanyAgain } from "../../module/actions/company.js";
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
const companyToken = (at = { x: 0, y: 0 }) => ({
	getFlag: (scope, key) => scope === SYSTEM_ID && key === "company",
	getCenterPoint: () => at,
	texture: { src: "systems/mythic-bastionland-pwd/assets/icons/company/cavalry.svg" },
	update: vi.fn(async () => {})
});

/** A Realm that answers for its flags, so what it was told to keep can be read back. */
function rememberingScene(tokens = []) {
	const scene = realmScene(tokens);
	scene.flags[SYSTEM_ID] = { ...scene.flags[SYSTEM_ID] };
	scene.getFlag = (scope, key) => (scope === SYSTEM_ID ? scene.flags[SYSTEM_ID][key] : undefined);
	scene.update = vi.fn(async (changes) => {
		for (const [path, value] of Object.entries(changes)) scene.flags[SYSTEM_ID][path.split(".").pop()] = value;
	});
	return scene;
}

beforeEach(() => {
	globalThis.game = { user: { isGM: true }, i18n: { localize: (key) => key, format: (key) => key } };
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

describe("a Company Token deleted", () => {
	const hex = { col: 4, row: 3 };
	const centre = { x: hexTopLeft(g, hex).x + g.size / 2, y: hexTopLeft(g, hex).y + g.size / 2 };

	it("leaves the Realm remembering where they stood and what they carried", async () => {
		const scene = rememberingScene();
		const token = companyToken(centre);
		await rememberCompany(scene, token);
		expect(lastCompanyHex(scene)).toEqual(hex);
		expect(scene.getFlag(SYSTEM_ID, "companyImg")).toBe(token.texture.src);
	});

	it("puts them back in that hex, carrying the same picture", async () => {
		const scene = rememberingScene();
		await rememberCompany(scene, companyToken(centre));
		const back = await standCompanyAgain(scene);
		expect(back).toMatchObject({ texture: { src: "systems/mythic-bastionland-pwd/assets/icons/company/cavalry.svg" } });
		expect(back).toMatchObject({ x: Math.round(hexTopLeft(g, hex).x), y: Math.round(hexTopLeft(g, hex).y) });
	});

	it("puts nobody back while the Company still stands on the Realm", async () => {
		const scene = rememberingScene([companyToken(centre)]);
		scene.flags[SYSTEM_ID][COMPANY_LAST_HEX_FLAG] = hex;
		await expect(standCompanyAgain(scene)).resolves.toBeNull();
		expect(scene.createEmbeddedDocuments).not.toHaveBeenCalled();
	});

	it("has nowhere to put them back when the Realm was never told", async () => {
		await expect(standCompanyAgain(rememberingScene())).resolves.toBeNull();
	});

	it("keeps a player from writing to the Realm, and from putting them back", async () => {
		globalThis.game.user.isGM = false;
		const scene = rememberingScene();
		await rememberCompany(scene, companyToken(centre));
		expect(scene.update).not.toHaveBeenCalled();
		await expect(standCompanyAgain(scene)).resolves.toBeNull();
	});
});

describe("the card the GMs are whispered", () => {
	it("offers a way back, and says who may take it", () => {
		const source = readFileSync(join(import.meta.dirname, "../../module/chat/company-lost.js"), "utf8");
		// Only the GM keeping the world posts, so one card arrives however many are logged in.
		expect(source).toContain("game.users.activeGM?.isSelf");
		// And only a GM's click puts them back.
		expect(source).toContain("game.user.isGM");
		expect(source).toContain("standCompanyAgain");
		const card = readFileSync(join(import.meta.dirname, "../../templates/chat/company-lost.hbs"), "utf8");
		expect(card).toContain("data-company-restore=\"{{scene}}\"");
		// Nowhere to put them back: the card says they've gone and offers nothing.
		expect(card).toContain("{{#if restorable}}");
	});

	it("is joined by the Company here button on every hex they aren't standing in", () => {
		const hexCard = readFileSync(join(import.meta.dirname, "../../templates/actor/gm-toolkit/hex-card.hbs"), "utf8");
		expect(hexCard).toContain('data-action="standCompany"');
		expect(hexCard).toContain("{{#unless companyHere}}");
	});
});
