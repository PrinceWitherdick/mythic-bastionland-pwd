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
