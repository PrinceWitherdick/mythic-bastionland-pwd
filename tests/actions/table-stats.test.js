import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn(async () => null) }));
const { inputDialog } = await import("../../module/apps/ui.js");
const { applyTableStats } = await import("../../module/actions/table-stats.js");
const { SYSTEM_ID } = await import("../../module/system-id.js");

let notices;
let nextId;

function setProperty(object, path, value) {
	const parts = path.split(".");
	const last = parts.pop();
	parts.reduce((node, part) => (node[part] ??= {}), object)[last] = value;
}

/** A Knight holding these items, whose writes land on it. */
function knightWith(specs, table) {
	const knight = { name: "Sir Test", type: "knight", isOwner: true, flags: {}, system: { bookTable: table, isSquire: false, steed: "" } };
	const list = [];
	const make = (spec) => {
		const item = {
			id: spec.id ?? `made${nextId++}`,
			name: spec.name,
			type: spec.type,
			img: spec.img ?? "icon.svg",
			sort: spec.sort ?? 0,
			flags: spec.flags ?? {},
			system: structuredClone(spec.system ?? {}),
			toObject() {
				return { _id: this.id, name: this.name, type: this.type, img: this.img, sort: this.sort, flags: this.flags, system: structuredClone(this.system) };
			},
			update: vi.fn(async function (changes) {
				for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(this, path, value);
				return this;
			}),
			delete: vi.fn(async function () {
				list.splice(list.indexOf(this), 1);
			})
		};
		list.push(item);
		return item;
	};
	specs.forEach(make);
	knight.items = { get contents() { return [...list]; }, get: (id) => list.find((item) => item.id === id), find: (fn) => list.find(fn) };
	knight.createEmbeddedDocuments = vi.fn(async (_type, data) => data.map(make));
	knight.getFlag = (scope, key) => knight.flags[scope]?.[key];
	knight.update = vi.fn(async (changes) => {
		for (const [path, value] of Object.entries(changes)) foundry.utils.setProperty(knight, path, value);
		return knight;
	});
	return knight;
}

const table = (rolls) => ({
	name: "Odd Crossbow",
	columns: ["Form", "Quirk"],
	rows: [
		["Pocket (d6)", "Squeaks"],
		["Oakheart (d8 hefty)", "Hums"],
		["Twin (2d6 long)", "Glows"],
		["Brass (2d8 slow)", "Sings"],
		["Iron (d10 slow)", "Rusts"],
		["Bone (d10 long)", "Weeps"]
	],
	rolls
});

beforeEach(() => {
	notices = [];
	nextId = 1;
	globalThis.ui = { notifications: { info: (text) => notices.push(text) } };
	globalThis.game = { i18n: { localize: (key) => key, format: (key) => key } };
	globalThis.fromUuidSync = () => null;
	globalThis.foundry = {
		// A forced replacement writes the flag whole; here, setting it is the same.
		data: { operators: { ForcedReplacement: { create: (value) => value } } },
		utils: {
			getProperty: (object, path) => path.split(".").reduce((node, part) => node?.[part], object),
			setProperty,
			objectsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
			expandObject: (flat) => {
				const expanded = {};
				for (const [path, value] of Object.entries(flat)) setProperty(expanded, path, value);
				return expanded;
			},
			mergeObject: function merge(target, source) {
				for (const [key, value] of Object.entries(source)) {
					target[key] = value && typeof value === "object" && !Array.isArray(value) ? merge(target[key] ?? {}, value) : value;
				}
				return target;
			}
		}
	};
});

afterEach(() => {
	for (const key of ["ui", "game", "fromUuidSync", "foundry"]) delete globalThis[key];
	vi.clearAllMocks();
});

