import { hexTarget } from "../chat/hex-target.js";
import { postCard, registerCardButtons, t, warn } from "../chat/cards.js";
import { featureAt } from "../rules/realm.js";
import { hexKey, parseHexKey, sameHex } from "../rules/realm-geometry.js";
import { COMPANY_PACE_SETTING, companyPace, paceSoFar } from "../rules/journey.js";
import { keyedSerialWrites } from "../rules/queue.js";
import { samePhase } from "../rules/time.js";
import { nextOmen } from "../rules/wilderness.js";
import { SYSTEM_ID } from "../system-id.js";
import { getCalendar } from "./calendar.js";
import { setCompanyHex } from "./company.js";
import { hexLabel } from "./hex-names.js";
import { settleBlindTravel } from "./night-travel.js";
import { hexesReached, keptBackByWeather } from "./held-back.js";
import { rollFirstArrival } from "./hex-lore.js";
import { welcomeHome } from "./homecoming.js";
import { COMPANY_MOVED_HOOK, COMPANY_MOVES_FLAG, COMPANY_MOVE_UNDONE_HOOK, forgetMoveVisits, heldBack, setHeldBack } from "./journey.js";
import { liveRealm } from "./myth-notes.js";
import { getRealm, isRealmScene } from "./realm.js";
import { realmKnown, revealMythsReached, secretsKeptOn } from "./solo.js";
import { rollRefereeTable } from "./referee-rolls.js";
import { revealSighted } from "./sighted.js";
import { gallop } from "./steeds.js";
import { advancePhase } from "./time.js";
import { markOmenOnEntering, wildernessRoll } from "./wilderness.js";

/**
 * What the book has happen as the Company comes into a hex, beyond the
 * questions of the dark and the fog (night-travel.js): a Myth's hex shows its
 * next Omen (p27), dire weather keeps the Company where it was (p18), a
 * Holding's mood is gauged on arriving (p18), and a second hex in a Phase is a
 * Gallop (p18). Each is told to the Referee on a card of their own, with a
 * button for what the book has them do, since a Token dragged by mistake
 * shouldn't spend an Omen or a steed's VIG. Travelling takes the whole Phase
 * (p18), so a move that ends in a new hex also offers the Phase's end.
 */

/** What marks the arrival card's buttons. */
const ARRIVAL_SELECTOR = "[data-arrival]";

/**
 * The Myths whose hexes the move came into, that have an Omen yet to show:
 * none resolved, since a resolved Myth shows no more (p27). Played alone,
 * only those found, so a Company dire weather held back isn't told of one.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} entered
 * @returns {object[]}
 */
function mythsEntered(scene, entered) {
	const realm = realmKnown(liveRealm(scene), scene);
	return entered.map((hex) => featureAt(realm, hex).myth).filter((myth) => myth && !nextOmen(myth).complete);
}

/**
 * Count the hexes come into this Phase, and say what pace that makes (p18).
 * @param {number} entered
 * @param {import("../rules/time.js").Calendar} now
 * @returns {Promise<{before: string, after: string, count: number, counted: number}>} With the hexes come into this
 *   Phase, and those kept in the count.
 */
async function countPace(entered, now) {
	const before = paceSoFar(game.settings.get(SYSTEM_ID, COMPANY_PACE_SETTING), now);
	const count = before + entered;
	const pace = { before: companyPace(before), after: companyPace(count), count, counted: 0 };
	// Past a Cruise, more hexes make no other pace, so there's nothing new to keep.
	if (pace.before !== "beyond") {
		await game.settings.set(SYSTEM_ID, COMPANY_PACE_SETTING, { when: { ...now }, count });
		pace.counted = entered;
	}
	return pace;
}

/**
 * Take a move's hexes back off the Phase's pace, as dire weather sends the
 * Company back where it set off (p18): it travelled no hexes at all. Only
 * while the count is still the Phase's it was counted in.
 * @param {{when?: object, paced?: number}|undefined} arrived As the arrival card keeps it.
 * @returns {Promise<unknown>}
 */
