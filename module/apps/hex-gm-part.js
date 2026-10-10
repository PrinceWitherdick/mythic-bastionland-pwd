import { takeExplorationAct } from "../actions/exploration.js";
import { openGmToolkit, theGmToolkit } from "../actions/gm-toolkit.js";
import {
	editHexPerson,
	editHexSparks,
	forgetHexSpark,
	getHexRecord,
	hexFeatures,
	renameHexSpark,
	rollHexSparkSet,
	sparkView,
	tellPlayersAboutHex,
	writeHexNote
} from "../actions/hex-lore.js";
import { hexJournalsOn, openHexJournal } from "../actions/hex-journals.js";
import { grantHolding, rulersOf } from "../actions/holding-ruler.js";
import { getHexVisits, markHexVisited } from "../actions/journey.js";
import { landmarkOfferView, renameLandmark, rerollLandmarkName, takeLandmarkOffer } from "../actions/landmarks.js";
import { rollUpHolding } from "../actions/people.js";
import { calendarLabel, momentLabel } from "../actions/calendar.js";
import { castActors, castKey } from "../actions/myth-cast.js";
import { getRealm, sceneGeometry } from "../actions/realm.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { keptFromMe, realmKnown } from "../actions/solo.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { mythLookup, seerEntry } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { isTableRoll } from "../rules/book-art.js";
import { omenStage } from "../rules/gm-toolkit.js";
import { toldState } from "../rules/hex-shared.js";
import { MAX_SPARK_NAME, MAX_SPARK_PROMPT, sparkBatches } from "../rules/hex-lore.js";
import { gatherCast } from "../rules/myth-cast.js";
import { CIVILISATION_PAGE, PEOPLE_PAGE, personView } from "../rules/people.js";
import { OMEN_COUNT, TERRAIN, featureAt, terrainAt } from "../rules/realm.js";
import { hexKey } from "../rules/realm-geometry.js";
import { HEX_FEATURE_ACTIONS } from "./hex-edit.js";
import { HEX_FORGET_ACTIONS, hexForgetContext } from "./hex-forget.js";
import { openHexEditor } from "./HexEditor.js";
import { wirePersonRename } from "./hex-rename.js";
import { openRollPerson } from "./RollPerson.js";
import { openSeerChooser } from "./SeerChooser.js";
import { inputDialog } from "./ui.js";

/**
 * The Lay of the Land (p19): the GM's own part of a hex, at the foot of the
 * Places window's hex beside what the players know. A Hex is broad and
 * varied, and what fills it is the Referee's to improvise, so this is where
 * they roll the Spark Tables for it and write down what they made of it; the
 * hex itself is changed in Edit this hex (HexEditor.js), opened from Edit hex
 * in the window's title bar. Everything rolled stays in the hex, so a Company
 * coming back finds the hex they left.
 */

/**
 * What the window showing the part keeps between draws: the tab of rolls last
 * shown, the page the Landmark's name was last flipped to, and whether a roll
 * is under way.
 * @typedef {object} HexGmState
 * @property {HexGmTab} tab
 * @property {{key: string, myth: string, page: number}|null} prompted
 * @property {boolean} rolling
 */

/** @returns {HexGmState} */
export const hexGmState = () => ({ prompted: null, rolling: false, tab: "land" });

/** The line under the GM's note for each way the players' telling can stand beside it, and its icon. */
const TOLD_SAYS = Object.freeze({
	current: "fa-solid fa-circle-check",
	stale: "fa-solid fa-triangle-exclamation",
	unsaid: "fa-solid fa-comment-slash",
	kept: "fa-solid fa-comment"
});

/**
 * The tabs the rolls for a hex are sorted into, in the order they stand: the
 * people met here, the land itself, and the Myth, Landmark or Holding where the hex has one.
 * @typedef {"people"|"land"|"myth"|"landmark"|"holding"} HexGmTab
 */
const HEX_GM_TABS = Object.freeze([
	Object.freeze({ key: "people", icon: "fa-solid fa-user-group" }),
	Object.freeze({ key: "land", icon: "fa-solid fa-mountain-sun" }),
	Object.freeze({ key: "myth", icon: "fa-solid fa-dragon" }),
	Object.freeze({ key: "landmark", icon: "fa-solid fa-monument" }),
	Object.freeze({ key: "holding", icon: "fa-solid fa-chess-rook" })
]);

