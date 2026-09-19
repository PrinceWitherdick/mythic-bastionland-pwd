import { SYSTEM_ID } from "../system-id.js";

/**
 * The "(TEST ONLY) Populate World" macro, as the Stonetop system gives its
 * worlds one: a script in the Macro Directory, in a "For Testing Purposes"
 * folder, on nobody's hotbar, and hidden from players. Running it builds a
 * fake game five Seasons in (module/test-world/populate.js); running it again
 * removes it. A GM who deletes the macro keeps it gone, since a world has each
 * setup step only once.
 */

/** The world setup step that gives a world the macro. */
export const TEST_WORLD_MACRO_STEP = "testWorldMacro";

/** Marks the macro, so a rename doesn't lose it. */
const MACRO_FLAG = "testWorldMacro";

/** Marks the folder it's filed in, so it's found again whatever it's renamed to. */
const FOLDER_FLAG = "testingFolder";

export const TEST_WORLD_MACRO_NAME = "(TEST ONLY) Populate World";

const FOLDER_NAME = "For Testing Purposes";

const IMAGE = "icons/svg/hazard.svg";

/**
 * The macro's script. It goes through game.system.api rather than importing
 * populate.js by path: a release runs from one bundled file (scripts/bundle.js),
 * where a path import would load a second copy of every module it reaches.
 */
export const TEST_WORLD_COMMAND = [
	"// Builds a fake game five Seasons in, or removes it again. See the system's module/test-world/populate.js.",
	"return game.system.api.populateTestWorld();"
].join("\n");

/**
 * What the api hands the macro. The test world loads only when it runs, so
 * nothing of it loads in play, and the bundle still evaluates it lazily.
 */
export async function populateTestWorld() {
	const { populateTestWorld: populate } = await import("../test-world/populate.js");
	return populate();
}

/** @returns {Macro|undefined} The world's copy of the macro. */
const findMacro = () => game.macros.find((macro) => macro.getFlag(SYSTEM_ID, MACRO_FLAG));

/** A world setup step: give the world the macro, in its folder. */
export async function seedTestWorldMacro() {
	if (findMacro()) return;
	const folder = game.folders.find((candidate) => candidate.type === "Macro" && candidate.getFlag(SYSTEM_ID, FOLDER_FLAG))
		?? await CONFIG.Folder.documentClass.create({ name: FOLDER_NAME, type: "Macro", flags: { [SYSTEM_ID]: { [FOLDER_FLAG]: true } } });
	await CONFIG.Macro.documentClass.create({
		name: TEST_WORLD_MACRO_NAME,
		type: "script",
		img: IMAGE,
		command: TEST_WORLD_COMMAND,
		folder: folder?.id ?? null,
		// Running it deletes things, so players never see it.
		ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
		flags: { [SYSTEM_ID]: { [MACRO_FLAG]: true } }
	});
}

/** Keep the world's copy of the macro's script current. GMs only. */
export async function syncTestWorldMacro() {
	if (!game.user.isGM) return;
	const macro = findMacro();
	if (macro && macro.command !== TEST_WORLD_COMMAND) await macro.update({ command: TEST_WORLD_COMMAND });
}
