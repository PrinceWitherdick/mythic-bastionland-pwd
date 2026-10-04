import { t } from "../chat/cards.js";
import { changesKept, keptWith, wantsOwnFolder } from "../rules/knight-folders.js";
import { SYSTEM_ID } from "../system-id.js";
import { worldKnights } from "./knights.js";

/**
 * Each Knight made gets a folder of their own in the Actors directory, named
 * after them and inside a "Company" folder, and their steed and Squire are
 * kept in it. Players can't make folders, so the active GM files everyone;
 * a Knight made while no GM is on is filed when one arrives. Folders are
 * found by flag, so renaming or moving the Company folder doesn't lose it.
 */

/** Marks a Knight still waiting for a folder. */
const WANTS = "wantsFolder";

/** @returns {boolean} Whether this user is the one who files Knights. */
const isKeeper = () => Boolean(game.users.activeGM?.isSelf);

/** Filing runs one at a time, so two Knights made together don't make two Company folders. */
let queue = Promise.resolve();
const enqueue = (task) => {
	queue = queue.then(task).catch((error) => console.error(`${SYSTEM_ID} | Couldn't file a Knight in their folder`, error));
	return queue;
};

/**
 * @param {string} key
 * @param {*} [value]
 * @returns {Folder|undefined} The Actors folder with that flag.
 */
const flaggedFolder = (key, value = true) => game.folders.find((folder) => folder.type === "Actor" && folder.getFlag(SYSTEM_ID, key) === value);

/**
 * @param {Actor} knight
 * @returns {Folder|undefined} The folder made for this Knight.
 */
const ownFolder = (knight) => flaggedFolder("knight", knight.id);

/** @returns {Promise<Folder>} The folder every Knight's is kept in, made if it's missing. */
async function companyFolder() {
	return flaggedFolder("company") ?? foundry.utils.getDocumentClass("Folder").create({
		name: t("company.folder"),
		type: "Actor",
		flags: { [SYSTEM_ID]: { company: true } }
	});
}

/**
 * Move a Knight's steed and Squire, and the Squire's own steed, into the
 * Knight's folder, if the Knight has one of their own.
 * @param {Actor} knight
 */
async function fileKept(knight) {
	const folder = knight.folder;
	if (!folder?.getFlag(SYSTEM_ID, "knight")) return;
	const seen = new Set([knight.uuid]);
	const pending = keptWith(knight.system);
	const moves = [];
	while (pending.length) {
		const uuid = pending.shift();
		if (seen.has(uuid)) continue;
		seen.add(uuid);
		const actor = fromUuidSync(uuid);
		if (actor?.documentName !== "Actor" || actor.pack) continue;
		if (actor.folder?.id !== folder.id) moves.push({ _id: actor.id, folder: folder.id });
		if (actor.type === "knight") pending.push(...keptWith(actor.system));
	}
	// Whoever is kept with them moves in one go, rather than a write apiece.
	if (moves.length) await Actor.implementation.updateDocuments(moves);
}

/**
 * Give a Knight a folder of their own inside the Company's, move them into
 * it, and bring their steed and Squire along.
 * @param {Actor} knight
 */
async function fileKnight(knight) {
	if (!game.actors.has(knight.id)) return;
	let folder = ownFolder(knight);
	if (!folder) {
		const company = await companyFolder();
		folder = await foundry.utils.getDocumentClass("Folder").create({
			name: knight.name,
			type: "Actor",
			folder: company.id,
			flags: { [SYSTEM_ID]: { knight: knight.id } }
		});
	}
	await knight.update({ folder: folder.id, [`flags.${SYSTEM_ID}.-=${WANTS}`]: null });
	await fileKept(knight);
}

/**
 * @param {Actor} actor
 * @param {object} changes
 */
function onUpdate(actor, changes) {
	if (actor.type !== "knight" || !isKeeper()) return;
	const renamed = "name" in changes;
	const knighted = changes.system?.isSquire === false;
	// Looking the folder up walks every Actor folder, so only an update worth acting on does.
	if (!renamed && !knighted && !changesKept(changes)) return;
	// A Knight's folder follows their name.
	const folder = ownFolder(actor);
	if (renamed && folder && folder.name !== actor.name) enqueue(() => folder.update({ name: actor.name }));
	// A Squire who is Knighted leaves their Knight's folder for one of their own.
	if (knighted && !folder) enqueue(() => fileKnight(actor));
	else if (changesKept(changes)) enqueue(() => fileKept(actor));
}

/** Watch for Knights being made, renamed, Knighted or given a steed or Squire. */
export function registerKnightFolderHooks() {
	// Marked on whoever makes them, so a GM can file them even if they arrive later.
	Hooks.on("preCreateActor", (actor, data, options) => {
		if (!options.pack && wantsOwnFolder(actor._source)) actor.updateSource({ [`flags.${SYSTEM_ID}.${WANTS}`]: true });
	});
	Hooks.on("createActor", (actor) => {
		if (isKeeper() && actor.getFlag(SYSTEM_ID, WANTS)) enqueue(() => fileKnight(actor));
	});
	Hooks.on("updateActor", onUpdate);
}

/** File any Knight made while no GM was on to do it. */
export function fileWaitingKnights() {
	if (!isKeeper()) return;
	for (const actor of worldKnights()) if (actor.getFlag(SYSTEM_ID, WANTS)) enqueue(() => fileKnight(actor));
}