describe("applyTableStats", () => {
	it("makes the gear the table is about into the weapon rolled, then back into gear when cleared", async () => {
		const knight = knightWith([{ id: "bow", name: "Odd crossbow (see below)", type: "gear", sort: 5, system: { description: "<p>Strange.</p>" } }], table([2, 1]));
		const said = await applyTableStats(knight, [0, 1]);
		const weapon = knight.items.contents.find((item) => item.type === "weapon");
		expect(weapon).toMatchObject({ name: "Odd crossbow (see below)", sort: 5 });
		expect(weapon.system).toMatchObject({ damage: "d8", hefty: true, ranged: true, equipped: true, description: "<p>Strange.</p>" });
		expect(knight.items.get("bow")).toBeUndefined();
		// The Quirk column has no stats, so it does nothing.
		expect(said).toHaveLength(1);
		expect(Object.keys(knight.flags[SYSTEM_ID].tableApplied)).toEqual(["0"]);

		// Rolled again: the same weapon takes the new form, and nothing of the last stays.
		knight.system.bookTable.rolls = [3, 1];
		await applyTableStats(knight, [0]);
		expect(knight.items.contents).toHaveLength(1);
		expect(weapon.system).toMatchObject({ damage: "2d6", hefty: false, long: true });

		// Cleared: the crossbow is the gear it was.
		knight.system.bookTable.rolls = [0, 1];
		await applyTableStats(knight, [0]);
		expect(knight.items.contents.map(({ type, name }) => `${type}:${name}`)).toEqual(["gear:Odd crossbow (see below)"]);
		expect(knight.flags[SYSTEM_ID].tableApplied).toEqual({});
	});

	it("changes a weapon in place, and puts back what the last result changed", async () => {
		const pole = { id: "pole", name: "Hooked polearm (d8, long, see below)", type: "weapon", system: { damage: "d8", long: true, specialist: { die: "", situation: "" } } };
		const kit = { name: "Kit", columns: ["Hooked Polearm"], rows: [["+d10 vs riders"], ["+d8 vs beasts"], ["Plain"], ["Plain"], ["Plain"], ["Plain"]], rolls: [1] };
		const knight = knightWith([pole], kit);
		await applyTableStats(knight, [0]);
		const item = knight.items.get("pole");
		expect(item.system.specialist).toEqual({ die: "d10", situation: "vs riders" });
		expect(knight.flags[SYSTEM_ID].tableApplied[0].before).toEqual({ "specialist.die": "", "specialist.situation": "" });

		knight.system.bookTable.rolls = [2];
		await applyTableStats(knight, [0]);
		expect(item.system.specialist).toEqual({ die: "d8", situation: "vs beasts" });
		expect(knight.flags[SYSTEM_ID].tableApplied[0].before).toEqual({ "specialist.die": "", "specialist.situation": "" });

		// A result with no stats puts the polearm back as it was.
		knight.system.bookTable.rolls = [3];
		await applyTableStats(knight, [0]);
		expect(item.system.specialist).toEqual({ die: "", situation: "" });
		expect(item.system.damage).toBe("d8");
	});

	it("asks which possession when more than one could take it, and applies to none if told", async () => {
		const knight = knightWith([
			{ id: "a", name: "Odd crossbow", type: "weapon", system: { damage: "d6" } },
			{ id: "b", name: "Odd crossbow, spare", type: "weapon", system: { damage: "d6" } }
		], table([2, 1]));
		inputDialog.mockResolvedValueOnce({ item: "b" });
		await applyTableStats(knight, [0]);
		expect(inputDialog.mock.calls[0][0].context.choices.map(({ id }) => id)).toEqual(["a", "b"]);
		expect(knight.items.get("b").system.damage).toBe("d8");
		expect(knight.items.get("a").system.damage).toBe("d6");

		const other = knightWith([
			{ id: "a", name: "Odd crossbow", type: "weapon", system: { damage: "d6" } },
			{ id: "b", name: "Odd crossbow, spare", type: "weapon", system: { damage: "d6" } }
		], table([2, 1]));
		inputDialog.mockResolvedValueOnce({ item: "blank" });
		await applyTableStats(other, [0]);
		expect(other.items.contents.map((item) => item.system.damage)).toEqual(["d6", "d6"]);
	});

	it("says so when nothing could take the stats", async () => {
		const knight = knightWith([{ id: "cloak", name: "Cloak", type: "armour", system: { armour: 1 } }], table([2, 0]));
		await applyTableStats(knight, [0]);
		expect(notices).toEqual(["bastionland.knightTable.apply.none"]);
	});
});

