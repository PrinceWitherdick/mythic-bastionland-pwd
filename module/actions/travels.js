import { t } from "../chat/cards.js";
import { reducesMotion } from "../client-settings.js";
import { hexCentre } from "../rules/realm-geometry.js";
import { sightedMarks } from "../rules/sighted.js";
import { searchable } from "../rules/text.js";
import { pickTravelsRealm, playerHexView, travelsList, viewSearchWords, viewWords } from "../rules/travels.js";
import { calendarLabel } from "./calendar.js";
import { companyTokenHex, findCompanyToken } from "./company.js";
import { getHexShared, partyNoteBy } from "./hex-shared.js";
import { getJourney } from "./journey.js";
import { getRealm, hexHiddenByHand, isRealmScene, sceneGeometry } from "./realm.js";
import { getSighted } from "./sighted.js";
import { keptFromMe, realmKnown } from "./solo.js";

/**
 * The players' record of the Realm, read off a Scene: what each window and
 * sheet page that shows it is drawn from. Only what a player could already
 * see goes in, whoever is looking.
 */

/**
 * @param {Scene|null} scene
 * @returns {import("../rules/travels.js").TravelsSources|null} Null for a Scene that isn't a Realm.
 */
export function travelsSources(scene) {
	const entry = getRealm(scene);
	if (!entry) return null;
	const handHidden = (hex) => hexHiddenByHand(scene, hex);
	return {
		realm: realmKnown(entry.realm),
		g: sceneGeometry(scene),
		journey: getJourney(scene),
		shared: getHexShared(scene),
		// The marks are read off the whole Realm, as the map draws them, whoever is looking.
		marks: sightedMarks(entry.realm, getSighted(scene), handHidden),
		handHidden,
		companyHex: companyTokenHex(scene)
	};
}

/**
 * @param {{count: number, last: {when: object|null}}|null} visits
 * @returns {string} How often the Company has been there, and when last.
 */
function visitsText(visits) {
	if (!visits) return t("travels.visits.never");
	return t(visits.count === 1 ? "travels.visits.once" : "travels.visits.many", {
		count: visits.count,
		when: visits.last.when ? calendarLabel(visits.last.when) : t("travels.visits.unknown")
	});
}

/**
 * One hex of the list, worded.
 * @param {import("../rules/travels.js").PlayerHexView} view
 * @param {boolean} onMap Whether the Realm is the one on the canvas, so the hex can be shown there.
 * @returns {object}
 */
function rowContext(view, onMap) {
	const words = viewWords(view, t);
	return {
		key: view.key,
		hex: view.key,
		title: words.title,
		terrain: words.terrain,
		features: words.features.join(", "),
		visits: view.visits ? visitsText(view.visits) : (words.sighted || t("travels.heardOf")),
		here: view.here,
		told: view.told.length > 0,
		noted: Boolean(view.party),
		onMap,
		search: searchable(viewSearchWords(view, words).join(" "))
	};
}

/**
 * The Realms the players' record can show, the one shown first.
 * @param {string|null} [chosen] The id last chosen.
 * @returns {{scenes: {id: string, name: string, selected: boolean}[], scene: Scene|null}}
 */
export function travelsRealmChoice(chosen = null) {
	const scenes = (game.scenes?.contents ?? [...(game.scenes ?? [])]).filter((scene) => isRealmScene(scene));
	// Where the Company stands and where it has been are read only if nothing before them settles it.
	const id = pickTravelsRealm(scenes.map((scene) => ({
		id: scene.id,
		viewed: scene.id === canvas?.scene?.id,
		active: Boolean(scene.active),
		get company() {
			return Boolean(findCompanyToken(scene));
		},
		get travelled() {
			return Object.keys(getJourney(scene).hexes).length > 0;
		}
	})), chosen);
	return {
		scenes: scenes.map((scene) => ({ id: scene.id, name: scene.name, selected: scene.id === id })),
		scene: scenes.find((scene) => scene.id === id) ?? null
	};
}

/**
 * Everything the list of places shows for a Realm.
 * @param {string|null} [chosen] The Realm last chosen.
 * @returns {object}
 */
export function travelsListContext(chosen = null) {
	const { scenes, scene } = travelsRealmChoice(chosen);
	const sources = travelsSources(scene);
	if (!sources) return { realms: scenes, noRealm: true };
	const list = travelsList(sources);
	const onMap = canvas?.scene?.id === scene.id;
	return {
		realms: scenes,
		chooseRealm: scenes.length > 1,
		sceneId: scene.id,
		summary: t("travels.summary", { count: list.count, total: list.total }),
		visited: list.visited.map((view) => rowContext(view, onMap)),
		heardOf: list.heardOf.map((view) => rowContext(view, onMap)),
		none: !list.visited.length && !list.heardOf.length,
		// A GM outside solo play sees the page as the players do, and is told so.
		asPlayers: Boolean(game.user?.isGM) && !keptFromMe()
	};
}

/**
 * Everything one hex's window shows.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {object}
 */
export function travelsHexContext(scene, hex) {
	const sources = travelsSources(scene);
	if (!sources) return { missing: true };
	const view = playerHexView(sources, hex);
	const words = viewWords(view, t);
	return {
		hex: view.key,
		title: words.title,
		terrain: words.terrain,
		features: words.features,
		visits: visitsText(view.visits),
		visited: Boolean(view.visits),
		here: view.here,
		sighted: words.sighted,
		told: view.told.map((told) => ({
			note: told.note,
			when: told.when ? t("travels.told.when", { when: calendarLabel(told.when) }) : null
		})),
		party: view.party?.text ?? "",
		partyBy: partyNoteBy(view.party),
		openable: view.openable,
		// A player's note goes through a GM, so with none here the box waits.
		canWrite: view.openable && (Boolean(game.user?.isGM) || Boolean(game.users?.activeGM)),
		noGM: !game.user?.isGM && !game.users?.activeGM,
		onMap: canvas?.scene?.id === scene.id,
		asPlayers: Boolean(game.user?.isGM) && !keptFromMe()
	};
}

/**
 * Show a hex on the map this user is looking at, with a ping only they see.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<void>}
 */
export async function showHexOnMap(scene, hex) {
	if (!scene || canvas?.scene?.id !== scene.id) return;
	const point = hexCentre(sceneGeometry(scene), hex);
	await canvas.animatePan({ ...point, duration: reducesMotion() ? 0 : 400 });
	canvas.controls?.drawPing?.(point, { style: CONFIG.Canvas.pings?.types?.PULSE ?? "pulse", user: game.user });
}