/**
 * The tab a roll kept in a hex is read under: a person, or a roll on the People
 * tables, with the people; a roll on the Civilisation tables with the Holding,
 * where one stands; anything else with the land.
 * @param {import("../rules/hex-lore.js").HexSpark} spark
 * @param {boolean} holding Whether a Holding stands in the hex.
 * @returns {HexGmTab}
 */
export function sparkTab(spark, holding) {
	if (spark.person || spark.page === PEOPLE_PAGE) return "people";
	if (holding && spark.page === CIVILISATION_PAGE) return "holding";
	return "land";
}

/**
 * What only a GM sees of a hex, below what the players know of it.
 * @param {object} data
 * @param {Scene} data.scene
 * @param {{col: number, row: number}} data.hex
 * @param {import("../rules/travels.js").PlayerHexView} data.view What the players know of it.
 * @param {object|null} data.index The art index.
 * @param {HexGmState} data.state
 * @returns {object|null} Null for a player, or a Scene that isn't a Realm.
 */
export function hexGmContext({ scene, hex, view, index, state }) {
	if (!game.user?.isGM) return null;
	const entry = getRealm(scene);
	if (!entry) return null;
	// Played alone, only what the Company has found here.
	const known = realmKnown(entry.realm);
	const g = sceneGeometry(scene);
	const record = getHexRecord(scene, hex);
	const visits = getHexVisits(scene, hex);
	const terrain = terrainAt(entry.realm, g, hex);
	const { myth, landmark } = featureAt(known, hex);
	const prompted = state.prompted?.key === hexKey(hex) ? state.prompted : null;
	const holdingHere = featureAt(entry.realm, hex).holding;
	const holding = Boolean(holdingHere);
	// The people met here stay, each in full. The land's rolls and the Holding's are each a row for every go of them,
	// dated when it was made. Newest first, all of them.
	const kept = record?.sparks ?? [];
	const under = (tab) => kept.filter((spark) => sparkTab(spark, holding) === tab);
	const people = under("people").map(sparkView).reverse();
	const land = keptRolls(under("land"));
	const held = holding ? keptRolls(under("holding")) : null;
	const shown = { people: true, land: true, myth: Boolean(myth), landmark: Boolean(landmark), holding };
	const tab = shown[state.tab] ? state.tab : "land";
	const counts = { people: people.length, land: land.count, myth: 0, landmark: 0, holding: held?.count ?? 0 };
	const pages = index?.spark ?? [];
	let notice = null;
	if (!index) notice = t("spark.noIndex");
	else if (!pages.length) notice = t("spark.noText");
	return {
		// The players' part names the land of a hex they know; a hex they don't is named here.
		terrain: !view.openable && terrain ? t(`realm.terrain.${TERRAIN[terrain - 1]}`) : null,
		features: unfound(scene, known, g, hex, view, index),
		// A Landmark's name, which a random page's prompt for its type can fill (p14), and what it asks of travellers.
		landmark: landmark
			? {
				type: t(`realm.landmarks.${landmark.type}`),
				name: landmark.name ?? "",
				from: prompted ? t("hexLore.landmark.from", { myth: prompted.myth, page: prompted.page }) : null,
				offer: landmarkOfferView(landmark.type),
				// The Seer who lives at a Sanctum (p26).
				seer: landmark.type === "sanctum" ? seerContext(landmark.seer, index) : null
			}
			: null,
		myth: myth ? mythContext(scene, myth, index) : null,
		visited: Boolean(visits),
		note: record?.note ?? "",
		told: toldContext(record?.note ?? "", view.told),
		// Any hex can have a Journal entry, where the setting makes them: one with nothing kept gets it when the GM asks.
		journal: hexJournalsOn(),
		// A tab for each kind of roll here, the Landmark's named by its type; only the one last chosen is shown.
		tab,
		tabs: HEX_GM_TABS.filter(({ key }) => shown[key]).map(({ key, icon }) => ({
			key,
			icon,
			label: key === "landmark" ? t(`realm.landmarks.${landmark.type}`) : t(`hexGm.tabs.${key}`),
			count: counts[key],
			active: key === tab
		})),
		people,
		land,
		// A Holding's Local Mood is rolled as the Company arrives (p18).
		holding: held,
		// Who rules the Holding (p20), and the offer to grant it to a Knight.
		ruler: holding ? rulerContext(scene, holdingHere) : null,
		notice,
		forget: hexForgetContext(scene, hex, { lore: record, visits })
	};
}

