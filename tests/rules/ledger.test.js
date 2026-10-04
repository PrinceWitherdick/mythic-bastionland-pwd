import { describe, expect, it } from "vitest";
import { LEDGER_MAX_ENTRIES, MERGE_WINDOW_MS, itemChanges, itemListEntry, knightChanges, ledgerGroups, mergeRuns, shortValue, writeIntoLedger } from "../../module/rules/ledger.js";

/** Words as their key and data, so a test reads what was asked for. */
const t = (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key);
const context = { t, nameOf: (uuid) => `name of ${uuid}`, typeLabel: (type) => type };
const phraseOf = (entry) => entry?.action.split(" ")[0];

const knight = (system = {}) => ({
	name: "Tristan",
	img: "a.webp",
	system: {
		glory: 2,
		virtues: { vig: { value: 12, max: 12 }, cla: { value: 10, max: 10 }, spi: { value: 8, max: 8 } },
		guard: { value: 3, max: 3 },
		fatigued: false,
		notes: "",
		bookTable: { knight: "The True Knight", name: "Oddity", rolls: [0] },
		...system
	}
});

describe("knightChanges", () => {
	it("reads what changed and passes over what the update left the same", () => {
		const entries = knightChanges(knight(), { "system.virtues.vig.value": 9, "system.virtues.cla.value": 10, name: "Tristan" }, context);
		expect(entries).toEqual([expect.objectContaining({
			subject: "virtues.vig.abbr",
			category: "virtues",
			action: t("ledger.phrases.changed", { subject: "virtues.vig.abbr", from: "12", to: "9" })
		})]);
	});

	it("says a picture or the heraldry changed without writing out what it holds", () => {
		const [entry] = knightChanges(knight({ heraldry: "" }), { "system.heraldry": "data:image/png;base64,AAAA" }, context);
		expect(entry.action).toBe(t("ledger.phrases.replaced", { subject: "ledger.subjects.heraldry" }));
	});

	it("says notes were written, rewritten or cleared, but not what they say", () => {
		const phrase = (from, to) => phraseOf(knightChanges(knight({ notes: from }), { "system.notes": to }, context)[0]);
		expect(phrase("", "<p>Hi</p>")).toBe("ledger.phrases.written");
		expect(phrase("<p>Hi</p>", "<p>Bye</p>")).toBe("ledger.phrases.rewritten");
		expect(phrase("<p>Hi</p>", "<p></p>")).toBe("ledger.phrases.cleared");
		expect(phrase("<p>Hi</p>", "<p>Hi</p>")).toBeUndefined();
	});

	it("names linked actors rather than their UUIDs", () => {
		const [entry] = knightChanges(knight({ steed: "" }), { "system.steed": "Actor.abc" }, context);
		expect(entry.action).toContain("name of Actor.abc");
	});

	it("marks conditions, and adds the rank a change of Glory reaches", () => {
		const entries = knightChanges(knight(), { "system.fatigued": true, "system.glory": 3 }, context);
		expect(entries.map(phraseOf)).toEqual(["ledger.phrases.changed", "ledger.phrases.marked", "ledger.phrases.changed"]);
		expect(entries[2].subject).toBe("rank.label");
		expect(entries[2].action).toContain("rank.gallant");
	});

	it("says when a Squire is Knighted", () => {
		const [entry] = knightChanges(knight({ isSquire: true }), { "system.isSquire": false }, context);
		expect(entry.action).toBe("ledger.phrases.knighted");
	});

	it("says when an affliction is taken on, changed or shaken off, by name", () => {
		const plague = { id: "a1", name: "Plague", loss: "1d6", virtue: "vig", when: "morning" };
		const read = (from, to) => knightChanges(knight({ afflictions: from }), { "system.afflictions": to }, context).map((entry) => entry.action);
		expect(read([], [plague])).toEqual([t("ledger.phrases.afflicted", { name: "Plague" })]);
		expect(read([plague], [])).toEqual([t("ledger.phrases.relieved", { name: "Plague" })]);
		expect(read([plague], [{ ...plague, loss: "1d8" }])).toEqual([t("ledger.phrases.replaced", { subject: "Plague" })]);
		expect(read([plague], [{ ...plague }])).toEqual([]);
		expect(read(undefined, [{ ...plague, name: "" }])).toEqual([t("ledger.phrases.afflicted", { name: "ledger.subjects.affliction" })]);
	});

	it("logs rolls on the Knight's table, but not the book swapping in another table", () => {
		expect(knightChanges(knight(), { "system.bookTable.rolls": [4] }, context)[0].action).toBe(t("ledger.phrases.set", { subject: "Oddity", value: "4" }));
		expect(knightChanges(knight(), { "system.bookTable.name": "Other", "system.bookTable.rolls": [4] }, context)).toEqual([]);
	});
});

