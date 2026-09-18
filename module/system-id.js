/**
 * The system id, spelled out once. It is a literal rather than
 * `game.system.id` because modules load before `game` exists, and template
 * paths, settings and flags all need it at import time.
 */
export const SYSTEM_ID = "mythic-bastionland-pwd";

/** URL root for files served from this system. */
export const SYSTEM_PATH = `systems/${SYSTEM_ID}`;

/**
 * Path to a template under this system's `templates` folder.
 * @param {string} path e.g. "actor/knight-sheet.hbs"
 * @returns {string}
 */
export const templatePath = (path) => `${SYSTEM_PATH}/templates/${path}`;

/**
 * Id of a compendium declared in system.json.
 * @param {string} name The pack's `name`.
 * @returns {string}
 */
export const packId = (name) => `${SYSTEM_ID}.${name}`;

/** The Macro compendium that holds Import PDF. */
export const MACROS_PACK = packId("macros");
