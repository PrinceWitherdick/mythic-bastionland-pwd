/**
 * Renaming a written Knight or their Seer, however it's done (on their sheet,
 * by Start from a book Knight, or in the Journal sidebar), reaches the
 * characters who go by the old name, so their sheets still find them. A name
 * another Knight or Seer already has is put back while players can choose the
 * Knight or a character goes by them: the two would be one on a sheet, and
 * the characters would quietly become the other's.
 */
import { confirmDialog } from "../apps/ui.js";
import { t } from "../chat/cards.js";
import { isOwnRecord } from "../rules/knight-refs.js";
import { holderRenames, knightNameClash, seerNameClash } from "../rules/own-knights.js";
import { escapeHTML } from "../rules/text.js";
import { SYSTEM_ID } from "../system-id.js";
import { knightIndex } from "./knight-index.js";
import { worldKnights } from "./knights.js";
import { OWN_KNIGHT_FLAG, isOwnKnightEntry, isReadyForPlayers, ownKnightType, ownKnightWrites, readOwnKnight } from "./own-knights.js";

/** Carries each written Knight's names as they were before an update, from its preUpdate to its update, by entry id. */
const NAMES_OPTION = `${SYSTEM_ID}.ownKnightNames`;

/** Marks the update that puts a name back, which follows no rename of its own. */
const PUT_BACK_OPTION = `${SYSTEM_ID}.ownKnightNamePutBack`;

/**
 * @param {JournalEntry} entry
 * @returns {{name: string, type: string, seer: string}} The entry's name, the Knight's, such as "Ferry", and their Seer's.
 */
const namesOf = (entry) => ({ name: entry.name, type: ownKnightType(entry), seer: readOwnKnight(entry).seer.name });

/**
 * Note a written Knight's names before the Referee changes them.
 * @param {JournalEntry} entry
 * @param {object} options
 */
function noteNames(entry, options) {
	if (!game.user.isGM || !isOwnKnightEntry(entry) || options[PUT_BACK_OPTION]) return;
	(options[NAMES_OPTION] ??= {})[entry.id] = namesOf(entry);
}

/**
 * Give a written Knight, or their Seer, back the name they had, after their
 * sheet's last write.
 * @param {JournalEntry} entry
 * @param {{name?: string, seer?: string}} names
 * @returns {Promise<unknown>}
 */
function putBack(entry, { name, seer }) {
	const update = {
		...(name !== undefined ? { name } : {}),
		...(seer !== undefined ? { [`flags.${SYSTEM_ID}.${OWN_KNIGHT_FLAG}.seer.name`]: seer } : {})
	};
	return ownKnightWrites(entry.id)(() => entry.update(update, { [PUT_BACK_OPTION]: true }));
}

/**
 * After a written Knight or their Seer was renamed by this Referee: put back
 * a name that another already has, where the Knight is chosen or can be, and
 * offer to rename the characters who went by the old one.
 * @param {JournalEntry} entry
 * @param {object} options
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function followRename(entry, options, userId) {
	const from = options[NAMES_OPTION]?.[entry.id];
	if (!from || userId !== game.user.id || !isOwnKnightEntry(entry)) return;
	const to = namesOf(entry);
	const typeChanged = from.type !== to.type;
	const seerChanged = from.seer !== to.seer;
	if (!typeChanged && !seerChanged) return;

	const index = await knightIndex();
	const bookKnights = index.knights.filter((each) => !isOwnRecord(each));
	const bookSeers = index.seers.filter((each) => !isOwnRecord(each));
	const knights = worldKnights();
	// A name a book Knight or Seer has too, as a copy has until it's renamed, is left alone: the characters going by it are the book's.
	const type = typeChanged && from.type && !knightNameClash(from.type, bookKnights) ? { fromType: from.type, toType: to.type } : null;
	const seer = seerChanged && from.seer && !seerNameClash(from.seer, bookSeers) ? { fromSeer: from.seer, toSeer: to.seer } : null;
	const ready = isReadyForPlayers(entry);
	const held = (names) => Boolean(names) && holderRenames(knights, names).length > 0;

	const typeClash = typeChanged && to.type ? knightNameClash(to.type, index.knights, entry.id) : null;
	const seerClash = seerChanged && to.seer ? seerNameClash(to.seer, index.seers, entry.id) : null;
	const keepType = Boolean(typeClash) && (ready || held(type));
	const keepSeer = Boolean(seerClash) && (ready || held(seer));
	if (keepType || keepSeer) {
		await putBack(entry, { ...(keepType ? { name: from.name } : {}), ...(keepSeer ? { seer: from.seer } : {}) });
		if (keepType) ui.notifications.warn(t("ownKnight.nameKept", { name: typeClash.name, kept: from.name }));
		if (keepSeer) ui.notifications.warn(t("ownKnight.seerNameKept", { name: seerClash.name, kept: from.seer }));
	}

	const renames = holderRenames(knights, { ...(type && !keepType ? type : {}), ...(seer && !keepSeer ? seer : {}) });
	if (!renames.length) return;
	const rename = await confirmDialog({
		title: t("ownKnight.renameTitle"),
		icon: "fa-solid fa-chess-knight",
		message: escapeHTML(t("ownKnight.renameHolders", { names: renames.map(({ name }) => name).join(", ") }))
	});
	if (!rename) return;
	for (const { id, update } of renames) await game.actors.get(id)?.update(update);
}

/** Follow every rename of a written Knight or their Seer, from wherever it's made. */
export function registerOwnKnightRenameHooks() {
	Hooks.on("preUpdateJournalEntry", (entry, _changes, options) => noteNames(entry, options));
	Hooks.on("updateJournalEntry", (entry, _changes, options, userId) => followRename(entry, options, userId)
		.catch((error) => console.error(`${SYSTEM_ID} | Couldn't follow the renaming of ${entry.name}`, error)));
}
