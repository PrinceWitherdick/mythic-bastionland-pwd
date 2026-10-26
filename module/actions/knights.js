import { t } from "../chat/cards.js";
import { renderOpenWindows } from "../apps/ui.js";
import { read } from "../client-settings.js";
import { knightTypeFromName, knightTypeKey, knightTypeTakenBy } from "../rules/creation.js";
import { isCompanyKnight, isKnight } from "../rules/knight-types.js";
import { SYSTEM_ID } from "../system-id.js";
import { isSolo } from "./solo.js";

/**
 * @param {Actor} actor
 * @returns {string[]} The players who own them, never a GM.
 */
export const playersOf = (actor) => Object.entries(actor.ownership ?? {})
	.filter(([user, level]) => user !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && !game.users.get(user)?.isGM)
	.map(([user]) => user);

/**
 * The Actor flag a solo Referee once cleared on a Knight of their own who
 * isn't one of the Company, such as a Holding's ruler. Such Knights are NPC
 * Knights now: the world setup step made those in the world so, and a Knight
 * brought in from an older compendium still carrying it is made one as it
 * comes (convertImportedNpcKnights). A Squire keeps it. Unset, a Knight rides with the Company.
 */
export const COMPANY_KNIGHT_FLAG = "companyKnight";

/**
 * Whether a Knight rides with the Company: one a player owns, or, in solo play,
 * where the Referee owns them all, any Knight not marked as one of theirs.
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
export const inCompany = (actor) => isCompanyKnight(actor)
	&& (Boolean(actor.hasPlayerOwner) || (isSolo() && actor.getFlag?.(SYSTEM_ID, COMPANY_KNIGHT_FLAG) !== false));

/**
 * Whether a character is on the Company's side: anything a player owns, or a
 * Knight riding with the Company, as in solo play.
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
export const sidesWithCompany = (actor) => Boolean(actor?.hasPlayerOwner) || inCompany(actor);

/**
 * Whether a character is one of the players' own, whom Morale doesn't touch
 * (p10): a Knight who rides with the Company, and a Squire whoever owns them.
 * The Referee's other Knights, such as a Holding's ruler, are NPCs, and waver
 * as NPCs do.
 * @param {Actor} actor
 * @returns {boolean}
 */
export const playerCharacter = (actor) => isCompanyKnight(actor) && (inCompany(actor) || Boolean(actor.system?.isSquire));

/**
 * The world's Knights of both kinds, NPC Knights and Squires among them, as
 * the Actors directory holds them: not a Token's own copy.
 * @param {(knight: Actor) => boolean} [keep] Only those this says yes to.
 * @returns {Actor[]}
 */
export const worldKnights = (keep = () => true) => (game.actors?.contents ?? Array.from(game.actors ?? []))
	.filter((actor) => isKnight(actor) && keep(actor));

/**
 * For a list of Knights to choose from: only those whoever chooses can see,
 * and any already chosen, so seeing fewer never unseats one.
 * @param {(knight: Actor) => boolean} chosen
 * @returns {(knight: Actor) => boolean}
 */
export const seenOrChosen = (chosen) => (knight) => Boolean(knight.visible) || Boolean(chosen(knight));

/** @returns {Actor[]} The world's Company Knights, Squires among them: not NPC Knights. */
export const companyKnights = () => worldKnights(isCompanyKnight);

/**
 * The world's Knights as rules/creation.js weighs who's taken which of the
 * book's Knights.
 * @param {(knight: Actor) => boolean} [keep]
 * @returns {import("../rules/creation.js").KnightRow[]}
 */
export const knightRows = (keep) => worldKnights(keep).map((actor) => ({
	id: actor.id,
	name: actor.name,
	knightType: actor.system.knightType,
	slain: Boolean(actor.system.slain),
	isSquire: Boolean(actor.system.isSquire)
}));

/** The world setting that lets more than one character be the same Knight from the book. */
export const DUPLICATE_KNIGHTS_SETTING = "duplicateKnights";

/** @returns {boolean} Whether the Referee lets two characters be the same Knight. */
export const allowsDuplicateKnights = () => read(DUPLICATE_KNIGHTS_SETTING, false) === true;

/** Register the setting. Called during init. */
export function registerDuplicateKnights() {
	game.settings.register(SYSTEM_ID, DUPLICATE_KNIGHTS_SETTING, {
		name: "bastionland.duplicateKnights.setting.name",
		hint: "bastionland.duplicateKnights.setting.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		// An open Knight chooser shows which Knights are taken, or that none is.
		onChange: () => renderOpenWindows("bastionland-knight-chooser")
	});
}

/** @returns {void} The warning that a Knight is already someone else's. */
const warnTaken = (name, knightType) => ui.notifications?.warn(t("sheet.knightTypeTaken", { name, type: knightTypeFromName(knightType) }));

/**
 * Hold every way a Knight is written to the rule the sheet and the Knight
 * chooser keep, so a macro, a Ledger revert or a duplicated Actor can't make a
 * living character a Knight another one already is, unless the Referee allows
 * it. What else the change does still happens. Called during init.
 */
export function registerDuplicateKnightGuard() {
	const getProperty = (object, key) => foundry.utils.getProperty(object, key);
	Hooks.on("preCreateActor", (actor, _data, _options, userId) => {
		if (userId !== game.user?.id || !isKnight(actor) || allowsDuplicateKnights()) return;
		const { knightType, slain, isSquire } = actor.system;
		if (slain || isSquire) return;
		const takenBy = knightTypeTakenBy(knightRows(), knightType);
		if (!takenBy) return;
		warnTaken(takenBy, knightType);
		actor.updateSource({ "system.knightType": "" });
	});
	Hooks.on("preUpdateActor", (actor, changes, _options, userId) => {
		if (userId !== game.user?.id || !isKnight(actor) || allowsDuplicateKnights()) return;
		const typed = getProperty(changes, "system.knightType");
		if (typed === undefined || knightTypeKey(typed) === knightTypeKey(actor.system.knightType)) return;
		if (getProperty(changes, "system.slain") ?? actor.system.slain) return;
		if (getProperty(changes, "system.isSquire") ?? actor.system.isSquire) return;
		const takenBy = knightTypeTakenBy(knightRows(), typed, actor.id);
		if (!takenBy) return;
		warnTaken(takenBy, typed);
		delete changes["system.knightType"];
		if (changes.system) delete changes.system.knightType;
	});
}
