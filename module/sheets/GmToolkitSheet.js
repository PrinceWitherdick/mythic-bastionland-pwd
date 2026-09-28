import { CALENDAR_HOOK, chronicleLabel, getCalendar } from "../actions/calendar.js";
import { WEATHER_HOOK, pickWeather, weatherButtonShown, weatherView } from "../actions/weather.js";
import { CITY_QUEST_HOOK, cityOmensSeen, resetCityQuest, rollCityOmen } from "../actions/city-quest.js";
import { COMPANY_FLAG, companyTokenHex } from "../actions/company.js";
import { crisisRoll, worldDomains } from "../actions/dominion.js";
import { awardGlory } from "../actions/glory.js";
import { forgetHexSpark, getHexLore, tellPlayersAboutHex, writeHexNote } from "../actions/hex-lore.js";
import { getJourney, markHexVisited, visitsLabel } from "../actions/journey.js";
import { CITY_CAST, addToCast, castActors, castKey, couldJoinCast, makeCastMember, removeFromCast } from "../actions/myth-cast.js";
import { editMythNote, getMythNotes } from "../actions/myth-notes.js";
import { editRealm, getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { rollMythTable } from "../actions/referee-rolls.js";
import { forgetMythCompleted, recordMythCompleted, writeSeasonNotes } from "../actions/season-log.js";
import { isSiteEntry, newSite, readSite } from "../actions/sites.js";
import { landmarkOfferView, takeLandmarkOffer } from "../actions/landmarks.js";
import { openArt } from "../apps/ArtPopout.js";
import { openBookFlip } from "../apps/BookFlip.js";
import { openHexLore, sparkWhen } from "../apps/HexLore.js";
import { openHexVisits } from "../apps/HexVisits.js";
import { openRealmPanel } from "../apps/RealmPanel.js";
import { spinTable } from "../apps/roll-spin.js";
import { openWildernessHex } from "../apps/WildernessHex.js";
import { TIME_ACTIONS, setCalendarByHand, timeContext } from "../apps/time-controls.js";
import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { canReadTablesFromRulebook, peekTable, peekVerse, tableForEntry, verseForEntry } from "../book-art/myth-tables.js";
import { postCard, statLabels, t } from "../chat/cards.js";
import { reducesMotion, scrollBehavior } from "../client-settings.js";
import { openRulebook } from "../rulebook/BookReader.js";
import { openRulebookSetup } from "../rulebook/RulebookSetup.js";
import { RULEBOOK_HOOK, hasRulebook } from "../rulebook/store.js";
import { isTableRoll, MYTH_VERSE_VERSION } from "../rules/book-art.js";
import { CITY_OMEN_COUNT, CITY_QUEST_END, cityQuestOver } from "../rules/city-quest.js";
import { PLACE_ORDERS, REALM_TABS, TOOLKIT_TABS, askedColumns, mythRollTaken, omenParts, omenStage, pointsOpposite, realmPlaces, resolvedMyths, tableView } from "../rules/gm-toolkit.js";
import { CAST_FLAG, castBlock, gatherCast } from "../rules/myth-cast.js";
import { mythNoteFor } from "../rules/myth-notes.js";
import { OMEN_COUNT, TERRAIN, featureAt, terrainAt } from "../rules/realm.js";
import { POINT_KINDS } from "../rules/sites.js";
import { completedMythId, crisisRollsDue, seasonLogView } from "../rules/season-log.js";
import { formatStatLine } from "../rules/stat-blocks.js";
import { PHASE_ICONS, SEASON_ICONS } from "../rules/time.js";
import { placeFeature, setOmen } from "../rules/realm-edits.js";
import { hexCentre, hexKey, parseHexKey, sameHex } from "../rules/realm-geometry.js";
import { latestWilderness } from "../rules/hex-lore.js";
import { searchable } from "../rules/text.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { SETTINGS_TAB_ENTRY, SettingsTabMixin } from "./settings-tab.js";
import { placeTabRail, stampRailSide } from "./tab-rail.js";
import { ViewableMixin } from "./viewable.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Each page's icon on the tab rail. */
const TAB_ICONS = Object.freeze({
	myths: "fa-solid fa-dragon",
	places: "fa-solid fa-map-location-dot",
	time: "fa-solid fa-hourglass-half",
	notes: "fa-solid fa-feather-pointed"
});

/**
 * The parts drawn from the Realm on show, redrawn whenever it changes. The
 * Time page lists the Realm's resolved Myths, waiting on the Season's turn.
 */
const REALM_PARTS = Object.freeze(["header", ...REALM_TABS, "time"]);

/** A field a redraw would take the typing out of. */
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]), textarea, select';

/** How long to wait for a burst of changes to land before redrawing. */
const REDRAW_DELAY = 50;

/** How often to look again whether the GM has left the field a redraw is waiting on. */
const TYPING_RECHECK = 300;

/** How many of the hexes visited last start unfolded, when the Places page lists the visited first. */
const OPEN_VISITS = 3;

/**
 * A Myth's entry in the art index, or its number alone for a Myth whose dice
 * don't read as a roll on the Myths table.
 * @param {object|null} index
 * @param {object} myth
 * @returns {{name: string, page: number|null, entry: object|null}}
 */
function mythLookup(index, myth) {
	if (!isTableRoll(myth)) return { name: t("gmToolkit.myths.unrolled", { number: myth.number }), page: null, entry: null };
	return mythEntry(index, myth);
}

/**
 * Show as much of a card just unfolded as the page has room for: all of it,
 * or from its heading down when it's taller than the page.
 * @param {HTMLElement} card
 */
function bringIntoView(card) {
	const page = card.closest("[data-tab]");
	const tall = page && card.offsetHeight > page.clientHeight;
	card.scrollIntoView({ block: tall ? "start" : "nearest", behavior: scrollBehavior() });
}

/**
 * The GM Toolkit's sheet: a Realm's Myths and their Omens, the places of the
 * Realm and the hexes the Company has been to, with what the GM wrote and the
 * Spark Tables rolled for each, and the GM's own notes. Its pages
 * hang off a tab rail, as the Knight sheet's do. Only GMs ever open it.
 *
 * The fields on the Realm's pages have no names, so the sheet's own form never
 * sends them to the Actor: each is written where it lives, on the Realm's Scene,
 * by `#onToolkitField`. Only the notes are the Actor's.
 */