/**
 * Under the GM's note, whether the players' last telling still reads as the
 * note does. Where they're behind, or haven't been told, the line ends in
 * Tell the players.
 * @param {string} note
 * @param {{id: string, note: string, when: object|null}[]} told Newest first.
 * @returns {object}
 */
function toldContext(note, told) {
	const [latest] = told;
	const when = latest?.when ? momentLabel(latest.when) : null;
	return {
		latest: latest?.note ?? "",
		state: toldState(note, latest?.note),
		says: Object.entries(TOLD_SAYS).map(([key, icon]) => ({
			key,
			icon,
			text: key === "unsaid" ? t("hexGm.told.unsaid") : t(`hexGm.told.${key}${when ? "" : "Undated"}`, { when }),
			tell: { stale: t("hexGm.told.tellAgain"), unsaid: t("hexLore.tell") }[key] ?? null
		}))
	};
}

/**
 * The Myth in the hex (p18): its name and page, the Omens met, the one playing
 * out and the one to come, and its Cast as far as the world has made them.
 * The rest of it, its table among them, is on its card in the Toolkit.
 * Played alone, only the Omens met are read.
 * @param {Scene} scene
 * @param {object} myth From the Realm as the Company knows it.
 * @param {object|null} index The art index.
 * @returns {object}
 */
function mythContext(scene, myth, index) {
	const { name, page, entry } = mythLookup(index, myth);
	const solo = keptFromMe();
	const { current, next } = omenStage(myth.omen);
	const omen = (number, label) => number && { label: t(`gmToolkit.myths.${label}`), text: entry?.omens?.[number - 1] ?? t("myths.omenNumber", { number }) };
	const { members, extras } = gatherCast(entry?.cast, castActors(), castKey(scene, myth));
	return {
		number: myth.number,
		name: page ? t("realm.panel.reference", { name, page }) : name,
		seen: t("realm.panel.omensSeen", { omen: myth.omen, count: OMEN_COUNT }),
		none: myth.omen <= 0,
		all: myth.omen >= OMEN_COUNT,
		omens: [omen(current, "current"), solo ? null : omen(next, "next")].filter(Boolean),
		// Each of the Cast by name, opening the first actor made of them; anyone dropped in by hand after them.
		cast: [
			...members.map((member) => ({ name: member.name, uuid: member.actors[0]?.uuid ?? null })),
			...extras.map(({ name, uuid }) => ({ name, uuid }))
		],
		castMissing: isTableRoll(myth) && !entry?.cast,
		solo,
		revealed: Boolean(myth.revealed)
	};
}

/**
 * The Seer at a Sanctum, by name and page once rolled.
 * @param {{d6: number, d12: number}|null|undefined} seer
 * @param {object|null} index The art index.
 * @returns {{name: string|null, roll: string}}
 */
function seerContext(seer, index) {
	if (!seer?.d6 || !seer?.d12) return { name: null, roll: t("hexGm.seer.roll") };
	const { name, page } = seerEntry(index, seer);
	return { name: t("realm.panel.reference", { name, page }), roll: t("hexGm.seer.again") };
}

/**
 * Who rules a Holding: each Domain given it, by its Knight where one is known,
 * or else by the ruler its sheet names.
 * @param {Scene} scene
 * @param {{id: string|null}} holding
 * @returns {{rulers: object[], grant: string}|null} Null for a Holding not yet on the map as a Tile, which nothing can be given.
 */
function rulerContext(scene, holding) {
	if (!holding.id) return null;
	const rulers = rulersOf(scene, holding).map(({ domain, knight }) => ({
		domain: { uuid: domain.uuid, name: domain.name },
		knight: knight ? { uuid: knight.uuid, name: knight.name } : null,
		named: knight ? null : String(domain.system.ruler ?? "").trim() || null
	}));
	return { rulers, grant: t(rulers.length ? "hexGm.ruler.change" : "hexGm.ruler.grant") };
}

