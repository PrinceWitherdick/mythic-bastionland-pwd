import { getCalendar } from "../actions/calendar.js";
import { movesAsCompany } from "../actions/journey.js";
import { isRealmScene } from "../actions/realm.js";
import { t } from "../chat/cards.js";
import { COMPANY_PACE_SETTING, companyPace, paceSoFar } from "../rules/journey.js";
import { SYSTEM_PATH, SYSTEM_ID } from "../system-id.js";
import { BLOOD, OCHRE, VERDIGRIS, WATER } from "./inks.js";

/**
 * Foundry's own Token ruler, which on a Realm also tells the Company's pace
 * while its Token is dragged: Trek, Gallop or Cruise for the hexes it will have
 * come into this Phase, or further than a Phase's travel goes (p18). The book
 * would have the players know what a move costs before they make it (p16).
 */

/** Core's waypoint label with the pace beside the distance; the same template on v13 and v14. */
export const WAYPOINT_LABEL_TEMPLATE = `${SYSTEM_PATH}/templates/hud/waypoint-label.hbs`;

/** The path's colour for each pace, in the Realm's own inks: verdigris, ochre, river blue and blood. */
export const PACE_COLOURS = Object.freeze({ trek: VERDIGRIS, gallop: OCHRE, cruise: WATER, beyond: BLOOD });

/**
 * @param {TokenDocument|undefined} token
 * @returns {number|null} The hexes the Company has come into this Phase, where the Token is the Company's on a
 *   Realm; null otherwise.
 */
function paceBefore(token) {
	if (!isRealmScene(token?.parent) || !movesAsCompany(token)) return null;
	return paceSoFar(game.settings.get(SYSTEM_ID, COMPANY_PACE_SETTING), getCalendar());
}

/**
 * @param {TokenDocument|undefined} token
 * @param {number|null} before As paceBefore has it.
 * @param {number} distance The distance dragged so far, in the Scene's grid units.
 * @returns {string|null} The pace's key, or null where the drag hasn't left its hex.
 */
function paceKey(token, before, distance) {
	if (before === null) return null;
	const hexes = Math.round(distance / (token.parent.grid?.distance || 1));
	return hexes > 0 ? companyPace(before + hexes) : null;
}

/**
 * The pace a drag of the Company's Token makes, or null where it isn't the
 * Company on a Realm, or the drag hasn't left its hex.
 * @param {TokenDocument|undefined} token
 * @param {number} distance The distance dragged so far, in the Scene's grid units.
 * @param {number|null} [before] As paceBefore has it, where already read.
 * @returns {{key: string, label: string, ink: string}|null} With its colour as CSS has it.
 */
export function rulerPace(token, distance, before = paceBefore(token)) {
	const key = paceKey(token, before, distance);
	return key ? { key, label: t(`realm.ruler.${key}`), ink: `#${PACE_COLOURS[key].toString(16).padStart(6, "0")}` } : null;
}

/**
 * Foundry's Token ruler, telling the Company's pace on a Realm.
 * @param {typeof foundry.canvas.placeables.tokens.TokenRuler} Base
 * @returns {typeof foundry.canvas.placeables.tokens.TokenRuler}
 */
export function realmTokenRuler(Base) {
	return class RealmTokenRuler extends Base {
		static WAYPOINT_LABEL_TEMPLATE = WAYPOINT_LABEL_TEMPLATE;

		/** The Company's pace so far, read once a refresh rather than for every hex it highlights. */
		#before;

		/** @override */
		refresh(state) {
			this.#before = undefined;
			return super.refresh(state);
		}

		/** @returns {number|null} As paceBefore has it, for this refresh. */
		#paceBefore() {
			if (this.#before === undefined) this.#before = paceBefore(this.token?.document);
			return this.#before;
		}

		/** @override */
		_getWaypointLabelContext(waypoint, state) {
			const context = super._getWaypointLabelContext(waypoint, state);
			// Told where the drag ends, once.
			if (!context || waypoint.next) return context;
			const pace = rulerPace(this.token?.document, waypoint.measurement?.distance ?? 0, this.#paceBefore());
			return pace ? { ...context, pace } : context;
		}

		/** @override */
		_getGridHighlightStyle(waypoint, offset) {
			const style = super._getGridHighlightStyle(waypoint, offset);
			if (!style) return style;
			const key = paceKey(this.token?.document, this.#paceBefore(), waypoint.measurement?.distance ?? 0);
			return key ? { ...style, color: PACE_COLOURS[key] } : style;
		}
	};
}

/** Use the Realm's Token ruler. Called during init. */
export function registerRealmTokenRuler() {
	CONFIG.Token.rulerClass = realmTokenRuler(CONFIG.Token.rulerClass);
}