async function uncountPace({ when, paced } = {}) {
	const said = game.settings.get(SYSTEM_ID, COMPANY_PACE_SETTING);
	if (!paced || !said || !samePhase(said.when, when)) return null;
	return game.settings.set(SYSTEM_ID, COMPANY_PACE_SETTING, { ...said, count: Math.max(0, (Number(said.count) || 0) - paced) });
}

/**
 * What the Referee is told of the Myth hexes come into, and the buttons that show their Omens.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} entered
 * @returns {{lines: string[], actions: object[]}}
 */
function mythNotes(scene, entered) {
	const lines = [];
	const actions = [];
	// Entering a Myth's hex reveals its next Omen (p27).
	for (const myth of mythsEntered(scene, entered)) {
		lines.push(t("arrival.myth", { hex: hexLabel(myth.hex, scene) }));
		actions.push({ key: "omen", hex: hexKey(myth.hex), icon: "fa-solid fa-eye", label: t("arrival.omen") });
	}
	return { lines, actions };
}

/**
 * @param {...({lines: string[], actions: object[]}|null)} notes
 * @returns {{lines: string[], actions: object[]}} Their lines and buttons, in order.
 */
const joinNotes = (...notes) => ({
	lines: notes.flatMap((note) => note?.lines ?? []),
	actions: notes.flatMap((note) => note?.actions ?? [])
});

/**
 * A Holding reached has its Local Mood rolled (p18).
 * @param {Scene} scene
 * @param {{col: number, row: number}|null} here Where the Company stopped.
 * @returns {{lines: string[], actions: object[]}} Nothing where no Holding stands there.
 */
function holdingNotes(scene, here) {
	const holding = here ? featureAt(getRealm(scene).realm, here).holding : null;
	if (!holding) return { lines: [], actions: [] };
	return {
		lines: [t("arrival.holding", { hex: hexLabel(here, scene) })],
		actions: [{ key: "mood", icon: "fa-solid fa-masks-theater", label: t("arrival.mood") }]
	};
}

/**
 * What the Referee is told of a move, and the buttons that act on it.
 * @param {Scene} scene
 * @param {{entered: object[], ended: boolean, from: object|null}} move
 * @param {import("../rules/time.js").Calendar} now
 * @returns {Promise<{lines: string[], actions: object[], paced: number, held: boolean}>} With the hexes counted
 *   toward the pace, and whether dire weather may have held the Company back.
 */
async function arrivalNotes(scene, { entered, ended, from }, now) {
	const lines = [];
	const actions = [];
	const here = entered.at(-1) ?? null;

	// Dire weather keeps the Company in the hex it's in (p18).
	const held = keptBackByWeather({ entered, ended, from }, now);
	if (held) {
		lines.push(t("arrival.dire", { hex: hexLabel(from, scene) }));
		// One or the other: pressing either takes both off the card.
		actions.push({ key: "stay", hex: hexKey(from), group: "held", icon: "fa-solid fa-cloud-showers-heavy", label: t("arrival.stay") });
		// Played alone, what the hexes ahead hold is found only once the Referee lets the Company on into them.
		if (secretsKeptOn(scene)) actions.push({ key: "onward", group: "held", icon: "fa-solid fa-person-hiking", label: t("arrival.onward") });
	}

	// Trek is a hex a Phase; a second is a Gallop, and a third only by boat or road (p18).
	const pace = await countPace(entered.length, now);
	if (pace.after !== pace.before && pace.after !== "trek") {
		lines.push(t(`arrival.${pace.after}`));
		if (pace.after === "gallop") actions.push({ key: "gallop", icon: "fa-solid fa-horse", label: t("arrival.gallopButton") });
	}
	// Travelling takes the whole Phase (p18): once the Company stops, the Referee ends it here. Not while dire
	// weather may be keeping it where it was, which Stay or Onward settles first.
	const ends = ended && !held;
	// A Holding's mood only once the Company is there.
	const notes = joinNotes({ lines, actions }, mythNotes(scene, entered), ended ? holdingNotes(scene, here) : null);
	if (ends) {
		const phase = t(`time.phases.${now.phase}`);
		notes.lines.unshift(t("arrival.travelled", { count: pace.count, phase }));
		notes.actions.push({ key: "endPhase", icon: "fa-solid fa-hourglass-end", label: t("arrival.endPhase", { phase }) });
	}
	return { ...notes, paced: pace.counted, held };
}