/**
 * The rolls kept under one tab, each go of them one row dated when it was made, newest first.
 * @param {import("../rules/hex-lore.js").HexSpark[]} sparks Oldest first.
 * @returns {{goes: {ids: string, when: string|null, sparks: object[]}[], count: number}}
 */
function keptRolls(sparks) {
	const goes = sparkBatches(sparks).reverse().map((batch) => {
		const shown = batch.map(sparkView).reverse();
		return { ids: shown.map(({ id }) => id).join(","), when: shown[0].when, sparks: shown };
	});
	return { goes, count: sparks.length };
}

/** @returns {string} An edit dialog's heading: when what's in it was rolled, where that's known. */
const rolledLegend = (when) => (when ? t("hexGm.editGo.legend", { when: calendarLabel(when) }) : t("hexGm.editGo.legendUndated"));

/**
 * Edit one go of rolls from the pen on its row: each roll's words in a box, a
 * box to tick to forget it, and one to forget the lot.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string[]} ids
 * @returns {Promise<unknown>|undefined}
 */
async function editGo(scene, hex, ids) {
	const sparks = (getHexRecord(scene, hex)?.sparks ?? []).filter(({ id }) => ids.includes(id)).reverse();
	if (!sparks.length) return;
	const data = await inputDialog({
		title: t("hexGm.editGo.title"),
		icon: "fa-solid fa-pen",
		template: "hex-go-edit",
		context: {
			legend: rolledLegend(sparks[0].when),
			many: sparks.length > 1,
			max: MAX_SPARK_PROMPT,
			rolls: sparks.map(({ id, table, prompt, entries }) => ({ id, table, prompt, rolled: entries.join(" ") }))
		},
		ok: { label: t("hexGm.editGo.save"), icon: "fa-solid fa-check" }
	});
	if (!data) return;
	return editHexSparks(scene, hex, {
		prompts: Object.fromEntries(sparks.map(({ id }) => [id, String(data[`prompt-${id}`] ?? "")])),
		forget: sparks.filter(({ id }) => data[`forget-${id}`]).map(({ id }) => id)
	});
}

/**
 * Edit a person kept here from the pen on their row: their name, each trait,
 * what they've heard, and a box to tick to forget them. A roll under People
 * that isn't a whole person, such as one People table rolled on its own, is
 * edited as a go of one roll.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string} id
 * @returns {Promise<unknown>|undefined}
 */
async function editPerson(scene, hex, id) {
	const spark = getHexRecord(scene, hex)?.sparks.find((each) => each.id === id);
	if (!spark) return;
	const person = personView(spark);
	if (!person) return editGo(scene, hex, [id]);
	const data = await inputDialog({
		title: t("hexGm.editPerson.title"),
		icon: "fa-solid fa-pen",
		template: "hex-person-edit",
		context: {
			legend: rolledLegend(spark.when),
			name: person.name,
			maxName: MAX_SPARK_NAME,
			traits: person.traits.map(({ label, text }, index) => ({ index, label, text })),
			heard: person.heard
		},
		ok: { label: t("hexGm.editGo.save"), icon: "fa-solid fa-check" }
	});
	if (!data) return;
	if (data.forget) return forgetHexSpark(scene, hex, id);
	return editHexPerson(scene, hex, id, {
		name: String(data.name ?? ""),
		traits: person.traits.map((_trait, index) => String(data[`trait-${index}`] ?? "")),
		heard: String(data.heard ?? "")
	});
}

/**
 * What stands in the hex that the players haven't found. The two lists word a
 * feature differently, so what the players know is told by what it is, not by
 * its words. A Seat of Power the players don't see, hidden by hand, still has its line.
 * @returns {string[]}
 */
function unfound(scene, known, g, hex, view, index) {
	const shown = ({ kind, direction, seat }) => {
		if (kind === "barrier") return view.barriers.includes(direction);
		if (kind === "holding") return Boolean(view.holding) && (!seat || view.holding.seat);
		return Boolean(view[kind]);
	};
	return hexFeatures(scene, known, g, hex, index, { full: true }).filter((feature) => !shown(feature)).map(({ text }) => text);
}