describe("items", () => {
	const sword = { _id: "i1", name: "Sword", type: "weapon", system: { damage: "d6", equipped: true, description: "" } };

	it("reads additions and removals of the Knight's things only", () => {
		expect(itemListEntry(sword, "added", context)).toMatchObject({ subject: "weapon", category: "property" });
		expect(itemListEntry({ name: "x", type: "unknown" }, "added", context)).toBeNull();
	});

	it("reads renames, taking up and setting aside, and damage, filed under the item", () => {
		const entries = itemChanges(sword, { name: "Longsword", "system.equipped": false, "system.damage": "d8" }, context);
		expect(entries.map(phraseOf)).toEqual(["ledger.phrases.renamed", "ledger.phrases.unequipped", "ledger.phrases.changed"]);
		expect(entries.every((entry) => entry.subject === "Sword")).toBe(true);
	});

	it("says when a thing is broken or mended, and how many are left", () => {
		const shield = { _id: "s1", name: "Shield", type: "armour", system: { broken: false, equipped: true } };
		expect(itemChanges(shield, { "system.broken": true }, context).map(phraseOf)).toEqual(["ledger.phrases.broke"]);
		expect(itemChanges({ ...shield, system: { broken: true } }, { "system.broken": false }, context).map(phraseOf)).toEqual(["ledger.phrases.mended"]);
		const javelins = { _id: "j1", name: "Javelins", type: "weapon", system: { quantity: { value: 3, max: 3 } } };
		const [thrown] = itemChanges(javelins, { "system.quantity.value": 2 }, context);
		expect(thrown.action).toContain("\"from\":\"3\",\"to\":\"2\"");
		expect(thrown.merge).toMatchObject({ key: "j1.count" });
		expect(itemChanges(javelins, { "system.quantity.value": 3 }, context)).toEqual([]);
	});
});

describe("mergeRuns", () => {
	const at = (entry, timestamp, userId = "u") => ({ ...entry, timestamp, userId });
	const vig = (from, to) => knightChanges(knight({ virtues: { vig: { value: from, max: 12 } } }), { "system.virtues.vig.value": to }, context)[0];

	it("folds a run of changes to one thing into one line", () => {
		const [line, ...rest] = mergeRuns([at(vig(10, 9), 2000), at(vig(11, 10), 1000)], t);
		expect(rest).toEqual([]);
		expect(line.action).toContain("\"from\":\"11\",\"to\":\"9\"");
	});

	it("drops a change and its undoing together", () => {
		expect(mergeRuns([at(vig(10, 11), 2000), at(vig(11, 10), 1000)], t)).toEqual([]);
	});

	it("keeps changes apart when they're far apart, by different people, or don't follow on", () => {
		expect(mergeRuns([at(vig(10, 9), 1000 + MERGE_WINDOW_MS + 1), at(vig(11, 10), 1000)], t)).toHaveLength(2);
		expect(mergeRuns([at(vig(10, 9), 2000, "a"), at(vig(11, 10), 1000, "b")], t)).toHaveLength(2);
		expect(mergeRuns([at(vig(5, 4), 2000), at(vig(11, 10), 1000)], t)).toHaveLength(2);
	});

	it("gathers items added together into one line", () => {
		const added = (name, timestamp) => at(itemListEntry({ name, type: "weapon" }, "added", context), timestamp);
		const [line] = mergeRuns([added("Dagger", 2000), added("Sword", 1000)], t);
		expect(line.merge.items).toEqual(["Sword", "Dagger"]);
		expect(line.action).toContain("Sword, Dagger");
	});

	it("keeps lines with different causes apart, and starts a new list past its limit", () => {
		expect(mergeRuns([{ ...at(vig(10, 9), 2000), cause: "Damage" }, at(vig(11, 10), 1000)], t)).toHaveLength(2);
		const added = (name, timestamp) => at(itemListEntry({ name, type: "weapon" }, "added", context), timestamp);
		const many = Array.from({ length: 25 }, (_, index) => added(`W${index}`, 1000 + index)).reverse();
		const folded = mergeRuns(many, t);
		expect(folded.map((line) => line.merge.items.length)).toEqual([1, 24]);
	});
});

describe("writeIntoLedger", () => {
	it("puts new lines first, newest first, and keeps to the limit", () => {
		const stored = Array.from({ length: LEDGER_MAX_ENTRIES }, (_, index) => ({ id: `old${index}`, action: "x" }));
		const ledger = writeIntoLedger(stored, [{ id: "a", action: "first" }, { id: "b", action: "second" }], t);
		expect(ledger).toHaveLength(LEDGER_MAX_ENTRIES);
		expect(ledger.slice(0, 3).map((entry) => entry.id)).toEqual(["b", "a", "old0"]);
	});

	it("starts an empty Ledger, and lets a change undone strike the line it undoes", () => {
		const vig = (from, to, timestamp) => ({ ...knightChanges(knight({ virtues: { vig: { value: from, max: 12 } } }), { "system.virtues.vig.value": to }, context)[0], timestamp, userId: "u" });
		expect(writeIntoLedger(undefined, [vig(12, 9, 1000)], t)).toHaveLength(1);
		const stored = [vig(12, 9, 1000), { id: "older", action: "x" }];
		expect(writeIntoLedger(stored, [vig(9, 12, 2000)], t)).toEqual([{ id: "older", action: "x" }]);
	});
});

describe("ledgerGroups", () => {
	it("lists groups in order with their subjects sorted and counted", () => {
		const groups = ledgerGroups([
			{ category: "property", subject: "Weapon" },
			{ category: "virtues", subject: "VIG" },
			{ category: "virtues", subject: "CLA" },
			{ category: "nonsense", subject: "?" }
		]);
		expect(groups).toEqual([
			{ id: "virtues", count: 2, subjects: ["CLA", "VIG"] },
			{ id: "property", count: 1, subjects: ["Weapon"] },
			{ id: "other", count: 1, subjects: ["?"] }
		]);
	});
});

describe("shortValue", () => {
	it("flattens HTML and cuts long text at a word", () => {
		expect(shortValue("<p>a &amp; b</p>")).toBe("a & b");
		expect(shortValue("word ".repeat(40)).endsWith("word…")).toBe(true);
	});
});
