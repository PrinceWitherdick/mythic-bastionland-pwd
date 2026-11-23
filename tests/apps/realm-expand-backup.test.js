import { describe, expect, it, vi } from "vitest";

vi.mock("../../module/chat/cards.js", () => ({ t: (key, data) => (data ? `${key} ${JSON.stringify(data)}` : key) }));
vi.mock("../../module/apps/ui.js", () => ({ inputDialog: vi.fn() }));

const { backupWords, dateText } = await import("../../module/apps/realm-expand.js");

describe("backupWords", () => {
	it("dates a backup stamped with the time of day, in the window, the question and the word after", () => {
		const when = Date.UTC(2026, 10, 22, 16, 11);
		const date = dateText(when);
		expect(backupWords(when, "The Vale")).toEqual({
			kept: `realm.expand.backup.kept ${JSON.stringify({ when: date })}`,
			confirm: `realm.expand.restore.confirm ${JSON.stringify({ when: date })}`,
			done: `realm.expand.restore.done ${JSON.stringify({ realm: "The Vale", when: date })}`
		});
	});

	it("names no date for a backup 1.0.2 stamped with the server's uptime, which would read as 1969", () => {
		expect(backupWords(3_600_000, "The Vale")).toEqual({
			kept: "realm.expand.backup.keptUndated",
			confirm: "realm.expand.restore.confirmUndated",
			done: `realm.expand.restore.doneUndated ${JSON.stringify({ realm: "The Vale" })}`
		});
	});
});
