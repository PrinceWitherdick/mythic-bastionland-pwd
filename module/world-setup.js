import { SYSTEM_ID } from "./system-id.js";

// Work a world needs done once: giving it a macro or folders, or bringing
// Scenes made by an older version up to date. On each load the active GM runs
// every step not yet done, one after another, and the world remembers which
// are done in a single setting, so a new step needs no setting of its own.

/** World setting holding the steps done: `{ [key]: true }`. */
const DONE_SETTING = "worldSetupDone";

/**
 * @typedef {object} SetupStep
 * @property {string} key  What the world remembers it by. Give a changed step a new key to run it again.
 * @property {() => Promise<boolean|void>} run Resolves false when it can't be done yet, to try again next load.
 */

/** Register the setting. Called during init. */
export function registerWorldSetup() {
	game.settings.register(SYSTEM_ID, DONE_SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: {}
	});
}

/**
 * @param {string} key
 * @returns {boolean} Whether this world has had the step.
 */
export const isSetupDone = (key) => Boolean(game.settings.get(SYSTEM_ID, DONE_SETTING)?.[key]);

/**
 * Remember a step as done, such as when the work it does was done another way.
 * @param {string} key
 */
export async function markSetupDone(key) {
	const done = game.settings.get(SYSTEM_ID, DONE_SETTING) ?? {};
	if (done[key]) return;
	await game.settings.set(SYSTEM_ID, DONE_SETTING, { ...done, [key]: true });
}

/**
 * Run the steps this world hasn't had, in order. Only the active GM does, so
 * two GMs never both do the same work. A step that fails is tried again next load.
 * @param {SetupStep[]} steps
 */
export async function runWorldSetup(steps) {
	if (!game.user.isGM || !game.users.activeGM?.isSelf) return;
	for (const { key, run } of steps) {
		if (isSetupDone(key)) continue;
		try {
			if ((await run()) !== false) await markSetupDone(key);
		} catch (error) {
			console.error(`${SYSTEM_ID} | World setup step "${key}" failed`, error);
		}
	}
}
