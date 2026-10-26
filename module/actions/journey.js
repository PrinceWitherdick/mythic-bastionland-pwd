import { t } from "../chat/cards.js";
import { JOURNEY_VERSION, WALKED_METHODS, forgetVisit, forgetVisits, hexesEntered, lastOfEach, normaliseJourney, normaliseVisits, recordVisits } from "../rules/journey.js";
import { hexAt, hexKey, parseHexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { COMPANY_FLAG, findCompanyToken, forcedMove, wentSomewhere } from "./company.js";
import { hexFlagEditor } from "./hex-flags.js";
import { sidesWithCompany } from "./knights.js";
import { isRealmScene, sceneGeometry } from "./realm.js";
import { timelineArrivals } from "./timeline-events.js";

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
 * Count the Company coming into hexes of a Realm, in order, and say which
 * arrival each became, so one move's arrivals can be forgotten and no other's.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 * @returns {Promise<Record<string, number>|null>} Each hex's arrival order by its key, or null where nothing was written.
 */
async function recordArrivals(scene, hexes) {
	let orders = null;
	await editJourney(scene, (journey) => {
		const next = recordVisits(journey, hexes, getCalendar());
		orders = next === journey ? null : Object.fromEntries(hexes.map((hex, index) => [hexKey(hex), journey.next + index]));
		return next;
	});
	return orders;
}

/**
 * Count the Company coming into hexes of a Realm, in order.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 * @returns {Promise<boolean>}
 */
export const recordHexVisits = async (scene, hexes) => Boolean(await recordArrivals(scene, hexes));

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
 * Forget the times the Company came into some hexes on one move, as when dire
 * weather turned out to have kept it from them. Each hex's arrival is the one
 * `orders` names. A hex it doesn't name keeps its arrivals, since the one
 * that's last may be another move's, or the move's own may never have been written.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 * @param {Record<string, number>|null} [orders] The move's arrival in each hex, by hex key.
 * @returns {Promise<boolean>}
 */
export const forgetMoveVisits = (scene, hexes, orders = null) => editJourney(scene, (journey) => hexes.reduce((next, hex) => {
	const order = orders?.[hexKey(hex)];
	return Number.isFinite(order) ? forgetVisit(next, hex, order) : next;
}, journey));

/**
 * The Scene flag holding the move dire weather may be holding back, till the
 * Referee lets it on or keeps it back, or the Company moves again: the move's
 * own id, the hex keys it came into, and whether, played alone, nothing there
 * is found meanwhile (`kept`, left out where it is).
 */
export const HELD_BACK_FLAG = "heldBack";

/**
 * @param {Scene|null} scene
 * @returns {{move: string|null, hexes: Set<string>, keys: Set<string>}} The move dire weather may be holding back,
 *   the hexes it came into, and those of them kept from being found, played alone, by their keys.
 */
export function heldBack(scene) {
	const flag = isRealmScene(scene) ? scene.getFlag?.(SYSTEM_ID, HELD_BACK_FLAG) : null;
	const raw = Array.isArray(flag) ? flag : Array.isArray(flag?.hexes) ? flag.hexes : [];
	const hexes = new Set(raw.filter((key) => typeof key === "string").map(parseHexKey).filter(Boolean).map(hexKey));
	// Hex keys alone, or with no word of being kept, are from when only a move played alone was written.
	return { move: typeof flag?.move === "string" ? flag.move : null, hexes, keys: flag?.kept === false ? new Set() : hexes };
}

/**
 * @param {Scene|null} scene
 * @param {{col: number, row: number}|null} hex
 * @returns {boolean} Whether dire weather may be keeping the Company from the hex, its Token there or not.
 */
export const heldBackFrom = (scene, hex) => Boolean(hex) && heldBack(scene).keys.has(hexKey(hex));

/**
 * Keep the move dire weather may be holding back, or none. Written only where
 * it changes. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes The hexes it came into.
 * @param {object} [options]
 * @param {string|null} [options.move] The move's own id, so its arrival card can tell whether it's still the one held back.
 * @param {boolean} [options.kept] Whether, played alone, nothing in them is found meanwhile.
 * @returns {Promise<boolean>} Whether it was written.
 */
export async function setHeldBack(scene, hexes, { move = null, kept = true } = {}) {
	if (!game.user.isGM || !isRealmScene(scene)) return false;
	const now = scene.getFlag(SYSTEM_ID, HELD_BACK_FLAG);
	const next = hexes.length ? { move, hexes: hexes.map(hexKey), ...(kept ? {} : { kept: false }) } : null;
	if (JSON.stringify(now ?? null) === JSON.stringify(next)) return false;
	await (next ? scene.setFlag(SYSTEM_ID, HELD_BACK_FLAG, next) : scene.unsetFlag(SYSTEM_ID, HELD_BACK_FLAG));
	return true;
}

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
 * the Realm has one (p7), otherwise any player's Token, or a Token of a Knight
 * riding with the Company, as in solo play.
 * @param {TokenDocument} token
 * @returns {boolean}
 */
export function movesAsCompany(token) {
	const company = findCompanyToken(token.parent);
	return company ? token.id === company.id : sidesWithCompany(token.actor);
}

/**
 * Called on the active GM's client once a Company's move is gathered, with the
 * Scene and `{entered, ended, from, chosen, orders}`: the hexes it came into, each once
 * where it was last come into, so the last is where it ended, whether a move ended in a new hex, the hex it set off from, whether the
 * Company chose to go, rather than being put there as a blind drift puts it, and a promise of the arrival
 * each hex became once the journey is written (null where it wasn't).
 * So each rule that follows the Company hears of a move once, however many
 * Knights' Tokens made it.
 */
export const COMPANY_MOVED_HOOK = `${SYSTEM_ID}.companyMoved`;

/**
 * Called on the active GM's client with the Scene and the hexes the Company
 * was set down in rather than moved into, such as its Token first put on a
 * Realm or stood again after it was lost.
 */
export const COMPANY_PLACED_HOOK = `${SYSTEM_ID}.companyPlaced`;

/**
 * Hexes come into and waiting to be written, by Scene id, so four Knights'
 * Tokens reaching the same hex together are one write. `entered` holds those
 * moved into rather than placed in.
 * @type {Map<string, {scene: Scene, hexes: {col: number, row: number}[], entered: {col: number, row: number}[], ended: boolean, from: {col: number, row: number}|null, chosen: boolean}>}
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
	for (const { scene, hexes, entered, ended, from, chosen } of waiting) {
		const visited = onceEach(hexes);
		// Read before they're counted: the hexes it comes to for the first time go on the Timeline.
		const first = visited.filter((hex) => !getHexVisits(scene, hex)?.count);
		const recorded = recordArrivals(scene, visited);
		recorded
			.then(() => timelineArrivals(scene, first))
			.catch((error) => console.error(`${SYSTEM_ID} | Couldn't keep the Company's journey`, error));
		// Which arrival each hex became, once written, so a move taken back forgets its own and no other's.
		const orders = recorded.catch(() => null);
		if (entered.length || ended) Hooks.callAll(COMPANY_MOVED_HOOK, scene, { entered: lastOfEach(entered), ended, from, chosen, orders });
		const moved = new Set(entered.map(hexKey));
		const placed = visited.filter((hex) => !moved.has(hexKey(hex)));
		if (placed.length) Hooks.callAll(COMPANY_PLACED_HOOK, scene, placed);
	}
}

/**
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 * @param {object} [move] Left out for a Company put down rather than moved.
 * @param {boolean} [move.ended] Whether the move ended in a new hex.
 * @param {{col: number, row: number}|null} [move.from] The hex it set off from.
 * @param {boolean} [move.forced] Whether it was a move the Company didn't choose.
 */
function gather(scene, hexes, move = null) {
	if (!hexes.length && !move?.ended) return;
	if (!arriving.size) setTimeout(writeArrivals, GATHER);
	const waiting = arriving.get(scene.id) ?? { scene, hexes: [], entered: [], ended: false, from: null, chosen: false };
	waiting.hexes.push(...hexes);
	if (move) waiting.entered.push(...hexes);
	waiting.ended ||= Boolean(move?.ended);
	// The first leg's start is where the whole move set off from.
	waiting.from ??= move?.from ?? null;
	waiting.chosen ||= Boolean(move) && !move.forced;
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
 * @param {object} movement From the `moveToken` hook.
 * @param {object} [operation] The update that moved it.
 * @returns {boolean} Whether the move was one the Company didn't choose: a drift when travelling blind, or the
 *   Referee setting it down with unconstrained Movement, as it passes Barriers.
 */
export const forcedTravel = (movement, operation) => forcedMove(operation) || Boolean(movement?.constrainOptions?.ignoreWalls);

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
	const from = movement?.origin ? hexAt(g, token.getCenterPoint(movement.origin)) : null;
	gather(scene, legHexes(token, movement, g), { ended: endsInNewHex(token, movement, g), from, forced: forcedTravel(movement, operation) });
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
