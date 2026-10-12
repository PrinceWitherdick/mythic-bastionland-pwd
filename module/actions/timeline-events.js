import { t } from "../chat/cards.js";
import { holdingName } from "../rules/realm.js";
import { scarForRoll } from "../rules/scars.js";
import { completedMythId } from "../rules/season-log.js";
import { COMPANY_TRACK, timelineKeys } from "../rules/timeline.js";
import { sessionRecap } from "../rules/session-end.js";
import { playerHexView } from "../rules/travels.js";
import { forgetEverywhere, keptFromPlayers, recordOnTrack, recordOnTracks, timelineNow } from "./timeline-record.js";
import { playersHexView, travelsSources } from "./travels.js";

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
		key: timelineKeys.holding(realm.id, holding.id, timelineNow(), knight.id),
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
 * One hex as the players know it, read for that hex alone, or null where it can't be read.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 */
function oneSeenAt(scene, hex) {
	try {
		return playersHexView(scene, hex);
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
 * A hex as the players know it, and where a row about it says it was.
 * @param {Scene} scene
 * @param {{col: number, row: number}|null} hex
 * @returns {{view: ReturnType<typeof playerHexView>|null, place: string}} The hex's name, or what there is in it, or else the Realm's name.
 */
function placeOf(scene, hex) {
	const view = hex ? oneSeenAt(scene, hex) : null;
	return { view, place: view?.name || worthNoting(view) || scene.name };
}

/**
 * The Company comes to a Holding, a Landmark or a Myth's hex for the first
 * time: on the Company's thread and the Realm's.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} hexes Each come into for the first time.
 */
export async function timelineArrivals(scene, hexes) {
	if (!hexes.length) return;
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
 * the latest words written over the last, in the Season they were written.
 * A note cleared takes its row with it.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string} text
 * @param {User} user Who wrote it.
 */
export function timelinePartyNote(scene, hex, text, user) {
	if (!text.trim()) return timelineNoteForgotten(scene, hex);
	return recordOnTracks([COMPANY_TRACK, scene], {
		source: "note",
		key: timelineKeys.note(scene.id, hex),
		title: t("timeline.auto.partyNote", { name: user.name }),
		place: placeOf(scene, hex).place,
		body: text.trim(),
		refresh: ["body", "title", "season"]
	});
}

/**
 * The Company's note on a hex is cleared or forgotten: its row comes off the Timeline.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 */
export const timelineNoteForgotten = (scene, hex) => forgetEverywhere(timelineKeys.note(scene.id, hex));

/**
 * A duel ends: on each duelist's thread, who won and the Glory it moved. A
 * sparring bout is practice, shaken off, and no milestone.
 * @param {string} messageId The duel's card, which ends once.
 * @param {import("../rules/duel.js").DuelState} duel
 * @param {Actor[]} actors Both duelists, in the duel's order.
 * @param {string|null} victorUuid
 * @param {Record<string, string[]>} glory Each duelist's Glory lines, by their uuid.
 */
export function timelineDuel(messageId, duel, actors, victorUuid, glory = {}) {
	if (duel.sparring) return null;
	const kind = t(`duel.kinds.${duel.kind}.label`);
	return Promise.all(duel.duelists.map(({ uuid }, index) => {
		// The other is named as the table saw them, by their Token.
		const name = duel.duelists[1 - index]?.name ?? "";
		const said = !victorUuid ? "duelNone" : victorUuid === uuid ? "duelWon" : "duelLost";
		return recordOnTrack(actors[index], {
			source: "duel",
			key: timelineKeys.duel(messageId),
			title: t(`timeline.auto.${said}`, { kind, name }),
			body: lines(glory[uuid] ?? [])
		});
	}));
}

/**
 * Somebody is Mortally Wounded.
 * @param {Actor} actor
 * @param {string} [cause] What dealt it, as a line.
 */
export function timelineMortalWound(actor, cause = "") {
	return recordOnTrack(actor, { source: "mortal", key: timelineKeys.mortal(timelineNow(), Date.now()), title: t("timeline.auto.mortal"), body: cause });
}

/**
 * A Knight takes a Mortal Wound in somebody's place: on both their threads.
 * A warden Doom kills has their death row instead.
 * @param {Actor} warden
 * @param {Actor} victim
 * @param {{doomed?: boolean}} [options]
 */
export function timelineWarded(warden, victim, { doomed = false } = {}) {
	const key = timelineKeys.ward(timelineNow(), Date.now());
	return Promise.all([
		doomed ? null : recordOnTrack(warden, { source: "ward", key, title: t("timeline.auto.warded", { name: victim.name }) }),
		recordOnTrack(victim, { source: "ward", key, title: t("timeline.auto.spared", { name: warden.name }) })
	]);
}

/**
 * Glory is awarded for a tournament or a battle: on each Knight's thread with
 * what it did to their Glory, and the Company's naming those the players can
 * see. A Myth's Glory is in the Myth's own row.
 * @param {string} award One of GLORY_AWARDS.
 * @param {{actor: Actor, lines: string[]}[]} entries
 */
export function timelineGloryAwarded(award, entries) {
	if (award === "myth" || !entries.length) return null;
	const season = timelineNow();
	const key = timelineKeys.award(award, season, Date.now());
	const title = t(`glory.awards.${award}.label`);
	const seen = entries.filter(({ actor }) => !keptFromPlayers(actor)).map(({ actor }) => actor.name);
	return Promise.all([
		...entries.map(({ actor, lines: said }) => recordOnTrack(actor, { source: "award", key, title, body: lines(said) })),
		seen.length ? recordOnTrack(COMPANY_TRACK, { source: "award", key, title, body: seen.join(", ") }) : null
	]);
}

/**
 * A Scar's wait is over: settled, or a Humiliation avenged on the foe who dealt it.
 * @param {Actor} knight
 * @param {Item} scar
 * @param {string} line What settling it did, as the card says.
 */
export function timelineScarSettled(knight, scar, line) {
	const foe = scarForRoll(scar.system?.roll)?.byRevenge ? scar.system?.foeName : "";
	const key = timelineKeys.settled(scar.id);
	return recordOnTrack(knight, foe
		? { source: "revenge", key, title: t("timeline.auto.revenge", { name: foe }), body: lines(scar.name, line) }
		: { source: "settled", key, title: t("timeline.auto.settled", { scar: scar.name }), body: line });
}

/**
 * A Knight joins the Company: on their thread, and the Company's unless the
 * players can't see them. Chosen again, the Company's row takes the new name.
 * @param {Actor} knight
 */
export function timelineJoined(knight) {
	return Promise.all([
		recordOnTrack(knight, { source: "joined", key: timelineKeys.joined(), title: t("timeline.auto.joined") }),
		keptFromPlayers(knight) ? null : recordOnTrack(COMPANY_TRACK, {
			source: "joined",
			key: timelineKeys.joined(knight.id),
			title: t("timeline.auto.joinedCompany", { name: knight.name }),
			refresh: ["title"]
		})
	]);
}

/**
 * A Knight takes a Squire: on both their threads.
 * @param {Actor} knight
 * @param {Actor} squire
 */
export function timelineSquireTaken(knight, squire) {
	return Promise.all([
		recordOnTrack(knight, { source: "squire", key: timelineKeys.squire(squire.id), title: t("timeline.auto.tookSquire") }),
		recordOnTrack(squire, { source: "squire", key: timelineKeys.serves(knight.id), title: t("timeline.auto.becameSquire", { name: knight.name }) })
	]);
}

/**
 * Somebody grows into an older Age, with what it did to their Virtues.
 * @param {Actor} actor
 * @param {string} age One of AGES.
 * @param {string[]} said The aging card's lines.
 */
export function timelineAged(actor, age, said = []) {
	return recordOnTrack(actor, { source: "aged", key: timelineKeys.aged(age), title: t("timeline.auto.aged", { age: t(`age.${age}`) }), body: lines(said) });
}

/**
 * A Knight names their successor.
 * @param {Actor} knight
 * @param {Actor} heir
 */
export function timelineHeirNamed(knight, heir) {
	return recordOnTrack(knight, { source: "heir", key: timelineKeys.heir(heir.id, timelineNow(), Date.now()), title: t("timeline.auto.heir", { name: heir.name }) });
}

/**
 * Omens of a Myth are met, or taken back: one row for each met, on the
 * Company's thread and the Realm's. Only what the players saw is written: the
 * Myth by its number, and where the Company stood, never the Myth's own hex.
 * @param {Scene} scene
 * @param {{number: number, d6: number, d12: number}} myth
 * @param {object} omens
 * @param {number} omens.from How many had been met.
 * @param {number} omens.to How many are now.
 * @param {{col: number, row: number}|null} [omens.hex] Where the Company was.
 * @param {boolean} [omens.news] Heard of at Court, rather than met.
 */
export async function timelineOmens(scene, myth, { from, to, hex = null, news = false }) {
	const id = completedMythId(scene.id, myth);
	for (let omen = to + 1; omen <= from; omen++) await forgetEverywhere(timelineKeys.omen(id, omen));
	if (to <= from) return;
	const { place } = placeOf(scene, hex);
	const title = t(news ? "timeline.auto.omenNews" : "timeline.auto.omen", { number: myth.number });
	const met = Array.from({ length: to - from }, (_, index) => ({ source: "omen", key: timelineKeys.omen(id, from + index + 1), title, place }));
	await recordOnTracks([COMPANY_TRACK, scene], met);
}

/**
 * The Company comes on a Landmark: on the Company's thread and the Realm's,
 * as the players know it now it's revealed. Written in its arrival's place,
 * so no arrival there is written again.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 */
export function timelineLandmarkFound(scene, hex) {
	const { view, place } = placeOf(scene, hex);
	if (!view?.landmark) return null;
	return recordOnTracks([COMPANY_TRACK, scene], {
		source: "found",
		key: timelineKeys.visit(scene.id, hex),
		title: t("timeline.auto.found", { place }),
		place: scene.name
	});
}

/**
 * One of a Domain's Crises is resolved.
 * @param {Actor} domain
 * @param {string} crisis One of CRISES.
 * @param {string} name Its name.
 */
export function timelineCrisisResolved(domain, crisis, name) {
	return recordOnTrack(domain, { source: "resolved", key: timelineKeys.resolved(crisis, timelineNow(), Date.now()), title: t("timeline.auto.crisisResolved", { crisis: name }) });
}

/**
 * Drama in a Domain's Court: what came of it, and who of the Court was at its heart.
 * @param {Actor} domain
 * @param {{said: string, who?: string|null, leverage?: string|null}} drama
 */
export function timelineDrama(domain, { said, who = null, leverage = null }) {
	return recordOnTrack(domain, { source: "drama", key: timelineKeys.drama(timelineNow(), Date.now()), title: t("domain.drama"), body: lines(said, who, leverage) });
}

/**
 * A Council task is settled.
 * @param {Actor} domain
 * @param {string} id The task's.
 * @param {{what: string, by: string, outcome: string, crisis?: string|null}} task
 */
export function timelineTaskSettled(domain, id, { what, by, outcome, crisis = null }) {
	return recordOnTrack(domain, {
		source: "task",
		key: timelineKeys.task(id),
		title: what,
		body: lines(by, outcome, crisis ? t("timeline.auto.taskCrisis", { crisis }) : null)
	});
}

/**
 * A Domain begins a Grand Design.
 * @param {Actor} domain
 * @param {string} id
 * @param {{scale: string}} design
 */
export function timelineDesignBegun(domain, id, design) {
	return recordOnTrack(domain, { source: "design", key: timelineKeys.design(id), title: t("timeline.auto.designBegun"), body: t(`domain.designs.scales.${design.scale}.label`) });
}

/**
 * A Grand Design struck off by mistake takes its row with it.
 * @param {string} id
 */
export const timelineDesignForgotten = (id) => forgetEverywhere(timelineKeys.design(id));

/**
 * Somebody joins a Domain's Court.
 * @param {Actor} domain
 * @param {string} id
 * @param {{name: string, role: string}} member
 */
export function timelineCourtJoined(domain, id, member) {
	return recordOnTrack(domain, { source: "court", key: timelineKeys.court(id), title: t("timeline.auto.courtJoined", { name: member.name }), body: t(`domain.court.roles.${member.role}.one`) });
}

/**
 * Somebody leaves a Domain's Court. The row they joined by stays.
 * @param {Actor} domain
 * @param {string} id
 * @param {{name: string, role: string}} member
 */
export function timelineCourtLeft(domain, id, member) {
	return recordOnTrack(domain, { source: "court", key: timelineKeys.courtLeft(id), title: t("timeline.auto.courtLeft", { name: member.name }), body: t(`domain.court.roles.${member.role}.one`) });
}

/**
 * Knights take their seats in a Domain's Circle, or leave them: on the
 * Domain's thread, and each Knight's, unless that would tell a player's
 * Knight's readers of a Domain kept from them.
 * @param {Actor} domain
 * @param {{joined: {id: string, name: string, actor: Actor|null}[], left: {id: string, name: string, actor: Actor|null}[]}} change
 */
export function timelineCircle(domain, { joined = [], left = [] }) {
	const season = timelineNow();
	const at = Date.now();
	const hidden = keptFromPlayers(domain);
	const rows = (knights, said, saidOf) => knights.flatMap(({ id, name, actor }) => {
		const key = timelineKeys.circle(id, season, at);
		return [
			recordOnTrack(domain, { source: "circle", key, title: t(`timeline.auto.${said}`, { name }) }),
			actor && !(hidden && !keptFromPlayers(actor)) ? recordOnTrack(actor, { source: "circle", key, title: t(`timeline.auto.${saidOf}`, { domain: domain.name }) }) : null
		];
	});
	return Promise.all([...rows(joined, "circleJoined", "circleJoinedOf"), ...rows(left, "circleLeft", "circleLeftOf")]);
}

/**
 * A Domain musters a Warband.
 * @param {Actor} domain
 * @param {Actor} warband
 * @param {string} origin Where its soldiers were drawn from.
 */
export function timelineMustered(domain, warband, origin) {
	return recordOnTrack(domain, { source: "warband", key: timelineKeys.warband(warband.id), title: t("timeline.auto.mustered", { name: warband.name }), body: origin });
}

/**
 * A Domain lets a Warband go.
 * @param {Actor} domain
 * @param {Actor} warband
 */
export function timelineDismissed(domain, warband) {
	return recordOnTrack(domain, { source: "warband", key: timelineKeys.warbandGone(warband.id), title: t("timeline.auto.dismissed", { name: warband.name }) });
}
