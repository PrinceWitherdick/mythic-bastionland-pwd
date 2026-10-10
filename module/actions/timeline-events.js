import { t } from "../chat/cards.js";
import { holdingName } from "../rules/realm.js";
import { COMPANY_TRACK, timelineKeys } from "../rules/timeline.js";
import { sessionRecap } from "../rules/session-end.js";
import { playerHexView } from "../rules/travels.js";
import { forgetEverywhere, keptFromPlayers, recordOnTrack, recordOnTracks, timelineNow } from "./timeline-record.js";
import { travelsSources } from "./travels.js";

/**
 * What the game writes on the Timeline by itself, one recorder for each
 * thing that happens. Each is called beside the code that makes it happen,
 * and never stops it.
 */

const lines = (...parts) => parts.flat().filter(Boolean).join("\n");

/**
 * The Season, or the Age, turns: a row closing the Season on the Company's
 * thread, one on each Knight's that something befell, and one on each Domain's.
 * @param {string} ended The Season that ended.
 * @param {object} turn
 * @param {string} turn.kind One of SEASON_TURNS.
 * @param {string} turn.title The card's title, such as "Harvest Begins".
 * @param {string|null} [turn.note] Said before anything else, such as where the Company journeyed.
 * @param {{name: string, lines: string[]}|null} [turn.collection] The Realm's collection.
 * @param {{actorId: string, pursuit: string|null, lines: string[]}[]} [turn.knights] What befell each of the Company beyond their Virtues restored, from passTime.
 * @param {{domainId?: string, lines: string[]}[]} [turn.domains] What befell each Domain.
 */
export async function timelineSeasonTurn(ended, { kind, title, note = null, collection = null, knights = [], domains = [] }) {
	const key = timelineKeys.turn(ended);
	const row = (body) => ({ source: kind, key, title, body });
	await Promise.all([
		recordOnTrack(COMPANY_TRACK, row(lines(note, collection?.lines ?? [])), { when: ended }),
		...knights.map(({ actorId, pursuit, lines: befell }) => {
			const knight = actorId ? game.actors?.get(actorId) : null;
			if (!knight || (!befell.length && !pursuit)) return null;
			return recordOnTrack(knight, row(lines(pursuit ? t("timeline.auto.pursuit", { pursuit }) : null, befell)), { when: ended });
		}),
		...domains.map(({ domainId, lines: told }) => {
			const domain = domainId ? game.actors?.get(domainId) : null;
			return domain ? recordOnTrack(domain, row(lines(told)), { when: ended }) : null;
		})
	]);
}

/**
 * A Myth is completed: on the Company's thread, the Realm's, and those of the
 * Knights given Glory for it.
 * @param {object} myth
 * @param {Scene} myth.scene The Realm it was in.
 * @param {string} myth.completedId As completedMythId names it.
 * @param {string} myth.name
 * @param {Actor[]} [myth.knights]
 */
export function timelineMythCompleted({ scene, completedId, name, knights = [] }) {
	return recordOnTracks([COMPANY_TRACK, scene, ...knights], {
		source: "myth",
		key: timelineKeys.myth(completedId),
		title: t("timeline.auto.mythCompleted", { name }),
		place: scene?.name ?? ""
	});
}

/**
 * A Myth unresolved again takes its rows off every thread.
 * @param {string} completedId
 */
export const timelineMythUndone = (completedId) => forgetEverywhere(timelineKeys.myth(completedId));

/**
 * A session ends: on the Company's thread, with what the Referee wrote of it
 * and what the players plan, when the Referee chose to share it.
 * @param {string} played The Season it was played in.
 * @param {object} session
 * @param {string} [session.recap]
 * @param {string} [session.plans]
 * @param {string} [session.passed] How much time passed, as the card says.
 */
export function timelineSession(played, { recap = "", plans = "", passed = "" }) {
	return recordOnTrack(COMPANY_TRACK, {
		source: "session",
		key: timelineKeys.session(played, Date.now()),
		title: t("timeline.auto.session"),
		body: lines(sessionRecap(recap, plans, t("sessionEnd.card.plans")), passed)
	}, { when: played });
}