/**
 * Tell the Referee what the Company's move calls for. Heard on the active GM's
 * client alone. A move it didn't choose, such as a blind drift, calls for nothing.
 * @param {Scene} scene
 * @param {{entered?: object[], ended?: boolean, from?: object|null, chosen?: boolean}} moved
 * @param {object} [heldMove] Where dire weather may hold the move back.
 * @param {string|null} [heldMove.move] The id it's held back under.
 * @param {Record<string, number>|Promise<Record<string, number>|null>|null} [heldMove.orders] The arrival each hex
 *   it came into became, by hex key, or the journey's write that will say.
 * @param {{col: number, row: number}[]} [heldMove.chose] The hexes the Company chose to come into, where a blind
 *   roll then moved it, for Undo to forget; the hexes entered otherwise.
 * @param {string[]} [heldMove.movements] The ids of the Tokens' moves that made it, which an Undo of one names.
 * @returns {Promise<ChatMessage|null>}
 */
export async function noticeArrival(scene, { entered = [], ended = false, from = null, chosen = true }, { move = null, orders = null, chose = null, movements = [] } = {}) {
	if (!game.user.isGM || !chosen || !isRealmScene(scene) || !entered.length) return null;
	const now = getCalendar();
	const { lines, actions, paced, held } = await arrivalNotes(scene, { entered, ended, from }, now);
	keepMove(scene, { movements, from, entered: chose ?? entered, orders, paced, when: { ...now }, held: held ? move : null })
		.catch((error) => console.error(`${SYSTEM_ID} | Couldn't keep the Company's move for Undo`, error));
	// The card keeps the arrivals only of a move held back, so only then does it wait for the journey's write.
	if (held) orders = (await orders) ?? null;
	if (!lines.length) return null;
	const here = entered.at(-1);
	// The Phase it came in and the hexes counted toward its pace, kept for buttons pressed later,
	// and the hexes dire weather may have held it back from, with the move they were held back on
	// and the arrivals there, so Stay forgets this move's and no later one's.
	const arrived = { when: { ...now }, paced, ...(held ? { held: entered, ...heldRecord(entered, move, orders) } : {}) };
	return postArrivalCard(scene, here, { lines, actions }, arrived);
}

/**
 * @param {{col: number, row: number}[]} entered
 * @param {string|null} move
 * @param {Record<string, number>|null} orders
 * @returns {{move?: string, orders?: Record<string, number>}} What an arrival card keeps of a held move.
 */
function heldRecord(entered, move, orders) {
	const mine = orders ? pickOrders(orders, entered) : {};
	return { ...(move ? { move } : {}), ...(Object.keys(mine).length ? { orders: mine } : {}) };
}

/**
 * Post an arrival card to the Referee. Its buttons read the Scene and what
 * `arrived` keeps, so both go in its flags.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex The hex the card speaks of.
 * @param {{lines: object[], actions: object[]}} notes
 * @param {{when?: object, paced?: number, held?: object[], move?: string, orders?: Record<string, number>}} arrived
 * @returns {Promise<ChatMessage>}
 */
function postArrivalCard(scene, hex, { lines, actions }, arrived) {
	return postCard(null, "arrival", { title: t("arrival.title"), target: hexTarget(hex, scene), lines, actions },
		{ mode: "gm", flags: { [SYSTEM_ID]: { arrival: scene.id, arrived } } });
}

/**
 * @typedef {object} MoveMade A chosen move of the Company's, kept for Undo.
 * @property {string[]} movements The ids of the Tokens' moves that made it.
 * @property {{col: number, row: number}|null} from
 * @property {{col: number, row: number}[]} entered
 * @property {Record<string, number>|null} orders The arrival each of its hexes became, by hex key.
 * @property {number} paced The hexes it counted toward the Phase's pace.
 * @property {object} when The Phase it came in.
 * @property {string|null} held The id it's held back under by dire weather.
 */

/** How many moves back Undo can take the Company's visits and pace with it. */
const MOVES_KEPT = 20;

