import { CALENDAR_HOOK, calendarLabel, chronicleLabel, getCalendar } from "../actions/calendar.js";
import { WEATHER_HOOK, pickWeather, weatherButtonShown, weatherView } from "../actions/weather.js";
import { CITY_QUEST_HOOK, cityOmensSeen, resetCityQuest, rollCityOmen } from "../actions/city-quest.js";
import { COMPANY_FLAG, companyTokenHex, setCompanyHex } from "../actions/company.js";
import { crisisRoll, worldDomains } from "../actions/dominion.js";
import { awardGlory } from "../actions/glory.js";
import { forgetHexSpark, getHexLore, rollHexSparkSet, tellPlayersAboutHex, writeHexNote } from "../actions/hex-lore.js";
import { confirmForgetHexVisits, getJourney, markHexVisited, visitsLabel } from "../actions/journey.js";
import { editMythNote, getMythNotes } from "../actions/myth-notes.js";
import { editRealm, getRealm, isRealmScene, sceneGeometry } from "../actions/realm.js";
import { rollMythTable, rollRefereeTable } from "../actions/referee-rolls.js";
import { writeSeasonNotes } from "../actions/season-log.js";
import { isSiteEntry, newSite } from "../actions/sites.js";
import { advancePhase, journeyToDistantRealm, sufferHardship, turnAge, turnSeason } from "../actions/time.js";
import { openArt } from "../apps/ArtPopout.js";
import { openHexLore } from "../apps/HexLore.js";
import { openRealmPanel } from "../apps/RealmPanel.js";
import { spinTable } from "../apps/roll-spin.js";
import { setCalendarByHand, timeContext } from "../apps/time-controls.js";
import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { canReadTablesFromRulebook, peekTable, tableForEntry } from "../book-art/myth-tables.js";
import { postCard, t } from "../chat/cards.js";
import { reducesMotion, scrollBehavior } from "../client-settings.js";
import { isTableRoll } from "../rules/book-art.js";
import { CITY_OMEN_COUNT, CITY_QUEST_END, cityQuestOver } from "../rules/city-quest.js";
import { REALM_TABS, TOOLKIT_TABS, askedColumns, mythRollTaken, omenParts, omenStage, pointsOpposite, realmPlaces, resolvedMyths, tableView } from "../rules/gm-toolkit.js";
import { visitedNewestFirst } from "../rules/journey.js";
import { mythNoteFor } from "../rules/myth-notes.js";
import { OMEN_COUNT, TERRAIN, featureAt, terrainAt } from "../rules/realm.js";
import { crisisRollsDue, seasonLogView } from "../rules/season-log.js";
import { PHASE_ICONS, SEASON_ICONS } from "../rules/time.js";
import { placeFeature, setOmen } from "../rules/realm-edits.js";
import { hexCentre, hexKey, parseHexKey, sameHex } from "../rules/realm-geometry.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { SETTINGS_TAB_ENTRY, SettingsTabMixin } from "./settings-tab.js";
import { placeTabRail, stampRailSide } from "./tab-rail.js";
import { ViewableMixin } from "./viewable.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Each page's icon on the tab rail. */
const TAB_ICONS = Object.freeze({
	myths: "fa-solid fa-dragon",
	journey: "fa-solid fa-route",
	places: "fa-solid fa-map-location-dot",
	time: "fa-solid fa-hourglass-half",
	seasons: "fa-solid fa-calendar-days",
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

/** How many of the hexes visited last start unfolded. */
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
 * The GM Toolkit's sheet: a Realm's Myths and their Omens, the hexes the
 * Company has been to with the Spark Tables rolled there, the places of the
 * Realm with what the GM wrote about each, and the GM's own notes. Its pages
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
			omenStep: GmToolkitSheet.#onOmenStep,
			nextOmen: GmToolkitSheet.#onNextOmen,
			mythResolved: GmToolkitSheet.#onMythResolved,
			mythUnresolved: GmToolkitSheet.#onMythUnresolved,
			rollCityOmen: () => rollCityOmen(),
			resetCityQuest: () => resetCityQuest(),
			showHex: GmToolkitSheet.#onShowHex,
			hexLore: GmToolkitSheet.#onHexLore,
			rollHexSet: GmToolkitSheet.#onRollHexSet,
			tellHex: GmToolkitSheet.#onTellHex,
			forgetSpark: GmToolkitSheet.#onForgetSpark,
			standCompany: GmToolkitSheet.#onStandCompany,
			markVisited: GmToolkitSheet.#onMarkVisited,
			forgetVisits: GmToolkitSheet.#onForgetVisits,
			openSite: GmToolkitSheet.#onOpenSite,
			newSite: () => newSite(),
			newMyth: GmToolkitSheet.#onNewMyth,
			rollMythTable: GmToolkitSheet.#onRollMythTable,
			showMythTable: GmToolkitSheet.#onShowMythTable,
			showMythArt: GmToolkitSheet.#onShowMythArt,
			nextPhase: () => advancePhase(),
			turnSeason: () => turnSeason(),
			turnAge: () => turnAge(),
			journey: () => journeyToDistantRealm(),
			refereeRoll: (_event, target) => rollRefereeTable(target.dataset.table),
			hardship: (_event, target) => sufferHardship(target.dataset.hardship),
			awardGlory: (_event, target) => awardGlory(target.dataset.award),
			crisisRoll: GmToolkitSheet.#onCrisisRoll,
			pickWeather: () => pickWeather()
		}
	};

	static PARTS = {
		tabs: { template: templatePath("actor/tab-rail.hbs") },
		header: { template: templatePath("actor/gm-toolkit/header.hbs") },
		myths: { template: templatePath("actor/gm-toolkit/myths.hbs"), scrollable: [""] },
		journey: { template: templatePath("actor/gm-toolkit/journey.hbs"), scrollable: [""] },
		places: { template: templatePath("actor/gm-toolkit/places.hbs"), scrollable: [""] },
		time: { template: templatePath("actor/gm-toolkit/time.hbs"), scrollable: [""] },
		seasons: { template: templatePath("actor/gm-toolkit/seasons.hbs"), scrollable: [""] },
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

	/** Whether a Myth's table is being rolled, so a second click waits for it to land. */
	#spinning = false;

	/** Whether a redraw is already on its way. */
	#redrawing = false;

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
	 * Seasons page rather than every page.
	 * @override
	 */
	_configureRenderOptions(options) {
		super._configureRenderOptions(options);
		const changes = options.renderContext === "updateActor" ? options.renderData : null;
		const changed = Object.keys(changes ?? {}).filter((key) => !["_id", "_stats"].includes(key));
		if (changed.length === 1 && changed[0] === "system" && Object.keys(changes.system).every((key) => key === "seasons")) options.parts = ["seasons"];
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
			case "journey": return Object.assign(part, this.#journeyContext(data));
			case "places": return Object.assign(part, this.#placesContext(data));
			case "time": return Object.assign(part, this.#timeContext(data));
			case "seasons": return Object.assign(part, this.#seasonsContext());
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
		const cityQuest = {
			seen: t("cityQuest.seen", { count: seen.length, end: CITY_QUEST_END }),
			omens: seen.map((omen) => ({ number: omen, text: this.#index?.cityQuest?.omens?.[omen - 1] ?? t("cityQuest.omen", { omen, count: CITY_OMEN_COUNT }) })),
			over: cityQuestOver(seen),
			empty: !seen.length,
			missingText: !this.#index?.cityQuest?.omens
		};
		if (!data) return { noRealm: true, cityQuest };

		const myths = data.realm.myths.map((myth) => this.#mythContext(myth, data));
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
	 */
	#mythContext(myth, data) {
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
			// All six in order: the one playing out and the one to come in full,
			// every other cut to a line that unfolds.
			omens: Array.from({ length: OMEN_COUNT }, (_, index) => {
				const number = index + 1;
				const label = number === current ? t("gmToolkit.myths.current") : number === next ? t("gmToolkit.myths.next") : null;
				const omenFold = `omen:${myth.number}:${number}`;
				return {
					number,
					parts: omenParts(text(number) ?? t("myths.omenNumber", { number })),
					met: number <= myth.omen,
					past: number < myth.omen,
					current: number === current,
					next: number === next,
					label,
					fold: omenFold,
					open: this.#folds.get(omenFold) ?? false
				};
			}),
			noneSeen: myth.omen <= 0,
			complete: myth.omen >= OMEN_COUNT,
			resolved: kept.resolved,
			note: kept.note,
			fold,
			open: this.#folds.get(fold) ?? false,
			table: this.#tableContext(myth, page, entry, pointsOpposite(text(current)))
		};
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
	 * The hexes the Company has come into, the last reached first.
	 * @param {object|null} data
	 */
	#journeyContext(data) {
		if (!data) return { noRealm: true };
		const visited = visitedNewestFirst(data.journey);
		return {
			summary: t("gmToolkit.journey.summary", { count: visited.length, total: data.g.cols * data.g.rows }),
			visits: visited.map(({ hex }, index) => this.#hexCard(data, hex, { fold: `visit:${hexKey(hex)}`, open: index < OPEN_VISITS }))
		};
	}

	/**
	 * The Realm's Holdings, Landmarks and every other hex written about, and the Sites.
	 * @param {object|null} data
	 */
	#placesContext(data) {
		const sites = game.journal.filter(isSiteEntry)
			.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
			.map((entry) => ({ uuid: entry.uuid, name: entry.name }));
		if (!data) return { noRealm: true, sites };

		const { holdings, landmarks, others } = realmPlaces(data.realm, data.lore);
		const card = (hex, options) => this.#hexCard(data, hex, { fold: `place:${hexKey(hex)}`, open: false, ...options });
		// A place's card is headed by its name, or by what it is while it has none, and says what it is only once.
		const named = (name, what) => ({ title: name || what, kind: name ? what : null });
		return {
			holdings: holdings.map((holding) => {
				const { title, kind } = named(holding.name, t(`realm.holdings.${holding.style}`));
				return card(holding.hex, { title, kind: [kind, holding.seat ? t("gmToolkit.places.seat") : null].filter(Boolean).join(", ") || null, self: "holding" });
			}),
			landmarks: landmarks.map((landmark) => {
				const seer = isTableRoll(landmark.seer) ? seerEntry(this.#index, landmark.seer) : null;
				return card(landmark.hex, {
					...named(landmark.name, t(`realm.landmarks.${landmark.type}`)),
					self: "landmark",
					status: [
						seer && { text: t("gmToolkit.places.seer", { name: seer.name }), hidden: false },
						!landmark.revealed && { text: t("gmToolkit.places.notFound"), hidden: true }
					].filter(Boolean)
				});
			}),
			others: others.map((hex) => card(hex, { title: t("realm.hex", hex) })),
			sites
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
	 * @param {string} [options.title] Defaults to the hex's name.
	 * @param {string|null} [options.kind] What sort of place it is, when it isn't just a hex.
	 * @param {"holding"|"landmark"} [options.self] The feature the card is about, left out of what stands in the hex.
	 * @param {{text: string, hidden: boolean}[]} [options.status] More to say about the place, before what stands in the hex.
	 * @returns {object}
	 */
	#hexCard(data, hex, { fold, open, title, kind = null, self = null, status = [] }) {
		const key = hexKey(hex);
		const record = data.lore.hexes[key] ?? null;
		const visits = data.journey.hexes[key] ?? null;
		const terrain = terrainAt(data.realm, data.g, hex);
		const label = t("realm.hex", hex);
		return {
			key,
			title: title ?? label,
			kind,
			// A place's own name heads its card, so the hex it's in is named beside it.
			hex: title && title !== label ? label : null,
			terrain: terrain ? t(`realm.terrain.${TERRAIN[terrain - 1]}`) : null,
			features: [...status, ...this.#featuresIn(data.realm, hex, self)],
			companyHere: sameHex(data.companyHex, hex),
			visited: Boolean(visits),
			visits: visits && visitsLabel(visits),
			note: record?.note ?? "",
			sparks: [...(record?.sparks ?? [])].reverse().map((spark) => ({
				id: spark.id,
				prompt: spark.prompt,
				table: spark.table,
				rolls: spark.rolls.join(", "),
				when: spark.when ? t("hexLore.when", { when: calendarLabel(spark.when) }) : null
			})),
			tellDisabled: !record?.note,
			fold,
			open: this.#folds.get(fold) ?? open
		};
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
		const { age, day, seasons, phases } = timeContext();
		// Hovering the clock reads the date out in full, as a chronicle would, before how to set it.
		const tooltip = `${chronicleLabel(calendar)} ${t("gmToolkit.clockHint")}`;
		// Only a table with FXMaster to draw the weather is shown it, and a GM may hide it even then.
		const weather = weatherButtonShown() ? weatherView() : null;
		return { age, day, season, seasonIcon: SEASON_ICONS[season], phaseIcon: PHASE_ICONS[phase], seasons, phases, weather, tooltip };
	}

	/**
	 * The world's calendar and what moves it (p17), the Domains still owed this
	 * Season's Crisis Roll (p20), and the Realm's resolved Myths, each replaced
	 * by a new one in the next Season (p27).
	 * @param {object|null} data
	 */
	#timeContext(data) {
		const waiting = data ? resolvedMyths(data.realm, data.notes) : [];
		return {
			...timeContext(),
			crisisRolls: crisisRollsDue(worldDomains(), getCalendar()).map((domain) => ({ id: domain.id, name: domain.name })),
			resolved: waiting.map((myth) => ({ number: myth.number, name: mythLookup(this.#index, myth).name, hex: t("realm.hex", myth.hex) }))
		};
	}

	/** Each Season by Age, the newest first: the GM's notes on it, and how it ended. */
	#seasonsContext() {
		const seasonName = (season) => t(`time.seasons.${season}`);
		return {
			ages: seasonLogView(this.actor.system.seasons, getCalendar()).map(({ age, seasons }) => ({
				label: t("gmToolkit.seasons.age", { age }),
				seasons: seasons.map(({ record, ...entry }) => ({
					...entry,
					label: seasonName(entry.season),
					icon: SEASON_ICONS[entry.season],
					notes: record.notes,
					turn: record.turn && {
						ended: t("gmToolkit.seasons.ended", { title: record.turn.title }),
						note: record.turn.note,
						entries: record.turn.entries
					}
				}))
			}))
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
			if (token.parent?.id === this.scene?.id && token.getFlag?.(SYSTEM_ID, COMPANY_FLAG)) this.#redraw("header", "journey", "places");
		};
		// Only a move, or the Company mark itself, changes where the Company is.
		const onCompanyChange = (token, changes) => ["x", "y", "flags"].some((key) => key in changes) && onCompany(token);
		const onSite = (entry) => isSiteEntry(entry) && this.#redraw("places");
		const onDomain = (actor) => actor.type === "domain" && this.#redraw("time");
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
			...["createActor", "deleteActor"].map((name) => [name, Hooks.on(name, onDomain)]),
			["updateActor", Hooks.on("updateActor", onDomainChange)],
			[CALENDAR_HOOK, Hooks.on(CALENDAR_HOOK, () => this.#redraw("header", "time", "seasons"))],
			[WEATHER_HOOK, Hooks.on(WEATHER_HOOK, () => this.#redraw("header"))]
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
		placeTabRail(this.element, ".bastionland-gm-toolkit__header");
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
			case "age":
			case "day":
				await setCalendarByHand({ [field]: target.value });
				return;
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

	/** @this {GmToolkitSheet} */
	static #onOmenStep(_event, target) {
		const myth = this.#mythFrom(target);
		const step = Number(target.dataset.step) || 0;
		if (!myth) return;
		return editRealm(this.scene, (realm) => setOmen(realm, myth.number, myth.omen + step));
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
		const { name, entry } = myth ? mythLookup(this.#index, myth) : {};
		if (entry?.path) openArt({ src: entry.path, title: name, icon: TAB_ICONS.myths });
	}

	/**
	 * Count the Myth's next Omen as met. The Toolkit shows it as the current
	 * Omen, so nothing goes to chat, not even to the GMs.
	 * @this {GmToolkitSheet}
	 */
	static #onNextOmen(_event, target) {
		const myth = this.#mythFrom(target);
		if (!myth || myth.omen >= OMEN_COUNT) return;
		return editRealm(this.scene, (realm) => setOmen(realm, myth.number, myth.omen + 1));
	}

	/**
	 * The group feels the Myth is resolved: mark it so, and award the Glory
	 * that comes with it (p27). A new Myth replaces it in the next Season.
	 * @this {GmToolkitSheet}
	 */
	static async #onMythResolved(_event, target) {
		const myth = this.#mythFrom(target);
		if (!myth) return;
		await editMythNote(this.scene, myth, { resolved: true });
		await awardGlory("myth");
	}

	/** @this {GmToolkitSheet} */
	static #onMythUnresolved(_event, target) {
		const myth = this.#mythFrom(target);
		if (myth) return editMythNote(this.scene, myth, { resolved: false });
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
		if (hex) return rollHexSparkSet({ scene: this.scene, hex });
	}

	/** @this {GmToolkitSheet} */
	static #onTellHex(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		if (hex) return tellPlayersAboutHex({ scene: this.scene, hex });
	}

	/** @this {GmToolkitSheet} */
	static #onForgetSpark(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		const { spark } = target.dataset;
		if (hex && spark) return forgetHexSpark(this.scene, hex, spark);
	}

	/**
	 * Stand the Company in this hex, making its Token when the Realm hasn't one
	 * yet. That is how a Realm made before the Company had a Token gets one, and
	 * how a Token deleted by mistake comes back.
	 * @this {GmToolkitSheet}
	 */
	static async #onStandCompany(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		if (!hex) return;
		const token = await setCompanyHex(this.scene, hex);
		if (token) ui.notifications.info(t("company.placed", { hex: t("realm.hex", hex) }));
	}

	/** @this {GmToolkitSheet} */
	static #onMarkVisited(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		if (hex) return markHexVisited(this.scene, hex);
	}

	/** @this {GmToolkitSheet} */
	static #onForgetVisits(_event, target) {
		const hex = GmToolkitSheet.#hexFrom(target);
		if (hex) return confirmForgetHexVisits(this.scene, hex);
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
