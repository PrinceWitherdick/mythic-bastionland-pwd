import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../../module/system-id.js";
import { REALM_BACKUP_FLAG } from "../../module/rules/realm-growth.js";

vi.mock("../../module/book-art/files.js", () => ({ ensureDirectories: vi.fn(async () => {}), uploadFile: vi.fn(async () => "worlds/w/bastionland-backups/realm-vale.json") }));
vi.mock("../../module/apps/ui.js", () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock("../../module/apps/realm-expand.js", () => ({ askToExpandRealm: vi.fn(), backupWords: vi.fn(), realmBackup: vi.fn(() => null) }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key, warn: vi.fn() }));
vi.mock("../../module/actions/realm.js", () => ({}));
vi.mock("../../module/actions/gm-toolkit.js", () => ({ theGmToolkit: () => null }));
vi.mock("../../module/actions/timeline-store.js", () => ({ findTimelineJournal: () => null, timelinePages: () => [] }));

const { keepRealmBackup } = await import("../../module/actions/realm-expand.js");
const { uploadFile } = await import("../../module/book-art/files.js");
const { confirmDialog } = await import("../../module/apps/ui.js");

let scene;

beforeEach(() => {
	vi.clearAllMocks();
	scene = {
		id: "vale",
		name: "The Vale",
		flags: { [SYSTEM_ID]: { [REALM_BACKUP_FLAG]: { path: "worlds/w/older.json", when: 5 } } },
		toObject: () => ({ _id: "vale" }),
		setFlag: vi.fn(async (scope, key, value) => {
			scene.flags[scope][key] = value;
		})
	};
	globalThis.game = { world: { id: "w" }, system: { version: "1" }, time: { serverTime: 1000 } };
	globalThis.foundry = { utils: { saveDataToFile: vi.fn() } };
	globalThis.File = class {
		constructor(parts, name) {
			this.name = name;
		}
	};
});

afterEach(() => {
	for (const key of ["game", "foundry", "File"]) delete globalThis[key];
});

describe("keepRealmBackup", () => {
	it("keeps the server's backup and names it on the Scene, dated by the clock rather than the server's uptime", async () => {
		const now = Date.UTC(2026, 10, 22, 16, 11);
		vi.spyOn(Date, "now").mockReturnValue(now);
		expect(await keepRealmBackup(scene, { west: 1 })).toBe(true);
		expect(uploadFile).toHaveBeenCalledOnce();
		expect(foundry.utils.saveDataToFile).not.toHaveBeenCalled();
		expect(scene.flags[SYSTEM_ID][REALM_BACKUP_FLAG]).toEqual({ path: "worlds/w/bastionland-backups/realm-vale.json", when: now });
		vi.restoreAllMocks();
	});

	it("asks whether to go on when the server's backup can't be saved, naming no new one", async () => {
		uploadFile.mockResolvedValueOnce(null);
		confirmDialog.mockResolvedValueOnce(false);
		expect(await keepRealmBackup(scene, { west: 1 })).toBe(false);
		expect(confirmDialog).toHaveBeenCalledOnce();
		expect(scene.flags[SYSTEM_ID][REALM_BACKUP_FLAG]).toEqual({ path: "worlds/w/older.json", when: 5 });
	});

});