/** Each Realm's kept moves are written one change at a time, so none is written over another. */
const movesWrites = keyedSerialWrites();

/**
 * @param {Scene} scene
 * @returns {MoveMade[]} The Company's moves kept for Undo on a Realm, the last last.
 */
function movesKept(scene) {
	const kept = scene.getFlag?.(SYSTEM_ID, COMPANY_MOVES_FLAG);
	return Array.isArray(kept) ? kept.filter((made) => made && typeof made === "object") : [];
}

/**
 * Change the moves kept for Undo on a Realm, after any change already being made.
 * @template T
 * @param {Scene} scene
 * @param {(moves: MoveMade[]) => {moves?: MoveMade[], result?: T}|Promise<{moves?: MoveMade[], result?: T}>} change
 *   The moves to keep, where they change, and what to answer.
 * @returns {Promise<T>}
 */
function changeMovesKept(scene, change) {
	return movesWrites(scene.id)(async () => {
		const { moves, result } = await change(movesKept(scene));
		if (moves) await (moves.length ? scene.setFlag(SYSTEM_ID, COMPANY_MOVES_FLAG, moves) : scene.unsetFlag(SYSTEM_ID, COMPANY_MOVES_FLAG));
		return result;
	});
}

/**
 * Keep a chosen move for Undo, once the journey's write says what arrivals its
 * hexes became, so the arrival card needn't wait for it.
 * @param {Scene} scene
 * @param {Omit<MoveMade, "orders"> & {orders: Record<string, number>|Promise<Record<string, number>|null>|null}} made
 * @returns {Promise<void>}
 */
function keepMove(scene, made) {
	// Waited for in turn, so the moves are kept in the order they were made.
	return changeMovesKept(scene, async (moves) => {
		const kept = await Promise.resolve(made.orders).catch(() => null);
		const orders = kept ? pickOrders(kept, made.entered) : null;
		return { moves: [...moves, { ...made, orders }].slice(-MOVES_KEPT) };
	});
}

/**
 * @param {Record<string, number>} orders
 * @param {{col: number, row: number}[]} entered
 * @returns {Record<string, number>} The arrivals a move's own hexes became.
 */
const pickOrders = (orders, entered) => Object.fromEntries(entered.map(hexKey).filter((key) => Number.isFinite(orders[key])).map((key) => [key, orders[key]]));

/**
 * A move of the Company's taken back with Undo, its Token put back in the hex
 * it set off from: the visits it made and the hexes it counted toward the
 * Phase's pace are forgotten, and it's no longer held back by dire weather.
 * What it found stays found. The move is the one the Undo names; where it names
 * none, the last kept, if it set off from where the Token was put back. A move
 * not kept is left alone. GMs only.
 * @param {Scene} scene
 * @param {{col: number, row: number}} back The hex the Token was put back in.
 * @param {string|null} [undone] The id of the Token's move the Undo took back.
 * @returns {Promise<boolean>} Whether a move was taken back.
 */
export async function takeBackMove(scene, back, undone = null) {
	if (!game.user.isGM || !scene) return false;
	const made = await changeMovesKept(scene, (moves) => {
		const index = undone ? moves.findLastIndex((move) => move.movements?.includes(undone)) : moves.length - 1;
		const last = moves[index];
		if (!last || (!undone && !sameHex(last.from, back))) return { result: null };
		return { moves: moves.toSpliced(index, 1), result: last };
	});
	if (!made) return false;
	if (made.orders) await forgetMoveVisits(scene, made.entered, made.orders);
	await uncountPace({ when: made.when, paced: made.paced });
	if (made.held && heldBack(scene).move === made.held) await setHeldBack(scene, []);
	return true;
}

/**
 * Forget a move kept for Undo that dire weather sent back, which Stay took back already.
 * @param {Scene} scene
 * @param {string|undefined} move The held move's id.
 * @returns {Promise<void>}
 */
function dropHeldMove(scene, move) {
	if (!move) return Promise.resolve();
	return changeMovesKept(scene, (moves) => (moves.some((made) => made.held === move) ? { moves: moves.filter((made) => made.held !== move) } : {}));
}

