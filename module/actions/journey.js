import { t } from "../chat/cards.js";
import { JOURNEY_VERSION, WALKED_METHODS, forgetVisit, forgetVisits, hexesEntered, normaliseJourney, normaliseVisits, recordVisits } from "../rules/journey.js";
import { hexAt, hexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { COMPANY_FLAG, findCompanyToken, wentSomewhere } from "./company.js";
import { hexFlagEditor } from "./hex-flags.js";
import { isRealmScene, sceneGeometry } from "./realm.js";

/**
 * Where the Company has been on each Realm, kept on the Realm's Scene beside
 * what the GM has written about its hexes. The active GM's browser counts each
 * hex as the Company comes into it; any GM can count one in by hand, or forget one.
 */

/** The Scene flag holding the hexes the Company has come into. */
export const JOURNEY_FLAG = "journey";

/**
 * Where the Company has been on a Realm.
 * @param {Scene|null} scene
 * @returns {import("../rules/journey.js").Journey} An empty journey for a Scene that isn't a Realm.
 */
export function getJourney(scene) {
	return normaliseJourney(isRealmScene(scene) ? scene.getFlag(SYSTEM_ID, JOURNEY_FLAG) : null);
}

/**
 * How often, and when, the Company came into one hex. Reads that hex alone.
 * @param {Scene|null} scene
 * @param {{col: number, row: number}} hex
 * @returns {import("../rules/journey.js").HexVisits|null}
 */
export function getHexVisits(scene, hex) {
	if (!isRealmScene(scene)) return null;
	return normaliseVisits(scene.getFlag(SYSTEM_ID, JOURNEY_FLAG)?.hexes?.[hexKey(hex)]);
}

/**
 * Change where the Company has been, in one write. GMs only.
 * @type {(scene: Scene, edit: (journey: import("../rules/journey.js").Journey) => import("../rules/journey.js").Journey) => Promise<boolean>}
 */
const editJourney = hexFlagEditor({ flag: JOURNEY_FLAG, version: JOURNEY_VERSION, read: getJourney, besides: ({ next }) => ({ next }) });

/**
 * Count the Company coming into hexes of a Realm, in order.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 * @returns {Promise<boolean>}
 */
export const recordHexVisits = (scene, hexes) => editJourney(scene, (journey) => recordVisits(journey, hexes, getCalendar()));

/**
 * Count the Company into a hex by hand, such as one it reached before the
 * toolkit was keeping count.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<boolean>}
 */
export const markHexVisited = (scene, hex) => recordHexVisits(scene, [hex]);

/**
 * Forget the Company was ever in a hex.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @returns {Promise<boolean>}
 */
export const forgetHexVisits = (scene, hex) => editJourney(scene, (journey) => forgetVisits(journey, hex));

/**
 * Forget one time the Company came into a hex.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {number} order The arrival's.
 * @returns {Promise<boolean>}
 */
export const forgetHexVisit = (scene, hex, order) => editJourney(scene, (journey) => forgetVisit(journey, hex, order));

/**
 * @param {{count: number, last: {when: object|null}}} visits
 * @returns {string} How often the Company has been to a hex, and when last.
 */
export const visitsLabel = (visits) =>
	t(visits.count === 1 ? "gmToolkit.visits.once" : "gmToolkit.visits.many", {
		count: visits.count,
		when: visits.last.when ? calendarLabel(visits.last.when) : t("gmToolkit.visits.unknown")
	});

/* -------------------------------------------- */
/*  Following the Company                       */
/* -------------------------------------------- */

/**
 * Whether a Token stands for the Company on its Realm: the Company Token where
 * the Realm has one (p7), otherwise any player's Token.
 * @param {TokenDocument} token
 * @returns {boolean}
 */
export function movesAsCompany(token) {
	const company = findCompanyToken(token.parent);
	return company ? token.id === company.id : Boolean(token.actor?.hasPlayerOwner);
}

/**
 * Called on the active GM's client once a Company's move is gathered, with the
 * Scene and `{entered, ended}`: the hexes it came into, each once, and whether
 * a move ended in a new hex. So each rule that follows the Company hears of a
 * move once, however many Knights' Tokens made it.
 */
export const COMPANY_MOVED_HOOK = `${SYSTEM_ID}.companyMoved`;

/**
 * Hexes come into and waiting to be written, by Scene id, so four Knights'
 * Tokens reaching the same hex together are one write. `entered` holds those
 * moved into rather than placed in.
 * @type {Map<string, {scene: Scene, hexes: {col: number, row: number}[], entered: {col: number, row: number}[], ended: boolean}>}
 */
const arriving = new Map();

/** How long to wait for the rest of a Company before writing where it went. */
const GATHER = 250;

/**
 * Knights moving together come into the same hex together, which is one visit.
 * @param {{col: number, row: number}[]} hexes
 * @returns {{col: number, row: number}[]}
 */
const onceEach = (hexes) => hexes.filter((hex, index) => index === hexes.findIndex((other) => hexKey(other) === hexKey(hex)));

/** Write what's been gathered, and tell the rules that follow the Company. */
function writeArrivals() {
	const waiting = [...arriving.values()];
	arriving.clear();
	for (const { scene, hexes, entered, ended } of waiting) {
		recordHexVisits(scene, onceEach(hexes)).catch((error) => console.error(`${SYSTEM_ID} | Couldn't keep the Company's journey`, error));
		if (entered.length || ended) Hooks.callAll(COMPANY_MOVED_HOOK, scene, { entered: onceEach(entered), ended });
	}
}

/**
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 * @param {object} [move] Left out for a Company put down rather than moved.
 * @param {boolean} [move.ended] Whether the move ended in a new hex.
 */
function gather(scene, hexes, move = null) {
	if (!hexes.length && !move?.ended) return;
	if (!arriving.size) setTimeout(writeArrivals, GATHER);
	const waiting = arriving.get(scene.id) ?? { scene, hexes: [], entered: [], ended: false };
	waiting.hexes.push(...hexes);
	if (move) waiting.entered.push(...hexes);
	waiting.ended ||= Boolean(move?.ended);
	arriving.set(scene.id, waiting);
}

/**
 * Whether a Token's move has ended in another hex than it set off from. A long
 * move is handed over a leg at a time; it's one move to a new hex.
 * @param {TokenDocument} token
 * @param {object} movement From the `moveToken` hook.
 * @param {object} g
 * @returns {boolean}
 */
function endsInNewHex(token, movement, g) {
	if (movement?.pending?.waypoints?.length || !movement?.origin) return false;
	const from = hexAt(g, token.getCenterPoint(movement.origin));
	const to = hexAt(g, token.getCenterPoint());
	return Boolean(from && to && hexKey(from) !== hexKey(to));
}

/**
 * Only one browser writes each arrival, and it must be a GM's.
 * @returns {boolean}
 */
const keepsTheJourney = () => Boolean(game.user.isGM && game.users?.activeGM?.isSelf);

/**
 * The hexes a leg of a Token's move comes into. A walked move comes into each
 * hex along its way, between its waypoints too; anything else only turns up
 * where it ends.
 * @param {TokenDocument} token
 * @param {object} movement From the `moveToken` hook.
 * @param {object} g
 * @returns {{col: number, row: number}[]}
 */
export function legHexes(token, movement, g) {
	const waypoints = movement?.passed?.waypoints ?? [];
	if (!waypoints.length) return [];
	const walked = WALKED_METHODS.includes(movement.method);
	const steps = walked ? waypoints : waypoints.slice(-1);
	const at = (position) => (position ? hexAt(g, token.getCenterPoint(position)) : null);
	return hexesEntered(steps.map(at), at(movement.origin), { walkedAcross: walked ? g : null });
}

/**
 * Count the hexes the Company comes into as it moves. Taking a move back isn't
 * travelling anywhere, so it counts nothing.
 * @param {TokenDocument} token
 * @param {object} movement
 * @param {object} [operation] The update that moved it.
 */
function noticeMove(token, movement, operation) {
	const scene = token?.parent;
	if (!isRealmScene(scene) || !keepsTheJourney()) return;
	if (!wentSomewhere(movement, operation) || !movesAsCompany(token)) return;
	const g = sceneGeometry(scene);
	gather(scene, legHexes(token, movement, g), { ended: endsInNewHex(token, movement, g) });
}

/**
 * The Company's Token put on a Realm starts the Company's journey in its hex.
 * @param {TokenDocument} token
 */
function noticeCompanyPlaced(token) {
	const scene = token?.parent;
	if (!isRealmScene(scene) || !keepsTheJourney() || !token.getFlag(SYSTEM_ID, COMPANY_FLAG)) return;
	const hex = hexAt(sceneGeometry(scene), token.getCenterPoint());
	if (hex) gather(scene, [hex]);
}

/** Follow the Company about each Realm. Called during init. */
export function registerJourneyHooks() {
	Hooks.on("moveToken", noticeMove);
	Hooks.on("createToken", noticeCompanyPlaced);
}