describe("applyTableStats, results that change kind or land elsewhere", () => {
	const draughts = (rolls) => ({
		name: "Odd Draughts",
		columns: ["Effect"],
		rows: [["Spit flame (d8 blast)"], ["Stone skin (A1)"], ["Hums"], ["Hums"], ["Hums"], ["Hums"]],
		rolls
	});

	it("takes a result back to the gear first when the next one is of another kind", async () => {
		const knight = knightWith([{ id: "jar", name: "Odd draughts (see below)", type: "gear", system: {} }], draughts([1]));
		await applyTableStats(knight, [0]);
		expect(knight.items.contents.map((item) => item.type)).toEqual(["weapon"]);

		knight.system.bookTable.rolls = [2];
		await applyTableStats(knight, [0]);
		expect(knight.items.contents.map(({ type, name }) => `${type}:${name}`)).toEqual(["armour:Odd draughts (see below)"]);
		expect(knight.items.contents[0].system.armour).toBe(1);

		knight.system.bookTable.rolls = [1];
		await applyTableStats(knight, [0]);
		expect(knight.items.contents.map((item) => item.type)).toEqual(["weapon"]);
		expect(knight.items.contents[0].system).toMatchObject({ damage: "d8", blast: true });

		knight.system.bookTable.rolls = [3];
		await applyTableStats(knight, [0]);
		expect(knight.items.contents.map(({ type, name }) => `${type}:${name}`)).toEqual(["gear:Odd draughts (see below)"]);
	});

	it("adds a named piece beside the armour the table is about, and takes it away again", async () => {
		const quirks = { name: "Strange Plate", columns: ["Quirk"], rows: [["Grim helm (A1)"], ["Spiked gloves (d6)"], ["Hums"], ["Hums"], ["Hums"], ["Hums"]], rolls: [1] };
		const knight = knightWith([{ id: "plate", name: "Strange plate (A1, see below)", type: "armour", system: { kind: "plates", armour: 1 } }], quirks);
		const said = await applyTableStats(knight, [0]);
		expect(said).toEqual(["bastionland.knightTable.apply.added"]);
		const helm = knight.items.contents.find((item) => item.name === "Grim helm");
		expect(helm.system).toMatchObject({ kind: "helm", armour: 1, equipped: true });
		expect(knight.items.get("plate").system).toEqual({ kind: "plates", armour: 1 });

		knight.system.bookTable.rolls = [2];
		await applyTableStats(knight, [0]);
		expect(knight.items.contents.map(({ type, name }) => `${type}:${name}`)).toEqual(["armour:Strange plate (A1, see below)", "weapon:Spiked gloves"]);

		knight.system.bookTable.rolls = [3];
		await applyTableStats(knight, [0]);
		expect(knight.items.contents.map((item) => item.name)).toEqual(["Strange plate (A1, see below)"]);
	});

	it("puts a companion's result on the NPC made from its line, and back", async () => {
		const breeds = { name: "Grey Hawk", columns: ["Breed"], rows: [["Kestrel (d6 beak)"], ["Old bird (6GD)"], ["Hums"], ["Hums"], ["Hums"], ["Hums"]], rolls: [1], page: 99 };
		const knight = knightWith([{ id: "hawk", name: "Grey hawk (VIG 4, CLA 9, SPI 5, 3GD, d4 beak, see below)", type: "gear", system: {} }], breeds);
		knight.id = "knight1";
		const npc = knightWith([{ id: "beak", name: "Beak", type: "weapon", system: { damage: "d4" } }]);
		Object.assign(npc, { name: "Grey hawk", uuid: "Actor.hawk", system: { armour: 0, guard: { value: 3, max: 3 } } });
		npc.getFlag = (_scope, key) => (key === "companionOf" ? "knight1" : undefined);
		globalThis.game.actors = [npc];
		globalThis.fromUuidSync = (uuid) => (uuid === npc.uuid ? npc : null);

		await applyTableStats(knight, [0]);
		expect(npc.items.get("beak").system.damage).toBe("d6");
		expect(knight.items.contents.map((item) => item.type)).toEqual(["gear"]);
		expect(knight.flags[SYSTEM_ID].tableApplied[0]).toMatchObject({ actor: "Actor.hawk", item: "beak", before: { damage: "d4" } });

		knight.system.bookTable.rolls = [2];
		await applyTableStats(knight, [0]);
		expect(npc.items.get("beak").system.damage).toBe("d4");
		expect(npc.system.guard).toEqual({ value: 6, max: 6 });

		knight.system.bookTable.rolls = [3];
		await applyTableStats(knight, [0]);
		expect(npc.system.guard).toEqual({ value: 3, max: 3 });
	});

	it("names the companion from the column that says what it is, unless renamed by hand", async () => {
		const kinds = { name: "Friend", columns: ["Past", "Kind"], rows: [["Lost", "Badger"], ["Proud", "Stoat"], ["x", "x"], ["x", "x"], ["x", "x"], ["x", "x"]], rolls: [1, 1], page: 30 };
		const knight = knightWith([{ id: "pal", name: "Friend (see below) (VIG 5, CLA 10, SPI 7, 4GD)", type: "gear", system: {} }], kinds);
		knight.id = "knight2";
		const npc = knightWith([]);
		Object.assign(npc, { name: "Friend", uuid: "Actor.pal", system: {} });
		npc.getFlag = (_scope, key) => (key === "companionOf" ? "knight2" : undefined);
		globalThis.game.actors = [npc];
		globalThis.fromUuidSync = (uuid) => (uuid === npc.uuid ? npc : null);

		await applyTableStats(knight, [0, 1]);
		expect(npc.name).toBe("Badger");
		knight.system.bookTable.rolls = [1, 2];
		await applyTableStats(knight, [1]);
		expect(npc.name).toBe("Stoat");
		knight.system.bookTable.rolls = [1, 0];
		await applyTableStats(knight, [1]);
		expect(npc.name).toBe("Friend");

		knight.system.bookTable.rolls = [1, 1];
		await applyTableStats(knight, [1]);
		npc.name = "Whiskers";
		knight.system.bookTable.rolls = [1, 2];
		await applyTableStats(knight, [1]);
		expect(npc.name).toBe("Whiskers");
	});

	it("leaves a column alone, without asking, when several could take it", async () => {
		const knight = knightWith([
			{ id: "a", name: "Odd crossbow", type: "weapon", system: { damage: "d6" } },
			{ id: "b", name: "Odd crossbow, spare", type: "weapon", system: { damage: "d6" } }
		], table([2, 1]));
		await applyTableStats(knight, [0], { ask: false });
		expect(inputDialog).not.toHaveBeenCalled();
		expect(knight.items.contents.map((item) => item.system.damage)).toEqual(["d6", "d6"]);
	});

	it("leaves what a column did in place, without asking, when several could take its result now", async () => {
		const knight = knightWith([
			{ id: "a", name: "Odd crossbow", type: "weapon", system: { damage: "d6" } },
			{ id: "b", name: "Odd crossbow, spare", type: "weapon", system: { damage: "d6" } },
			{ id: "piece", name: "Oakheart", type: "weapon", system: { damage: "d8" } }
		], table([2, 1]));
		const applied = { 0: { created: "piece", kind: "weapon" } };
		knight.flags[SYSTEM_ID] = { tableApplied: applied };
		await applyTableStats(knight, [0], { ask: false });
		expect(knight.items.get("piece")).toBeDefined();
		expect(knight.flags[SYSTEM_ID].tableApplied).toEqual(applied);
		expect(knight.update).not.toHaveBeenCalled();
	});

	it("moves a companion's result once made a weapon of its line onto the NPC, the line gear again", async () => {
		const line = "Grey hawk (VIG 4, CLA 9, SPI 5, 3GD, d4 beak, see below)";
		const breeds = { name: "Grey Hawk", columns: ["Breed"], rows: [["Kestrel (d6 beak)"], ["Hums"], ["Hums"], ["Hums"], ["Hums"], ["Hums"]], rolls: [1], page: 99 };
		const knight = knightWith([{ id: "made", name: line, type: "weapon", system: { damage: "d6", equipped: true } }], breeds);
		knight.id = "knight1";
		knight.flags[SYSTEM_ID] = { tableApplied: { 0: { item: "made", kind: "weapon", retypedFrom: { _id: "hawk", name: line, type: "gear", img: "icon.svg", sort: 0, flags: {}, system: {} } } } };
		const npc = knightWith([{ id: "beak", name: "Beak", type: "weapon", system: { damage: "d4" } }]);
		Object.assign(npc, { name: "Grey hawk", uuid: "Actor.hawk", system: { armour: 0, guard: { value: 3, max: 3 } } });
		npc.getFlag = (_scope, key) => (key === "companionOf" ? "knight1" : undefined);
		globalThis.game.actors = [npc];
		globalThis.fromUuidSync = (uuid) => (uuid === npc.uuid ? npc : null);

		await applyTableStats(knight, [0], { ask: false });
		expect(knight.items.contents.map(({ type, name }) => `${type}:${name}`)).toEqual([`gear:${line}`]);
		expect(npc.items.get("beak").system.damage).toBe("d6");
		expect(knight.flags[SYSTEM_ID].tableApplied[0]).toMatchObject({ actor: "Actor.hawk", item: "beak" });
		expect(knight.flags[SYSTEM_ID].tableApplied[0].retypedFrom).toBeUndefined();
	});
});