/**
 * The move as it ended: where a blind roll sent the Company back, it came no
 * further than the hex before; where it drifted, into the hex it drifted to.
 * @param {{entered?: object[], from?: object|null}} moved
 * @param {{col: number, row: number}|null} landing
 * @returns {object}
 */
function landedMove(moved, landing) {
	if (!landing) return moved;
	const before = (moved.entered ?? []).slice(0, -1);
	const back = sameHex(landing, before.at(-1) ?? moved.from);
	return { ...moved, entered: back ? before : [...before, landing] };
}

/**
 * Keep the move dire weather may be holding back under its own id, or settle
 * the one that was: any other move of the Company's settles it, but for a blind
 * drift on that move, which puts the Company among the hexes held back from.
 * Played alone, nothing in them is found or explored meanwhile.
 * @param {Scene} scene
 * @param {{entered?: object[], chosen?: boolean}} move
 * @param {string|null} id The move's id, where it's held back.
 * @returns {Promise<boolean>}
 */
function keepHeldBack(scene, move, id) {
	if (move.chosen !== false) return setHeldBack(scene, id ? (move.entered ?? []) : [], { move: id, kept: secretsKeptOn(scene) });
	const here = move.entered?.at(-1);
	return here && heldBack(scene).hexes.has(hexKey(here)) ? Promise.resolve(false) : setHeldBack(scene, []);
}

/**
 * Follow one of the Company's moves: first whether it travelled blind and
 * where that left it, then, played alone, the Myth hexes it really came into
 * are found, and last what coming there calls for, so the card speaks of the
 * hex the Company is in. GMs only.
 * @param {Scene} scene
 * @param {object} moved As the journey tells of it.
 * @returns {Promise<ChatMessage|null>}
 */
async function followMove(scene, moved) {
	const now = getCalendar();
	// Dire weather may hold a chosen move back (p18). Kept before travelling blind asks anything, so nothing
	// in the hexes ahead is found or explored while it's asked.
	const chosen = moved.chosen !== false;
	const move = chosen && keptBackByWeather(moved, now) ? foundry.utils.randomID() : null;
	await keepHeldBack(scene, moved, move);
	const landing = await settleBlindTravel(scene, moved);
	const landed = landedMove(moved, landing);
	// Still held back where a blind roll moved it on, not where it sent it back where it set off.
	const held = Boolean(move) && keptBackByWeather(landed, now);
	if (landing) await keepHeldBack(scene, landed, held ? move : null);
	// Till the Referee lets it on, the hexes it set off toward aren't found. Chosen to set off from again, the
	// Company plainly stayed there, so the hex it leaves is found too; not one it was put back from, by Stay or
	// a blind roll, having never been there, nor one a drift put it in among those held back from.
	const into = held ? [] : chosen ? (landed.entered ?? []) : hexesReached(scene, landed);
	await revealMythsReached(scene, [...(chosen && landed.from ? [landed.from] : []), ...into]);
	return noticeArrival(scene, landed, { move: held ? move : null, orders: landed.orders ?? null, chose: chosen ? (moved.entered ?? []) : null, movements: moved.movements ?? [] });
}

/**
 * @param {Scene} scene
 * @param {{move?: string}} arrived
 * @returns {boolean} Whether the move an arrival card speaks of is still the one dire weather is holding back:
 *   any later move settles it. A card from before moves were kept is taken at its word while none is held.
 */
const stillHeld = (scene, arrived) => heldBack(scene).move === (arrived.move ?? null);

/**
 * Let the Company on into the hexes dire weather held it back from, played
 * alone: what each rule that follows the Company held back from them is done
 * now, as if it had just come in.
 * @param {Scene} scene
 * @param {{col: number, row: number}[]} entered
 * @returns {Promise<void>}
 */
async function reachHeldHexes(scene, entered) {
	await revealMythsReached(scene, entered);
	await revealSighted(scene, entered);
	await rollFirstArrival({ scene, hex: entered.at(-1) });
	welcomeHome(scene, entered).catch((error) => console.error(`${SYSTEM_ID} | Couldn't welcome the Company home`, error));
}

