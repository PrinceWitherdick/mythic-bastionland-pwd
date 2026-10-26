import { findByRoll } from "../book-art/art-index.js";
import { askActiveGM } from "../ask-gm.js";
import { t, warn } from "../chat/cards.js";
import { deletionEntry, queryAsker, replacementEntry } from "../compat.js";
import { STANDARD_KIT, knightItems, knightUpdate, startFor } from "../rules/creation.js";
import { KNIGHT_TYPE, NPC_KNIGHT_START, NPC_KNIGHT_TYPE, becomesNpcKnight, isKnight, isNpcKnight, kindStamp } from "../rules/knight-types.js";
import { rollKnightName } from "../rules/knight-names.js";
import { escapeHTML } from "../rules/text.js";
import { SYSTEM_ID } from "../system-id.js";
import { kitWeaponNames } from "./abilities.js";
import { findFlaggedFolder, flaggedFolder } from "./folders.js";
import { COMPANY_KNIGHT_FLAG, worldKnights } from "./knights.js";
import { withoutLedger } from "./ledger.js";
import { createKnightWithCompanions, rollStartScores } from "./new-knight.js";

/**
 * Knights the Referee plays: NPC Knights, an Actor type of their own. One of
 * the book's Knights is made into one for a part in the Realm, such as ruling
 * a Holding, rather than for a player. They're made as the Knight chooser
 * makes one, rolled with the Ruler Start's dice (p6), and kept in the Actors
 * directory's NPCs folder, apart from the Company.
 */

/** The flag that marks the Actors folder NPCs are kept in, so renaming or moving it is safe. */
export const NPC_FOLDER_FLAG = "npcFolder";

/** The world setup step that made the Referee's Knights from before into NPC Knights. */
export const NPC_KNIGHTS_STEP = "npcKnightActors";

/**
 * The Actors folder for NPCs, made the first time one is needed.
 * @returns {Promise<Folder|null>}
 */
export const npcFolder = () => flaggedFolder("Actor", NPC_FOLDER_FLAG, true, { name: t("npcFolder.name") });

/**
 * Make one of the book's Knights into an NPC Knight: a name of their own,
 * Virtues and GD rolled as a Ruler's, and their Property, Ability, Passion,
 * Seer and steed as the book gives them. GMs only.
 * @param {string} roll Their roll on the Knights table, such as "3-07".
 * @param {object|null} index The art index.
 * @returns {Promise<Actor|null>}
 */
export async function makeNpcKnight(roll, index) {
	if (!game.user.isGM) return null;
	const knight = findByRoll(index?.knights, roll);
	const seer = knight ? findByRoll(index?.seers, roll) : null;
	const start = startFor(NPC_KNIGHT_START);
	const { scores } = await rollStartScores(start);
	const update = knightUpdate({ start, virtues: scores, guard: scores.guard, knight, seer });
	const kitNames = Object.fromEntries(STANDARD_KIT.map(({ key }) => [key, t(`chooser.kit.${key}`)]));
	const items = knightItems(knight, kitNames, kitWeaponNames());
	const folder = (await npcFolder())?.id ?? null;
	const name = rollKnightName(Math.random, worldKnights().map((actor) => actor.name));
	return createKnightWithCompanions({ name, update, items, folder, type: NPC_KNIGHT_TYPE });
}

/**
 * Whether the Referee may make this Knight an NPC Knight, or one of the
 * Company again: never a Squire, who serves whoever their Knight is, and a
 * Knight a player holds only from an NPC Knight into the Company.
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
export const changesKind = (actor) => Boolean(game.user?.isGM) && isKnight(actor) && !actor.pack
	&& !actor.system?.isSquire && (isNpcKnight(actor) || !actor.hasPlayerOwner);

/**
 * Whether a Squire serves this Knight. Only a small Company gives its Knights
 * Squires (p7), so a Knight with one can't be made an NPC Knight until the
 * Squire is unlinked or Knighted, and an NPC Knight takes none.
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
export function servedBySquire(actor) {
	const uuid = actor?.system?.isSquire ? null : actor?.system?.squire;
	const squire = uuid ? globalThis.fromUuidSync?.(uuid) : null;
	return squire?.documentName === "Actor" && Boolean(squire.system?.isSquire);
}

/**
 * Make a Knight an NPC Knight, or an NPC Knight a Knight, keeping everything
 * they have, but never a Knight a Squire serves into an NPC Knight. Their
 * folder follows, by the Knight-filing hooks.
 * @param {Actor} actor
 * @param {boolean} npc Whether they're to be an NPC Knight.
 * @returns {Promise<boolean>} Whether they changed.
 */
