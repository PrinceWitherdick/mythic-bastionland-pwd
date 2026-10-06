import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hex = { col: 3, row: 4 };
const scene = { id: "s1" };
const castle = { id: "t1", hex, style: "castle", seat: true, name: "Ashford" };
let realm = { holdings: [castle], myths: [], landmarks: [] };

const domainOf = (name, holding = "", ruler = "") => ({ uuid: `Actor.${name}`, name, system: { holding, ruler }, update: vi.fn(async function (changes) {
	if ("system.holding" in changes) this.system.holding = changes["system.holding"];
	return this;
}) });
const knightOf = (id, extra = {}) => ({ id, uuid: `Actor.${id}`, name: id, system: { domain: "", isSquire: false, knightType: "", ...extra } });
const index = { knights: [{ roll: "1-01", name: "The True Knight" }, { roll: "1-02", name: "The Silk Knight" }, { roll: "1-03", name: "The Moss Knight" }] };

let knights = [];
let domains = [];
let linked = new Map();
let answer = null;
const inputDialog = vi.fn(async () => answer);
const foundDomain = vi.fn(async () => domainOf("Founded", "Scene.s1.Tile.t1"));
const create = vi.fn(async (data) => ({ ...domainOf(data.name, data.system.holding, data.system.ruler), created: data }));