/**
 * The Company has moved since the card was posted, so its Stay or Onward is done with.
 * @returns {true}
 */
function movedOn() {
	ui.notifications.info(t("arrival.movedOn"));
	return true;
}

/**
 * What each of the arrival card's buttons does, with the Phase the Company
 * came in and the hexes it counted toward the pace. GMs only.
 * @type {Record<string, (scene: Scene, hex: {col: number, row: number}|null, arrived: {when?: object, paced?: number, held?: object[], move?: string, orders?: object}) => Promise<unknown>>}
 */
const ARRIVAL_ACTIONS = {
	// Back where it was, put there rather than gone there by choice, having travelled nowhere:
	// the hexes it was held back from weren't come into, so a Myth there isn't found later as one been to.
	async stay(scene, hex, arrived) {
		if (!hex) return null;
		if (!stillHeld(scene, arrived)) return movedOn();
		const moved = await setCompanyHex(scene, hex, { forced: true });
		await uncountPace(arrived);
		if (arrived.held?.length) await forgetMoveVisits(scene, arrived.held, arrived.orders ?? null);
		await setHeldBack(scene, []);
		// Taken back already, so Undo has nothing more to take.
		await dropHeldMove(scene, arrived.move);
		return moved;
	},
	// Played alone, let on through dire weather: the hexes it came into are found, and any Myth's Omen offered.
	async onward(scene, _hex, arrived) {
		const entered = arrived.held ?? [];
		if (!entered.length) return null;
		if (!stillHeld(scene, arrived)) return movedOn();
		await setHeldBack(scene, []);
		await reachHeldHexes(scene, entered);
		const notes = mythNotes(scene, entered);
		if (!notes.lines.length) return true;
		return postArrivalCard(scene, entered.at(-1), notes, { when: arrived.when, paced: 0 });
	},
	gallop: () => gallop(),
	async omen(scene, hex, arrived) {
		if (!hex) return null;
		const outcome = await wildernessRoll({ scene, hex });
		// Shown as they came in, so the Phase they came in has had its Omen, whenever the button was pressed.
		if (outcome) await markOmenOnEntering(scene, hex, arrived.when ?? getCalendar());
		return outcome;
	},
	mood: () => rollRefereeTable("mood"),
	// The Phase the Company travelled in ends (p18), in the window that asks how it was spent, ticked as travelling.
	// A card from a Phase already over has nothing left to end. Closing the window leaves the button to press again.
	async endPhase(scene, _hex, arrived) {
		if (arrived.when && !samePhase(arrived.when, getCalendar())) {
			ui.notifications.info(t("arrival.phaseGone"));
			return true;
		}
		return advancePhase({ scene, mode: "travel" });
	}
};

/** Register what the Company's moves are counted in, follow its moves, and wire the card. Called during init. */
export function registerArrivals() {
	game.settings.register(SYSTEM_ID, COMPANY_PACE_SETTING, { scope: "world", config: false, type: Object, default: null });
	Hooks.on(COMPANY_MOVED_HOOK, (scene, move) => {
		followMove(scene, move).catch((error) => console.error(`${SYSTEM_ID} | Couldn't follow the Company's move`, error));
	});
	Hooks.on(COMPANY_MOVE_UNDONE_HOOK, (scene, back, undone) => {
		takeBackMove(scene, back, undone).catch((error) => console.error(`${SYSTEM_ID} | Couldn't take the Company's move back`, error));
	});
	registerCardButtons({
		selector: ARRIVAL_SELECTOR,
		gmOnly: true,
		// Each does its work once: an Omen revealed twice, or a second gallop, would cost twice.
		once: true,
		handler: async (button, message) => {
			const scene = game.scenes.get(message?.flags?.[SYSTEM_ID]?.arrival ?? "");
			if (!isRealmScene(scene)) {
				warn("arrival.realmGone");
				return false;
			}
			const act = ARRIVAL_ACTIONS[button.dataset.arrival];
			const hex = button.dataset.arrivalHex ? parseHexKey(button.dataset.arrivalHex) : null;
			return Boolean(act && (await act(scene, hex, message.flags[SYSTEM_ID].arrived ?? {})));
		}
	});
}
