import { t } from "../chat/cards.js";
import { deletionEntry } from "../compat.js";
import { changesKept, keptWith, wantsOwnFolder } from "../rules/knight-folders.js";
import { isCompanyKnight, isKnight, isNpcKnight } from "../rules/knight-types.js";
import { serialWrites } from "../rules/queue.js";
import { SYSTEM_ID } from "../system-id.js";
import { findFlaggedFolder, flaggedFolder } from "./folders.js";
import { worldKnights } from "./knights.js";
import { npcFolder } from "./npc-knights.js";

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
const filing = serialWrites();
const enqueue = (task) => filing(task).catch((error) => console.error(`${SYSTEM_ID} | Couldn't file a Knight in their folder`, error));

/**
 * @param {Actor} knight
 * @returns {Folder|null} The folder made for this Knight.
 */
const ownFolder = (knight) => findFlaggedFolder("Actor", "knight", knight.id);

/** @returns {Promise<Folder|null>} The folder every Knight's is kept in, made if it's missing. */
const companyFolder = () => flaggedFolder("Actor", "company", true, { name: t("company.folder") });

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
		if (isCompanyKnight(actor)) pending.push(...keptWith(actor.system));
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
		// Without the Company's folder the Knight is left unfiled, rather than given one at the top that is never moved in.
		const company = await companyFolder();
		if (!company) return;
		folder = await flaggedFolder("Actor", "knight", knight.id, { name: knight.name, folder: company.id });
	}
	if (!folder) return;
	await knight.update(Object.fromEntries([["folder", folder.id], deletionEntry(`flags.${SYSTEM_ID}.${WANTS}`)]));
	await fileKept(knight);
}

/**
 * Move an NPC Knight, and the steed kept with them, into the NPCs folder, and
 * take away the folder of their own they had as one of the Company once it
 * holds nobody else.
 * @param {Actor} knight
 */
async function fileNpcKnight(knight) {
	if (!game.actors.has(knight.id)) return;
	const own = ownFolder(knight);
	const folder = (await npcFolder())?.id ?? null;
	// A Squire is still one of the Company, so they and their steed keep the folder, which then stays.
	const kept = keptWith(knight.system).map((uuid) => fromUuidSync(uuid)).filter((actor) => !isCompanyKnight(actor));
	const moves = [knight, ...kept]
		.filter((actor) => actor?.documentName === "Actor" && !actor.pack && (!own || actor.folder?.id === own.id || actor === knight))
		.filter((actor) => (actor.folder?.id ?? null) !== folder)
		.map((actor) => ({ _id: actor.id, folder }));
	if (moves.length) await Actor.implementation.updateDocuments(moves);
	if (own && !own.contents.length && !own.children?.length) await own.delete();
}

/**
 * @param {Actor} actor
 * @param {object} changes
 */
function onUpdate(actor, changes) {
	if (!isKnight(actor) || !isKeeper()) return;
	// Made an NPC Knight, or brought back into the Company from one.
	if ("type" in changes) {
		if (isNpcKnight(actor)) enqueue(() => fileNpcKnight(actor));
		else if (!actor.system.isSquire) enqueue(() => fileKnight(actor));
		return;
	}
	if (isNpcKnight(actor)) return;
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
		if (!isKeeper()) return;
		if (actor.getFlag(SYSTEM_ID, WANTS)) enqueue(() => fileKnight(actor));
		// An NPC Knight made at the top of the directory is kept with the other NPCs.
		else if (isNpcKnight(actor) && !actor.folder && !actor.pack) enqueue(() => fileNpcKnight(actor));
	});
	Hooks.on("updateActor", onUpdate);
}

/** File any Knight made while no GM was on to do it. */
export function fileWaitingKnights() {
	if (!isKeeper()) return;
	for (const actor of worldKnights()) if (actor.getFlag(SYSTEM_ID, WANTS)) enqueue(() => fileKnight(actor));
}