/**
 * A Knight reaches a new Rank.
 * @param {Actor} knight
 * @param {string} rank One of RANKS' keys.
 */
export function timelineRank(knight, rank) {
	return recordOnTrack(knight, { source: "rank", key: timelineKeys.rank(rank), title: t("timeline.auto.rank", { rank: t(`rank.${rank}`) }) });
}

/**
 * A Knight takes a Scar, in the Season it was taken.
 * @param {Actor} knight
 * @param {Item} scar
 * @param {string} [effect] What it does to them.
 */
export function timelineScar(knight, scar, effect = "") {
	const foe = scar.system?.foeName;
	return recordOnTrack(knight, {
		source: "scar",
		key: timelineKeys.scar(scar.id),
		title: scar.name,
		body: lines(effect, foe ? t("timeline.auto.scarBy", { name: foe }) : null)
	}, { when: scar.system?.season || undefined });
}

/**
 * A Squire is Knighted, and their thread carries on as a Knight's.
 * @param {Actor} squire
 * @param {Actor|null} master Who they served.
 */
export function timelineKnighted(squire, master) {
	return recordOnTrack(squire, {
		source: "knighted",
		key: timelineKeys.knighted(),
		title: t("timeline.auto.knighted"),
		body: master ? t("timeline.auto.served", { name: master.name }) : ""
	});
}

/**
 * A Knight falls: on their own thread and the Company's.
 * @param {Actor} knight
 */
export function timelineFallen(knight) {
	const title = t("timeline.auto.fell", { name: knight.name });
	return Promise.all([
		recordOnTrack(knight, { source: "death", key: timelineKeys.death(), title }),
		recordOnTrack(COMPANY_TRACK, { source: "death", key: timelineKeys.death(knight.id), title })
	]);
}

/**
 * Someone takes up a fallen Knight's journey: on both their threads.
 * @param {Actor} fallen
 * @param {Actor} taken
 */
export function timelineTookUp(fallen, taken) {
	return Promise.all([
		recordOnTrack(fallen, { source: "succeeded", key: timelineKeys.succeeded(), title: t("timeline.auto.carriedOn", { name: taken.name }) }),
		recordOnTrack(taken, { source: "tookUp", key: timelineKeys.tookUp(fallen.id), title: t("timeline.auto.tookUp", { name: fallen.name }) })
	]);
}

/**
 * A Domain is founded: on its own thread, its ruler's, and its Realm's when
 * it rules a Holding there and the players can see it.
 * @param {Actor} knight Its ruler.
 * @param {Actor} domain
 * @param {Scene|null} [realm] The Realm its Holding is in.
 */
export function timelineFounded(knight, domain, realm = null) {
	return Promise.all([
		recordOnTrack(domain, { source: "founded", key: timelineKeys.founded(), title: t("timeline.auto.foundedBy", { name: knight.name }) }),
		recordOnTrack(knight, { source: "founded", key: timelineKeys.founded(domain.id), title: t("timeline.auto.founded", { domain: domain.name }) }),
		realm && !keptFromPlayers(domain) ? recordOnTrack(realm, { source: "founded", key: timelineKeys.domain(domain.id), title: t("timeline.auto.founded", { domain: domain.name }) }) : null
	]);
}

/**
 * A Domain makes its Crisis Roll: what came of it, and the Crises it brought.
 * @param {Actor} domain
 * @param {object} roll
 * @param {string} roll.result One of CRISIS_RESULTS.
 * @param {string[]} roll.crises The names of the Crises it brought.
 */
export function timelineCrisisRoll(domain, { result, crises }) {
	return recordOnTrack(domain, {
		source: "crisis",
		key: timelineKeys.crisis(timelineNow(), Date.now()),
		title: t("domain.crisisRoll"),
		body: lines(t(`domain.results.crisis.${result}`), crises)
	});
}