export class GmToolkitSheet extends SettingsTabMixin(ViewableMixin(HandlebarsApplicationMixin(ActorSheetV2))) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-sheet", "bastionland-has-tab-rail", "bastionland-gm-toolkit"],
		position: { width: 820, height: 820 },
		window: { resizable: true },
		form: { submitOnChange: true },
		actions: {
			markOmen: GmToolkitSheet.#onMarkOmen,
			mythResolved: GmToolkitSheet.#onMythResolved,
			mythUnresolved: GmToolkitSheet.#onMythUnresolved,
			rollCityOmen: () => rollCityOmen(),
			resetCityQuest: () => resetCityQuest(),
			showHex: GmToolkitSheet.#onShowHex,
			hexLore: GmToolkitSheet.#onHexLore,
			rollHexSet: GmToolkitSheet.#onRollHexSet,
			tellHex: GmToolkitSheet.#onTellHex,
			forgetSpark: GmToolkitSheet.#onForgetSpark,
			markVisited: GmToolkitSheet.#onMarkVisited,
			forgetVisits: GmToolkitSheet.#onForgetVisits,
			openSite: GmToolkitSheet.#onOpenSite,
			newSite: () => newSite(),
			flipBook: () => openBookFlip(),
			newMyth: GmToolkitSheet.#onNewMyth,
			settleMyths: GmToolkitSheet.#onSettleMyths,
			rollMythTable: GmToolkitSheet.#onRollMythTable,
			showMythTable: GmToolkitSheet.#onShowMythTable,
			showMythArt: GmToolkitSheet.#onShowMythArt,
			makeCastMember: GmToolkitSheet.#onMakeCastMember,
			openCastActor: GmToolkitSheet.#onOpenCastActor,
			dropFromCast: GmToolkitSheet.#onDropFromCast,
			...TIME_ACTIONS,
			landmarkOffer: GmToolkitSheet.#onLandmarkOffer,
			crisisRoll: GmToolkitSheet.#onCrisisRoll,
			pickWeather: () => pickWeather(),
			// With no copy yet, the button sets one up rather than doing nothing.
			openRulebook: () => openRulebook() ?? openRulebookSetup(),
			placesOrder: GmToolkitSheet.#onPlacesOrder
		}
	};

	static PARTS = {
		tabs: { template: templatePath("actor/tab-rail.hbs") },
		header: { template: templatePath("actor/gm-toolkit/header.hbs") },
		myths: { template: templatePath("actor/gm-toolkit/myths.hbs"), scrollable: [""] },
		places: { template: templatePath("actor/gm-toolkit/places.hbs"), scrollable: [""] },
		time: { template: templatePath("actor/gm-toolkit/time.hbs"), scrollable: [""] },
		notes: { template: templatePath("actor/gm-toolkit/notes.hbs"), scrollable: [""] },
		settings: { template: templatePath("actor/gm-toolkit/settings.hbs"), scrollable: [""] }
	};

	/** The toolkit's pages, picked from the rail hung off the window's edge. */
	static TABS = {
		primary: {
			initial: TOOLKIT_TABS[0],
			tabs: [
				...TOOLKIT_TABS.map((id) => ({ id, icon: TAB_ICONS[id], label: `bastionland.gmToolkit.tabs.${id}` })),
				// The GM's own settings, and the Referee's.
				SETTINGS_TAB_ENTRY
			]
		}
	};

	/** @type {string|null} The Realm Scene chosen at the top of the sheet. */
	sceneId = null;

	/** @type {object|null|undefined} The art index: undefined until loaded, null if never imported. */
	#index;

	/** @type {[string, number][]} Hook ids to remove on close. */
	#hooks = [];

	/** Folds opened or closed by hand, by what they fold, so a redraw leaves them as they were. */
	#folds = new Map();

	/** Parts waiting to be redrawn. */
	#stale = new Set();

	/** @type {Map<number, Record<number, number>>} The row last rolled in each column of a Myth's table, by Myth number. */
	#tableRolls = new Map();

	/** @type {Map<string, {img: string|null, members: object[]}>} Each Cast as the page last drew it, so a click knows the stat block it stands for. */
	#casts = new Map();

	/** Whether a Myth's table is being rolled, so a second click waits for it to land. */
	#spinning = false;

	/** Whether a redraw is already on its way. */
	#redrawing = false;

	/** @type {Record<string, string>} What each page with a search box is searched for, kept across redraws. */
	#searches = { places: "" };

	/** How the Places page lists its hexes, one of PLACE_ORDERS, kept across redraws. */
	#placesOrder = PLACE_ORDERS[0];

	/** @returns {Scene|null} The Realm on show: the one chosen, the one on the canvas, or the first there is. */
	get scene() {
		const chosen = game.scenes.get(this.sceneId);
		if (isRealmScene(chosen)) return chosen;
		return isRealmScene(canvas?.scene) ? canvas.scene : game.scenes.find(isRealmScene) ?? null;
	}

	/** @override */
	get title() {
		return this.actor.name;
	}

	/* -------------------------------------------- */
	/*  Rendering                                   */
	/* -------------------------------------------- */

	/**
	 * A change to the Seasons log alone, such as a Season's notes, redraws the
	 * Time page, which keeps it, rather than every page.
	 * @override
	 */
	_configureRenderOptions(options) {
		super._configureRenderOptions(options);
		const changes = options.renderContext === "updateActor" ? options.renderData : null;
		const changed = Object.keys(changes ?? {}).filter((key) => !["_id", "_stats"].includes(key));
		if (changed.length === 1 && changed[0] === "system" && Object.keys(changes.system).every((key) => key === "seasons")) options.parts = ["time"];
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.#index === undefined) this.#index = await loadArtIndex();
		const scene = this.scene;
		const entry = scene ? getRealm(scene) : null;
		const realm = entry?.realm ?? null;
		return Object.assign(context, {
			actor: this.actor,
			system: this.actor.system,
			realmData: realm && {
				scene,
				realm,
				g: sceneGeometry(scene),
				lore: getHexLore(scene),
				journey: getJourney(scene),
				notes: getMythNotes(scene),
				companyHex: companyTokenHex(scene)
			}
		});
	}

	/** @override */
	async _preparePartContext(partId, context, options) {
		const part = { ...(await super._preparePartContext(partId, context, options)) };
		part.tab = context.tabs?.[partId];
		const data = context.realmData;
		switch (partId) {
			case "header": return Object.assign(part, this.#headerContext(data));
			case "myths": return Object.assign(part, this.#mythsContext(data));
			case "places": return Object.assign(part, this.#placesContext(data));
			case "time": return Object.assign(part, this.#timeContext(data));
			case "notes": return Object.assign(part, await this.#notesContext());
			default: return part;
		}
	}

	/**
	 * The banner: which Realm the pages show, where the Company is, and the world's calendar.
	 * @param {object|null} data
	 */
	#headerContext(data) {
		const shown = data?.scene ?? null;
		const realms = game.scenes.filter(isRealmScene).map((scene) => ({ id: scene.id, name: scene.name, selected: scene.id === shown?.id }));
		return {
			realms,
			// With one Realm there is nothing to choose: the banner names it instead of offering a dropdown.
			onlyRealm: realms.length === 1 ? realms[0].name : null,
			clock: this.#clockContext(),
			rulebook: { have: hasRulebook(), tooltip: t(hasRulebook() ? "gmToolkit.rulebook" : "gmToolkit.rulebookSetup") },
			company: data?.companyHex ? { label: t("realm.hex", data.companyHex), key: hexKey(data.companyHex) } : null,
			noCompany: Boolean(data) && !data.companyHex
		};
	}

	/**
	 * Each Myth with the Omen playing out and the one to come (p18, p27), and the City Quest (p172).
	 * @param {object|null} data
	 */
	#mythsContext(data) {
		const seen = cityOmensSeen();
		// Read once for the whole page: every Myth's Cast is gathered from the same
		// actors, and names their scores by the same words.
		const forCast = { actors: castActors(), labels: statLabels() };
		this.#casts.clear();
		const cityQuest = {
			seen: t("cityQuest.seen", { count: seen.length, end: CITY_QUEST_END }),
			omens: seen.map((omen) => ({ number: omen, text: this.#index?.cityQuest?.omens?.[omen - 1] ?? t("cityQuest.omen", { omen, count: CITY_OMEN_COUNT }) })),
			over: cityQuestOver(seen),
			empty: !seen.length,
			missingText: !this.#index?.cityQuest?.omens,
			cast: this.#castContext({
				key: CITY_CAST,
				fold: "cast:city",
				cast: this.#index?.cityQuest?.cast,
				note: this.#index?.cityQuest?.castNote,
				missingText: !this.#index?.cityQuest?.cast,
				myth: t("cityQuest.title"),
				...forCast
			})
		};
		if (!data) return { noRealm: true, cityQuest };

		const myths = data.realm.myths.map((myth) => this.#mythContext(myth, data, forCast));
		return {
			myths,
			// Opening one Myth folds the one open before, so the other five stay a row each.
			mythGroup: `${this.id}-myths`,
			missingText: Boolean(myths.length) && !this.#index?.myths?.length,
			cityQuest
		};
	}

	/**
	 * @param {object} myth From the Realm.
	 * @param {object} data
	 * @param {import("../rules/myth-cast.js").CastActor[]} actors Every actor a Cast could gather.
	 */
	#mythContext(myth, data, forCast) {
		const { name, page, entry } = mythLookup(this.#index, myth);
		const { current, next } = omenStage(myth.omen);
		const text = (number) => entry?.omens?.[number - 1] ?? null;
		const kept = mythNoteFor(data.notes, myth);
		const fold = `myth:${myth.number}`;
		return {
			number: myth.number,
			name,
			reference: page ? t("realm.key.page", { page }) : null,
			img: entry?.path ?? null,
			hex: t("realm.hex", myth.hex),
			hexKey: hexKey(myth.hex),
			hidden: !myth.revealed,
			seen: t("realm.panel.omensSeen", { omen: myth.omen, count: OMEN_COUNT }),
			// On one line under the name, so it reads with the card folded.
			verse: this.#verse(entry, page)?.join(" / ") ?? null,
			// All six in order: the one playing out and the one to come in full,
			// every other cut to a line, which its row reads out on hover instead.
			// Clicking a row marks that Omen; clicking the one playing out takes
			// it back, so what each does is said where the pointer is.
			omens: Array.from({ length: OMEN_COUNT }, (_, index) => {
				const number = index + 1;
				const label = number === current ? t("gmToolkit.myths.current") : number === next ? t("gmToolkit.myths.next") : null;
				const written = text(number) ?? t("myths.omenNumber", { number });
				const cut = number !== current && number !== next;
				const mark = number === current ? t("gmToolkit.myths.unmarkOmen") : t("gmToolkit.myths.markOmen", { number });
				return {
					number,
					parts: omenParts(written),
					met: number <= myth.omen,
					past: number < myth.omen,
					current: number === current,
					next: number === next,
					label,
					cut,
					mark
				};
			}),
			complete: myth.omen >= OMEN_COUNT,
			resolved: kept.resolved,
			note: kept.note,
			fold,
			open: this.#folds.get(fold) ?? false,
			table: this.#tableContext(myth, page, entry, pointsOpposite(text(current))),
			cast: this.#castContext({
				key: castKey(this.scene, myth),
				fold: `cast:${myth.number}`,
				cast: entry?.cast,
				note: entry?.castNote,
				missingText: !entry?.cast,
				img: entry?.path ?? null,
				myth: name,
				...forCast
			})
		};
	}

	/**
	 * The Cast printed beside a Myth's Omens (p18), with whoever the world has
	 * made of them and anyone else the GM has dropped in.
	 * @param {object} options
	 * @param {string} options.key Which Cast, as an actor's flag names it.
	 * @param {string} options.fold
	 * @param {object[]|null|undefined} options.cast From the art index.
	 * @param {string|null|undefined} options.note What the book says about the whole Cast.
	 * @param {boolean} options.missingText Whether the book's own words are still to be imported.
	 * @param {string|null} [options.img] The Myth's picture, worn by whoever is made from it.
	 * @param {string} options.myth The Myth's name, which the folder its Cast is filed in takes.
	 * @param {import("../rules/myth-cast.js").CastActor[]} options.actors
	 * @param {Record<string, string>} options.labels What each score is called, read once for the page.
	 */
	#castContext({ key, fold, cast, note, missingText, img = null, myth, actors, labels }) {
		const { members, extras, made } = gatherCast(cast, actors, key);
		this.#casts.set(key, { img, myth, members });
		return {
			key,
			fold,
			img,
			open: this.#folds.get(fold) ?? false,
			summary: members.length ? t("gmToolkit.cast.summary", { made, count: members.length }) : t("gmToolkit.cast.title"),
			note: note || null,
			// The Armour joins the stat line and the rest is run together; the entry keeps its printed lines for making an actor of it.
			members: members.map((member) => ({ ...member, statLine: formatStatLine(member.stats, labels), ...castBlock(member.lines) })),
			extras,
			made,
			empty: !members.length && !extras.length,
			missingText
		};
	}

	/**
	 * The verse under a Myth's name: from the index, or else read from the
	 * world's rulebook for an index imported before the verses were.
	 * @param {object|null} entry From the art index.
	 * @param {number|null} page
	 * @returns {string[]|null} One entry a line, or null while it's read or where there's none.
	 */
	#verse(entry, page) {
		if (entry?.verse) return entry.verse;
		if (!page || (this.#index?.version ?? 0) >= MYTH_VERSE_VERSION) return null;
		const read = peekVerse(page);
		// Read once however often the page is drawn meanwhile, as the table is.
		if (read === undefined && canReadTablesFromRulebook()) verseForEntry(this.#index, entry, { page }).then(() => this.#redraw("myths"));
		return read ?? null;
	}

	/**
	 * The table printed beside a Myth's Omens, which they call "opposite": from
	 * the index, or else read from the world's rulebook while the page waits.
	 * @param {object} myth
	 * @param {number|null} page
	 * @param {object|null} entry From the art index.
	 * @param {boolean} called Whether the Omen playing out points to it, which unfolds it.
	 * @returns {object|null} Null for a Myth whose page there's no way to read.
	 */
	#tableContext(myth, page, entry, called) {
		const fold = `table:${myth.number}`;
		const read = peekTable(page);
		const table = entry?.table ?? read ?? null;
		if (!table) {
			if (!page) return null;
			const reading = read === undefined && canReadTablesFromRulebook();
			// Each read is made once however often the page is drawn meanwhile, and the redraws it asks for fold into one.
			if (reading) tableForEntry(this.#index, entry, { page }).then(() => this.#redraw("myths"));
			return { fold, reading };
		}
		return {
			fold,
			open: this.#folds.get(fold) ?? called,
			name: table.name,
			...tableView(table, this.#tableRolls.get(myth.number), (column) => t("gmToolkit.myths.rollColumn", { column }))
		};
	}

	/**
	 * Every place in the Realm, each hex once, by column then row: the hexes
	 * the Company has come into, the last three reached unfolded, then the
	 * rest; or its Holdings, Landmarks and every other hex visited or written
	 * about. And the Sites.
	 * @param {object|null} data
	 */
	#placesContext(data) {
		const sites = game.journal.filter(isSiteEntry)
			.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
			.map((entry) => this.#siteRow(entry));
		const search = this.#searches.places;
		if (!data) return { noRealm: true, sites, search };

		const order = this.#placesOrder;
		const places = realmPlaces(data.realm, data.lore, data.journey);
		// One fold for a hex in either order, so switching keeps a card as it was left.
		const card = (hex, open = false) => this.#hexCard(data, hex, { fold: `place:${hexKey(hex)}`, open });
		const section = (key, cards, hint = false) => ({
			heading: t(`gmToolkit.places.${key}`),
			hint: hint ? t(`gmToolkit.places.${key}Hint`) : null,
			empty: t(`gmToolkit.places.${key}None`),
			cards
		});
		const latest = places.recent.slice(0, OPEN_VISITS);
		const sections = order === "visited"
			? [
				section("visited", places.visited.map((hex) => card(hex, latest.some((seen) => sameHex(seen, hex))))),
				section("unvisited", places.unvisited.map((hex) => card(hex)), true)
			]
			: [
				section("holdings", places.holdings.map((holding) => card(holding.hex))),
				section("landmarks", places.landmarks.map((landmark) => card(landmark.hex))),
				section("others", places.others.map((hex) => card(hex)), true)
			];
		return {
			summary: t("gmToolkit.places.summary", { count: places.visited.length, total: data.g.cols * data.g.rows }),
			orders: PLACE_ORDERS.map((key) => ({ key, label: t(`gmToolkit.places.orders.${key}`), active: key === order })),
			sections,
			sites,
			search
		};
	}

	/**
	 * A Site on one row: its name, how many of each kind of point it has, and
	 * how many of them the players have found.
	 * @param {JournalEntry} entry
	 * @returns {object}
	 */
	#siteRow(entry) {
		const points = Object.values(readSite(entry).points).filter((point) => point.kind);
		const counts = POINT_KINDS.map((kind) => {
			const count = points.filter((point) => point.kind === kind).length;
			return count ? `${count} ${t(`sites.points.${kind}.${count === 1 ? "label" : "plural"}`)}` : null;
		}).filter(Boolean);
		const found = points.filter((point) => point.found).length;
		return {
			uuid: entry.uuid,
			name: entry.name,
			counts,
			found: points.length ? t("gmToolkit.places.siteFound", { found, total: points.length }) : t("gmToolkit.places.siteEmpty"),
			search: searchable([entry.name, ...counts, ...points.map((point) => point.text)].join(" "))
		};
	}

	/**
	 * One hex: what stands in it, when the Company was there, what the GM
	 * wrote, and the Spark Tables rolled for it, newest first.
	 * @param {object} data
	 * @param {{col: number, row: number}} hex
	 * @param {object} options
	 * @param {string} options.fold  What remembers whether it's unfolded.
	 * @param {boolean} options.open Whether it starts unfolded.
	 * @returns {object}
	 */
	#hexCard(data, hex, { fold, open }) {
		const key = hexKey(hex);
		const { title, kind, self, status } = this.#placeIn(data.realm, hex);
		// What a Landmark here asks of travellers who are there (p14), Holding or no.
		const { landmark } = featureAt(data.realm, hex);
		const offer = landmark ? landmarkOfferView(landmark.type) : null;
		const record = data.lore.hexes[key] ?? null;
		const visits = data.journey.hexes[key] ?? null;
		const terrain = terrainAt(data.realm, data.g, hex);
		const label = t("realm.hex", hex);
		const terrainName = terrain ? t(`realm.terrain.${TERRAIN[terrain - 1]}`) : null;
		const features = [...status, ...this.#featuresIn(data.realm, hex, self)];
		const visited = visits && visitsLabel(visits);
		const sparks = [...(record?.sparks ?? [])].reverse().map((spark) => ({
			id: spark.id,
			prompt: spark.prompt,
			table: spark.table,
			when: sparkWhen(spark)
		}));
		// The wilderness as it was last rolled, read at a glance while the card is folded.
		const wild = latestWilderness(record).map((spark) => ({
			text: t("gmToolkit.wildChip", { table: spark.table, prompt: spark.prompt }),
			when: sparkWhen(spark)
		}));
		const said = [title, kind, label, terrainName, ...features.map((feature) => feature.text), visited, record?.note, ...sparks.flatMap((spark) => [spark.prompt, spark.table, spark.when])];
		return {
			key,
			// Everything the card says, for the Places page's search.
			search: searchable(said.filter(Boolean).join(" ")),
			title: title ?? label,
			kind,
			// A place's own name heads its card, so the hex it's in is named beside it.
			hex: title && title !== label ? label : null,
			terrain: terrainName,
			features,
			companyHere: sameHex(data.companyHex, hex),
			visited: Boolean(visits),
			visits: visited,
			note: record?.note ?? "",
			sparks,
			wild,
			landmark: offer,
			fold,
			open: this.#folds.get(fold) ?? open
		};
	}

	/**
	 * What heads a hex's card: the Holding in it, else the Landmark, by name or
	 * by what it is while it has none, and saying what it is only once. A hex
	 * holding neither is headed by its own name.
	 * @param {object} realm
	 * @param {{col: number, row: number}} hex
	 * @returns {{title: string|undefined, kind: string|null, self: "holding"|"landmark"|null, status: {text: string, hidden: boolean}[]}}
	 */
	#placeIn(realm, hex) {
		const { holding, landmark } = featureAt(realm, hex);
		const named = (name, what) => ({ title: name || what, kind: name ? what : null });
		if (holding) {
			const { title, kind } = named(holding.name, t(`realm.holdings.${holding.style}`));
			return { title, kind: [kind, holding.seat ? t("gmToolkit.places.seat") : null].filter(Boolean).join(", ") || null, self: "holding", status: [] };
		}
		if (landmark) {
			const seer = isTableRoll(landmark.seer) ? seerEntry(this.#index, landmark.seer) : null;
			return {
				...named(landmark.name, t(`realm.landmarks.${landmark.type}`)),
				self: "landmark",
				status: [
					seer && { text: t("gmToolkit.places.seer", { name: seer.name }), hidden: false },
					!landmark.revealed && { text: t("gmToolkit.places.notFound"), hidden: true }
				].filter(Boolean)
			};
		}
		return { title: undefined, kind: null, self: null, status: [] };
	}

	/**
	 * What the Realm says stands in a hex, each flagged when players can't see it yet.
	 * @param {object} realm
	 * @param {{col: number, row: number}} hex
	 * @param {string|null} [skip] A kind of feature to leave out, such as the one a card is about.
	 * @returns {{text: string, hidden: boolean}[]}
	 */
	#featuresIn(realm, hex, skip = null) {
		const here = featureAt(realm, hex);
		const holding = skip === "holding" ? null : here.holding;
		const landmark = skip === "landmark" ? null : here.landmark;
		const { myth } = here;
		const features = [];
		if (holding) {
			const named = holding.name || t(`realm.holdings.${holding.style}`);
			features.push({ text: holding.seat ? `${named} (${t("gmToolkit.places.seat")})` : named, hidden: false });
		}
		if (myth) {
			const { name } = mythLookup(this.#index, myth);
			features.push({ text: t("gmToolkit.places.myth", { number: myth.number, name }), hidden: !myth.revealed });
		}
		if (landmark) {
			const named = landmark.name || t(`realm.landmarks.${landmark.type}`);
			const seer = isTableRoll(landmark.seer) ? seerEntry(this.#index, landmark.seer) : null;
			features.push({ text: seer ? `${named}: ${seer.name}` : named, hidden: !landmark.revealed });
		}
		return features;
	}

	/** The calendar at the banner's end, each part of it set by hand from there. */
	#clockContext() {
		const calendar = getCalendar();
		const { season, phase } = calendar;
		// The banner shows the date alone, so the Referee's own blocks aren't worked out for it.
		const { age, seasons, phases } = timeContext({ referee: false });
		// Hovering the Age reads the date out in full, as a chronicle would, before how to set it.
		const tooltip = `${chronicleLabel(calendar)} ${t("gmToolkit.clockHint")}`;
		// Only a table with FXMaster to draw the weather is shown it, and a GM may hide it even then.
		const weather = weatherButtonShown() ? weatherView() : null;
		return { age, season, seasonIcon: SEASON_ICONS[season], phaseIcon: PHASE_ICONS[phase], seasons, phases, weather, tooltip };
	}

	/**
	 * The world's calendar and what moves it (p17). The Season it is in comes
	 * with what's owed before it turns: the Domains' Crisis Rolls (p20), and the
	 * Realm's resolved Myths, each replaced by a new one in the next Season
	 * (p27). Below it, the record of every other Season.
	 * @param {object|null} data
	 */
	#timeContext(data) {
		const calendar = getCalendar();
		const waiting = data ? resolvedMyths(data.realm, data.notes) : [];
		// The log by Age, the newest first, and each Age's Seasons the newest first too.
		const ages = seasonLogView(this.actor.system.seasons, calendar).map(({ age, seasons }) => ({ age, seasons: [...seasons].reverse() }));
		const { record, ...now } = ages.flatMap(({ seasons }) => seasons).find((entry) => entry.current);
		return {
			...timeContext(),
			thisSeason: {
				...now,
				label: t("gmToolkit.time.thisSeason", { season: t(`time.seasons.${now.season}`) }),
				icon: SEASON_ICONS[now.season],
				notes: record.notes,
				turn: this.#seasonTurn(record.turn)
			},
			crisisRolls: crisisRollsDue(worldDomains(), calendar).map((domain) => ({ id: domain.id, name: domain.name })),
			resolved: waiting.map((myth) => ({ number: myth.number, name: mythLookup(this.#index, myth).name, hex: t("realm.hex", myth.hex) })),
			pastAges: ages.map(({ age, seasons }) => {
				const past = seasons.filter((entry) => !entry.current).map((entry) => this.#pastSeason(entry));
				const fold = `age-${age}`;
				return {
					age,
					label: t("gmToolkit.seasons.age", { age }),
					count: t(`gmToolkit.seasons.count.${past.length === 1 ? "one" : "other"}`, { count: past.length }),
					seasons: past,
					fold,
					// The Age the world is in lies open, the ones before it folded away.
					open: this.#folds.get(fold) ?? age === now.age
				};
			}).filter(({ seasons }) => seasons.length)
		};
	}

	/**
	 * A Season before this one, folded to one row under its Age.
	 * @param {{key: string, season: string, record: import("../rules/season-log.js").SeasonRecord}} entry
	 */
	#pastSeason({ record, ...entry }) {
		const fold = `season-${entry.key}`;
		return {
			...entry,
			label: t(`time.seasons.${entry.season}`),
			icon: SEASON_ICONS[entry.season],
			notes: record.notes,
			// The Myths resolved in it (p27); its events (p17) only mattered while it lasted.
			myths: record.myths.map(({ name }) => name),
			turn: this.#seasonTurn(record.turn),
			fold,
			open: this.#folds.get(fold) ?? false
		};
	}

	/**
	 * How a Season ended, as its card told the table, or null while it hasn't.
	 * @param {import("../rules/season-log.js").SeasonTurn|null} turn
	 */
	#seasonTurn(turn) {
		return turn && {
			title: turn.title,
			ended: t("gmToolkit.seasons.ended", { title: turn.title }),
			note: turn.note,
			entries: turn.entries
		};
	}

	/** The GM's own notes. */
	async #notesContext() {
		return {
			enrichedNotes: await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.actor.system.notes, {
				secrets: this.actor.isOwner,
				relativeTo: this.actor
			})
		};
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		const onRealmDocument = (document) => {
			const sceneId = document.documentName === "Scene" ? document.id : document.parent?.id;
			if (sceneId === this.scene?.id) this.#redraw(...REALM_PARTS);
		};
		// A Realm made, renamed, unmade or deleted changes the choice of Realms, and can change the one on show.
		// Other changes to a Scene only matter when it's the one on show, which onRealmDocument hears.
		const onScenes = () => this.#redraw(...REALM_PARTS);
		const onSceneChange = (_scene, changes) => ("name" in changes || changes.flags?.[SYSTEM_ID]) && onScenes();
		const onCompany = (token) => {
			if (token.parent?.id === this.scene?.id && token.getFlag?.(SYSTEM_ID, COMPANY_FLAG)) this.#redraw("header", "places");
		};
		// Only a move, or the Company mark itself, changes where the Company is.
		const onCompanyChange = (token, changes) => ["x", "y", "flags"].some((key) => key in changes) && onCompany(token);
		const onSite = (entry) => isSiteEntry(entry) && this.#redraw("places");
		const onDomain = (actor) => actor.type === "domain" && this.#redraw("time");
		// An actor made, deleted, renamed, repictured, put in a Cast or taken out of one changes the Myths page.
		const onCast = (actor) => couldJoinCast(actor) && this.#redraw("myths");
		// Only the Cast flag itself, since the system writes plenty of others on an
		// actor -- goods pictures, a breed, a hex's lore -- that the Myths page can't see.
		const onCastChange = (actor, changes) => (["name", "img"].some((key) => key in changes) || CAST_FLAG in (changes.flags?.[SYSTEM_ID] ?? {})) && onCast(actor);
		// Only a Crisis Roll or a new name changes the Time page's list of Domains.
		const onDomainChange = (actor, changes) => ("name" in changes || changes.system?.crisisRolled !== undefined) && onDomain(actor);
		this.#hooks = [
			...["createTile", "updateTile", "deleteTile", "updateScene"].map((name) => [name, Hooks.on(name, onRealmDocument)]),
			...["createScene", "deleteScene"].map((name) => [name, Hooks.on(name, onScenes)]),
			["updateScene", Hooks.on("updateScene", onSceneChange)],
			...["createToken", "deleteToken"].map((name) => [name, Hooks.on(name, onCompany)]),
			["updateToken", Hooks.on("updateToken", onCompanyChange)],
			...["createJournalEntry", "updateJournalEntry", "deleteJournalEntry"].map((name) => [name, Hooks.on(name, onSite)]),
			[CITY_QUEST_HOOK, Hooks.on(CITY_QUEST_HOOK, () => this.#redraw("myths"))],
			// One listener for each, fanning out to the pages that care, rather than
			// a pair of them running down every actor the world writes.
			...["createActor", "deleteActor"].map((name) => [name, Hooks.on(name, (actor) => {
				onDomain(actor);
				onCast(actor);
			})]),
			["updateActor", Hooks.on("updateActor", (actor, changes) => {
				onDomainChange(actor, changes);
				onCastChange(actor, changes);
			})],
			[CALENDAR_HOOK, Hooks.on(CALENDAR_HOOK, () => this.#redraw("header", "time"))],
			[WEATHER_HOOK, Hooks.on(WEATHER_HOOK, () => this.#redraw("header"))],
			[RULEBOOK_HOOK, Hooks.on(RULEBOOK_HOOK, () => this.#redraw("header"))]
		];
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		// A <details> says it's been folded or unfolded only to itself. Parts not
		// drawn this time kept theirs, and already have a listener.
		for (const part of options.parts ?? []) {
			for (const details of this.parts?.[part]?.querySelectorAll("details[data-fold]") ?? []) {
				details.addEventListener("toggle", () => {
					// One drawn open says so too, so only a fold opened by hand counts as news.
					const opened = details.open && this.#folds.get(details.dataset.fold) !== true;
					this.#folds.set(details.dataset.fold, details.open);
					if (opened && details.hasAttribute("data-myth-card")) bringIntoView(details);
				});
			}
		}
		for (const part of Object.keys(this.#searches)) {
			if (!options.parts?.includes(part)) continue;
			this.parts[part]?.querySelector(".bastionland-gm-toolkit__search")?.addEventListener("input", (event) => {
				this.#searches[part] = event.target.value;
				this.#applySearch(part);
			});
			this.#applySearch(part);
		}
		placeTabRail(this.element, ".bastionland-gm-toolkit__header");
	}

	/**
	 * Show only the hexes and Sites a page's search finds, and only the sections
	 * that still hold one. With no search, everything is shown.
	 * @param {string} part The page searched.
	 */
	#applySearch(part) {
		const page = this.parts?.[part];
		if (!page) return;
		const term = searchable(this.#searches[part].trim());
		let found = 0;
		for (const place of page.querySelectorAll("[data-search]")) {
			place.hidden = Boolean(term) && !place.dataset.search.includes(term);
			if (!place.hidden) found++;
		}
		for (const section of page.querySelectorAll("[data-search-section]")) {
			section.hidden = Boolean(term) && !section.querySelector("[data-search]:not([hidden])");
		}
		const none = page.querySelector(".bastionland-gm-toolkit__no-match");
		if (none) none.hidden = !term || found > 0;
	}

	/**
	 * The Settings page is shown to a GM: the Toolkit is every GM's own.
	 * @override
	 */
	_showsSettingsTab(user) {
		return Boolean(user?.isGM);
	}

	/**
	 * The rail changes sides when the window is dragged near the screen's edge.
	 * @override
	 */
	_onPosition(position) {
		super._onPosition(position);
		stampRailSide(this.element, position);
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		for (const [name, id] of this.#hooks) Hooks.off(name, id);
		this.#hooks = [];
		this.#stale.clear();
	}

	/**
	 * Redraw some parts once a batch of changes has landed, and once whoever is
	 * typing in one of them has left the field: a redraw puts every field back
	 * to its saved value. The notes are never among them, so an open editor
	 * isn't swept away by a Token moving.
	 * @param {...string} parts
	 */
	#redraw(...parts) {
		for (const part of parts) this.#stale.add(part);
		if (this.#redrawing) return;
		this.#redrawing = true;
		setTimeout(() => this.#redrawStale(), REDRAW_DELAY);
	}

	/**
	 * Draw the parts waiting to be drawn, unless the GM is typing in one of
	 * them. Then it looks again shortly, rather than waiting on the field's blur,
	 * which never comes for a field swept away by some other redraw.
	 */
	#redrawStale() {
		if (!this.rendered) {
			this.#redrawing = false;
			this.#stale.clear();
			return;
		}
		const parts = [...this.#stale];
		const field = document.activeElement;
		if (field?.matches?.(TYPING) && parts.some((part) => this.parts?.[part]?.contains(field))) {
			setTimeout(() => this.#redrawStale(), TYPING_RECHECK);
			return;
		}
		this.#redrawing = false;
		this.#stale.clear();
		if (parts.length) this.render({ parts });
	}

	/* -------------------------------------------- */
	/*  Fields                                      */
	/* -------------------------------------------- */

	/**
	 * The Realm's fields are written where they live, and never sent to the
	 * Actor; only the notes are the Actor's own.
	 * @override
	 */
	_onChangeForm(formConfig, event) {
		const field = event.target?.dataset?.toolkitField;
		if (!field) return super._onChangeForm(formConfig, event);
		return this.#onToolkitField(field, event.target);
	}

	/**
	 * @param {string} field
	 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} target
	 */
	async #onToolkitField(field, target) {
		const scene = this.scene;
		switch (field) {
			// A search filters its page as it's typed, and is never saved.
			case "search": return;
			case "realm":
				if (!target.value || target.value === this.sceneId) return;
				this.sceneId = target.value;
				return this.render({ parts: REALM_PARTS });
			case "hexNote": {
				const hex = parseHexKey(target.closest("[data-hex]")?.dataset.hex);
				if (hex && scene) await writeHexNote(scene, hex, target.value);
				return;
			}
			case "mythNote": {
				const myth = this.#mythFrom(target);
				if (myth) await editMythNote(scene, myth, { note: target.value });
				return;
			}
			case "seasonNotes": {
				const key = target.closest("[data-season-key]")?.dataset.seasonKey;
				if (key) await writeSeasonNotes(key, target.value);
				return;
			}
			case "season":
			case "phase":
				// A pick is made once chosen, so the banner needn't wait for the GM to leave the drop-down.
				target.blur();
				await setCalendarByHand({ [field]: target.value });
				return;
			default:
		}
	}

	/**
	 * Dropping an actor on a Myth counts them among its Cast, and dropping one
	 * on the City Quest among the City's.
	 * @override
	 */
	async _onDropActor(event, actor) {
		const element = event.target instanceof HTMLElement ? event.target : null;
		if (!element || !this.isEditable || actor.uuid === this.actor.uuid) return null;
		// A Cast already on the page says which it is; anywhere else on a Myth's card means that Myth's.
		const fold = element.closest("[data-cast-key]");
		const myth = fold ? null : this.#mythFrom(element);
		const key = fold?.dataset.castKey || (myth && castKey(this.scene, myth));
		if (!key) return null;
		return addToCast(actor, key, myth ? mythLookup(this.#index, myth).name : t("cityQuest.title"));
	}

	/**
	 * @param {HTMLElement} target
	 * @returns {{key: string, img: string|null, members: object[], member: object|null}|null} The Cast
	 *   a control belongs to, and the entry it stands for, as the page last drew them.
	 */
	#castFrom(target) {
		const key = target.closest("[data-cast-key]")?.dataset.castKey;
		const cast = key ? this.#casts.get(key) : null;
		if (!cast) return null;
		const index = Number(target.closest("[data-cast-index]")?.dataset.castIndex);
		return { key, img: cast.img, myth: cast.myth, members: cast.members, member: cast.members[index] ?? null };
	}

	/**
	 * @param {HTMLElement} target
	 * @returns {object|null} The Myth a control belongs to, read afresh from the Realm.
	 */
	#mythFrom(target) {
		const number = Number(target.closest("[data-number]")?.dataset.number);
		const scene = this.scene;
		return (scene && getRealm(scene)?.realm.myths.find((myth) => myth.number === number)) ?? null;
	}

	/**
	 * @param {HTMLElement} target
	 * @returns {{col: number, row: number}|null} The hex a control belongs to.
	 */
	static #hexFrom(target) {
		return parseHexKey(target.closest("[data-hex]")?.dataset.hex);
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * The Omen clicked is the one the Company has met: Omens come in order (p18),
	 * so every Omen before it is met too and every one after it is still to come.
	 * Clicking the Omen playing out takes it back, which is how a mistaken tap is
	 * undone where it was made. Nothing goes to chat, not even to the GMs.
	 * @this {GmToolkitSheet}
	 */
	static #onMarkOmen(_event, target) {
		const myth = this.#mythFrom(target);
		const number = Number(target.dataset.omen);
		if (!myth || !Number.isInteger(number)) return;
		return editRealm(this.scene, (realm) => setOmen(realm, myth.number, number === myth.omen ? number - 1 : number));
	}

	/**
	 * Roll on a Myth's table, a d6 for each column or for the one clicked. The
	 * card is posted as the highlight starts down the table to stop on each row rolled.
	 * @this {GmToolkitSheet}
	 */
	static async #onRollMythTable(_event, target) {
		const myth = this.#mythFrom(target);
		if (!myth || this.#spinning) return;
		const { name, page, entry } = mythLookup(this.#index, myth);
		const table = entry?.table ?? peekTable(page);
		if (!table) return;

		const columns = askedColumns(table, Number(target.dataset.column));
		this.#spinning = true;
		try {
			const { roll, results, prompt } = await rollMythTable(table, columns);
			this.#tableRolls.set(myth.number, {
				...this.#tableRolls.get(myth.number),
				...Object.fromEntries(results.map((result) => [result.index, result.roll]))
			});
			// The card goes out at once, so its dice roll while the highlight runs.
			// GMs only, as with the Omen card: it names a Myth the players may not know.
			const card = postCard(null, "spark", {
				name: table.name,
				tagline: t("gmToolkit.myths.tableTagline", { name, page }),
				prompt,
				results
			}, { rolls: [roll], mode: "gm" });
			const shown = target.closest("[data-number]")?.querySelector("[data-myth-table]");
			await Promise.all([card, spinTable(shown, columns, results)]);
		} finally {
			this.#spinning = false;
		}
	}

	/**
	 * An Omen's "see opposite": unfold the Myth's table and bring it into view.
	 * @this {GmToolkitSheet}
	 */
	static #onShowMythTable(event, target) {
		// In an Omen cut to a line, the link opens the table, not the Omen.
		event.preventDefault();
		const fold = target.closest("[data-number]")?.querySelector("details[data-myth-fold]");
		if (!fold) return;
		fold.open = true;
		fold.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
	}

	/**
	 * Open the Myth's picture in a window of its own, from where it can be shown
	 * to the players.
	 * @this {GmToolkitSheet}
	 */
	static #onShowMythArt(_event, target) {
		const myth = this.#mythFrom(target);
		const { name, page, entry } = myth ? mythLookup(this.#index, myth) : {};
		// The verse goes under the picture as the book prints it, one line under the other.
		if (entry?.path) openArt({ src: entry.path, title: name, caption: this.#verse(entry, page)?.join("\n") ?? "", icon: TAB_ICONS.myths });
	}

	/**
	 * The group feels the Myth is resolved: mark it so, keep it in this
	 * Season's record, and award the Glory that comes with it (p27). A new Myth
	 * replaces it in the next Season. The group may resolve it at any Omen,
	 * for the players' own deeds can bring it to an end (p16).
	 * @this {GmToolkitSheet}
	 */
	static async #onMythResolved(_event, target) {
		const myth = this.#mythFrom(target);
		if (!myth) return;
		await Promise.all([
			editMythNote(this.scene, myth, { resolved: true }),
			recordMythCompleted({ id: completedMythId(this.scene.id, myth), name: mythLookup(this.#index, myth).name }),
			awardGlory("myth")
		]);
	}

	/** @this {GmToolkitSheet} */
	static async #onMythUnresolved(_event, target) {
		const myth = this.#mythFrom(target);
		if (!myth) return;
		await Promise.all([editMythNote(this.scene, myth, { resolved: false }), forgetMythCompleted(completedMythId(this.scene.id, myth))]);
	}

	/**
	 * Roll the new Myth that replaces a resolved one (p27), in the same hex and
	 * under the same number, with none of its Omens met. A Realm never holds the
	 * same Myth twice, so a Myth it already has, the resolved one included, is
	 * rolled again. What was written about the old Myth stays with the old roll,
	 * so taking the roll back with the Realm's Undo brings it back too.
	 * @this {GmToolkitSheet}
	 */
	static async #onNewMyth(_event, target) {
		const myth = this.#mythFrom(target);
		const scene = this.scene;
		if (!myth || !scene) return;
		const { realm } = getRealm(scene);
		let d6;
		let d12;
		// Six Myths of 72 are taken, so a free one turns up within a few rolls.
		for (let tries = 0; tries < 100; tries++) {
			d6 = await new Roll("1d6").evaluate();
			d12 = await new Roll("1d12").evaluate();
			if (!mythRollTaken(realm, { d6: d6.total, d12: d12.total })) break;
		}
		const rolled = { number: myth.number, d6: d6.total, d12: d12.total };
		const written = await editRealm(scene, (realm, g) => placeFeature(realm, g, myth.hex, { kind: "myth", ...rolled, omen: 0, revealed: false }));
		if (!written) return;
		const { name, page, entry } = mythLookup(this.#index, rolled);
		await postCard(null, "omen", {
			title: `${myth.number}. ${name}`,
			tagline: page ? t("realm.key.page", { page }) : null,
			img: entry?.path ?? null,
			omen: t("gmToolkit.myths.newMythRolled", { hex: t("realm.hex", myth.hex) }),
			text: null,
			hint: t("gmToolkit.myths.newMythHint")
		}, { rolls: [d6, d12], mode: "gm" });
	}

	/**
	 * Open the Realm's Myths, where which six the Realm holds is settled: one
	 * rolled again, all of them rolled again, or one chosen from the book's
	 * table. Nothing here is posted, since none of it is play: it's the Realm
	 * being made or mended.
	 * @this {GmToolkitSheet}
	 */
	static async #onSettleMyths(_event, target) {
		const scene = this.scene;
		if (!scene) return;
		// Opened from a Myth's own card it opens on that Myth; from the page, on the first.
		const myth = this.#mythFrom(target);
		// A window of its own, like the Knight chooser, loaded only when one is asked for.
		const { openMythChooser } = await import("../apps/MythChooser.js");
		openMythChooser({ scene, number: myth?.number ?? null });
	}

	/**
	 * Show a hex on the map: view its Realm, pan there, mark it for this GM
	 * alone, and open the Hex panel on it. A ping would show every player where
	 * a hidden Myth lies, so none is sent.
	 * @this {GmToolkitSheet}
	 */
	static async #onShowHex(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		const scene = this.scene;
		if (!hex || !scene) return;
		if (canvas.scene?.id !== scene.id) {
			await scene.view();
			if (canvas.scene?.id !== scene.id) return;
		}
		const point = hexCentre(sceneGeometry(scene), hex);
		await canvas.animatePan({ ...point, duration: reducesMotion() ? 0 : 400 });
		canvas.controls?.drawPing?.(point, { style: CONFIG.Canvas.pings?.types?.PULSE ?? "pulse", user: game.user });
		openRealmPanel({ scene, hex });
	}

	/** @this {GmToolkitSheet} */
	static #onHexLore(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		if (hex && this.scene) return openHexLore({ scene: this.scene, hex });
	}

	/** @this {GmToolkitSheet} */
	static #onRollHexSet(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		if (hex && this.scene) return openWildernessHex({ scene: this.scene, hex });
	}

	/** @this {GmToolkitSheet} */
	static #onTellHex(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		const note = target.closest("[data-hex]")?.querySelector('[data-toolkit-field="hexNote"]')?.value;
		if (hex) return tellPlayersAboutHex({ scene: this.scene, hex, note });
	}

	/** @this {GmToolkitSheet} */
	static #onForgetSpark(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		const { spark } = target.dataset;
		if (hex && spark) return forgetHexSpark(this.scene, hex, spark);
	}

	/**
	 * Make one of a Cast: an NPC, or a Structure for a stat block that is one.
	 * @this {GmToolkitSheet}
	 */
	static async #onMakeCastMember(_event, target) {
		const cast = this.#castFrom(target);
		if (!cast?.member) return;
		const made = await makeCastMember(cast.member, { key: cast.key, img: cast.img, myth: cast.myth });
		if (made) ui.notifications.info(t("gmToolkit.cast.created", { name: made.name }));
	}

	/** @this {GmToolkitSheet} */
	static #onOpenCastActor(_event, target) {
		const actor = fromUuidSync(target.closest("[data-uuid]")?.dataset.uuid ?? "");
		return actor?.sheet?.render({ force: true });
	}

	/** @this {GmToolkitSheet} */
	static #onDropFromCast(_event, target) {
		const actor = fromUuidSync(target.closest("[data-uuid]")?.dataset.uuid ?? "");
		return actor ? removeFromCast(actor) : null;
	}

	/** @this {GmToolkitSheet} */
	static #onMarkVisited(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		if (hex) return markHexVisited(this.scene, hex);
	}

	/** @this {GmToolkitSheet} */
	static #onForgetVisits(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		if (hex) return openHexVisits({ scene: this.scene, hex });
	}

	/**
	 * Carry out what the Landmark on this card asks of the Company (p14), on the
	 * Realm the toolkit is showing.
	 * @this {GmToolkitSheet}
	 */
	static #onLandmarkOffer(_event, target) {
		return takeLandmarkOffer(target.dataset.landmarkOffer, { scene: this.scene, hex: GmToolkitSheet.#hexFrom(target) });
	}

	/**
	 * List the Places page's hexes another way: the last visited first, or by kind.
	 * @this {GmToolkitSheet}
	 */
	static #onPlacesOrder(_event, target) {
		const order = target.dataset.order;
		if (!PLACE_ORDERS.includes(order) || order === this.#placesOrder) return;
		this.#placesOrder = order;
		this.#redraw("places");
	}

	/** @this {GmToolkitSheet} */
	static #onCrisisRoll(_event, target) {
		const domain = game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId);
		if (domain?.type === "domain") return crisisRoll(domain);
	}

	/** @this {GmToolkitSheet} */
	static #onOpenSite(_event, target) {
		const entry = fromUuidSync(target.closest("[data-uuid]")?.dataset.uuid ?? "");
		return entry?.sheet?.render({ force: true });
	}
}