/**
 * Write one field of the GM's part as it's changed: the note or the Landmark's name.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} field
 * @returns {Promise<unknown>|undefined}
 */
export function writeHexGmField(scene, hex, field) {
	const { name, value } = field;
	if (name === "note") return writeHexNote(scene, hex, value ?? "");
	if (name === "landmarkName") return renameLandmark(scene, hex, String(value ?? "").trim());
}

/**
 * Hang the GM's part on a freshly drawn hex: the tabs switch, the fields save
 * as they're changed, and the people kept here are named by clicking theirs.
 * @param {HTMLElement|null|undefined} root
 * @param {object} at
 * @param {Scene} at.scene
 * @param {{col: number, row: number}} at.hex
 * @param {HexGmState} at.state
 */
export function wireHexGmPart(root, { scene, hex, state }) {
	const part = root?.querySelector(".bastionland-travels-hex__gm");
	if (!part) return;
	wireHexGmTabs(part, state);
	wireToldState(part);
	part.addEventListener("change", (event) => {
		const field = event.target;
		if (!field?.name) return;
		event.stopPropagation();
		writeHexGmField(scene, hex, field);
	});
	wirePersonRename(part, (id, name) => renameHexSpark(scene, hex, id, name));
}

/**
 * As the GM types their note, say whether the players' last telling still
 * matches it, before the note is even saved.
 * @param {HTMLElement} part
 */
function wireToldState(part) {
	const told = part.querySelector("[data-told-latest]");
	part.querySelector('textarea[name="note"]')?.addEventListener("input", (event) => {
		const now = toldState(event.target.value, told?.dataset.toldLatest);
		for (const line of told?.querySelectorAll("[data-told-say]") ?? []) line.hidden = line.dataset.toldSay !== now;
	});
}

/**
 * The hex's Journal, made on the click if it has none, as a button for the
 * title bar of a window showing the GM's part of a hex: none when the part
 * isn't shown or the setting makes no entries.
 * @param {HTMLElement|null|undefined} element The window.
 * @returns {{action: string, icon: string, label: string, tooltip: string}[]}
 */
export function hexGmHeaderButtons(element) {
	const part = element?.querySelector(".bastionland-travels-hex__gm");
	if (!part) return [];
	return [
		{ action: "editHex", icon: "fa-solid fa-pen-to-square", label: t("hexLore.editShort"), tooltip: t("hexLore.editHint") },
		...(part.hasAttribute("data-journal") ? [{ action: "hexJournal", icon: "fa-solid fa-book", label: t("hexJournal.open"), tooltip: t("hexJournal.openHint") }] : [])
	];
}

/**
 * Show the tab clicked and remember it, for the next hex as well. Arrow keys
 * step along the tabs, Home and End go to the first and last.
 * @param {HTMLElement} part
 * @param {HexGmState} state
 */
function wireHexGmTabs(part, state) {
	const tabs = [...part.querySelectorAll("[data-hex-tab]")];
	const show = (chosen) => {
		state.tab = chosen.dataset.hexTab;
		for (const tab of tabs) {
			const active = tab === chosen;
			tab.classList.toggle("is-active", active);
			tab.setAttribute("aria-selected", String(active));
			tab.tabIndex = active ? 0 : -1;
		}
		for (const panel of part.querySelectorAll("[data-hex-panel]")) panel.hidden = panel.dataset.hexPanel !== state.tab;
	};
	const steps = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
	for (const tab of tabs) {
		tab.addEventListener("click", () => show(tab));
		tab.addEventListener("keydown", (event) => {
			const step = steps[event.key];
			if (step === undefined) return;
			event.preventDefault();
			const at = tabs.indexOf(tab);
			const next = Number.isFinite(step) ? tabs[(at + step + tabs.length) % tabs.length] : tabs.at(step < 0 ? 0 : -1);
			next.focus();
			show(next);
		});
	}
}

/**
 * @param {HexGmState} state
 * @param {() => Promise<unknown>} roll
 * @returns {Promise<unknown>} Null while another roll is under way, so a second click doesn't roll twice.
 */