export async function setKnightKind(actor, npc) {
	if (!changesKind(actor) || isNpcKnight(actor) === npc || (npc && servedBySquire(actor))) return false;
	// Foundry changes a document's type only when its system data is replaced whole, and v14 sends the change on to
	// every client only when that data differs, so the replacement carries a fresh stamp.
	const system = actor.system.toObject();
	system.kindChanged = kindStamp(system.kindChanged);
	await actor.update(Object.fromEntries([
		["type", npc ? NPC_KNIGHT_TYPE : KNIGHT_TYPE],
		replacementEntry("system", system),
		deletionEntry(`flags.${SYSTEM_ID}.${COMPANY_KNIGHT_FLAG}`)
	]), withoutLedger());
	return true;
}

/** A player asks the Referee to make an NPC Knight they hold one of the Company. */
const JOIN_QUERY = `${SYSTEM_ID}.npcKnightJoins`;

/**
 * Make an NPC Knight one of the Company, as whoever takes them up as their
 * character. Only a GM can change an Actor's type, so a player asks the
 * active one.
 * @param {Actor} actor
 * @returns {Promise<boolean>} Whether they're a Knight of the Company's now.
 */
export async function joinCompany(actor) {
	if (!isNpcKnight(actor)) return true;
	if (game.user.isGM) return setKnightKind(actor, false);
	if (!game.users.activeGM) {
		warn("npcKnight.joinNeedsReferee", { name: actor.name });
		return false;
	}
	if (await askActiveGM(JOIN_QUERY, { actorId: actor.id }, `Couldn't make ${actor.name} a Knight of the Company's`)) return true;
	warn("npcKnight.joinRefused", { name: actor.name });
	return false;
}

/**
 * A player's NPC Knight made one of the Company, by the GM who was asked:
 * only one the asker owns.
 * @param {{actorId?: string}} data
 * @param {object} context
 * @returns {Promise<boolean>}
 */
export async function onJoinQuery(data = {}, context = {}) {
	const asker = queryAsker(context);
	if (!asker || !game.user.isGM) return false;
	const actor = game.actors.get(data?.actorId);
	if (!isNpcKnight(actor) || !actor.testUserPermission(asker, "OWNER")) return false;
	return setKnightKind(actor, false);
}

/** Answer players taking up their NPC Knights. Called during init. */
export function registerNpcKnightQueries() {
	CONFIG.queries[JOIN_QUERY] = onJoinQuery;
}

/**
 * The name of Create Actor's "who plays this Knight" radios. No Actor has a
 * field by that name, so Foundry drops it as the Actor is made.
 */
export const KNIGHT_KIND_CHOICE = "knightKind";

/**
 * Create Actor's choice of who plays a new Knight: a player, or the Referee
 * as an NPC Knight. Laid out as the system's other pick lists.
 * @param {boolean} npc Whether the Referee's starts chosen.
 * @returns {string} HTML.
 */
export function knightKindChoice(npc) {
	const choice = (type, key, checked) => `<label class="bastionland-check">
		<input type="radio" name="${KNIGHT_KIND_CHOICE}" value="${type}"${checked ? " checked" : ""}>
		<span class="bastionland-check__label">
			<strong>${escapeHTML(t(`npcKnight.kindChoice.${key}`))}</strong>
			<span class="bastionland-check__detail">${escapeHTML(t(`npcKnight.kindChoice.${key}Detail`))}</span>
		</span>
	</label>`;
	return `<fieldset class="bastionland-choice-list bastionland-choice-list--full" data-knight-kind>
	<legend>${escapeHTML(t("npcKnight.kindChoice.legend"))}</legend>
	${choice(KNIGHT_TYPE, "player", !npc)}
	${choice(NPC_KNIGHT_TYPE, "referee", npc)}
</fieldset>`;
}

