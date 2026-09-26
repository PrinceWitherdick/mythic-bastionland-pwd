import { t } from "../chat/cards.js";
import { JOURNEY_VERSION, WALKED_METHODS, changedHexes, forgetVisit, forgetVisits, hexesEntered, normaliseJourney, normaliseVisits, recordVisits } from "../rules/journey.js";
import { serialWrites } from "../rules/queue.js";
import { hexAt, hexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID } from "../system-id.js";
import { calendarLabel, getCalendar } from "./calendar.js";
import { setOrDeleteEntry } from "../compat.js";
import { COMPANY_FLAG, findCompanyToken, wentSomewhere } from "./company.js";
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

/** Journey writes, taken one at a time. */
const queueJourneyWrite = serialWrites();

/** @returns {string} An update path into the flag. */
const flagPath = (...parts) => `flags.${SYSTEM_ID}.${JOURNEY_FLAG}.${parts.join(".")}`;

/**
 * Change where the Company has been, writing only the hexes that changed, so a
 * change to another hex, or to the Realm itself, isn't written over. GMs only.
 * @param {Scene} scene
 * @param {(journey: import("../rules/journey.js").Journey) => import("../rules/journey.js").Journey} edit
 * @returns {Promise<boolean>} Whether anything was written.
 */
function editJourney(scene, edit) {
	if (!game.user.isGM || !isRealmScene(scene)) return Promise.resolve(false);
	return queueJourneyWrite(async () => {
		const before = getJourney(scene);
		const after = edit(before);
		const keys = changedHexes(before, after);
		if (!keys.length) return false;
		const changes = { [flagPath("version")]: JOURNEY_VERSION, [flagPath("next")]: after.next };
		// A hex forgotten is a key taken out, rather than an empty record left behind.
		for (const key of keys) {
			const [path, value] = setOrDeleteEntry(flagPath("hexes", key), after.hexes[key]);
			changes[path] = value;
		}
		await scene.update(changes);
		return true;
	});
}

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
 * Hexes come into and waiting to be written, by Scene id, so four Knights'
 * Tokens reaching the same hex together are one write.
 * @type {Map<string, {scene: Scene, hexes: {col: number, row: number}[]}>}
 */
const arriving = new Map();

/** How long to wait for the rest of a Company before writing where it went. */
const GATHER = 250;

/** Write what's been gathered. */
function writeArrivals() {
	const waiting = [...arriving.values()];
	arriving.clear();
	for (const { scene, hexes } of waiting) {
		// Knights moving together come into the same hex together, which is one visit.
		const once = hexes.filter((hex, index) => index === hexes.findIndex((other) => hexKey(other) === hexKey(hex)));
		recordHexVisits(scene, once).catch((error) => console.error(`${SYSTEM_ID} | Couldn't keep the Company's journey`, error));
	}
}

/**
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes
 */
function gather(scene, hexes) {
	if (!hexes.length) return;
	if (!arriving.size) setTimeout(writeArrivals, GATHER);
	const waiting = arriving.get(scene.id) ?? { scene, hexes: [] };
	waiting.hexes.push(...hexes);
	arriving.set(scene.id, waiting);
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
	gather(scene, legHexes(token, movement, sceneGeometry(scene)));
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