vi.mock("../../module/apps/ui.js", () => ({ filterBySearch: vi.fn(), inputDialog: (...args) => inputDialog(...args) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/book-art/art-index.js", () => ({ findByRoll: (list, roll) => list?.find((entry) => entry.roll === roll) ?? null, loadArtIndex: async () => index }));
const linkKnightDomain = vi.fn();
vi.mock("../../module/actions/dominion.js", () => ({ knightDomain: (knight) => linked.get(knight) ?? null, linkKnightDomain: (...args) => linkKnightDomain(...args), worldDomains: () => domains }));
const npc = { ...knightOf("Aldric"), folder: { id: "npcs" } };
const makeNpcKnight = vi.fn(async () => npc);
vi.mock("../../module/actions/npc-knights.js", () => ({ makeNpcKnight: (...args) => makeNpcKnight(...args) }));
const createDomain = vi.fn(async (knight, { name, holding, seat }) => {
	const domain = await create({ name, type: "domain", system: { ruler: knight.name, holding, seat } });
	await linkKnightDomain(knight, domain);
	return domain;
});
vi.mock("../../module/actions/found-domain.js", () => ({ createDomain: (...args) => createDomain(...args), foundDomain: (...args) => foundDomain(...args) }));
vi.mock("../../module/actions/homecoming.js", () => ({ realmHoldings: () => [{ sceneId: "s1", holdings: realm.holdings }] }));
vi.mock("../../module/actions/knights.js", () => ({ worldKnights: (keep = () => true) => knights.filter(keep) }));
vi.mock("../../module/actions/realm.js", () => ({ getRealm: (one) => (one === scene ? { realm } : null) }));

const { grantChoices, grantHolding, rulersOf } = await import("../../module/actions/holding-ruler.js");

beforeEach(() => {
	globalThis.game = { user: { isGM: true } };
	globalThis.Actor = { implementation: { create } };
});

afterEach(() => {
	knights = [];
	domains = [];
	linked = new Map();
	answer = null;
	realm = { holdings: [castle], myths: [], landmarks: [] };
	delete globalThis.game;
	delete globalThis.Actor;
	vi.clearAllMocks();
});

describe("who rules a Holding", () => {
	it("pairs each Domain given it with its Knight", () => {
		const brand = knightOf("Brand");
		const ashford = domainOf("Ashford", "Scene.s1.Tile.t1");
		brand.system.domain = ashford.uuid;
		knights = [brand];
		domains = [ashford, domainOf("Elsewhere", "Scene.s1.Tile.t9")];
		expect(rulersOf(scene, castle)).toEqual([{ domain: ashford, knight: brand }]);
		expect(rulersOf(scene, { ...castle, id: null })).toEqual([]);
	});
});

describe("whom a Holding can be granted to", () => {
	it("puts the Knights with Domains first, then every Knight of the table, then the world's others", () => {
		const brand = knightOf("Brand", { knightType: "True" });
		const eve = knightOf("Eve", { knightType: "Silk" });
		const odd = knightOf("Odd");
		linked.set(brand, domainOf("Brand's Domain", "Scene.s1.Tile.t9"));
		const { domained, table, others } = grantChoices({ index, knights: [brand, eve, odd], domains: [], ruling: [] });
		expect(domained.map(({ value, name }) => [value, name])).toEqual([["knight:Brand", "Brand"]]);
		// The True Knight is Brand, already above; the Silk Knight is Eve, by her name; the Moss Knight is the book's alone.
		expect(table.slice(0, 2).map(({ value, name }) => [value, name])).toEqual([["knight:Eve", "Eve"], ["book:1-03", "The Moss Knight"]]);
		expect(table).toHaveLength(71);
		expect(table[2].name).toBe('chooser.unnamed {"roll":"1-04"}');
		expect(others.map(({ value }) => value)).toEqual(["knight:Odd"]);
		// With nobody ruling it, the first offered starts chosen.
		expect([...domained, ...table, ...others].filter(({ checked }) => checked).map(({ value }) => value)).toEqual(["knight:Brand"]);
	});

	it("starts on whoever rules it now, and finds a Domain already naming a Knight of the book", () => {
		const claim = domainOf("Moss Hall", "Scene.s1.Tile.t1", "The Moss Knight");
		const { table } = grantChoices({ index, knights: [], domains: [claim], ruling: [claim] });
		const moss = table.find(({ value }) => value === "book:1-03");
		expect(moss.domain).toBe(claim);
		expect(moss.checked).toBe(true);
		expect(moss.detail).toBe("hexGm.ruler.rulesHere");
	});
});

describe("granting a Holding", () => {
	it("points a Knight's Domain at it, and the Domain given it before gives it up", async () => {
		const brand = knightOf("Brand");
		const theirs = domainOf("Brand's Domain", "Scene.s1.Tile.t9");
		const before = domainOf("Old Claim", "Scene.s1.Tile.t1");
		linked.set(brand, theirs);
		knights = [brand, knightOf("Pip", { isSquire: true })];
		domains = [theirs, before];
		answer = { ruler: "knight:Brand" };
		expect(await grantHolding(scene, hex)).toBe(theirs);
		// Squires aren't offered it: they aren't knighted yet.
		const { context } = inputDialog.mock.calls[0][0];
		expect([...context.domained, ...context.others].map(({ value }) => value)).toEqual(["knight:Brand"]);
		expect(theirs.update).toHaveBeenCalledWith({ "system.holding": "Scene.s1.Tile.t1", "system.seat": true });
		expect(before.update).toHaveBeenCalledWith({ "system.holding": "" });
		expect(foundDomain).not.toHaveBeenCalled();
	});

	it("founds a Domain there for a Knight of the world without one", async () => {
		const wren = knightOf("Wren");
		knights = [wren];
		answer = { ruler: "knight:Wren" };
		const domain = await grantHolding(scene, hex);
		expect(foundDomain).toHaveBeenCalledWith(wren, { holding: "Scene.s1.Tile.t1" });
		expect(domain.name).toBe("Founded");
	});

	it("makes a Knight of the book an NPC Knight, ruling a Domain made beside them", async () => {
		answer = { ruler: "book:1-03" };
		const domain = await grantHolding(scene, hex);
		expect(makeNpcKnight).toHaveBeenCalledWith("1-03", index);
		expect(createDomain).toHaveBeenCalledWith(npc, { name: "Ashford", holding: "Scene.s1.Tile.t1", seat: true });
		expect(linkKnightDomain).toHaveBeenCalledWith(npc, domain);
		expect(foundDomain).not.toHaveBeenCalled();
	});

	it("hands a Domain already naming a Knight of the book to the NPC Knight made of them", async () => {
		const claim = domainOf("Moss Hall", "", "The Moss Knight");
		domains = [claim];
		answer = { ruler: "book:1-03" };
		expect(await grantHolding(scene, hex)).toBe(claim);
		expect(claim.update).toHaveBeenCalledWith({ "system.holding": "Scene.s1.Tile.t1", "system.seat": true, "system.ruler": "Aldric" });
		expect(linkKnightDomain).toHaveBeenCalledWith(npc, claim);
		expect(create).not.toHaveBeenCalled();
	});

	it("grants nothing where the NPC Knight couldn't be made", async () => {
		makeNpcKnight.mockResolvedValueOnce(null);
		answer = { ruler: "book:1-03" };
		expect(await grantHolding(scene, hex)).toBeNull();
		expect(create).not.toHaveBeenCalled();
	});

	it("grants nothing when the window is shut, or there's no Holding", async () => {
		expect(await grantHolding(scene, hex)).toBeNull();
		realm = { holdings: [], myths: [], landmarks: [] };
		expect(await grantHolding(scene, hex)).toBeNull();
		expect(inputDialog).toHaveBeenCalledTimes(1);
		expect(create).not.toHaveBeenCalled();
	});
});