/**
 * Show NPC Knight in a Referee's Create Actor window as a choice under Knight,
 * rather than as a type of its own beside NPC. Choosing the Referee gives the
 * Knight entry the NPC Knight type, so the Actor is made as one from the
 * start. A player's window offers no NPC Knight, so it's left as it is.
 * @param {foundry.applications.api.ApplicationV2} dialog
 * @param {HTMLElement} element
 */
export function foldNpcKnightType(dialog, element) {
	const select = element?.querySelector?.('select[name="type"]');
	const npcOption = select?.querySelector(`option[value="${NPC_KNIGHT_TYPE}"]`);
	const knightOption = select?.querySelector(`option[value="${KNIGHT_TYPE}"]`);
	if (!npcOption || !knightOption) return;
	const npc = npcOption.selected;
	npcOption.remove();
	if (npc) knightOption.selected = true;
	(select.closest(".form-group") ?? select).insertAdjacentHTML("afterend", knightKindChoice(npc));
	const choice = element.querySelector("[data-knight-kind]");
	const nameInput = element.querySelector('input[name="name"]');
	const choose = (type) => {
		knightOption.value = type;
		if (nameInput) nameInput.placeholder = Actor.implementation.defaultName({ type });
	};
	const show = () => {
		// The list's own display wins over the hidden attribute, so it's set straight.
		choice.style.display = knightOption.selected ? "" : "none";
		dialog?.setPosition?.({ height: "auto" });
	};
	if (npc) choose(NPC_KNIGHT_TYPE);
	show();
	select.addEventListener("change", show);
	choice.addEventListener("change", (event) => {
		if (event.target?.name === KNIGHT_KIND_CHOICE) choose(event.target.value);
	});
}

/** Fold NPC Knight into Knight in Create Actor. Called during init. */
export function registerNpcKnightCreateChoice() {
	Hooks.on("renderDialogV2", foldNpcKnightType);
}

/**
 * @param {Folder|null} folder
 * @returns {Set<string>} The ids of that folder and every folder inside it.
 */
const folderTree = (folder) => new Set(folder ? [folder.id, ...folder.getSubfolders(true).map((inner) => inner.id)] : []);

/**
 * @param {Actor} actor
 * @param {Set<string>} [npcFolders] The NPCs folder and the folders inside it.
 * @returns {boolean} Whether this is one of the Referee's Knights from before NPC Knights, to become one.
 */
const fromBeforeNpcKnights = (actor, npcFolders = new Set()) => becomesNpcKnight({
	type: actor.type,
	isSquire: Boolean(actor.system?.isSquire),
	hasPlayerOwner: Boolean(actor.hasPlayerOwner),
	inNpcFolder: npcFolders.has(actor.folder?.id),
	companyKnight: actor.getFlag?.(SYSTEM_ID, COMPANY_KNIGHT_FLAG)
});

/**
 * A world setup step. Before NPC Knights had a type of their own, the
 * Referee's Knights were Knights no player held, kept in the NPCs folder, or,
 * in solo play, marked as not riding with the Company. Each becomes an NPC
 * Knight, so the Company's rolls leave them out.
 * @returns {Promise<void>}
 */
export async function convertNpcKnights() {
	const npcFolders = folderTree(findFlaggedFolder("Actor", NPC_FOLDER_FLAG, true));
	const knights = worldKnights((actor) => fromBeforeNpcKnights(actor, npcFolders));
	let count = 0;
	for (const actor of knights) {
		try {
			if (await setKnightKind(actor, true)) count++;
		} catch (error) {
			console.warn(`${SYSTEM_ID} | Couldn't make ${actor.name} an NPC Knight`, error);
		}
	}
	if (count) ui.notifications.info(t("npcKnight.converted", { count }));
}

/**
 * A Knight the Referee brings in from an older compendium, still marked as
 * not riding with the Company, becomes an NPC Knight as those already in the
 * world did. Called once the world is ready.
 */
export function convertImportedNpcKnights() {
	Hooks.on("createActor", (actor, _options, userId) => {
		if (userId !== game.user.id || !fromBeforeNpcKnights(actor)) return;
		setKnightKind(actor, true).catch((error) => console.warn(`${SYSTEM_ID} | Couldn't make ${actor.name} an NPC Knight`, error));
	});
}
