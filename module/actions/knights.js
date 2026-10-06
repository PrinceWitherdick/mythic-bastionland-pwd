import { t } from "../chat/cards.js";
import { read } from "../client-settings.js";
import { knightTypeFromName, knightTypeKey, knightTypeTakenBy } from "../rules/creation.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * The world's Knights, Squires among them, as the Actors directory holds them:
 * not a Token's own copy.
 * @param {(knight: Actor) => boolean} [keep] Only those this says yes to.
 * @returns {Actor[]}
 */
export const worldKnights = (keep = () => true) => (game.actors?.contents ?? Array.from(game.actors ?? []))
	.filter((actor) => actor.type === "knight" && keep(actor));

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
		onChange: () => {
			for (const app of foundry.applications.instances.values()) {
				if (app.rendered && app.options?.classes?.includes("bastionland-knight-chooser")) app.render();
			}
		}
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
		if (userId !== game.user?.id || actor.type !== "knight" || allowsDuplicateKnights()) return;
		const { knightType, slain, isSquire } = actor.system;
		if (slain || isSquire) return;
		const takenBy = knightTypeTakenBy(knightRows(), knightType);
		if (!takenBy) return;
		warnTaken(takenBy, knightType);
		actor.updateSource({ "system.knightType": "" });
	});
	Hooks.on("preUpdateActor", (actor, changes, _options, userId) => {
		if (userId !== game.user?.id || actor.type !== "knight" || allowsDuplicateKnights()) return;
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
