import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ID } from "../module/system-id.js";
import { macroIconPath } from "../module/rules/macro-icons.js";

let solo = false;
vi.mock("../module/actions/solo.js", () => ({ isSolo: () => solo }));

const { ensureTimelineHotbar, seedTimelineMacro } = await import("../module/actions/timeline-macro.js");

const IMAGE = macroIconPath("timeline");
const COMMAND = "game.system.api.openTimeline();";

/** A world as the Timeline macro sees it. */
function installWorld({ isGM = false, macro = null } = {}) {
	const create = vi.fn();
	const assign = vi.fn();
	const setFlag = vi.fn();
	globalThis.game = {
		user: { isGM, hotbar: {}, assignHotbarMacro: assign, setFlag, getFlag: () => false },
		macros: { find: (test) => [macro].filter(Boolean).find(test) },
		i18n: { localize: (key) => key }
	};
	globalThis.CONFIG = { Macro: { documentClass: { create } } };
	globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
	return { create, assign, setFlag };
}

const worldMacro = () => ({
	id: "timeline", command: COMMAND, img: IMAGE, canExecute: true, update: vi.fn(),
	getFlag: (scope, key) => scope === SYSTEM_ID && (key === "givenImg" ? IMAGE : key === "timelineMacro")
});

afterEach(() => {
	solo = false;
	for (const key of ["game", "CONFIG", "CONST"]) delete globalThis[key];
});

describe("seedTimelineMacro", () => {
	it("makes one macro everyone can run", async () => {
		const { create } = installWorld({ isGM: true });
		await seedTimelineMacro();
		expect(create).toHaveBeenCalledWith(expect.objectContaining({
			name: "bastionland.timeline.macro.name", type: "script", command: COMMAND, img: IMAGE, ownership: { default: 2 }
		}));
	});
});

describe("ensureTimelineHotbar", () => {
	it("puts it on a player's hotbar", async () => {
		const macro = worldMacro();
		const { assign, setFlag } = installWorld({ macro });
		await ensureTimelineHotbar();
		expect(assign).toHaveBeenCalledWith(macro, 1);
		expect(setFlag).toHaveBeenCalledWith(SYSTEM_ID, "timelineHotbar", true);
	});

	it("leaves a GM's hotbar alone, unless they play alone and are the Company too", async () => {
		const macro = worldMacro();
		let world = installWorld({ isGM: true, macro });
		await ensureTimelineHotbar();
		expect(world.assign).not.toHaveBeenCalled();
		expect(world.setFlag).not.toHaveBeenCalled();

		solo = true;
		world = installWorld({ isGM: true, macro });
		await ensureTimelineHotbar();
		expect(world.assign).toHaveBeenCalledWith(macro, 1);
	});
});