/**
 * A Domain passes to a new ruler, by succession or conquest: on its thread,
 * and on the new ruler's when they're a Knight.
 * @param {Actor} domain
 * @param {"passed"|"seized"} how
 * @param {{name: string, knight: Actor|null}} ruler
 * @param {string} said What the card says of it, such as "Eve seizes Tal's Domain from Tal".
 */
export function timelineNewRuler(domain, how, ruler, said) {
	const season = timelineNow();
	const at = Date.now();
	return Promise.all([
		recordOnTrack(domain, { source: how, key: timelineKeys[how](season, at), title: said }),
		ruler.knight ? recordOnTrack(ruler.knight, { source: "rules", key: timelineKeys.rules(domain.id, season, at), title: said }) : null
	]);
}

/**
 * A Holding is granted to a Knight: on the Domain's thread and the Knight's,
 * and the Realm's unless the players can see neither.
 * @param {Scene} realm
 * @param {{id: string}} holding
 * @param {string} name The Holding's name, as the map shows it.
 * @param {Actor} domain
 * @param {Actor} knight
 */
export function timelineHoldingGranted(realm, holding, name, domain, knight) {
	const seen = !keptFromPlayers(domain) || !keptFromPlayers(knight);
	return recordOnTracks([seen ? realm : null, domain, knight], {
		source: "granted",
		key: timelineKeys.holding(realm.id, holding.id),
		title: t("timeline.auto.granted", { holding: name, name: knight.name }),
		refresh: ["title"]
	});
}

/**
 * @param {Scene} scene
 * @returns {object|null} What the players know of the Realm, never what the Referee does, or null where it can't be read.
 */
function playersSources(scene) {
	try {
		const sources = travelsSources(scene);
		return sources ? { ...sources, gm: false } : null;
	} catch {
		return null;
	}
}

/**
 * A hex as the players know it, or null where it can't be read.
 * @param {object|null} sources From playersSources.
 * @param {{col: number, row: number}} hex
 */
function seenAt(sources, hex) {
	try {
		return sources ? playerHexView(sources, hex) : null;
	} catch {
		return null;
	}
}

/**
 * @param {ReturnType<typeof playerHexView>|null} view
 * @returns {string|null} What there is in it worth a row: a Holding, a Landmark, or a Myth, unnamed.
 */
function worthNoting(view) {
	if (view?.holding) return holdingName(view.holding, t);
	if (view?.landmark) return view.landmark.name || t(`realm.landmarks.${view.landmark.type}`);
	if (view?.myth) return t("timeline.auto.mythHex", { number: view.myth.number });
	return null;
}

/**
 * The Company comes to a Holding, a Landmark or a Myth's hex for the first
 * time: on the Company's thread and the Realm's.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes Each come into for the first time.
 */
export async function timelineArrivals(scene, hexes) {
	const sources = playersSources(scene);
	const arrivals = hexes.flatMap((hex) => {
		const view = seenAt(sources, hex);
		const thing = worthNoting(view);
		return thing ? [{ source: "visit", key: timelineKeys.visit(scene.id, hex), title: t("timeline.auto.arrived", { place: view.name || thing }), place: scene.name }] : [];
	});
	if (arrivals.length) await recordOnTracks([COMPANY_TRACK, scene], arrivals);
}

/**
 * The Company keeps a note on a hex: on the Company's thread and the Realm's,
 * the latest words written over the last. A note cleared takes its row with it.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string} text
 * @param {User} user Who wrote it.
 */
export function timelinePartyNote(scene, hex, text, user) {
	if (!text.trim()) return timelineNoteForgotten(scene, hex);
	const view = seenAt(playersSources(scene), hex);
	return recordOnTracks([COMPANY_TRACK, scene], {
		source: "note",
		key: timelineKeys.note(scene.id, hex),
		title: t("timeline.auto.partyNote", { name: user.name }),
		place: view?.name || worthNoting(view) || scene.name,
		body: text.trim(),
		refresh: ["body", "title"]
	});
}

/**
 * The Company's note on a hex is cleared or forgotten: its row comes off the Timeline.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 */
export const timelineNoteForgotten = (scene, hex) => forgetEverywhere(timelineKeys.note(scene.id, hex));