async function rollOnce(state, roll) {
	if (state.rolling) return null;
	state.rolling = true;
	try {
		return await roll();
	} finally {
		state.rolling = false;
	}
}

/**
 * What the part's buttons do, each handed the hex shown and the button pressed.
 * `redraw` draws the hex again, for what changes nothing kept.
 * @type {Record<string, (at: {scene: Scene, hex: {col: number, row: number}, state: HexGmState, redraw: () => unknown}, target: HTMLElement) => unknown>}
 */
export const HEX_GM_ACTIONS = Object.freeze({
	// Roll the land, its weather and one feature on the Nature Spark Tables, and keep them.
	async rollWildHex({ scene, hex, state }, target) {
		target.disabled = true;
		try {
			await rollOnce(state, () => rollHexSparkSet({ scene, hex }));
		} finally {
			target.disabled = false;
		}
	},
	rollPerson: ({ scene, hex }) => openRollPerson({ scene, hex }),
	rollHolding: ({ scene, hex, state }) => rollOnce(state, () => rollUpHolding({ scene, hex })),
	wilderness: ({ scene, hex }) => wildernessRoll({ scene, hex }),
	// Gathering Folklore, searching, or what a vantage point shows, whichever the button names (p19).
	act: ({ scene, hex }, target) => takeExplorationAct(target.dataset.act, { scene, hex }),
	mood: () => rollRefereeTable("mood"),
	editGo: ({ scene, hex }, target) => editGo(scene, hex, (target.dataset.sparks ?? "").split(",").filter(Boolean)),
	editPerson({ scene, hex }, target) {
		const { spark } = target.dataset;
		if (spark) return editPerson(scene, hex, spark);
	},
	// The note as it stands in its box, saved or not.
	tellHex({ scene, hex }, target) {
		const note = target.closest(".bastionland-travels-hex__gm")?.querySelector('[name="note"]')?.value;
		return tellPlayersAboutHex({ scene, hex, note });
	},
	hexJournal: ({ scene, hex }) => openHexJournal(scene, hex),
	markVisited: ({ scene, hex }) => markHexVisited(scene, hex),
	// Name the Landmark here from the prompt a random page prints for its type (p14, p179).
	async rerollLandmark({ scene, hex, state, redraw }) {
		const realm = getRealm(scene)?.realm;
		const before = realm ? featureAt(realm, hex).landmark?.name : undefined;
		const named = await rollOnce(state, () => rerollLandmarkName(scene, hex));
		if (!named) return;
		state.prompted = { key: hexKey(hex), myth: named.myth, page: named.page };
		// A new name changes the Realm, which draws the hex again; the same name again is drawn here, to show where it came from.
		if (named.name === before) return redraw();
	},
	// What the Landmark here asks of the Company (p14).
	landmarkOffer: ({ scene, hex }, target) => takeLandmarkOffer(target.dataset.landmarkOffer, { scene, hex }),
	// Roll the Seer, step the Omens, reveal: as in Edit this hex.
	...HEX_FEATURE_ACTIONS,
	// Choose the Seer at the Sanctum here by hand, from the Knights table (p26).
	chooseSeer: ({ scene, hex }) => openSeerChooser({ scene, hex }),
	// Grant the Holding here to a Knight, through their Domain (p20).
	grantHolding: ({ scene, hex }) => grantHolding(scene, hex),
	// A sheet named in the part: one of the Cast, or the Knight or Domain ruling a Holding.
	openActor: (_at, target) => fromUuidSync(target.dataset.uuid ?? "")?.sheet?.render({ force: true }),
	// The Myth's card in the Toolkit, with all its Omens, its table and its Cast to make.
	async mythInToolkit({ scene }, target) {
		const sheet = theGmToolkit()?.sheet ?? (await openGmToolkit("myths"));
		return sheet?.showMyth?.(scene, Number(target.dataset.myth));
	},
	// Edit hex, in the title bar: change the hex itself, in a window of its own.
	editHex: ({ scene, hex }) => openHexEditor({ scene, hex }),
	// The eraser on the visits line: forget every visit here, or everything kept here.
	...HEX_FORGET_ACTIONS
});
